const assert = require('node:assert/strict')
const path = require('node:path')
const { boot } = require('./harness.cjs')
async function adapter(bundle = path.join(__dirname, '../dist/index.js')) {
  const h = await boot(bundle)
  const tick = async () => {
    for (let i = 0; i < 3; i++) await h.tick()
  }
  const put = (id, cls, value) => {
    h.dcl.componentCreated(id, 'engine.shape', cls)
    h.dcl.componentUpdated(id, JSON.stringify(value))
  }
  const entityWithText = (text) => {
    const hit = Object.entries(h.snapshot()).find(([, node]) => node['core::UiText']?.value === text)
    return hit ? Number(hit[0]) : undefined
  }
  const chain = (entity) => {
    const snap = h.snapshot()
    const out = []
    for (let e = entity; e !== undefined && e !== 0 && out.length < 16; e = snap[e]?.['core::UiTransform']?.parent)
      out.push(e)
    return out
  }
  put('world', 23, {})
  put('orphan', 27, { parentComponent: 'world', value: 'orphan-label' })
  await tick()
  assert.equal(entityWithText('orphan-label'), undefined, 'no canvas: a UIWorldSpace child is not rendered')

  put('canvas', 24, {})
  put('control', 27, { parentComponent: 'canvas', value: 'canvas-label' })
  await tick()
  const orphan = entityWithText('orphan-label')
  const control = entityWithText('canvas-label')
  assert(orphan !== undefined && control !== undefined, 'with a canvas: the UIWorldSpace child is rendered')
  assert.equal(chain(orphan).at(-1), chain(control).at(-1), 'the child hangs under the same root as a canvas child')
  assert.equal(chain(orphan).length, chain(control).length, 'the child sits directly under the canvas root')

  put('late', 27, { parentComponent: 'container', value: 'late-label' })
  await tick()
  assert.equal(chain(entityWithText('late-label')).length, chain(control).length, 'missing parent: canvas fallback')
  put('container', 25, { parentComponent: 'canvas' })
  await tick()
  assert.equal(chain(entityWithText('late-label')).length, chain(control).length + 1, 'parent arrives: re-homed')

  h.dcl.componentDisposed('container')
  await tick()
  assert.equal(entityWithText('late-label'), undefined, 'disposed parent: the child stays hidden, no fallback')
  put('container', 25, { parentComponent: 'canvas' })
  await tick()
  assert.equal(chain(entityWithText('late-label')).length, chain(control).length + 1, 'parent recreated: child back')

  h.dcl.componentDisposed('canvas')
  await tick()
  assert.equal(entityWithText('orphan-label'), undefined, 'canvas gone: the UIWorldSpace child is not rendered')
  const warned = h.logs.filter((l) => l.args.join(' ').includes('UIWorldSpace (class 23)'))
  assert.equal(warned.length, 1, 'class 23 is reported once')
}
adapter()
  .then(() =>
    console.log(
      'Class23 adapter fallback: PASS (canvas fallback, missing parent, re-homing, disposed parent, disposal)'
    )
  )
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
