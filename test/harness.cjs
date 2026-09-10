const fs = require('fs')
const vm = require('vm')
const path = require('path')
const crypto = require('crypto')
const { offlineEthereum } = require('./offline-ethereum.cjs')
const { createHostServices } = require('./host-services.cjs')
function decode(data) {
  const b = Buffer.from(data),
    out = []
  for (let p = 0; p < b.length; ) {
    const length = b.readUInt32LE(p),
      type = b.readUInt32LE(p + 4)
    if (length < 12 || p + length > b.length) throw Error('Invalid CRDT length')
    const m = { length, type, entity: b.readUInt32LE(p + 8) }
    if (type !== 3) {
      m.component = b.readUInt32LE(p + 12)
      m.timestamp = b.readUInt32LE(p + 16)
    }
    if (type === 1 || type === 4) {
      const n = b.readUInt32LE(p + 20)
      if (n + 24 !== length) throw Error('Invalid payload size')
      m.payload = b.subarray(p + 24, p + length).toString('hex')
    }
    out.push(m)
    p += length
  }
  return out
}
function putWire(entity, component, payload, timestamp = 1) {
  const b = Buffer.alloc(24 + payload.length)
  ;[b.length, 1, entity, component, timestamp, payload.length].forEach((x, i) => b.writeUInt32LE(x, i * 4))
  Buffer.from(payload).copy(b, 24)
  return b
}
async function boot(bundle, scene = 'globalThis.__dcl=dcl;', options = {}) {
  const services =
    options.hostServices !== undefined
      ? createHostServices(options.hostServices, {
          onUnavailable: options.onServiceUnavailable,
          onTrace: options.onServiceTrace
        })
      : undefined
  const timers = new Set()
  const cancelTimer = id => { clearTimeout(id); timers.delete(id) }
  const dispose = () => { for (const id of timers) cancelTimer(id); services?.dispose() }
  const schedule = (repeat, fn, ms, ...args) => {
    const id = (repeat ? setInterval : setTimeout)(() => {
      if (!repeat) timers.delete(id)
      fn(...args)
    }, ms)
    timers.add(id)
    return id
  }
  const trace = [],
    logs = [],
    incoming = [],
    hostEvents = []
  const metadata = options.metadata || {
    main: 'bin/game.js',
    scene: { base: '0,0', parcels: ['0,0'] },
    display: { title: 'SDK6 conformance' }
  }
  const user = {
    userId: services?.wallet.accounts[0] ?? 'local-user',
    displayName: 'Local',
    hasConnectedWeb3: Boolean(services?.wallet.accounts.length),
    version: 1,
    avatar: { wearables: [], snapshots: {} }
  }
  const replies = {
    '~system/Runtime': {
      readFile:
        options.readFile ||
        (({ fileName }) => ({
          content: Buffer.from(fileName === 'scene.json' ? JSON.stringify(metadata) : scene)
        })),
      getSceneInformation:
        options.getSceneInformation ||
        (() => ({
          urn: 'test-scene',
          baseUrl: 'http://fixture.invalid/',
          content: [],
          metadataJson: JSON.stringify(metadata)
        })),
      getRealm: () => ({
        realmInfo: { baseUrl: 'http://fixture.invalid/', realmName: 'Test', room: 'test', isPreview: false }
      }),
      getExplorerInformation: () => ({ platform: 'desktop', agent: 'synthetic' }),
      getWorldTime: () => ({ seconds: 123 })
    },
    '~system/EngineApi': {
      crdtGetState: () => ({
        hasEntities: true,
        data: [putWire(0, 1054, Buffer.from('0d0000803f10800a18d005', 'hex'))]
      }),
      crdtSendToRenderer: ({ data }) => {
        options.onCrdt?.(data)
        if (options.recordTrace !== false)
          trace.push({ kind: 'crdt', messages: decode(data), base64: Buffer.from(data).toString('base64') })
        return { data: incoming.splice(0) }
      },
      sendBatch: () => ({ events: hostEvents.splice(0) }),
      subscribe: () => ({}),
      unsubscribe: () => ({})
    },
    '~system/Players': {
      getConnectedPlayers: () => ({ players: [{ userId: 'remote-user' }] }),
      getPlayersInScene: () => ({ players: [{ userId: 'remote-user' }] }),
      getPlayerData: () => ({ data: { ...user, userId: 'remote-user' } })
    },
    '~system/UserActionModule': { requestTeleport: () => ({}) },
    '~system/UserIdentity': { getUserData: options.getUserData || (() => ({ data: user })) },
    '~system/RestrictedActions': Object.fromEntries(
      ['movePlayerTo', 'triggerEmote', 'openExternalUrl', 'openNftDialog'].map((n) => [n, () => ({})])
    ),
    '~system/CommunicationsController': { send: () => ({}) },
    '~system/PortableExperiences': {
      spawn: ({ pid }) => ({ pid, parentCid: 'test-scene' }),
      kill: () => ({ status: true }),
      exit: () => ({ status: true }),
      getPortableExperiencesLoaded: () => ({ loaded: [] })
    },
    '~system/EthereumController': {
      requirePayment: () => ({ jsonAnyResponse: JSON.stringify({ transactionHash: 'fixture-only' }) }),
      signMessage: () => ({ message: 'fixture', hexEncodedMessage: '0x00', signature: 'fixture-only' }),
      sendAsync: (args) =>
        options.ethereumSendAsync
          ? options.ethereumSendAsync(args)
          : services
          ? services.ethereumSendAsync(args)
          : offlineEthereum(args)
    },
    '~system/SignedFetch': {
      signedFetch: () => ({ ok: true, status: 200, statusText: 'OK', headers: {}, body: '{"fixture":true}' })
    },
    '~system/AdaptationLayerHelper': {
      getTextureSize: ({ src }) =>
        options.getTextureSize ? options.getTextureSize({ src }) : { src, size: { width: 256, height: 256 } }
    }
  }
  for (const [name, methods] of Object.entries(options.rpcOverrides ?? {})) {
    replies[name] = { ...(replies[name] ?? {}), ...methods }
  }
  const context = vm.createContext({
    module: { exports: {} },
    exports: {},
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    Blob,
    DataView,
    setTimeout: (...args) => schedule(false, ...args),
    clearTimeout: cancelTimer,
    setInterval: (...args) => schedule(true, ...args),
    clearInterval: cancelTimer,
    URL,
    URLSearchParams,
    performance,
    console: Object.fromEntries(
      ['log', 'warn', 'error', 'info', 'debug'].map((n) => [
        n,
        (...a) => {
          const entry = { level: n, args: a.map((x) => String(x)) }
          options.onLog?.(entry)
          if (logs.length < (options.maxLogs ?? Infinity)) logs.push(entry)
        }
      ])
    ),
    fetch:
      options.fetch ||
      (() => {
        throw Error('Unexpected network fetch')
      }),
    require(name) {
      if (!replies[name]) throw Error('Unmocked module ' + name)
      return new Proxy(replies[name], {
        get(o, k) {
          if (!(k in o)) throw Error('Unmocked RPC ' + name + '.' + String(k))
          return async (args) => {
            options.onRpc?.({ module: name, method: k, args })
            if (options.recordTrace !== false) trace.push({ kind: 'rpc', module: name, method: k, args })
            return o[k](args)
          }
        }
      })
    }
  })
  if (options.webSocket || services) context.WebSocket = options.webSocket || services.WebSocket
  if (options.readonlyHostAliases)
    for (const name of ['window', 'self'])
      Object.defineProperty(context, name, { get: () => context, configurable: true })
  if (options.deterministic)
    vm.runInContext(
      `
    (() => {
    let seed = ${Number(options.seed ?? 123456789) >>> 0} || 1;
    Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296 };
    globalThis.__clock = 1600000000000;
    let timerId = 0;
    const timers = new Map();
    const schedule = (fn, ms, args, interval) => {
      const id = ++timerId;
      timers.set(id, {fn, args, at: globalThis.__clock + Math.max(0, Number(ms) || 0), interval});
      return id;
    };
    globalThis.setTimeout = (fn, ms, ...args) => schedule(fn, ms, args, 0);
    globalThis.setInterval = (fn, ms, ...args) => schedule(fn, ms, args, Math.max(1, Number(ms) || 0));
    globalThis.clearTimeout = globalThis.clearInterval = id => timers.delete(id);
    globalThis.performance = {now: () => globalThis.__clock - 1600000000000};
    globalThis.__runTimers = () => {
      for (const [id, timer] of [...timers]) {
        if (!timers.has(id) || timer.at > globalThis.__clock) continue;
        if (timer.interval) timer.at += timer.interval;
        else timers.delete(id);
        timer.fn(...timer.args);
      }
    };

    const NativeDate = Date;
    const deterministicNow = () => Math.trunc(globalThis.__clock);
    globalThis.Date = new Proxy(NativeDate, {
      apply() { return new NativeDate(globalThis.__clock).toString() },
      construct(target, args, newTarget) {
        return Reflect.construct(target, args.length ? args : [globalThis.__clock], newTarget)
      },
      get(target, key, receiver) {
        return key === 'now' ? deterministicNow : Reflect.get(target, key, receiver)
      }
    });
    })();
  `,
      context
    )
  // Observe the evaluator's receiver without injecting code into the SDK6 bundle
  // or weakening the production separation between scene and host globals.
  let sceneContext = context
  const NativeFunction = vm.runInContext('Function', context)
  context.Function = new Proxy(NativeFunction, {
    construct(target, args) {
      const fn = Reflect.construct(target, args)
      return new Proxy(fn, {
        apply(target, receiver, args) {
          if (receiver?.dcl?.componentUpdated && receiver?.self === receiver) sceneContext = receiver
          return Reflect.apply(target, receiver, args)
        }
      })
    }
  })
  let source = fs.readFileSync(bundle, 'utf8')
  source = source.replace(/function createAdaptionLayer\((?:developerMode)?\) \{/, '$&\n globalThis.__state = state;')
  vm.runInContext(source, context, { filename: bundle, timeout: 10000 })
  const tick = async (dt = 1 / 60) => {
    if (options.deterministic) {
      context.__clock += dt * 1000
      context.__runTimers()
    }
    services?.pump()
    await context.module.exports.onUpdate(dt)
    await new Promise((r) => setImmediate(r))
  }
  try {
    await context.module.exports.onStart()
    for (let i = 0; i < 8; i++) await tick()
  } catch (error) {
    dispose()
    throw error
  }
  const engine = vm.runInContext('typeof engine === "undefined" ? null : engine', context)
  function snapshot() {
    const out = {}
    if (!engine) return out
    for (const c of engine.componentsIter()) {
      if (c.componentId > 20000 && !c.componentName?.startsWith('sdk6::')) continue
      for (const [e, v] of c.iterator()) {
        ;(out[e] ??= {})[c.componentName || c.componentId] = JSON.parse(JSON.stringify(v))
      }
    }
    return out
  }
  const actions = []
  const record = (action, invoke) => {
    actions.push(action)
    const success = (value) => {
      try {
        action.outcome = { value: JSON.parse(JSON.stringify(value ?? null)) }
      } catch {
        action.unreplayable = true
      }
    }
    const failure = (error) => {
      action.outcome = { error: String(error) }
    }
    try {
      const value = invoke()
      if (value && typeof value.then === 'function')
        return value.then(
          (result) => {
            success(result)
            return result
          },
          (error) => {
            failure(error)
            throw error
          }
        )
      success(value)
      return value
    } catch (error) {
      failure(error)
      throw error
    }
  }
  if (options.recordTrace !== false) {
    incoming.push = (...buffers) => {
      for (const bytes of buffers) actions.push({ method: '__incoming', args: [Buffer.from(bytes).toString('base64')] })
      return Array.prototype.push.apply(incoming, buffers)
    }
  }
  const sceneDcl = sceneContext.__dcl || sceneContext.dcl || context.__dcl
  const observedDcl =
    options.recordTrace === false
      ? sceneDcl
      : sceneDcl &&
        new Proxy(sceneDcl, {
          get(o, k) {
            const f = o[k]
            return typeof f === 'function'
              ? (...args) => {
                  return record(
                    { method: k, args: args.map((a) => (typeof a === 'function' ? { callback: true } : a)) },
                    () => f(...args)
                  )
                }
              : f
          }
        })
  return {
    context,
    services,
    dispose,
    sceneContext: sceneContext.globalThis === sceneContext ? sceneContext : context,
    trace,
    logs,
    incoming,
    hostEvents,
    actions,
    tick: async (dt = 1 / 60) => {
      return options.recordTrace === false ? tick(dt) : record({ method: '__tick', args: [dt] }, () => tick(dt))
    },
    engine,
    snapshot,
    dcl: observedDcl,
    state: context.__state,
    hash: crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex')
  }
}
module.exports = { boot, decode, putWire }
if (require.main === module)
  (async () => {
    for (const name of ['sdk6', 'sdk7']) {
      try {
        const h = await boot(path.join(__dirname, 'artifacts', name + '-adapter.js'))
        console.log(
          name,
          JSON.stringify({
            exports: Object.keys(h.context.module.exports),
            dcl: Object.keys(h.dcl || {}),
            snapshot: h.snapshot(),
            logs: h.logs
          })
        )
      } catch (e) {
        console.error(name, e.stack)
      }
    }
  })()
