const { createWebSocketHost } = require('./websocket-host.cjs')
const { createWalletHost } = require('./wallet-host.cjs')

function createHostServices(profile = {}, hooks = {}) {
  let disposed = false
  const trace = []
  const missing = []
  const record = (entry) => {
    if (disposed) return
    trace.push(entry)
    hooks.onTrace?.(entry)
  }
  const unavailable = (entry) => {
    if (disposed) return
    missing.push(entry)
    hooks.onUnavailable?.(entry)
  }
  const decode = (data) => {
    if (typeof data === 'string') return data
    if (data && typeof data.base64 === 'string') return Buffer.from(data.base64, 'base64')
    throw new TypeError('WebSocket fixture messages must be strings or {base64}')
  }
  const peers = Object.create(null)
  for (const [url, script] of Object.entries(profile.webSocket?.peers ?? {})) {
    if (!script || typeof script !== 'object' || Array.isArray(script))
      throw new TypeError('Invalid WebSocket peer fixture')
    peers[url] = (control) => {
      control.open(script.protocol ?? '')
      for (const message of script.messages ?? []) control.message(decode(message))
      return {
        manualOpen: true,
        send(data) {
          const key = typeof data === 'string' ? data : 'base64:' + Buffer.from(data).toString('base64')
          if (script.echo) control.message(data)
          else if (Object.hasOwn(script.replies ?? {}, key)) {
            for (const reply of script.replies[key]) control.message(decode(reply))
          } else if (!(script.accept ?? []).includes(key)) {
            unavailable({ kind: 'websocket-message', url, data: key })
          }
        }
      }
    }
  }
  const sockets = createWebSocketHost({
    peers,
    onTrace: (entry) => record({ kind: 'websocket', event: entry }),
    onUnavailable: (entry) => unavailable({ kind: 'websocket', ...entry })
  })
  const wallet = createWalletHost({
    ...profile.wallet,
    onUnavailable: (entry) => unavailable({ kind: 'ethereum', ...entry })
  })
  const ethereumSendAsync = (args) => {
    const response = wallet.bridge(args)
    record({ kind: 'wallet-rpc', request: args, response: JSON.parse(response.jsonAnyResponse) })
    return response
  }
  return {
    wallet,
    WebSocket: sockets.WebSocket,
    ethereumSendAsync,
    trace,
    missing,
    pump: () => sockets.drain(sockets.pending),
    dispose: () => {
      disposed = true
      sockets.dispose()
    }
  }
}
module.exports = { createHostServices }
