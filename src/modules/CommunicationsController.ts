import { send as sendString, sendBinary, type SendBinaryRequest } from '~system/CommunicationsController'

export function create(): Record<string, any> {
  async function send(message: string): Promise<void> {
    await sendString({ message })
  }

  return {
    send,
    async sendBinary(request: SendBinaryRequest) {
      return await sendBinary({ data: request.data ?? [], peerData: request.peerData ?? [] })
    }
  }
}
