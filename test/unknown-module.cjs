const assert = require('node:assert/strict')
const esbuild = require('esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { boot } = require('./harness.cjs')

const root = path.resolve(__dirname, '..')
const legacyMessage = 'The module is not available in the list!'

// bevy-explorer reports a promise nobody handles as `console.error('Unhandled promise rejection: ', reason)`.
// Node would exit on the same rejection, so the report is recorded here and asserted against per boot.
const unhandled = []
process.on('unhandledRejection', (reason) => unhandled.push(String(reason)))

async function bundle() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk6-f21-'))
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
  return output
}

// The `@dcl/amd` loader every SDK6 bundle starts with, lifted from the first module of the sdk6-basic fixture. It
// asks the host for each `@`-prefixed dependency, hands a rejection to `onerror` or rethrows it, and checks at
// scene start that every registered module loaded.
function amdLoader() {
  const source = fs.readFileSync(path.join(__dirname, 'fixtures/sdk6-basic.js'), 'utf8')
  const first = source.slice(0, source.indexOf('/*! "', 10))
  const literal = first.match(/eval\(("[\s\S]*")\)\s*;?\s*$/)
  assert(literal, 'sdk6-basic.js starts with the eval-wrapped @dcl/amd loader')
  const code = JSON.parse(literal[1])
  assert(code.includes('typeof onerror'), 'the loader routes rejections through onerror')
  return code
}

// Direct `dcl.loadModule` calls: a host module by either spelling, unknown names with and without the
// `@decentraland/` prefix (the legacy message names the prefixed one `Legacy<name>`), and an in-bundle package.
const direct = `
const report = (tag, value) => dcl.log(tag, JSON.stringify(value))
const attempt = (name) =>
  dcl.loadModule(name, {}).then(
    (descriptor) => report('F21_RESOLVED', { name, methods: descriptor.methods.map((m) => m.name).sort() }),
    (error) => report('F21_REJECTED', { name, message: String(error && error.message) })
  )
attempt('@decentraland/Identity')
attempt('Identity')
attempt('@dcl/ecs-scene-utils').then(() => attempt('@dcl/ecs-scene-utils'))
attempt('@decentraland/NotAModule')
attempt('not-a-module')
dcl.callRpc('@dcl/ecs-scene-utils', 'anything', []).then(
  () => report('F21_RPC', { status: 'resolved' }),
  (error) => report('F21_RPC', { status: 'rejected', message: String(error && error.message) })
)
`

// A dependant defined before the bundle's own define of an `@` package, so the loader asks the host first.
const inBundle = `
define('scene', ['@dcl/ecs-scene-utils', '@decentraland/Identity'], (utils, identity) => {
  dcl.log('F21_DEPENDANT', JSON.stringify({ delay: typeof utils.Delay, getUserData: typeof identity.getUserData }))
})
define('@dcl/ecs-scene-utils', ['exports'], (exports) => { exports.Delay = function Delay() {} })
`

// An `@` package the bundle never defines: the loader's start-up check has to name it.
const orphan = `
define('orphan', ['@never/defined'], () => { dcl.log('F21_ORPHAN', 'ran') })
`

// A factory that throws while a host module releases it: the loader hands the error to onerror.
const broken = `
define('broken', ['@decentraland/Identity'], () => { throw new TypeError('factory failed') })
`

const entries = (h, tag) => h.logs.filter((e) => e.args[0] === tag).map((e) => JSON.parse(e.args[1]))
const errors = (h) => h.logs.filter((e) => e.level === 'error').map((e) => e.args.join(' '))

async function run(output, scene) {
  const harness = await boot(output, amdLoader() + scene, { deterministic: true })
  for (let i = 0; i < 8; i++) await harness.tick()
  return harness
}

;(async () => {
  const output = await bundle()

  const h = await run(output, direct + inBundle)
  const resolved = entries(h, 'F21_RESOLVED')
  assert.deepEqual(
    resolved.map((r) => r.name).sort(),
    ['@decentraland/Identity', 'Identity'],
    'host modules resolve by both spellings'
  )
  for (const r of resolved) {
    assert.ok(r.methods.includes('getUserData') && r.methods.includes('getUserPublicKey'), `${r.name}: method list`)
  }

  const rejected = entries(h, 'F21_REJECTED')
  assert.deepEqual(
    rejected.map((r) => r.name).sort(),
    ['@dcl/ecs-scene-utils', '@dcl/ecs-scene-utils', '@decentraland/NotAModule', 'not-a-module'],
    'unknown names reject every time; nothing is cached for them'
  )
  for (const r of rejected) {
    const legacyName = r.name.replace(/^@decentraland\//, 'Legacy')
    assert.equal(r.message, `Error getting the methods of ${legacyName}: ${legacyMessage}`, `${r.name}: legacy message`)
  }

  const [rpc] = entries(h, 'F21_RPC')
  assert.equal(rpc.status, 'rejected')
  assert.match(rpc.message, /Module not loaded/, 'callRpc never materialises an unknown handle')

  const dependant = entries(h, 'F21_DEPENDANT')
  assert.deepEqual(
    dependant,
    [{ delay: 'function', getUserData: 'function' }],
    'the dependant runs once, released by the later define'
  )
  assert.deepEqual(errors(h), [], 'a host-module miss for an in-bundle package logs no error line')
  assert.deepEqual(unhandled, [], 'the loader hands the rejection to onerror; nothing reaches the host runtime')
  assert.deepEqual(Object.keys(h.state.loadedModules).sort(), ['@decentraland/Identity', 'Identity'])

  const o = await run(output, orphan)
  assert.deepEqual(entries(o, 'F21_ORPHAN'), [], 'the dependant of a never-defined package never runs')
  assert.equal(o.logs.filter((e) => e.level === 'error').length, 1, 'exactly one error line')
  assert.match(
    errors(o)[0],
    /^Error onStart [\s\S]*These modules didn't load[\s\S]*@never\/defined/,
    'the start-up check names it'
  )
  assert.deepEqual(unhandled, [])

  const b = await run(output, broken)
  const brokenErrors = errors(b)
  assert.equal(brokenErrors.length, 2, 'the factory error and the start-up check')
  assert.match(
    brokenErrors[0],
    /^Error in module loader [\s\S]*TypeError: factory failed/,
    'onerror reports a scene error'
  )
  assert.match(
    brokenErrors[1],
    /^Error onStart [\s\S]*These modules didn't load[\s\S]*broken/,
    'the start-up check names the module'
  )
  assert.deepEqual(unhandled, [])

  console.log(
    `f21 unknown module rejection: PASS (${resolved.length} resolved, ${rejected.length} rejected, in-bundle define released the dependant, orphan and broken modules reported)`
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
