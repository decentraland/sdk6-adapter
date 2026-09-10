const engineName = name => String(name).startsWith('engine.') ? name : 'engine.' + name
const { boot } = require('./harness.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

async function run(bundle, expectedPayloads) {
  const upper = 'https://fixture.invalid/UI/Atlas.PNG?Signature=AbC'
  const lower = 'https://fixture.invalid/ui/atlas.png?signature=abc'
  const sizes = new Map([
    [upper, { width: 256, height: 128 }],
    [lower, { width: 512, height: 256 }]
  ])
  const requests = []
  const h = await boot(bundle, 'globalThis.__dcl=dcl;', {
    getTextureSize: ({ src }) => {
      requests.push(src)
      assert(sizes.has(src), 'Texture lookup changed source identity: ' + src)
      return { src, size: sizes.get(src) }
    }
  })
  function shared(id, classId, data) {
    h.dcl.componentCreated(id, engineName(id), classId)
    h.dcl.componentUpdated(id, JSON.stringify(data))
  }
  shared('canvas', 24, { visible: true })
  shared('upper', 68, { src: upper })
  shared('lower', 68, { src: lower })
  for (const [id, source] of [
    ['a', 'upper'],
    ['b', 'upper'],
    ['c', 'lower']
  ])
    shared(id, 29, {
      parentComponent: 'canvas',
      visible: true,
      width: 32,
      height: 16,
      source,
      sizeInPixels: true,
      sourceLeft: 32,
      sourceTop: 16,
      sourceWidth: 64,
      sourceHeight: 32
    })
  for (let i = 0; i < 6; i++) await h.tick()
  assert.deepEqual(
    requests.slice().sort(),
    [upper, lower].sort(),
    'One lookup per exact source, shared images reuse it'
  )
  const backgrounds = Object.values(h.snapshot())
    .map((v) => v['core::UiBackground'])
    .filter((v) => v?.texture?.tex?.texture)
  if (h.engine) assert.equal(backgrounds.length, 3)
  for (const bg of backgrounds) {
    const src = bg.texture.tex.texture.src
    const { width, height } = sizes.get(src)
    const u0 = 32 / width,
      u1 = 96 / width,
      v0 = 1 - 48 / height,
      v1 = 1 - 16 / height
    assert.deepEqual(bg.uvs, [u0, v0, u0, v1, u1, v1, u1, v0], 'UV rectangle uses dimensions of exact source')
  }
  for (let i = 0; i < 12; i++) await h.tick()
  assert.equal(requests.length, 2, 'Stable UI must not refetch dimensions every frame')
  assert(!h.logs.some((v) => v.level === 'error'), JSON.stringify(h.logs))
  const wire = new Map()
  for (const m of h.trace.filter((t) => t.kind === 'crdt').flatMap((t) => t.messages)) {
    if (m.component === 1053 && m.type === 1) wire.set(m.entity, m.payload)
    if (m.type === 3 || (m.component === 1053 && m.type === 2)) wire.delete(m.entity)
  }
  const payloads = [...wire.values()].sort()
  assert.equal(payloads.length, 3, 'Three serialized image backgrounds')
  if (expectedPayloads) assert.deepEqual(payloads, expectedPayloads, 'Minified UI background wire parity')
  else assert(h.engine, 'First bundle must expose readable state for independent UV expectations')
  return {
    bundle: path.basename(bundle),
    hash: h.hash,
    status: 'PASS',
    cases: 4,
    textureRequests: requests.length,
    payloads
  }
}
;(async () => {
  const bundles = process.argv[2]
    ? [path.resolve(process.argv[2])]
    : ['index.js', 'index.min.js'].map((f) => path.join(__dirname, '../dist', f))
  const outcomes = []
  for (const bundle of bundles) outcomes.push(await run(bundle, outcomes[0]?.payloads))
  fs.writeFileSync(
    path.join(__dirname, 'ui-resource-results.json'),
    JSON.stringify({ status: 'PASS', outcomes }, null, 2) + '\n'
  )
  console.log('UI resource identity, cropped UVs and lookup caching: PASS (' + outcomes.length + ' bundles)')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
