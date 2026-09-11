const engineName = name => String(name).startsWith('engine.') ? name : 'engine.' + name
const { boot: bootHarness } = require('./harness.cjs')
const sessions = []
async function boot(...args) {
  const h = await bootHarness(...args)
  sessions.push(h)
  return h
}
const fs = require('fs')
const path = require('path')
const assert = require('assert/strict')
const base = __dirname,
  reports = []
const fixture = fs.readFileSync(path.join(base, 'fixtures/sdk6-basic.js'), 'utf8')
const preamble = fixture.slice(0, fixture.lastIndexOf('/*! "src\\\\game.ts"'))
if (!preamble || preamble === fixture) throw Error('Could not isolate SDK6 runtime')
const synthetic = preamble + '\n' + fs.readFileSync(path.join(base, 'synthetic-scene.js'), 'utf8')
fs.mkdirSync(path.join(base, 'scene/bin'), { recursive: true })
fs.writeFileSync(path.join(base, 'scene/bin/game.js'), synthetic)
fs.writeFileSync(
  path.join(base, 'scene/scene.json'),
  JSON.stringify(
    { main: 'bin/game.js', scene: { base: '0,0', parcels: ['0,0'] }, display: { title: 'SDK6 conformance synthetic' } },
    null,
    2
  )
)
const enumText = fs.readFileSync(path.join(base, '../src/types.ts'), 'utf8').split('export type')[0]
const classes = [...enumText.matchAll(/^  ([A-Z_]+) = (\d+)/gm)].map((m) => ({ name: m[1], id: +m[2] }))
const shared = [34, 68, 70, 71, 72, 200]
const ui = [23, 24, 25, 26, 27, 28, 29, 30, 40, 41]
const payload = {
  visible: true,
  withCollisions: true,
  isPointerBlocker: true,
  position: { x: 3, y: 4, z: 5 },
  scale: { x: 1, y: 2, z: 3 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  src: 'models/fixture.glb',
  value: 'probe',
  text: 'probe',
  width: 100,
  height: 40,
  opacity: 1,
  fontSize: 16,
  color: { r: 1, g: 1, b: 1, a: 1 },
  albedoColor: { r: 0.2, g: 0.3, b: 0.4, a: 1 },
  states: [{ clip: 'walk', playing: true, looping: true, speed: 1 }],
  url: 'audio.ogg',
  playing: true,
  volume: 0.5,
  uuid: 'callback',
  type: 'pointerDown',
  button: 'POINTER',
  hoverText: 'probe',
  distance: 6,
  showFeedback: true,
  area: { box: { x: 2, y: 2, z: 2 } },
  modifiers: ['HIDE_AVATARS'],
  cameraMode: 0
}
const expected = {
  1: ['Transform'],
  8: ['PointerEvents'],
  16: ['MeshRenderer', 'MeshCollider'],
  17: ['MeshRenderer'],
  18: ['MeshRenderer', 'MeshCollider'],
  20: ['MeshRenderer', 'MeshCollider'],
  21: ['TextShape'],
  22: ['NftShape'],
  32: ['Billboard'],
  33: ['Animator'],
  54: ['GltfContainer'],
  56: ['AvatarShape'],
  64: ['Material'],
  65: ['Material'],
  201: ['AudioSource'],
  202: ['AudioStream'],
  205: ['AvatarModifierArea'],
  206: ['AvatarAttach'],
  207: ['CameraModeArea']
}
fs.mkdirSync(path.join(base, 'artifacts'), { recursive: true })
const json = (x) => JSON.parse(JSON.stringify(x))
async function main() {
  for (const bundle of ['replacement']) {
    const bundlePath = path.join(base, '../dist/index.js')
    const report = { bundle, tests: [], classes: [], rpcs: [], events: [], scenes: [], traceFiles: [] }
    reports.push(report)
    async function test(name, fn) {
      let h
      try {
        h = await boot(bundlePath)
        await fn(h)
        report.tests.push({ name, status: 'PASS' })
      } catch (e) {
        report.tests.push({ name, status: 'FAIL', error: String(e) })
      }
      if (h) saveTrace(name, h)
    }
    function saveTrace(name, h) {
      const file = bundle + '-' + name.replace(/[^a-z0-9-]/gi, '_') + '.json'
      report.traceFiles.push(file)
      fs.writeFileSync(
        path.join(base, 'artifacts', file),
        JSON.stringify({ actions: h.actions, trace: h.trace, logs: h.logs, snapshot: h.snapshot() }, null, 2)
      )
    }
    const comp = (h, e, name) =>
      Object.entries(h.snapshot()[h.state.ecs7.entities[e]] || {}).find(([k]) => k === 'core::' + name)?.[1]
    async function put(h, e, id, data = payload) {
      h.dcl.updateEntityComponent(e, 'engine.component-' + id, id, JSON.stringify(data))
      await h.tick()
    }
    async function add(h, e) {
      h.dcl.addEntity(e)
      await h.tick()
    }
    async function sharedBox(h) {
      await add(h, 'a')
      await add(h, 'b')
      h.dcl.componentCreated('box', "engine.box", 16)
      h.dcl.componentUpdated('box', JSON.stringify(payload))
      h.dcl.attachEntityComponent('a', "engine.box", 'box')
      h.dcl.attachEntityComponent('b', "engine.box", 'box')
      await h.tick()
    }
    await test('entity-create-transform-update', async (h) => {
      await add(h, 'a')
      await put(h, 'a', 1)
      assert.deepEqual(comp(h, 'a', 'Transform').position, payload.position)
      assert(h.trace.some((t) => t.kind === 'crdt' && t.messages.some((m) => m.type === 1 && m.component === 1)))
    })
    await test('entity-remove', async (h) => {
      await add(h, 'a')
      await put(h, 'a', 16)
      h.dcl.removeEntity('a')
      await h.tick()
      assert.equal(h.state.ecs7.entities.a, undefined)
      assert(h.trace.some((t) => t.kind === 'crdt' && t.messages.some((m) => m.type === 3)))
    })
    await test('set-parent', async (h) => {
      await add(h, 'a')
      await add(h, 'b')
      h.dcl.setParent('a', 'b')
      await h.tick()
      assert.equal(comp(h, 'a', 'Transform').parent, h.state.ecs7.entities.b)
    })
    await test('reset-parent-to-root', async (h) => {
      await add(h, 'a')
      await add(h, 'b')
      h.dcl.setParent('a', 'b')
      await h.tick()
      h.dcl.setParent('a', '0')
      await h.tick()
      assert.equal(comp(h, 'a', 'Transform').parent, 0)
    })
    await test('shared-component-create-update-attach', async (h) => {
      await sharedBox(h)
      assert(comp(h, 'a', 'MeshRenderer'))
      assert(comp(h, 'b', 'MeshRenderer'))
      h.dcl.componentUpdated('box', JSON.stringify({ ...payload, visible: false }))
      await h.tick()
      assert.equal(comp(h, 'a', 'MeshRenderer'), undefined)
      assert.equal(comp(h, 'b', 'MeshRenderer'), undefined)
    })
    await test('shared-component-detach-preserves-other-user', async (h) => {
      await sharedBox(h)
      h.dcl.removeEntityComponent('a', "engine.box")
      await h.tick()
      assert(comp(h, 'b', 'MeshRenderer'))
      h.dcl.componentUpdated('box', JSON.stringify({ ...payload, visible: false }))
      await h.tick()
      assert.equal(comp(h, 'b', 'MeshRenderer'), undefined)
    })
    await test('component-dispose', async (h) => {
      await sharedBox(h)
      h.dcl.componentDisposed('box')
      await h.tick()
      assert.equal(comp(h, 'a', 'MeshRenderer'), undefined)
      assert.equal(comp(h, 'b', 'MeshRenderer'), undefined)
      assert(h.trace.some((t) => t.kind === 'crdt' && t.messages.some((m) => m.type === 2)))
    })
    await test('remove-inline-transform', async (h) => {
      await add(h, 'a')
      await put(h, 'a', 1)
      h.dcl.removeEntityComponent('a', "engine.component-1")
      await h.tick()
      assert.equal(comp(h, 'a', 'Transform'), undefined)
    })
    await test('collision-flags-false', async (h) => {
      await add(h, 'a')
      await put(h, 'a', 16, { ...payload, withCollisions: false, isPointerBlocker: false })
      assert.equal(comp(h, 'a', 'MeshCollider')?.collisionMask ?? 0, 0)
    })
    await test('pointer-update-replaces-registration', async (h) => {
      await add(h, 'a')
      await put(h, 'a', 8)
      await put(h, 'a', 8, { ...payload, hoverText: 'updated' })
      assert.equal(comp(h, 'a', 'PointerEvents').pointerEvents.length, 1)
    })
    await test('callbacks-start-and-update', async (h) => {
      const x = await boot(
        bundlePath,
        'globalThis.__dcl=dcl;globalThis.counts={start:0,update:0};dcl.onStart(()=>globalThis.counts.start++);dcl.onUpdate(()=>globalThis.counts.update++);'
      )
      saveTrace('callbacks-real-start-and-update', x)
      assert.equal(x.sceneContext.counts.start, 1)
      assert(x.sceneContext.counts.update > 0)
    })
    await test('subscribe-unsubscribe-position', async (h) => {
      const events = []
      h.dcl.onEvent((e) => events.push(json(e)))
      h.dcl.subscribe('positionChanged')
      await h.tick()
      assert(events.some((e) => e.type === 'positionChanged'))
      h.dcl.unsubscribe('positionChanged')
      events.length = 0
      await h.tick()
      assert.equal(events.length, 0)
    })
    await test('log-and-error', async (h) => {
      h.dcl.log('probe-log')
      h.dcl.error('probe-error', new Error('fixture'))
      assert(h.logs.some((x) => x.args.includes('probe-log')))
      assert(h.logs.some((x) => x.args.includes('probe-error')))
    })
    await test('open-url-and-nft-require-pointer', async (h) => {
      h.dcl.openExternalUrl('https://example.invalid')
      h.dcl.openNFTDialog('0x0000000000000000000000000000000000000000', '1', null)
      await h.tick()
      assert(!h.trace.some((t) => t.method === 'openExternalUrl'))
      assert(!h.trace.some((t) => t.method === 'openNftDialog'))
    })
    await test('ui-image-consumes-texture', async (h) => {
      h.dcl.componentCreated('canvas', "engine.canvas", 24)
      h.dcl.componentUpdated('canvas', JSON.stringify({ visible: true }))
      h.dcl.componentCreated('texture', "engine.texture", 68)
      h.dcl.componentUpdated('texture', JSON.stringify({ src: 'fixture.png' }))
      h.dcl.componentCreated('image', "engine.image", 29)
      h.dcl.componentUpdated(
        'image',
        JSON.stringify({
          parentComponent: 'canvas',
          visible: true,
          width: 200,
          height: 40,
          source: 'texture',
          sourceWidth: 256,
          sourceHeight: 256
        })
      )
      for (let i = 0; i < 3; i++) await h.tick()
      assert(
        Object.values(h.snapshot()).some((x) => x['core::UiBackground']?.texture?.tex?.texture?.src === 'fixture.png')
      )
    })
    await test('unknown-module-and-method', async (h) => {
      // Unknown names reject like the legacy runtime and are never cached, so
      // an RPC on the same handle rejects too.
      await assert.rejects(() => h.dcl.loadModule('UnknownFixtureModule'), /The module is not available in the list!/)
      assert.equal('UnknownFixtureModule' in h.state.loadedModules, false)
      await assert.rejects(() => h.dcl.callRpc('UnknownFixtureModule', 'missing', []))
    })
    async function incomingComponent(h, entity, id, value) {
      const vm = require('vm'),
        BufferType = vm.runInContext('ReadWriteByteBuffer', h.context),
        b = new BufferType()
      let bytes
      if (id === 1072) bytes = Buffer.from([8, value.mode])
      else if (id === 1074) bytes = Buffer.from([8, value.isPointerLocked ? 1 : 0])
      else {
        h.engine.getComponent(id).schema.serialize(value, b)
        bytes = b.toBinary()
      }
      const wire = require('./harness.cjs').putWire(entity, id, bytes, 100)
      h.actions.push({ method: '__incoming', args: [wire.toString('base64')] })
      h.incoming.push(wire)
      await h.tick()
      await h.tick()
    }
    await test('incoming-position-and-rotation', async (h) => {
      const events = []
      h.dcl.onEvent((e) => events.push(json(e)))
      h.dcl.subscribe('positionChanged')
      h.dcl.subscribe('rotationChanged')
      await incomingComponent(h, h.engine.PlayerEntity, 1, {
        position: { x: 9, y: 2, z: 3 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        parent: 0
      })
      await incomingComponent(h, h.engine.CameraEntity, 1, {
        position: { x: 9, y: 3.6, z: 3 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0.7071068, z: 0, w: 0.7071068 },
        parent: 0
      })
      assert(events.some((e) => e.type === 'positionChanged' && e.data.position.x === 9))
      assert(events.some((e) => e.type === 'rotationChanged' && Math.abs(e.data.quaternion.y - 0.7071068) < 0.001))
    })
    await test('incoming-camera-mode', async (h) => {
      const events = []
      h.dcl.onEvent((e) => events.push(json(e)))
      h.dcl.subscribe('cameraModeChanged')
      await incomingComponent(h, h.engine.CameraEntity, 1072, { mode: 1 })
      assert(events.some((e) => e.type === 'cameraModeChanged' && e.data.cameraMode === 1))
    })
    await test('incoming-pointer-lock', async (h) => {
      const events = []
      h.dcl.onEvent((e) => events.push(json(e)))
      h.dcl.subscribe('onPointerLock')
      await incomingComponent(h, h.engine.CameraEntity, 1074, { isPointerLocked: true })
      assert(events.some((e) => e.type === 'onPointerLock' && e.data.locked === true))
    })

    await test('incoming-pointer-uuid-event', async (h) => {
      await add(h, 'a')
      await put(h, 'a', 8)
      const events = []
      h.dcl.onEvent((e) => events.push(json(e)))
      const BufferType = require('vm').runInContext('ReadWriteByteBuffer', h.context),
        b = new BufferType()
      const entity = h.state.ecs7.entities.a
      h.engine.getComponent(1063).schema.serialize(
        {
          button: 0,
          state: 1,
          timestamp: 100,
          tickNumber: 1,
          hit: {
            entityId: entity,
            length: 2,
            position: { x: 1, y: 1, z: 1 },
            normalHit: { x: 0, y: 1, z: 0 },
            direction: { x: 0, y: 0, z: 1 },
            globalOrigin: { x: 0, y: 1, z: 0 }
          }
        },
        b
      )
      const wire = require('./harness.cjs').putWire(entity, 1063, b.toBinary())
      wire.writeUInt32LE(4, 4)
      h.actions.push({ method: '__incoming', args: [wire.toString('base64')] })
      h.incoming.push(wire)
      await h.tick()
      await h.tick()
      assert(
        events.some((e) => e.type === 'uuidEvent' && e.data.uuid === 'callback' && e.data.payload.hit.entityId === 'a')
      )
    })
    await test('sdk6-physicscast-hitFirst-hitAll', async (h) => {
      const code =
        preamble +
        `
PhysicsCast.instance.hitFirst({origin:new Vector3(0,1,0),direction:new Vector3(0,-1,0),distance:10},function(){log('RAY_FIRST');},1);PhysicsCast.instance.hitAll({origin:new Vector3(0,1,0),direction:new Vector3(0,-1,0),distance:10},function(){log('RAY_ALL');},2);`
      const x = await boot(bundlePath, code)
      saveTrace('sdk6-physicscast-real-api', x)
      assert(
        x.trace.some((t) => t.kind === 'crdt' && t.messages.some((m) => m.component === 1067)) ||
          x.trace.some((t) => t.method === 'sendBatch' && t.args.actions.length),
        'SDK6 PhysicsCast emitted no renderer raycast request'
      )
    })
    for (const c of classes) {
      let h
      try {
        h = await boot(bundlePath)
        let baseline = {}
        if (ui.includes(c.id) || shared.includes(c.id)) {
          if (c.id !== 24 && !shared.includes(c.id)) {
            h.dcl.componentCreated('canvas', "engine.canvas", 24)
            h.dcl.componentUpdated('canvas', JSON.stringify({ ...payload }))
            for (let i = 0; i < 3; i++) await h.tick()
            baseline = h.snapshot()
          }
          h.dcl.componentCreated('component', engineName(c.name), c.id)
          h.dcl.componentUpdated(
            'component',
            JSON.stringify({ ...payload, parentComponent: c.id === 24 ? undefined : 'canvas' })
          )
        } else {
          await add(h, 'a')
          h.dcl.componentCreated('component', engineName(c.name), c.id)
          h.dcl.componentUpdated('component', JSON.stringify(payload))
          h.dcl.attachEntityComponent('a', engineName(c.name), 'component')
        }
        for (let i = 0; i < 3; i++) await h.tick()
        const snap = h.snapshot()
        const names = [
          ...new Set(
            Object.entries(snap)
              .filter(([e]) => e !== '0')
              .flatMap(([e, x]) =>
                Object.entries(x)
                  .filter(([k, v]) => JSON.stringify(baseline[e]?.[k]) !== JSON.stringify(v))
                  .map(([k]) => k)
              )
          )
        ]
        const want = expected[c.id]
        const status = shared.includes(c.id)
          ? 'RESOURCE_ONLY'
          : want
          ? want.every((n) => names.includes('core::' + n))
            ? 'EMITS_EXPECTED_COMPONENTS'
            : 'MISSING_EXPECTED_COMPONENTS'
          : names.length
          ? 'EMITS_COMPONENTS'
          : 'NO_OUTPUT'
        report.classes.push({ ...c, status, components: names, logs: h.logs })
        saveTrace('class-' + c.id, h)
      } catch (e) {
        report.classes.push({ ...c, status: 'ERROR', error: String(e), logs: h?.logs })
      }
    }
    const rpcArgs = {
      send: ['hello'],
      getCurrentRealm: [],
      isPreviewMode: [],
      getExplorerConfiguration: [],
      getPlatform: [],
      getDecentralandTime: [],
      getBootstrapData: [],
      areUnsafeRequestAllowed: [],
      getUserPublicKey: [],
      getUserData: [],
      getParcel: [],
      getPlayerData: [{ userId: 'remote-user' }],
      getConnectedPlayers: [],
      getPlayersInScene: [],
      spawn: ['urn:test'],
      kill: ['urn:test'],
      exit: [],
      getPortableExperiencesLoaded: [],
      movePlayerTo: [
        { x: 1, y: 2, z: 3 },
        { x: 4, y: 5, z: 6 }
      ],
      triggerEmote: [{ predefined: 'wave' }],
      signedFetch: ['https://example.invalid', { responseBodyType: 'json' }],
      requirePayment: ['0x0', 1, 'ETH'],
      signMessage: [{ message: 'fixture' }],
      convertMessageToObject: ['key: value'],
      sendAsync: [{ id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [] }],
      getUserAccount: [],
      getProvider: []
    }
    for (const module of [
      'CommunicationsController',
      'EnvironmentAPI',
      'EthereumController',
      'Identity',
      'ParcelIdentity',
      'Players',
      'PortableExperiences',
      'RestrictedActions',
      'RestrictedActionModule',
      'SignedFetch',
      'SocialController',
      'web3-provider'
    ]) {
      const h = await boot(bundlePath)
      const descriptor = await h.dcl.loadModule(module)
      if (!descriptor.methods.length) report.rpcs.push({ module, status: 'EMPTY_MODULE' })
      for (const method of descriptor.methods) {
        const m = method.name
        const before = h.trace.length
        try {
          const result = await h.dcl.callRpc(module, m, rpcArgs[m] || [])
          let status = 'RETURNED'
          if (m === 'isPreviewMode' && result !== false) status = 'WRONG_RESULT'
          if (m === 'getPlayerData' && result?.userId !== 'remote-user') status = 'WRONG_RESULT'
          report.rpcs.push({
            module,
            method: m,
            args: rpcArgs[m] || [],
            status,
            result: m === 'getProvider' ? 'provider object' : result,
            forwarded: h.trace.slice(before)
          })
        } catch (e) {
          report.rpcs.push({
            module,
            method: m,
            args: rpcArgs[m] || [],
            status: 'ERROR',
            error: String(e),
            forwarded: h.trace.slice(before)
          })
        }
      }
    }
    for (const event of [
      'onEnterScene',
      'onLeaveScene',
      'sceneStart',
      'playerExpression',
      'videoEvent',
      'profileChanged',
      'playerConnected',
      'playerDisconnected',
      'onRealmChanged',
      'playerClicked',
      'comms'
    ]) {
      const h = await boot(bundlePath)
      const received = []
      h.dcl.onEvent((e) => received.push(json(e)))
      h.dcl.subscribe(event)
      h.hostEvents.push({
        generic: { eventId: event, eventData: JSON.stringify({ userId: 'remote-user', message: 'fixture' }) }
      })
      await h.tick()
      saveTrace('event-' + event, h)
      report.events.push({
        event,
        route: 'EngineApi.sendBatch generic',
        status: received.some((e) => e.type === event)
          ? 'DELIVERED'
          : event === 'sceneStart'
          ? 'SUPPRESSED_DUPLICATE'
          : 'NOT_DELIVERED',
        received
      })
    }
    for (const [name, code] of [
      ['sdk6-basic', fixture],
      ['synthetic-sdk6', synthetic]
    ]) {
      try {
        const h = await boot(bundlePath, code)
        report.hash = h.hash
        const wire = h.trace.filter((t) => t.kind === 'crdt').flatMap((t) => t.messages)
        report.scenes.push({
          name,
          snapshot: h.snapshot(),
          logs: h.logs,
          crdtMessages: wire.length,
          componentIds: [...new Set(wire.map((m) => m.component))]
        })
        saveTrace(name, h)
      } catch (e) {
        report.scenes.push({ name, error: String(e) })
      }
    }
    console.log(
      bundle,
      JSON.stringify({
        tests: report.tests,
        classes: report.classes.map((c) => [c.name, c.status]),
        rpcs: report.rpcs.filter((r) => r.status !== 'RETURNED'),
        events: report.events.map((e) => [e.event, e.status]),
        scenes: report.scenes.map((s) => ({ name: s.name, error: s.error, messages: s.crdtMessages, logs: s.logs }))
      })
    )
  }
  if (reports.some((r) => r.tests.some((t) => t.status === 'FAIL'))) process.exitCode = 1
  fs.writeFileSync(
    path.join(base, 'results.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        scope:
          'Real downloaded adapter bundles and bundled SDK7 executed in Node VM; deterministic simulated renderer and RPC endpoints, not native explorer conformance.',
        reports
      },
      null,
      2
    )
  )
}
main().finally(() => { for (const h of sessions) h.dispose() }).catch((e) => {
  console.error(e)
  process.exitCode = 1
})
