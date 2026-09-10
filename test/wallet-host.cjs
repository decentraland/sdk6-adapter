'use strict'

// A deliberately closed JSON-RPC fixture host. It models wallet availability,
// but it never invents chain data, signatures, or transaction hashes.
function createWalletHost(options = {}) {
  const calls = []
  const unavailable = []
  const trace = []
  const connected = options.connected ?? options.accounts !== undefined
  const accounts = connected ? [...(options.accounts || ['0x0000000000000000000000000000000000000001'])] : []
  const chainId = options.chainId || '0x1'
  const netVersion = options.netVersion || String(Number.parseInt(chainId, 16))
  const fixtures = options.fixtures || {}

  function error(code, message, data) {
    const value = { code, message }
    if (data !== undefined) value.data = data
    return value
  }

  function envelope(id, outcome) {
    return outcome.error
      ? { jsonrpc: '2.0', id: id === undefined ? null : id, error: outcome.error }
      : { jsonrpc: '2.0', id: id === undefined ? null : id, result: outcome.result }
  }

  function fixtureFor(method, params) {
    if (!Object.hasOwn(fixtures, method)) return undefined
    const candidates = fixtures[method]
    if (candidates === undefined) return undefined
    if (typeof candidates === 'function') return candidates(params)
    if (Array.isArray(candidates)) {
      const found = candidates.find((entry) => JSON.stringify(entry.params || []) === JSON.stringify(params))
      return found && (Object.hasOwn(found, 'error') ? { error: found.error } : { result: found.result })
    }
    if (Object.hasOwn(candidates, JSON.stringify(params))) return candidates[JSON.stringify(params)]
    if (Object.hasOwn(candidates, 'default')) return candidates.default
    return undefined
  }

  function invoke(method, params) {
    const call = { method, params }
    calls.push(call)
    trace.push({ kind: 'wallet-rpc', ...call })
    if (method === 'eth_accounts') return { result: [...accounts] }
    if (method === 'eth_requestAccounts') {
      return accounts.length ? { result: [...accounts] } : { error: error(4100, 'Wallet is not connected') }
    }
    if (method === 'eth_coinbase') return { result: accounts[0] || null }
    if (method === 'eth_chainId') return { result: chainId }
    if (method === 'net_version') return { result: netVersion }

    const configured = fixtureFor(method, params)
    if (configured !== undefined) {
      const outcome = configured && Object.hasOwn(configured, 'error') ? { error: configured.error } : configured && Object.hasOwn(configured, 'result') ? configured : { result: configured }
      trace.push({ kind: 'wallet-fixture', method, params, simulated: true, outcome })
      return outcome
    }

    const missing = { method, params }
    unavailable.push(missing)
    trace.push({ kind: 'wallet-unavailable', ...missing })
    options.onUnavailable?.(missing)
    const signing = /^(eth_sendTransaction|eth_sign|personal_sign|eth_signTypedData(?:_v[1-4])?)$/.test(method)
    return {
      error: error(
        signing ? 4100 : -32601,
        signing
          ? `Wallet denies ${method} without an explicit fixture`
          : `Wallet fixture has no explicit response for ${method}`
      )
    }
  }

  function one(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request))
      return envelope(null, { error: error(-32600, 'Invalid JSON-RPC request') })
    const hasId = Object.hasOwn(request, 'id')
    const validId = !hasId || request.id === null || typeof request.id === 'string' || (typeof request.id === 'number' && Number.isFinite(request.id))
    const isNotification = !hasId
    if (!validId) return envelope(null, { error: error(-32600, 'Invalid JSON-RPC request') })
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string')
      return isNotification ? undefined : envelope(request.id, { error: error(-32600, 'Invalid JSON-RPC request') })
    if (request.params !== undefined && (request.params === null || typeof request.params !== 'object'))
      return isNotification ? undefined : envelope(request.id, { error: error(-32600, 'Invalid JSON-RPC request') })
    const response = envelope(request.id, invoke(request.method, request.params || []))
    return hasId ? response : undefined
  }

  function respond(request) {
    if (Array.isArray(request)) {
      if (request.length === 0) return envelope(null, { error: error(-32600, 'Invalid JSON-RPC batch') })
      const replies = request.map(one).filter((reply) => reply !== undefined)
      return replies.length ? replies : undefined
    }
    return one(request)
  }

  function parseParams(jsonParams) {
    if (jsonParams === undefined) return []
    if (typeof jsonParams !== 'string') throw error(-32600, 'jsonParams must be JSON')
    const params = JSON.parse(jsonParams)
    if (params === null || typeof params !== 'object') throw error(-32600, 'jsonParams must be JSON parameters')
    return params
  }

  function bridge(args) {
    const request = args && typeof args === 'object' ? args : {}
    let response
    try {
      response = one({ jsonrpc: '2.0', id: request.id, method: request.method, params: parseParams(request.jsonParams) })
    } catch (cause) {
      response = envelope(request.id, { error: cause && cause.code ? cause : error(-32600, 'Invalid jsonParams') })
    }
    return { jsonAnyResponse: JSON.stringify(response) }
  }

  async function request(payload) {
    const response = respond(payload)
    if (Array.isArray(response)) return response
    if (response === undefined) return undefined
    if (response.error) {
      const thrown = new Error(response.error.message)
      Object.assign(thrown, response.error)
      throw thrown
    }
    return response.result
  }

  return {
    bridge,
    sendAsync: bridge,
    ethereumSendAsync: bridge,
    request,
    respond,
    connected,
    accounts,
    chainId,
    netVersion,
    calls,
    unavailable,
    trace
  }
}

module.exports = { createWalletHost }
