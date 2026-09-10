import { sendAsync } from '~system/EthereumController'

type RpcCallback = (error: Error | null, result?: any) => void

export function create(): Record<string, any> {
  let nextRequestId = 1
  const requestOne = async (message: any): Promise<any> => {
    if (!message || typeof message !== 'object' || typeof message.method !== 'string')
      throw new TypeError('Invalid JSON-RPC request')
    if (
      Object.prototype.hasOwnProperty.call(message, 'id') &&
      message.id !== null &&
      typeof message.id !== 'string' &&
      !(typeof message.id === 'number' && Number.isFinite(message.id))
    )
      throw new TypeError('Invalid JSON-RPC request id')
    if (message.params !== undefined && (message.params === null || typeof message.params !== 'object'))
      throw new TypeError('Invalid JSON-RPC parameters')
    const transportId = nextRequestId++
    const response = await sendAsync({
      id: transportId,
      method: message.method,
      jsonParams: JSON.stringify(message.params ?? [])
    })
    const envelope = JSON.parse(response.jsonAnyResponse)
    if (!envelope || envelope.id !== transportId) throw new Error('JSON-RPC response id mismatch')
    return { ...envelope, id: Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : transportId }
  }
  const request = async (message: any): Promise<any> => {
    if (Array.isArray(message)) {
      if (message.length === 0) throw new TypeError('JSON-RPC batch must not be empty')
      const responses = await Promise.all(message.map(requestOne))
      const replies = responses.filter((_, index) => Object.prototype.hasOwnProperty.call(message[index], 'id'))
      return replies.length ? replies : undefined
    }
    const response = await requestOne(message)
    return Object.prototype.hasOwnProperty.call(message, 'id') ? response : undefined
  }
  const dispatch = (message: any, callback?: RpcCallback): void => {
    if (typeof callback !== 'function') throw new Error('Decentraland provider only allows async calls')
    // Use both promise handlers so a callback's exception cannot invoke it twice.
    void request(message).then(
      (result) => callback(null, result),
      (error) => callback(error)
    )
  }

  return {
    async getProvider(): Promise<any> {
      return {
        send: dispatch,
        sendAsync: dispatch,
        async request(message: { method: string; params?: any[] | Record<string, any> }): Promise<any> {
          if (Array.isArray(message)) throw new TypeError('Provider request expects one method')
          const response = await requestOne(message)
          if (response?.error) {
            const error = new Error(response.error.message ?? 'JSON-RPC request failed') as Error & {
              code?: number
              data?: any
            }
            error.code = response.error.code
            error.data = response.error.data
            throw error
          }
          if (!response || !Object.prototype.hasOwnProperty.call(response, 'result'))
            throw new Error('Invalid JSON-RPC response')
          return response.result
        }
      }
    }
  }
}
