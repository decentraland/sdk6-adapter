import {
  sendAsync,
  requirePayment as runtimeRequirePayment,
  signMessage as runtimeSignMessage
} from '~system/EthereumController'

type RPCSendableMessage = {
  jsonrpc: '2.0'
  id: number
  method: string
  params: any[]
}

type MessageDict = Record<string, string>

export function create(): Record<string, any> {
  async function requirePayment(toAddress: string, amount: number, currency: string): Promise<any> {
    const response = await runtimeRequirePayment({ toAddress, amount, currency })
    return JSON.parse(response.jsonAnyResponse)
  }

  async function signMessage(message: MessageDict): Promise<{
    message: string
    hexEncodedMessage: string
    signature: string
  }> {
    return await runtimeSignMessage({ message })
  }

  async function convertMessageToObject(message: string): Promise<MessageDict> {
    let parsedMessage = message

    if (message.indexOf('# DCL Signed message') === 0) {
      parsedMessage = message.slice(21)
    }
    const arr = parsedMessage
      .split('\n')
      .map((m) => m.split(':'))
      .map(([key, value]) => [key, value.trim()])

    return arr.reduce((o, [key, value]) => ({ ...o, [key]: value }), {})
  }

  async function internalSendAsync(message: RPCSendableMessage): Promise<any> {
    const response = await sendAsync({
      id: message.id,
      method: message.method,
      jsonParams: JSON.stringify(message.params)
    })
    return JSON.parse(response.jsonAnyResponse)
  }

  async function getUserAccount(): Promise<string | undefined> {
    // A scene identity is not necessarily a connected wallet. Legacy hosts
    // resolved this API through eth_accounts, including its permission checks.
    const response = await internalSendAsync({ id: 1, jsonrpc: '2.0', method: 'eth_accounts', params: [] })
    if (response?.error) throw new Error(`Could not access eth_accounts: ${response.error.message}`)
    if (!Array.isArray(response?.result)) throw new Error('Invalid eth_accounts response')
    const address = response.result[0]
    if (address === undefined) return undefined
    if (typeof address !== 'string') throw new Error('Invalid eth_accounts address')
    return address.toLowerCase()
  }

  return {
    requirePayment,
    signMessage,
    convertMessageToObject,
    sendAsync: internalSendAsync,
    getUserAccount
  }
}
