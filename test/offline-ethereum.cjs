// Explicit offline guest fixture, not a simulation of chain state or transactions.
function offlineEthereum({ id, method }) {
  const result = { eth_chainId: '0x1', net_version: '1', eth_accounts: [], eth_coinbase: null }
  return {
    jsonAnyResponse: JSON.stringify(
      Object.hasOwn(result, method)
        ? { jsonrpc: '2.0', id, result: result[method] }
        : { jsonrpc: '2.0', id, error: { code: -32601, message: `Offline fixture has no response for ${method}` } }
    )
  }
}
module.exports = { offlineEthereum }
