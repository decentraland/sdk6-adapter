const assert = require('node:assert/strict')
const esbuild = require('esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { boot, putWire } = require('./harness.cjs')

const root = path.resolve(__dirname, '..')
const HOLD_MAX_TICKS = 120
const HOLD_MAX_MS = 2000
const LOCAL = '0xlocal'
const REMOTE = '0xremote'
const LATE = '0xlate'
const playerEvents = ['onEnterScene', 'playerConnected', 'onLeaveScene', 'playerDisconnected']

// Mirrors the Foundation `userData` module shared by the 2023 welcome areas: user data is cached from
// start-up Identity calls and read inside the player enter-scene handler.
const scene = `
dcl.log('MP_ARMED', Date.now())
let userData
dcl.loadModule('@decentraland/Identity', {})
  .then((m) => Promise.all([
    dcl.callRpc(m.rpcHandle, 'getUserPublicKey', []),
    dcl.callRpc(m.rpcHandle, 'getUserData', [])
  ]))
  .then(([, data]) => { userData = data; dcl.log('MP_ME', data.userId) })
for (const type of ${JSON.stringify(playerEvents)}) dcl.subscribe(type)
dcl.onEvent((event) => {
  if (!${JSON.stringify(playerEvents)}.includes(event.type)) return
  dcl.log('MP_EVENT', event.type, event.data.userId, userData === undefined ? 'unset' : userData.userId)
})
`

async function bundle() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk6-f17f22-'))
  const output = path.join(directory, 'index.js')
  await esbuild.build({
    entryPoints: [path.join(root, 'src/index.ts')],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    outfile: output,
    external: ['~system/*'],
    alias: { '~sdk/all-composites': path.join(root, 'src/empty-composites.ts') },
    define: { SDK6_DIRECT_TRANSFORM: 'false' },
    logLevel: 'silent'
  })
  return { directory, output }
}

function pbString(field, value) {
  const bytes = Buffer.from(value, 'utf8')
  assert(bytes.length < 128)
  return Buffer.concat([Buffer.from([(field << 3) | 2, bytes.length]), bytes])
}

function deleteWire(entity, component, timestamp) {
  const b = Buffer.alloc(20)
  ;[20, 2, entity, component, timestamp].forEach((x, i) => b.writeUInt32LE(x, i * 4))
  return b
}

function componentIds(h) {
  return {
    identity: h.engine.getComponent('core::PlayerIdentityData').componentId,
    avatar: h.engine.getComponent('core::AvatarBase').componentId
  }
}

function enterWires(h, entity, address, timestamp = 1) {
  const { identity, avatar } = componentIds(h)
  return [
    putWire(entity, identity, Buffer.concat([pbString(1, address), Buffer.from([0x18, 0])]), timestamp),
    putWire(entity, avatar, pbString(5, `Player ${address}`), timestamp)
  ]
}

const userData = {
  userId: LOCAL,
  displayName: 'Local',
  hasConnectedWeb3: true,
  version: 1,
  avatar: { wearables: [], snapshots: {} }
}
const received = (h) => h.logs.filter((e) => e.args[0] === 'MP_EVENT').map((e) => [e.args[1], e.args[2], e.args[3]])
const identityResolved = (h) => h.logs.some((e) => e.args[0] === 'MP_ME')
const errors = (h) => h.logs.filter((e) => e.level === 'error').map((e) => e.args.join(' '))
const ticks = async (h, n) => {
  for (let i = 0; i < n; i++) await h.tick()
}

async function singleDelivery(output) {
  const h = await boot(output, scene, { deterministic: true, getUserData: () => ({ data: userData }) })
  assert(identityResolved(h), 'immediate identity resolves during boot')
  h.incoming.push(...enterWires(h, 1, LOCAL), ...enterWires(h, 64, REMOTE))
  await ticks(h, 2)
  assert.deepEqual(received(h), [
    ['onEnterScene', LOCAL, LOCAL],
    ['playerConnected', LOCAL, LOCAL],
    ['onEnterScene', REMOTE, LOCAL],
    ['playerConnected', REMOTE, LOCAL]
  ])
  h.incoming.push(deleteWire(64, componentIds(h).avatar, 2))
  await ticks(h, 2)
  assert.deepEqual(received(h).slice(4), [
    ['onLeaveScene', REMOTE, LOCAL],
    ['playerDisconnected', REMOTE, LOCAL]
  ])
  assert.deepEqual(errors(h), [])
  return { events: received(h).length }
}

