const { boot, putWire } = require('./harness.cjs'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm')
const sdk = fs.readFileSync(path.join(__dirname, 'fixtures/sdk6-6.12.4/package/dist/src/index.js'), 'utf8')
const scene = `
globalThis.__dcl=dcl;globalThis.results={rays:[],input:[]};
const target=new Entity();target.addComponent(new BoxShape());target.addComponent(new Transform({position:new Vector3(2,1,2)}));engine.addEntity(target);globalThis.results.target=target.uuid;
const attachment=new Entity();attachment.addComponent(new AttachToAvatar({anchorPointId:AttachToAvatarAnchorPointId.LeftHand}));engine.addEntity(attachment);globalThis.results.attachment=attachment.uuid;
const follow=new Entity();engine.addEntity(follow);follow.setParent(Attachable.AVATAR);globalThis.results.follow=follow.uuid;
const canvas=new UICanvas();const field=new UIInputText(canvas);field.width=240;field.height=40;field.onChanged=new OnChanged(e=>globalThis.results.input.push({change:e.value}));field.onTextSubmit=new OnTextSubmit(e=>globalThis.results.input.push({submit:e.text}));
const ray={origin:new Vector3(2,3,2),direction:new Vector3(0,-1,0),distance:10};
PhysicsCast.instance.hitFirst(ray,e=>globalThis.results.rays.push(e),1);PhysicsCast.instance.hitAll(ray,e=>globalThis.results.rays.push(e),2);
`
async function send(h, entity, name, value, timestamp) {
  const c = [...h.engine.componentsIter()].find((c) => c.componentName === 'core::' + name)
  const B = vm.runInContext('ReadWriteByteBuffer', h.context),
    b = new B()
  c.schema.serialize(value, b)
  h.incoming.push(putWire(entity, c.componentId, b.toBinary(), timestamp))
  await h.tick()
  await h.tick()
}
;(async () => {
  const h = await boot(path.join(__dirname, '../dist/index.js'), sdk + '\n' + scene)
  const results = h.sceneContext.results
  const target = h.state.ecs7.entities[results.target]
  const state = h.snapshot()
  assert.equal(state[h.state.ecs7.entities[results.attachment]]['core::AvatarAttach'].anchorPointId, 2)
  assert.equal(state[h.state.ecs7.entities[results.follow]]['core::Transform'].parent, h.engine.PlayerEntity)
  const ui = +Object.entries(state).find(([, x]) => x['core::UiInput'])[0]
  assert.equal(state[ui]['core::UiTransform'].width, 240)
  await send(h, ui, 'UiInputResult', { value: 'hello', isSubmit: false }, 100)
  await send(h, ui, 'UiInputResult', { value: 'world', isSubmit: true }, 101)
  assert.deepEqual(JSON.parse(JSON.stringify(results.input)), [{ change: 'hello' }, { submit: 'world' }])
  for (const [id, s] of Object.entries(state)) {
    if (!s['core::Raycast']) continue
    await send(
      h,
      +id,
      'RaycastResult',
      {
        timestamp: s['core::Raycast'].timestamp,
        globalOrigin: { x: 2, y: 3, z: 2 },
        direction: { x: 0, y: -1, z: 0 },
        tickNumber: 100,
        hits: [{ entityId: target, length: 1, position: { x: 2, y: 2, z: 2 }, normalHit: { x: 0, y: 1, z: 0 } }]
      },
      100
    )
  }
  assert.equal(results.rays.length, 2)
  for (const result of results.rays) {
    assert.equal(result.didHit, true)
    assert.equal(result.ray.distance, 10)
    assert.deepEqual(JSON.parse(JSON.stringify(result.hitNormal)), { x: 0, y: 1, z: 0 })
    const hit = result.entities ? result.entities[0] : result
    assert.equal(hit.entity.isValid, true)
    assert.equal(hit.entity.entityId, results.target)
  }
  assert(!h.logs.some((x) => x.level === 'error'), JSON.stringify(h.logs))
  fs.writeFileSync(
    path.join(__dirname, 'latest-sdk6-results.json'),
    JSON.stringify({ sdk: '6.12.4', status: 'PASS', results, trace: h.trace, logs: h.logs }, null, 2)
  )
  console.log('SDK6 6.12.4 real callbacks, avatar anchors and UI dimensions: PASS')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
