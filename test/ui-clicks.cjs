// Click and input behaviour of the SDK6 UI classes: onClick on images and buttons must fire exactly
// once per pointer-down with the legacy payload, never while hidden, non-blocking or under such an
// ancestor, and follow updates and disposal; UIInputText must report onChanged/onTextSubmit with the
// legacy payloads and drop empty submissions. Pointer results are injected the way a host does it:
// PointerEventsResult (append-only set) and UiInputResult (last-writer-wins) CRDT messages.
const assert = require('node:assert/strict')
const path = require('node:path')
const vm = require('node:vm')
const { boot, putWire } = require('./harness.cjs')

const DOWN = 1
const UP = 0
const POINTER = 0
const PRIMARY = 1

async function run(bundle) {
  const h = await boot(bundle)
  const events = []
  h.dcl.onEvent((e) => events.push(JSON.parse(JSON.stringify(e))))
  const put = (id, cls, value) => {
    h.dcl.componentCreated(id, 'engine.shape', cls)
    h.dcl.componentUpdated(id, JSON.stringify(value))
  }
  const tick = async (n = 3) => {
    for (let i = 0; i < n; i++) await h.tick()
  }
  const nodes = () => Object.entries(h.snapshot()).filter(([, n]) => n['core::UiTransform'])
  const image = (tag) => {
    const hits = nodes().filter(
      ([, n]) => n['core::UiBackground']?.texture?.tex?.texture?.src === `https://fixture.invalid/${tag}.png`
    )
    assert.equal(hits.length, 1, `one image ${tag}`)
    return Number(hits[0][0])
  }
  const listeners = (entity) => h.snapshot()[entity]?.['core::PointerEvents']?.pointerEvents?.length ?? 0
  const buffer = () => new (vm.runInContext('ReadWriteByteBuffer', h.context))()
  let stamp = 100
  const zero = { x: 0, y: 0, z: 0 }
  const pointer = async (entity, state, button = POINTER, timestamp = ++stamp) => {
    const b = buffer()
    h.engine.getComponent(1063).schema.serialize(
      {
        button,
        state,
        timestamp,
        tickNumber: 0,
        hit: { entityId: entity, length: 0, position: zero, normalHit: zero, direction: zero, globalOrigin: zero }
      },
      b
    )
    const wire = putWire(entity, 1063, b.toBinary())
    wire.writeUInt32LE(4, 4)
    h.incoming.push(wire)
    await tick()
  }
  const typed = async (entity, value, isSubmit) => {
    const b = buffer()
    h.engine.getComponent(1095).schema.serialize({ value, isSubmit }, b)
    h.incoming.push(putWire(entity, 1095, b.toBinary(), ++stamp))
    await tick()
  }
  const drain = () => {
    const out = events.filter((e) => e.type === 'uuidEvent').map((e) => e.data)
    events.length = 0
    return out
  }
  const click = (uuid) => [{ uuid, payload: { buttonId: 0 } }]

  put('canvas', 24, {})
  for (const tag of ['a', 'b']) put('tex-' + tag, 68, { src: `https://fixture.invalid/${tag}.png` })
  put('parent', 25, { parentComponent: 'canvas', width: 600, height: 400 })
  put('img-a', 29, { parentComponent: 'parent', source: 'tex-a', onClick: 'click-a' })
  put('img-b', 29, { parentComponent: 'canvas', source: 'tex-b', onClick: 'click-b', positionX: 300 })
  put('btn', 41, {
    parentComponent: 'canvas',
    text: 'go',
    onClick: 'click-btn',
    background: { r: 0.5, g: 0, b: 0, a: 1 },
    positionX: -300
  })
  put('input', 28, {
    parentComponent: 'canvas',
    placeholder: 'type',
    onChanged: 'changed',
    onTextSubmit: 'submit',
    onFocus: 'focus',
    onBlur: 'blur',
    positionY: 200
  })
  put('input-change-only', 28, {
    parentComponent: 'canvas',
    placeholder: 'change-only',
    onChanged: 'changed-only',
    positionY: -200
  })
  put('input-sdk6', 28, {
    parentComponent: 'canvas',
    placeholder: 'sdk6',
    onTextChanged: 'text-changed',
    onChanged: null,
    onTextSubmit: null,
    positionX: 300
  })
  await tick()
  drain()

  const a = image('a')
  const b = image('b')
  await pointer(a, DOWN)
  assert.deepEqual(drain(), click('click-a'), 'pointer down fires onClick once with the legacy buttonId payload')
  await pointer(a, UP)
  assert.deepEqual(drain(), [], 'pointer up fires nothing')
  await pointer(a, DOWN, POINTER, stamp)
  assert.deepEqual(drain(), [], 'a result that is not newer than the last one is ignored')
  await pointer(a, DOWN, PRIMARY)
  assert.deepEqual(drain(), [], 'the primary action does not click (legacy fired for mouse buttons only)')
  await pointer(b, DOWN)
  assert.deepEqual(drain(), click('click-b'), 'each image reports its own uuid')
  await pointer(a, DOWN)
  await pointer(a, UP)
  await pointer(a, DOWN)
  assert.deepEqual(drain(), [...click('click-a'), ...click('click-a')], 'repeated clicks fire once each')

  put('img-a', 29, { parentComponent: 'parent', source: 'tex-a', onClick: 'click-a2' })
  await tick()
  await pointer(a, DOWN)
  assert.deepEqual(drain(), click('click-a2'), 'an updated onClick fires the new uuid')
  put('img-a', 29, { parentComponent: 'parent', source: 'tex-a', onClick: null })
  await tick()
  assert.equal(listeners(a), 0, 'clearing onClick removes the host listener marker')
  await pointer(a, DOWN)
  assert.deepEqual(drain(), [], 'no onClick, no event')
  put('img-a', 29, { parentComponent: 'parent', source: 'tex-a', onClick: 'click-a' })
  await tick()
  await pointer(a, DOWN)
  assert.deepEqual(drain(), click('click-a'), 'restoring onClick fires again')

  for (const [label, value] of [
    ['visible false', { visible: false }],
    ['isPointerBlocker false', { isPointerBlocker: false }]
  ]) {
    put('img-a', 29, { parentComponent: 'parent', source: 'tex-a', onClick: 'click-a', ...value })
    await tick()
    assert.equal(listeners(a), 0, `${label}: no listener`)
    await pointer(a, DOWN)
    assert.deepEqual(drain(), [], `${label}: no event`)
    put('img-a', 29, { parentComponent: 'parent', source: 'tex-a', onClick: 'click-a' })
    await tick()
    assert.equal(listeners(a), 1, `${label} lifted: one listener marker, not an accumulated list`)
    await pointer(a, DOWN)
    assert.deepEqual(drain(), click('click-a'), `${label} lifted: clicks again`)
  }
  for (const [label, value] of [
    ['parent hidden', { visible: false }],
    ['parent non-blocking', { isPointerBlocker: false }]
  ]) {
    put('parent', 25, { parentComponent: 'canvas', width: 600, height: 400, ...value })
    await tick()
    assert.equal(listeners(a), 0, `${label}: no listener on the child`)
    await pointer(a, DOWN)
    assert.deepEqual(drain(), [], `${label}: no event on the child`)
    put('parent', 25, { parentComponent: 'canvas', width: 600, height: 400 })
    await tick()
    assert.equal(listeners(a), 1, `${label} lifted: one listener marker on the child`)
    await pointer(a, DOWN)
    assert.deepEqual(drain(), click('click-a'), `${label} lifted: the child clicks again`)
  }

  h.dcl.componentDisposed('img-b')
  await tick()
  assert.equal(h.snapshot()[b], undefined, 'a disposed image leaves the tree')
  await pointer(b, DOWN)
  assert.deepEqual(drain(), [], 'a result for a disposed image fires nothing')
  await pointer(a, DOWN)
  assert.deepEqual(drain(), click('click-a'), 'other images keep working after a disposal')

  const btn = Number(nodes().find(([, n]) => n['core::UiBackground']?.color?.r === 0.5)[0])
  await pointer(btn, DOWN)
  assert.deepEqual(drain(), click('click-btn'), 'button onClick fires with the legacy payload')
  await pointer(btn, UP)
  assert.deepEqual(drain(), [], 'button pointer up fires nothing')
  put('btn', 41, {
    parentComponent: 'canvas',
    text: 'go',
    onClick: 'click-btn',
    background: { r: 0.5, g: 0, b: 0, a: 1 },
    positionX: -300,
    visible: false
  })
  await tick()
  await pointer(btn, DOWN)
  assert.deepEqual(drain(), [], 'a hidden button fires nothing')

  const inputs = nodes().filter(([, n]) => n['core::UiInput'])
  const input = Number(inputs.find(([, n]) => n['core::UiInput'].placeholder === 'type')[0])
  const changeOnly = Number(inputs.find(([, n]) => n['core::UiInput'].placeholder === 'change-only')[0])
  await typed(input, 'hello', false)
  assert.deepEqual(
    drain(),
    [{ uuid: 'changed', payload: { value: 'hello' } }],
    'typing reports onChanged with the legacy payload'
  )
  await typed(input, 'hello!', true)
  assert.deepEqual(
    drain(),
    [{ uuid: 'submit', payload: { text: 'hello!' } }],
    'submitting reports onTextSubmit once, without a duplicate onChanged'
  )
  await typed(input, '', true)
  assert.deepEqual(drain(), [], 'an empty submission is dropped as in the legacy renderer')
  await typed(input, 'again', false)
  assert.deepEqual(
    drain(),
    [{ uuid: 'changed', payload: { value: 'again' } }],
    'typing after a submit reports onChanged again'
  )
  await typed(changeOnly, 'x', false)
  assert.deepEqual(
    drain(),
    [{ uuid: 'changed-only', payload: { value: 'x' } }],
    'an input with only onChanged reports typing'
  )
  await typed(changeOnly, 'x', true)
  assert.deepEqual(drain(), [], 'submitting the already reported text is not a change')
  assert.equal(
    events.filter((e) => e.type === 'uuidEvent' && ['focus', 'blur'].includes(e.data.uuid)).length,
    0,
    'onFocus/onBlur never fire (no SDK7 signal)'
  )
  const sdk6 = Number(inputs.find(([, n]) => n['core::UiInput'].placeholder === 'sdk6')[0])
  await typed(sdk6, 'a', false)
  assert.deepEqual(
    drain(),
    [{ uuid: 'text-changed', payload: { value: { value: 'a', isSubmit: false } } }],
    'the SDK6 6.x onTextChanged uuid receives typing with the value/isSubmit payload'
  )
  await typed(sdk6, 'ab', true)
  assert.deepEqual(
    drain(),
    [{ uuid: 'text-changed', payload: { value: { value: 'ab', isSubmit: true } } }],
    'the SDK6 6.x onTextChanged uuid receives one submit event'
  )
  await typed(sdk6, '', true)
  assert.deepEqual(drain(), [], 'an empty submission is dropped on the onTextChanged path too')
  h.dcl.componentDisposed('input')
  await tick()
  await typed(input, 'gone', false)
  assert.deepEqual(drain(), [], 'a disposed input reports nothing')

  assert.deepEqual(
    h.logs.filter((l) => l.level === 'error'),
    [],
    'no errors logged'
  )
}

;(async () => {
  await run(path.join(__dirname, '../dist/index.js'))
  console.log(
    'UI clicks and input: PASS (onClick once per pointer down, hidden/non-blocking/ancestor gating, update, disposal, button, onChanged/onTextSubmit payloads, empty submit dropped)'
  )
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