async function heldUntilIdentity(output) {
  const resolvers = []
  const h = await boot(output, scene, {
    deterministic: true,
    getUserData: () => new Promise((resolve) => resolvers.push(resolve))
  })
  assert.equal(resolvers.length, 2, 'both start-up identity calls are issued during boot')
  h.incoming.push(...enterWires(h, 1, LOCAL), ...enterWires(h, 64, REMOTE))
  await ticks(h, 4)
  assert.deepEqual(received(h), [], 'player events are held while identity calls are pending')
  assert(!identityResolved(h))
  for (const resolve of resolvers) resolve({ data: userData })
  await ticks(h, 1)
  assert(identityResolved(h))
  assert.deepEqual(received(h), [
    ['onEnterScene', LOCAL, LOCAL],
    ['playerConnected', LOCAL, LOCAL],
    ['onEnterScene', REMOTE, LOCAL],
    ['playerConnected', REMOTE, LOCAL]
  ])
  h.incoming.push(...enterWires(h, 65, LATE))
  await ticks(h, 2)
  assert.deepEqual(received(h).slice(4), [
    ['onEnterScene', LATE, LOCAL],
    ['playerConnected', LATE, LOCAL]
  ])
  assert.deepEqual(errors(h), [])
  return { events: received(h).length }
}

// The scene logs the deterministic clock at evaluation time, which is the instant the gate was armed.
const armedAt = (h) => Number(h.logs.find((e) => e.args[0] === 'MP_ARMED').args[1])

async function releasedAtCap(output, dt) {
  const h = await boot(output, scene, { deterministic: true, getUserData: () => new Promise(() => {}) })
  h.incoming.push(...enterWires(h, 1, LOCAL))
  let waited = 0
  while (received(h).length === 0 && waited < HOLD_MAX_TICKS + 8) {
    await h.tick(dt)
    waited++
  }
  assert(waited > 8, `events were held (${waited} ticks)`)
  assert(waited <= HOLD_MAX_TICKS, `events were released by a cap (${waited} ticks)`)
  assert.deepEqual(received(h), [
    ['onEnterScene', LOCAL, 'unset'],
    ['playerConnected', LOCAL, 'unset']
  ])
  assert(!identityResolved(h))
  assert.deepEqual(errors(h), [])
  return { events: received(h).length, waited, elapsedMs: h.context.__clock - armedAt(h) }
}

// One millisecond per tick keeps the wall clock under HOLD_MAX_MS, so only the tick cap can release; fifty
// milliseconds per tick reaches HOLD_MAX_MS in fewer ticks than the tick cap needs, so only the wall clock can.
async function releasedAtEitherCap(output) {
  const byTicks = await releasedAtCap(output, 1 / 1000)
  assert(byTicks.elapsedMs < HOLD_MAX_MS, `tick cap: wall clock stayed under the cap (${byTicks.elapsedMs} ms)`)
  const byClock = await releasedAtCap(output, 1 / 20)
  assert(byClock.elapsedMs >= HOLD_MAX_MS, `wall-clock cap: the clock reached the cap (${byClock.elapsedMs} ms)`)
  assert(
    byClock.waited < byTicks.waited,
    `wall-clock cap: fewer ticks than the tick cap (${byClock.waited} < ${byTicks.waited})`
  )
  return { byTicks, byClock }
}

;(async () => {
  const { directory, output } = await bundle()
  try {
    const cases = {
      f17SingleDelivery: await singleDelivery(output),
      f22HeldUntilIdentity: await heldUntilIdentity(output),
      f22ReleasedAtCap: await releasedAtEitherCap(output)
    }
    const { byTicks, byClock } = cases.f22ReleasedAtCap
    console.log(
      `F17/F22 player events: PASS (single delivery ${cases.f17SingleDelivery.events}, held ${cases.f22HeldUntilIdentity.events}, tick cap after ${byTicks.waited} ticks at ${byTicks.elapsedMs} ms, wall-clock cap after ${byClock.waited} ticks at ${byClock.elapsedMs} ms)`
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
