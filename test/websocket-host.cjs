/*
 * A deliberately local WebSocket implementation for scene tests.  It never
 * opens a network connection: every accepted URL has to be supplied in peers.
 */
function createWebSocketHost({ peers = {}, onUnavailable, onTrace, onListenerError, maxQueue = 1024 } = {}) {
  if (!Number.isInteger(maxQueue) || maxQueue < 1) throw new RangeError('maxQueue must be a positive integer')

  const pending = []
  const sockets = new Set()
  let disposed = false

  function trace(kind, detail) {
    onTrace?.({ kind, ...detail })
  }

  function enqueue(task) {
    if (disposed || pending.length >= maxQueue) return false
    pending.push(task)
    return true
  }

  function makeEvent(type, values) {
    return { type, ...values }
  }

  function toArrayBuffer(value) {
    if (value instanceof ArrayBuffer) return value.slice(0)
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
    throw new TypeError('WebSocket.send accepts strings and binary data')
  }

  function toBlob(value) {
    if (typeof Blob === 'undefined') return toArrayBuffer(value)
    return value instanceof Blob ? value.slice(0) : new Blob([toArrayBuffer(value)])
  }

  function textLength(value) {
    return new TextEncoder().encode(value).byteLength
  }

  class LocalWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3

    constructor(input, protocols) {
      let parsed
      try {
        parsed = new URL(String(input))
      } catch {
        throw new SyntaxError('Invalid WebSocket URL')
      }
      if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:')
        throw new SyntaxError('WebSocket URL must use ws or wss')
      if (parsed.hash) throw new SyntaxError('WebSocket URL must not contain a fragment')

      const requested = protocols === undefined ? [] : Array.isArray(protocols) ? protocols : [protocols]
      if (
        requested.some((protocol) => typeof protocol !== 'string' || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(protocol))
      )
        throw new SyntaxError('Invalid WebSocket protocol')
      if (new Set(requested).size !== requested.length) throw new SyntaxError('WebSocket protocols must be unique')

      this.url = parsed.href
      this.protocol = ''
      this.extensions = ''
      this.readyState = LocalWebSocket.CONNECTING
      this.bufferedAmount = 0
      this._binaryType = 'blob'
      this.onopen = null
      this.onmessage = null
      this.onerror = null
      this.onclose = null
      this._listeners = new Map()
      this._peer = null
      this._closeRequested = false
      this._protocols = [...requested]
      sockets.add(this)

      const factory = peers[this.url] || peers[String(input)]
      trace('connect', { url: this.url, protocols: [...requested], available: !!factory })
      if (!factory) {
        this._enqueue(() => {
          if (this.readyState !== LocalWebSocket.CONNECTING) return
          onUnavailable?.({ url: this.url, protocols: [...requested] })
          try {
            this._emit('error', makeEvent('error', { error: new Error('WebSocket endpoint unavailable') }))
          } finally {
            this._finishClose(1006, 'WebSocket endpoint unavailable', false)
          }
        })
        return
      }

      const control = {
        open: (protocol = '') => this._queueOpen(protocol),
        message: (data) => this._queueMessage(data),
        error: (error = new Error('WebSocket peer error')) => this._queueError(error),
        close: (code = 1000, reason = '') => this._queueClose(code, reason),
        get readyState() {
          return this.socket.readyState
        },
        socket: this
      }
      try {
        this._peer = typeof factory === 'function' ? factory(control) : factory
      } catch (error) {
        this._queueError(error)
        this._queueClose(1011, String(error?.message || 'Peer setup failed'))
        return
      }
      // A fixture may opt into manual connection timing by returning
      // { manualOpen: true }.  Normal fixtures become open on the next drain.
      if (!this._peer?.manualOpen) this._queueOpen(this._peer?.protocol || '')
    }

    get CONNECTING() {
      return LocalWebSocket.CONNECTING
    }
    get OPEN() {
      return LocalWebSocket.OPEN
    }
    get CLOSING() {
      return LocalWebSocket.CLOSING
    }
    get CLOSED() {
      return LocalWebSocket.CLOSED
    }
    get binaryType() {
      return this._binaryType
    }
    set binaryType(value) {
      if (value !== 'blob' && value !== 'arraybuffer') throw new TypeError('binaryType must be blob or arraybuffer')
      this._binaryType = value
    }

    addEventListener(type, listener) {
      if (typeof listener !== 'function' && typeof listener?.handleEvent !== 'function') return
      const list = this._listeners.get(type) || []
      if (!list.includes(listener)) list.push(listener)
      this._listeners.set(type, list)
    }

    removeEventListener(type, listener) {
      const list = this._listeners.get(type)
      if (!list) return
      const index = list.indexOf(listener)
      if (index !== -1) list.splice(index, 1)
    }

    send(data) {
      if (this.readyState === LocalWebSocket.CONNECTING) throw new Error('InvalidStateError: WebSocket is not open')
      if (this.readyState === LocalWebSocket.CLOSING || this.readyState === LocalWebSocket.CLOSED) return
      const payload =
        typeof data === 'string' || (typeof Blob !== 'undefined' && data instanceof Blob) ? data : toArrayBuffer(data)
      const size = typeof payload === 'string' ? textLength(payload) : payload.size ?? payload.byteLength
      this.bufferedAmount += size
      if (
        !this._enqueue(() => {
          this.bufferedAmount = Math.max(0, this.bufferedAmount - size)
          if (this.readyState !== LocalWebSocket.OPEN) return
          trace('send', { url: this.url, data: payload })
          this._peer?.send?.(payload, { socket: this })
        })
      ) {
        this.bufferedAmount = Math.max(0, this.bufferedAmount - size)
        this._failOverflow()
      }
    }

    close(code = 1000, reason = '') {
      if (this.readyState === LocalWebSocket.CLOSING || this.readyState === LocalWebSocket.CLOSED) return
      if (code !== 1000 && (code < 3000 || code > 4999)) throw new RangeError('Invalid close code')
      if (textLength(String(reason)) > 123) throw new SyntaxError('Close reason is too long')
      this._closeRequested = true
      this.readyState = LocalWebSocket.CLOSING
      trace('close-request', { url: this.url, code, reason: String(reason) })
      this._enqueue(() => {
        if (this.readyState !== LocalWebSocket.CLOSING) return
        if (typeof this._peer?.close === 'function') this._peer.close(code, String(reason), { socket: this })
        else this._finishClose(code, String(reason), true)
      })
    }

    _enqueue(task) {
      const queued = enqueue(task)
      if (!queued) this._failOverflow()
      return queued
    }

    _queueOpen(protocol) {
      this._enqueue(() => {
        if (this.readyState !== LocalWebSocket.CONNECTING) return
        if (protocol && !this._protocols.includes(String(protocol))) {
          onUnavailable?.({url: this.url, reason: 'unrequested-subprotocol'})
          this._queueError(new Error('Peer selected an unrequested WebSocket protocol'))
          this._queueClose(1006, 'Invalid peer protocol')
          return
        }
        this.protocol = String(protocol)
        this.readyState = LocalWebSocket.OPEN
        trace('open', { url: this.url, protocol: this.protocol })
        this._emit('open', makeEvent('open'))
      })
    }

    _queueMessage(data) {
      data = typeof data === 'string' ? data : toArrayBuffer(data)
      const deliver = () => {
        // A scripted peer may send during setup.  Preserve browser ordering by
        // waiting until the asynchronous open event has run.
        if (this.readyState === LocalWebSocket.CONNECTING) {
          this._enqueue(deliver)
          return
        }
        if (this.readyState !== LocalWebSocket.OPEN) return
        const binary = typeof data !== 'string'
        const payload = binary ? (this.binaryType === 'arraybuffer' ? toArrayBuffer(data) : toBlob(data)) : data
        trace('message', { url: this.url, binary, data })
        this._emit('message', makeEvent('message', { data: payload }))
      }
      this._enqueue(deliver)
    }

    _queueError(error) {
      this._enqueue(() => {
        if (this.readyState === LocalWebSocket.CLOSED) return
        trace('error', { url: this.url, error: String(error?.message || error) })
        this._emit('error', makeEvent('error', { error }))
      })
    }

    _queueClose(code, reason) {
      this._enqueue(() => this._finishClose(code, reason, code !== 1006))
    }

    _failOverflow() {
      if (this.readyState === LocalWebSocket.CLOSED || this._overflowed) return
      this._overflowed = true
      const error = new Error('WebSocket host queue limit exceeded')
      trace('overflow', { url: this.url })
      onUnavailable?.({ url: this.url, protocols: this._protocols, reason: 'queue-overflow' })
      // Reserve one deterministic delivery turn for failure, even if the
      // queue is full.  Dropping the oldest pending packet is intentional:
      // overflow is terminal and must never leave the socket appearing open.
      if (pending.length >= maxQueue) pending.shift()
      pending.push(() => {
        if (this.readyState === LocalWebSocket.CLOSED) return
        try {
          this._emit('error', makeEvent('error', { error }))
        } finally {
          this._finishClose(1013, 'Host queue limit exceeded', false)
        }
      })
    }

    _finishClose(code, reason, wasClean) {
      if (this.readyState === LocalWebSocket.CLOSED) return
      this.readyState = LocalWebSocket.CLOSED
      sockets.delete(this)
      trace('close', { url: this.url, code, reason: String(reason) })
      this._emit('close', makeEvent('close', { code, reason: String(reason), wasClean }))
    }

    _emit(type, event) {
      event.target = this
      event.currentTarget = this
      let failure
      const handler = this['on' + type]
      if (typeof handler === 'function') {
        try {
          handler.call(this, event)
        } catch (error) {
          failure = error
        }
      }
      for (const listener of [...(this._listeners.get(type) || [])]) {
        try {
          if (typeof listener === 'function') listener.call(this, event)
          else listener.handleEvent(event)
        } catch (error) {
          failure ||= error
        }
      }
      if (failure) {
        onListenerError?.(failure, { type, socket: this })
        if (!onListenerError) throw failure
      }
    }
  }

  function drain(limit = Infinity) {
    let delivered = 0
    while (pending.length && delivered < limit) {
      pending.shift()()
      delivered++
    }
    return delivered
  }

  function dispose() {
    disposed = true
    pending.length = 0
    for (const socket of [...sockets]) {
      try {
        socket._peer?.dispose?.({ socket })
      } finally {
        // Disposal belongs to the host lifetime, rather than the simulated
        // connection.  Do not invoke scene callbacks that might reconnect.
        socket.readyState = LocalWebSocket.CLOSED
        socket._listeners.clear()
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
        sockets.delete(socket)
        trace('dispose', { url: socket.url })
      }
    }
  }

  return {
    WebSocket: LocalWebSocket,
    drain,
    dispose,
    get pending() {
      return pending.length
    }
  }
}

function scriptedPeer(script = {}) {
  return (control) => {
    const peer = {
      manualOpen: script.manualOpen,
      protocol: script.protocol,
      sent: [],
      send(data, context) {
        peer.sent.push(data)
        script.onSend?.(data, control, context)
      },
      close(code, reason, context) {
        script.onClose?.(code, reason, control, context)
        control.close(code, reason)
      },
      dispose(context) {
        script.onDispose?.(control, context)
      }
    }
    script.onConnect?.(control, peer)
    return peer
  }
}

module.exports = { createWebSocketHost, scriptedPeer }
