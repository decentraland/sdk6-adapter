import { clearTimeout, setTimeout } from '../timers'

type Callback = (event: ProgressEvent) => void
export class ProgressEvent {
  constructor(
    public readonly type: string,
    public readonly target: XMLHttpRequest
  ) {}
  get currentTarget(): XMLHttpRequest {
    return this.target
  }
}

export class XMLHttpRequest {
  withCredentials = false
  timeout = 0
  readyState = 0
  responseType: '' | 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' = ''
  responseURL = ''
  statusText = ''
  status = 0
  response: any = null
  responseText = ''
  headers: Record<string, string> = Object.create(null)
  private handlers: Record<string, Callback | undefined> = Object.create(null)
  private listeners = new Map<string, Set<Callback>>()
  private requestHeaders: Record<string, string> = Object.create(null)
  private method = 'GET'
  private url = ''
  private generation = 0
  private timeoutId?: number
  private sending = false

  set onreadystatechange(callback: Callback) {
    this.handlers.readystatechange = callback
  }
  set ontimeout(callback: Callback) {
    this.handlers.timeout = callback
  }
  set onloadstart(callback: Callback) {
    this.handlers.loadstart = callback
  }
  set onloadend(callback: Callback) {
    this.handlers.loadend = callback
  }
  set onload(callback: Callback) {
    this.handlers.load = callback
  }
  set onerror(callback: Callback) {
    this.handlers.error = callback
  }
  set onabort(callback: Callback) {
    this.handlers.abort = callback
  }

  addEventListener(type: string, callback: Callback): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(callback)
  }
  removeEventListener(type: string, callback: Callback): void {
    this.listeners.get(type)?.delete(callback)
  }
  private emit(type: string): void {
    const event = new ProgressEvent(type, this)
    for (const callback of [this.handlers[type], ...(this.listeners.get(type) ?? [])]) {
      try {
        callback?.call(this, event)
      } catch (error) {
        console.error('SDK6 XHR listener failed', error)
      }
    }
  }
  private state(value: number): void {
    this.readyState = value
    this.emit('readystatechange')
  }
  private clearTimer(): void {
    if (this.timeoutId !== undefined) clearTimeout(this.timeoutId)
    this.timeoutId = undefined
  }
  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name] = value
  }
  getAllResponseHeaders(): string {
    return Object.entries(this.headers)
      .map(([k, v]) => `${k}: ${v}\r\n`)
      .join('')
  }
  getResponseHeader(name: string): string | null {
    return this.headers[name.toLowerCase()] ?? null
  }
  open(method: string, url: string, async = true): void {
    if (!async) throw new Error('Synchronous XMLHttpRequest is not supported by SDK7')
    this.generation++
    this.clearTimer()
    this.sending = false
    this.method = method
    this.url = url
    this.requestHeaders = Object.create(null)
    this.headers = Object.create(null)
    this.status = 0
    this.statusText = ''
    this.response = null
    this.responseText = ''
    this.state(1)
  }
  send(body?: string): void {
    if (this.readyState !== 1 || this.sending) throw new Error('XHR must be opened before send')
    const generation = ++this.generation
    this.sending = true
    this.emit('loadstart')
    if (this.timeout > 0) this.timeoutId = setTimeout(() => this.cancel('timeout'), this.timeout)
    Promise.resolve()
      .then(() => fetch(this.url, { method: this.method, headers: this.requestHeaders, body }))
      .then(async (response) => {
        if (generation !== this.generation) return
        this.status = response.status
        this.statusText = response.statusText
        this.responseURL = response.url
        response.headers.forEach((value, name) => {
          this.headers[name.toLowerCase()] = value
        })
        this.state(2)
        this.state(3)
        let value: any
        if (this.responseType === 'arraybuffer') value = await (response as any).arrayBuffer()
        else if (this.responseType === 'blob') value = await (response as any).blob()
        else {
          value = await response.text()
          if (this.responseType === 'json') {
            try {
              value = JSON.parse(value)
            } catch {
              value = null
            }
          }
        }
        if (generation !== this.generation) return
        this.response = value
        if (this.responseType === '' || this.responseType === 'text') this.responseText = value
        this.sending = false
        this.clearTimer()
        this.state(4)
        this.emit('load')
        this.emit('loadend')
      })
      .catch(() => {
        if (generation === this.generation) this.cancel('error')
      })
  }
  private cancel(type: string): void {
    if (!this.sending) return
    this.generation++
    this.sending = false
    this.clearTimer()
    this.status = 0
    this.response = null
    this.responseText = ''
    this.state(4)
    this.emit(type)
    this.emit('loadend')
  }
  abort(): void {
    this.cancel('abort')
    this.readyState = 0
  }
}
