async function main() {
{
const { boot } = require('./harness.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const scene = `
;(function(root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') module.exports = factory()
  else root.CANNON = factory()
})(globalThis, function() { return { body: 'scene physics' } })
globalThis.isolation = { browserGlobals: globalThis === self && self === window, cannon: CANNON.body, builtins: globalThis.console === console && globalThis.Promise === Promise && globalThis.Math === Math }
try { require('~system/Runtime'); isolation.hostRequire = true } catch (_) { isolation.hostRequire = false }
dcl.onStart(function() { isolation.started = true })
dcl.onUpdate(function() { isolation.ticks = (isolation.ticks || 0) + 1 })
`
await (async () => {
  const results = []
  for (const file of ['index.js', 'index.min.js']) {
    const h = await boot(path.join(__dirname, '../dist', file), scene, { readonlyHostAliases: true })
    assert.equal(typeof h.context.module.exports.onUpdate, 'function')
    assert.equal(h.context.CANNON, undefined, 'UMD global must not leak into adapter host')
    assert.equal(h.sceneContext.isolation.browserGlobals, true)
    assert.equal(h.sceneContext.isolation.cannon, 'scene physics')
    assert.equal(h.sceneContext.isolation.builtins, true)
    assert.equal(h.sceneContext.isolation.hostRequire, false)
    assert.equal(h.sceneContext.isolation.started, true)
    assert(h.sceneContext.isolation.ticks > 0)
    assert(!h.logs.some((x) => x.level === 'error'), JSON.stringify(h.logs))
    results.push({ file, hash: h.hash, status: 'PASS', assertions: 9 })
  }
  fs.writeFileSync(path.join(__dirname, 'sandbox-isolation-results.json'), JSON.stringify({ results }, null, 2) + '\n')
  console.log('Sandbox UMD isolation and lifecycle: PASS (selected shipping artifacts)')
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

}
if (process.exitCode) throw Error("sandbox-isolation failed")
{
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { boot } = require('./harness.cjs')

const root = path.resolve(__dirname, '..')
const scene = `dcl.loadModule('Identity').then(async () => dcl.log('IDENTITY_RESULT', JSON.stringify({
  publicKey: await dcl.callRpc('Identity', 'getUserPublicKey', []),
  data: await dcl.callRpc('Identity', 'getUserData', [])
})))`
const profiles = [
  { name: 'disconnected', hasConnectedWeb3: false, expectedPublicKey: null },
  { name: 'connected', hasConnectedWeb3: true, expectedPublicKey: '0xfixture' }
]

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

async function run(bundle, profile) {
  const h = await boot(bundle, scene, {
    getUserData: () => ({
      data: {
        userId: '0xfixture',
        displayName: 'Fixture',
        hasConnectedWeb3: profile.hasConnectedWeb3,
        version: 1,
        avatar: { wearables: [], snapshots: {} }
      }
    })
  })
  for (let i = 0; i < 4; i++) await h.tick()
  const line = h.logs.find((entry) => entry.args[0] === 'IDENTITY_RESULT')
  assert(line, JSON.stringify(h.logs))
  const result = JSON.parse(line.args[1])
  assert.equal(result.publicKey, profile.expectedPublicKey)
  assert.equal(result.data.publicKey, profile.expectedPublicKey)
  assert.equal(result.data.userId, '0xfixture')
  return { profile: profile.name, status: 'PASS' }
}

await (async () => {
  const results = []
  for (const name of ['index.js', 'index.min.js']) {
    const bundle = path.join(root, 'dist', name)
    const pinned = { file: path.relative(root, bundle), sha256: sha256(bundle) }
    for (const profile of profiles) results.push({ ...pinned, ...(await run(bundle, profile)) })
  }
  fs.writeFileSync(
    path.join(__dirname, 'identity-module-results.json'),
    JSON.stringify({ status: 'PASS', results }, null, 2) + '\n'
  )
  console.log(`Identity public-key gating: ${results.length} bundle cases PASS`)
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

}
if (process.exitCode) throw Error("identity-module failed")
{
const assert = require('node:assert/strict')
const esbuild = require('esbuild')
const vm = require('node:vm')
const fs = require('node:fs')

await (async () => {
  const build = await esbuild.build({
    stdin: {
      contents: "export * from './src/modules/AirdropController'; export * from './src/modules/AirdropUi'",
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['~system/*', '@dcl/sdk/react-ecs']
  })
  const calls = []
  const context = vm.createContext({
    exports: {},
    module: { exports: {} },
    console,
    require(name) {
      if (name === '@dcl/sdk/react-ecs')
        return {
          __esModule: true,
          default: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) },
          UiEntity: 'UiEntity'
        }
      calls.push(name)
      throw new Error(`Airdrop must not access host services: ${name}`)
    }
  })
  vm.runInContext(build.outputFiles[0].text, context)
  const api = context.module.exports,
    module = api.create()
  const open = () => module.openCrate({ title: 'Reward', items: [{ name: 'Item' }] }, '0xabcd', '0x' + '1'.repeat(40))
  function buttons() {
    const out = []
    function visit(node) {
      if (Array.isArray(node)) node.forEach(visit)
      else if (node && typeof node === 'object') {
        if (node.props?.onMouseDown) out.push(node)
        visit(node.children)
      }
    }
    visit(api.renderAirdrop())
    return out
  }
  await open()
  const rendered = JSON.stringify(api.renderAirdrop())
  assert.match(rendered, /AIRDROP DOES NOT WORK/)
  assert.match(rendered, /You cannot claim items here/)
  assert.doesNotMatch(rendered, /Review in wallet|NOT VERIFIED|may not work/)
  assert.equal(api.acceptCrate, undefined, 'No transaction submission entry point')
  assert.equal(buttons().length, 1)
  assert.equal(buttons()[0].props.uiText.value, 'Close')
  buttons()[0].props.onMouseDown()
  assert.equal(api.currentCrate(), undefined)
  assert.equal(calls.length, 0, 'Opening and closing never accesses wallet services')
  for (let i = 0; i < 16; i++) await open()
  await assert.rejects(open(), /Too many pending/)
  await assert.rejects(module.openCrate({ title: 'bad', items: [] }, '0xab', 'bad'), /Invalid airdrop target/)
  fs.writeFileSync(
    'test/airdrop-confirmation-results.json',
    JSON.stringify(
      {
        status: 'PASS',
        scope: 'Source-level unavailable Airdrop dialog; wallet service access forbidden',
        checks: ['explicit-unavailable-warning', 'close-only', 'no-wallet-access', 'no-submit-entry-point', 'queue-bound', 'invalid-input']
      },
      null,
      2
    ) + '\n'
  )
  console.log('Airdrop unavailable dialog and no-wallet checks PASS')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

}
if (process.exitCode) throw Error("airdrop-confirmation failed")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
