const engineName = name => String(name).startsWith('engine.') ? name : 'engine.' + name
const { boot, putWire } = require('./harness.cjs'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm')
const bundle = path.join(__dirname, '../dist/index.js'),
  report = { resources: [], ui: [], io: [], failures: [] }
function* permutations(items) {
  if (!items.length) {
    yield []
    return
  }
  for (let i = 0; i < items.length; i++)
    for (const rest of permutations(items.filter((_, j) => j !== i))) yield [items[i], ...rest]
}
async function input(h, entity, name, value, append = false, timestamp = 100) {
  const c = [...h.engine.componentsIter()].find((c) => c.componentName === 'core::' + name)
  assert(c, 'component schema ' + name)
  const B = vm.runInContext('ReadWriteByteBuffer', h.context),
    b = new B()
  c.schema.serialize(value, b)
  const wire = putWire(entity, c.componentId, b.toBinary(), timestamp)
  if (append) wire.writeUInt32LE(4, 4)
  h.incoming.push(wire)
  await h.tick()
  await h.tick()
}
const current = (h, id) => h.snapshot()[h.state.ecs7.entities[id]] || {}
async function resources() {
  for (const kind of ['texture', 'avatar', 'audio']) {
    let n = 0
    for (const order of permutations([0, 1, 2, 3, 4, 5])) {
      const h = await boot(bundle),
        resourceId = kind === 'audio' ? 200 : kind === 'avatar' ? 72 : 68,
        componentId = kind === 'audio' ? 201 : 65,
        resource = kind === 'audio' ? { url: 'sound.ogg', volume: 0.4 } : { src: 'texture.png', userId: 'remote-user' },
        value = kind === 'audio' ? { audioClipId: 'resource', playing: true } : { albedoTexture: 'resource' }
      const calls = [
        () => h.dcl.componentCreated('resource', "engine.resource", resourceId),
        () => h.dcl.componentUpdated('resource', JSON.stringify(resource)),
        () => h.dcl.componentCreated('component', "engine.target", componentId),
        () => h.dcl.componentUpdated('component', JSON.stringify(value)),
        () => h.dcl.addEntity('a'),
        () => h.dcl.attachEntityComponent('a', "engine.target", 'component')
      ]
      try {
        for (const i of order) {
          calls[i]()
          await h.tick()
        }
        const actual = current(h, 'a')
        if (kind === 'audio') {
          assert.equal(actual['core::AudioSource']?.audioClipUrl, 'sound.ogg')
          assert.equal(actual['core::AudioSource'].volume, resource.volume)
        } else {
          const tex = actual['core::Material']?.material.pbr.texture.tex
          assert.equal(
            kind === 'avatar' ? tex.avatarTexture.userId : tex.texture.src,
            kind === 'avatar' ? 'remote-user' : 'texture.png'
          )
        }
        h.dcl.componentDisposed('component')
        await h.tick()
        assert.equal(current(h, 'a')[kind === 'audio' ? 'core::AudioSource' : 'core::Material'], undefined)
        assert(!h.logs.some((l) => l.level === 'error'), JSON.stringify(h.logs))
        n++
      } catch (error) {
        report.failures.push({ campaign: 'resource-order', kind, order, error: String(error) })
        break
      }
    }
    report.resources.push({ kind, permutationsPassed: n })
    console.log('resources', kind, n)
  }
}
async function ui() {
  const definitions = [
    ['canvas', 24, { visible: true }],
    [
      'panel',
      25,
      { parentComponent: 'canvas', visible: true, width: { type: 1, value: 300 }, height: { type: 1, value: 200 } }
    ],
    [
      'text',
      27,
      {
        parentComponent: 'panel',
        visible: true,
        value: 'label',
        width: { type: 1, value: 120 },
        height: { type: 1, value: 40 }
      }
    ],
    [
      'input',
      28,
      { parentComponent: 'panel', visible: true, value: 'initial', onChanged: 'change', onTextSubmit: 'submit' }
    ],
    [
      'image',
      29,
      {
        parentComponent: 'panel',
        visible: true,
        source: 'texture',
        width: { type: 1, value: 40 },
        height: { type: 1, value: 40 }
      }
    ],
    ['texture', 68, { src: 'fixture.png' }]
  ]
  let n = 0
  for (const order of permutations([0, 1, 2, 3, 4, 5])) {
    const h = await boot(bundle)
    try {
      for (const i of order) {
        const [id, c, v] = definitions[i]
        h.dcl.componentCreated(id, engineName(id), c)
        h.dcl.componentUpdated(id, JSON.stringify(v))
        await h.tick()
      }
      await h.tick()
      const s = Object.values(h.snapshot())
      assert(s.some((e) => e['core::UiText']?.value === 'label'))
      assert(s.some((e) => e['core::UiInput']?.value === 'initial'))
      assert(s.some((e) => e['core::UiBackground']?.texture?.tex?.texture?.src === 'fixture.png'))
      h.dcl.componentDisposed('text')
      await h.tick()
      await h.tick()
      assert(!Object.values(h.snapshot()).some((e) => e['core::UiText']))
      h.dcl.componentDisposed('panel')
      await h.tick()
      await h.tick()
      assert(!Object.values(h.snapshot()).some((e) => e['core::UiInput'] || e['core::UiText']))
      assert(!h.logs.some((l) => l.level === 'error'), JSON.stringify(h.logs))
      n++
    } catch (error) {
      report.failures.push({ campaign: 'ui-order', order, error: String(error) })
      break
    }
  }
  report.ui.push({ permutationsPassed: n })
  console.log('ui', n)
}
async function test(name, fn) {
  try {
    await fn()
    report.io.push({ name, status: 'PASS' })
  } catch (error) {
    report.io.push({ name, status: 'FAIL', error: String(error) })
    report.failures.push({ campaign: 'io', name, error: String(error) })
  }
}
async function io() {
  await test('raycast-result-hit-miss-all-and-cleanup', async () => {
    const h = await boot(bundle),
      events = []
    h.dcl.onEvent((e) => events.push(JSON.parse(JSON.stringify(e))))
    h.dcl.addEntity('target')
    h.dcl.updateEntityComponent('target', "engine.transform", 1, JSON.stringify({ position: { x: 6, y: 10, z: 5 } }))
    await h.tick()
    for (const kind of ['HitFirst', 'HitAll'])
      for (const hit of [false, true]) {
        const id = kind + hit
        h.dcl.query('raycast', {
          queryId: id,
          queryType: kind,
          ray: { origin: { x: 5, y: 10, z: 5 }, direction: { x: 1, y: 0, z: 0 }, distance: 10 }
        })
        await h.tick()
        const [entity, values] = Object.entries(h.snapshot()).find(([, s]) => s['core::Raycast'])
        const ray = values['core::Raycast']
        await input(h, +entity, 'RaycastResult', {
          timestamp: ray.timestamp,
          globalOrigin: { x: 5, y: 10, z: 5 },
          direction: { x: 1, y: 0, z: 0 },
          tickNumber: 1,
          hits: hit
            ? [
                {
                  entityId: h.state.ecs7.entities.target,
                  length: 1,
                  position: { x: 6, y: 10, z: 5 },
                  normalHit: { x: -1, y: 0, z: 0 }
                }
              ]
            : []
        })
        const result = events.find((e) => e.type === 'raycastResponse' && e.data.queryId === id)
        assert(result)
        assert.equal(result.data.payload.didHit, hit)
        assert.deepEqual(result.data.payload.ray, {
          origin: { x: 5, y: 10, z: 5 },
          direction: { x: 1, y: 0, z: 0 },
          distance: 10
        })
        assert(result.data.payload.hitNormal)
        if (hit) {
          const item = kind === 'HitAll' ? result.data.payload.entities[0] : result.data.payload
          assert.equal(item.entity.entityId, 'target')
        }
        assert(!Object.values(h.snapshot()).some((s) => s['core::Raycast']))
      }
  })
  await test('ui-input-change-and-submit', async () => {
    const h = await boot(bundle),
      events = []
    h.dcl.onEvent((e) => events.push(JSON.parse(JSON.stringify(e))))
    h.dcl.componentCreated('canvas', "engine.canvas", 24)
    h.dcl.componentUpdated('canvas', '{}')
    h.dcl.componentCreated('input', "engine.input", 28)
    h.dcl.componentUpdated(
      'input',
      JSON.stringify({ parentComponent: 'canvas', value: 'a', onChanged: 'change', onTextSubmit: 'submit' })
    )
    await h.tick()
    await h.tick()
    const entity = +Object.entries(h.snapshot()).find(([, s]) => s['core::UiInput'])[0]
    await input(h, entity, 'UiInputResult', { value: 'typed', isSubmit: false })
    await input(h, entity, 'UiInputResult', { value: 'sent', isSubmit: true }, false, 101)
    assert(events.some((e) => e.type === 'uuidEvent' && e.data.uuid === 'change' && e.data.payload.value === 'typed'))
    assert(events.some((e) => e.type === 'uuidEvent' && e.data.uuid === 'submit' && e.data.payload.text === 'sent'))
  })
  await test('video-resource-update-event-and-disposal', async () => {
    const h = await boot(bundle),
      events = []
    h.dcl.onEvent((e) => events.push(JSON.parse(JSON.stringify(e))))
    h.dcl.subscribe('videoEvent')
    h.dcl.componentCreated('video', "engine.video", 71)
    h.dcl.componentUpdated('video', JSON.stringify({ videoClipId: 'clip', playing: true }))
    h.dcl.componentCreated('clip', "engine.clip", 70)
    h.dcl.componentUpdated('clip', JSON.stringify({ url: 'one.mp4' }))
    h.dcl.addEntity('a')
    h.dcl.updateEntityComponent('a', "engine.material", 65, JSON.stringify({ albedoTexture: 'video' }))
    await h.tick()
    const material = current(h, 'a')['core::Material']
    const entity = material.material.pbr.texture.tex.videoTexture.videoPlayerEntity
    assert.equal(h.snapshot()[entity]['core::VideoPlayer'].src, 'one.mp4')
    h.dcl.componentUpdated('clip', JSON.stringify({ url: 'two.mp4' }))
    await h.tick()
    assert.equal(h.snapshot()[entity]['core::VideoPlayer'].src, 'two.mp4')
    await input(
      h,
      entity,
      'VideoEvent',
      { timestamp: 1, tickNumber: 1, currentOffset: 2, videoLength: 10, state: 4 },
      true
    )
    assert(events.some((e) => e.type === 'videoEvent' && e.data.componentId === 'video' && e.data.currentOffset === 2))
    h.dcl.componentDisposed('video')
    await h.tick()
    assert(!h.snapshot()[entity])
    assert.equal(current(h, 'a')['core::Material'].material.pbr.texture, undefined)
  })
  await test('timers-cancellation-args-and-nesting', async () => {
    const h = await boot(
      bundle,
      `globalThis.__dcl=dcl;globalThis.timerEvents=[];const id=setTimeout(()=>globalThis.timerEvents.push('bad'),0);clearTimeout(id);setTimeout((v)=>{globalThis.timerEvents.push(v);setTimeout(()=>globalThis.timerEvents.push('nested'),0)},20,'ok');let n=0;const interval=setInterval(()=>{globalThis.timerEvents.push('interval');if(++n===2)clearInterval(interval)},10);`
    )
    assert.deepEqual(Array.from(h.sceneContext.timerEvents).sort(), ['interval', 'interval', 'nested', 'ok'].sort())
  })
  await test('malformed-mutation-does-not-drop-following-valid-message', async () => {
    const h = await boot(bundle)
    h.dcl.addEntity('a')
    h.dcl.updateEntityComponent('a', "engine.shape", 16, '{bad')
    h.dcl.updateEntityComponent('a', "engine.shape", 17, '{}')
    await h.tick()
    assert.equal(current(h, 'a')['core::MeshRenderer'].mesh.$case, 'sphere')
    assert(h.logs.some((x) => x.level === 'error'))
  })
  await test('parent-cycle-rejected-without-corruption', async () => {
    const h = await boot(bundle)
    h.dcl.addEntity('a')
    h.dcl.addEntity('b')
    h.dcl.setParent('a', 'b')
    h.dcl.setParent('b', 'a')
    await h.tick()
    assert.equal(current(h, 'a')['core::Transform'].parent, h.state.ecs7.entities.b)
    assert.equal(current(h, 'b')['core::Transform'], undefined)
    assert(h.logs.some((x) => x.level === 'error'))
  })
  await test('prototype-names-are-not-rpc-modules', async () => {
    const h = await boot(bundle)
    for (const name of ['constructor', '__proto__', 'toString']) {
      const m = await h.dcl.loadModule(name)
      assert.equal(m.methods.length, 0)
      await assert.rejects(() => h.dcl.callRpc(name, 'constructor', []))
    }
  })
  await test('rpc-json-envelope-and-provider-callback', async () => {
    const h = await boot(bundle)
    await h.dcl.loadModule('EthereumController')
    assert.deepEqual(
      JSON.parse(
        JSON.stringify(
          await h.dcl.callRpc('EthereumController', 'sendAsync', [{ id: 1, method: 'eth_chainId', params: [] }])
        )
      ),
      { jsonrpc: '2.0', id: 1, result: '0x1' }
    )
    await h.dcl.loadModule('web3-provider')
    const p = await h.dcl.callRpc('web3-provider', 'getProvider', [])
    const value = await new Promise((resolve, reject) =>
      p.send({ id: 1, method: 'eth_chainId', params: [] }, (error, result) => (error ? reject(error) : resolve(result)))
    )
    assert.equal(value.result, '0x1')
  })
}
;(async () => {
  await resources()
  await ui()
  await io()
  fs.writeFileSync(path.join(__dirname, 'combination-results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  if (report.failures.length) process.exitCode = 1
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
