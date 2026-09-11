const assert = require('node:assert/strict')
const esbuild = require('esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { boot } = require('./harness.cjs')

const root = path.resolve(__dirname, '..')

async function bundle() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk6-f7-'))
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

// Legacy SDK6 serialized components with JSON.stringify, which drops an undefined field, and the renderer model
// defaulted a missing or null value to "". Each case pairs the JSON the scene really sends with the text to render.
// The `visible: false` row locks the adapter's hidden-text rendering (empty text); the legacy renderer kept the
// string and drew it at alpha 0, which is the same picture.
const worldCases = [
  [{ fontSize: 30 }, ''],
  [{ value: null }, ''],
  [{ value: 'Coming Soon' }, 'Coming Soon'],
  [{ fontSize: 30 }, ''],
  [{ value: 0 }, '0'],
  [{ value: 'undefined' }, 'undefined'],
  [{ value: 'hidden', visible: false }, '']
]
const uiCases = [
  [{ value: '' }, ''],
  [{}, ''],
  [{ value: null }, ''],
  [{ value: 'Table 3: open' }, 'Table 3: open'],
  [{}, ''],
  [{ value: 7 }, '7'],
  [{ value: 'undefined' }, 'undefined']
]

function textShape(harness, id) {
  return harness.snapshot()[harness.state.ecs7.entities[id]]?.['core::TextShape']
}

function uiTextValues(harness) {
  return Object.values(harness.snapshot())
    .map((node) => node['core::UiText'])
    .filter(Boolean)
    .map((text) => text.value)
}

async function run(bundlePath) {
  const harness = await boot(bundlePath, '', { deterministic: true })
  let assertions = 0

  harness.dcl.addEntity('sign')
  for (const [payload, text] of worldCases) {
    harness.dcl.updateEntityComponent('sign', 'engine.text', 21, JSON.stringify(payload))
    await harness.tick()
    assert.equal(textShape(harness, 'sign')?.text, text, `TextShape ${JSON.stringify(payload)}`)
    assertions++
  }

  const tick = async () => {
    for (let i = 0; i < 3; i++) await harness.tick()
  }
  harness.dcl.componentCreated('canvas', 'engine.shape', 24)
  harness.dcl.componentUpdated('canvas', JSON.stringify({}))
  harness.dcl.componentCreated('status', 'engine.shape', 27)
  for (const [payload, text] of uiCases) {
    harness.dcl.componentUpdated(
      'status',
      JSON.stringify({ parentComponent: 'canvas', fontSize: 14, vAlign: 'top', ...payload })
    )
    await tick()
    assert.deepEqual(uiTextValues(harness), [text], `UIText ${JSON.stringify(payload)}`)
    assertions++
  }

  assert.equal(harness.logs.filter((entry) => entry.level === 'error').length, 0, 'adapter errors')
  harness.dispose()
  console.log(`F7 text value "undefined": PASS (${assertions} payloads, world + screen-space text)`)
}

if (require.main === module)
  (async () => run(process.argv[2] || (await bundle())))().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
module.exports = { run }
