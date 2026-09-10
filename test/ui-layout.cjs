async function main() {
{
const { boot } = require('./harness.cjs')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
function fields(hex) {
  const b = Buffer.from(hex, 'hex'),
    out = []
  let p = 0
  function varint() {
    let value = 0,
      shift = 0,
      n
    do {
      assert(p < b.length)
      n = b[p++]
      value += (n & 127) * 2 ** shift
      shift += 7
      assert(shift <= 56)
    } while (n & 128)
    return value
  }
  while (p < b.length) {
    const tag = varint(),
      field = Math.floor(tag / 8),
      wire = tag & 7
    let value
    if (wire === 0) value = varint()
    else if (wire === 5) {
      value = b.readFloatLE(p)
      p += 4
    } else if (wire === 1) p += 8
    else if (wire === 2) {
      const length = varint()
      p += length
    } else throw new Error('Unsupported wire type ' + wire)
    assert(p <= b.length)
    out.push({ field, wire, value })
  }
  return out
}
await (async () => {
  const runtime = fs.readFileSync(path.join(__dirname, 'fixtures/sdk6-6.12.4/package/dist/src/index.js'), 'utf8')
  const scene =
    runtime +
    '\nvar canvas=new UICanvas();var label=new UIText(canvas);label.value="UI wire regression";label.opacity=0.5;'
  const outcomes = []
  for (const file of ['index.js', 'index.min.js']) {
    const h = await boot(path.join(__dirname, '../dist', file), scene)
    const messages = h.trace
      .filter((t) => t.kind === 'crdt')
      .flatMap((t) => t.messages)
      .filter((m) => m.component === 1050 && m.type === 1)
    assert(messages.length > 0, 'No UiTransform messages')
    let opacity = false
    for (const m of messages)
      for (const f of fields(m.payload)) {
        if (f.field === 53)
          assert.equal(f.wire, 0, 'UiTransform field 53 must be border_left_width_unit (varint), not opacity')
        if (f.field === 73) {
          assert.equal(f.wire, 5, 'Opacity must be float field 73')
          if (f.value === 0.5) opacity = true
        }
      }
    assert(opacity, 'Expected SDK6 label opacity 0.5 at UiTransform field 73')
    outcomes.push({ bundle: file, messages: messages.length, status: 'PASS' })
  }
  fs.writeFileSync(path.join(__dirname, 'ui-wire-results.json'), JSON.stringify({ status: 'PASS', outcomes }, null, 2))
  console.log('Current UiTransform wire contract: PASS (readable and minified)')
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

}
if (process.exitCode) throw Error("ui-wire failed")
{
const assert = require('node:assert/strict'), path = require('node:path'), vm = require('node:vm')
const { boot, putWire } = require('./harness.cjs')
await (async () => {
  for (const file of ['index.js']) {
    const h = await boot(path.resolve('dist', file))
    h.dcl.componentCreated('canvas', "engine.canvas", 24)
    h.dcl.componentUpdated('canvas', '{}')
    h.dcl.componentCreated('panel', "engine.panel", 25)
    h.dcl.componentUpdated('panel', JSON.stringify({parentComponent:'canvas', width:'100%', height:'100%', color:{r:1,g:0,b:0,a:1}}))
    const component = [...h.engine.componentsIter()].find(c => c.componentName === 'core::UiCanvasInformation')
    let stamp = 1
    for (const [width, height] of [[1280,720], [1920,1080], [720,1280], [2560,720]]) {
      const BufferClass = vm.runInContext('ReadWriteByteBuffer', h.context), bytes = new BufferClass()
      component.schema.serialize({width,height,devicePixelRatio:1}, bytes)
      h.incoming.push(putWire(0, component.componentId, bytes.toBinary(), stamp++))
      for(let n=0;n<3;n++) await h.tick()
      const snapshot=h.snapshot(), panel=Object.values(snapshot).find(n=>n['core::UiBackground']?.color.r===1)
      assert(panel, 'Reference panel missing')
      const t=panel['core::UiTransform'], root=snapshot[t.parent]['core::UiTransform']
      const near=(actual,expected)=>assert(Math.abs(actual-expected)<0.001, `${file} ${width}x${height}: ${actual} != ${expected}`)
      near(t.width,width)
      near(t.height,height*0.85)
      near(root.positionTop,height*0.1)
      near(t.positionLeft,0)
      near(t.positionTop,0)
    }
  }
  console.log('SDK6 canvas reference: height scaling, 10% top/5% bottom reservations, four aspect ratios PASS')
})().catch(e=>{console.error(e);process.exitCode=1})

}
if (process.exitCode) throw Error("ui-canvas-reference failed")
{
const engineName = name => String(name).startsWith('engine.') ? name : 'engine.' + name
const assert=require('node:assert/strict'),path=require('node:path')
const {boot}=require('./harness.cjs')
await (async () =>{
 const h=await boot(path.resolve('dist/index.js'))
 const put=(id,cls,value)=>{h.dcl.componentCreated(id,engineName(id),cls);h.dcl.componentUpdated(id,JSON.stringify(value))}
 put('canvas',24,{})
 put('scroll',30,{parentComponent:'canvas',width:300,height:150,hAlign:'right',vAlign:'bottom',backgroundColor:{r:0.5,g:0.5,b:0.5,a:1},opacity:0.5,isHorizontal:false,isVertical:false})
 put('label',27,{parentComponent:'scroll',width:'80%',height:'80%',hAlign:'center',vAlign:'top',value:'content'})
 for(let i=0;i<3;i++)await h.tick()
 const snapshot=h.snapshot(),background=Object.values(snapshot).find(n=>n['core::UiBackground']?.color.r===0.5)
 assert(background)
 const t=background['core::UiTransform']
 assert.equal(t.width,240)
 assert.equal(t.height,120)
 let x=0,y=0,node=background
 while(node?.['core::UiTransform']){const transform=node['core::UiTransform'];x+=transform.positionLeft||0;y+=transform.positionTop||0;node=snapshot[transform.parent]}
 assert.equal(x,1010)
 assert.equal(y,534)
 console.log('SDK6 rendered scroll reference: fitted 240x120 content background at (1010,534), separate 300x150 viewport PASS')
})().catch(e=>{console.error(e);process.exitCode=1})

}
if (process.exitCode) throw Error("ui-scroll-background-reference failed")
{
const assert = require('node:assert/strict'), path = require('node:path')
const { boot } = require('./harness.cjs')
await (async () => {
  let expectedWire
  for (const file of process.argv.length > 2 ? process.argv.slice(2) : ['dist/index.js', 'dist/index.min.js']) {
    const h = await boot(path.resolve(file))
    const put = (id, cls, value) => { h.dcl.componentCreated(id, 'engine.shape', cls); h.dcl.componentUpdated(id, JSON.stringify(value)) }
    const update = async (id, value) => { h.dcl.componentUpdated(id, JSON.stringify(value)); await h.tick(); await h.tick() }
    const width = (text, expected) => {
      if (!h.engine) return
      const node = Object.values(h.snapshot()).find(n => n['core::UiText']?.value === text)
      assert(node, 'Missing label ' + text)
      assert.equal(node['core::UiTransform'].width, expected, text)
    }
    put('canvas', 24, {})
    const panel = { parentComponent: 'canvas', width: 360, height: 220 }
    const label = { parentComponent: 'panel', width: '100%', height: '100%', value: 'label A', fontSize: 16 }
    put('panel', 25, panel); put('label', 27, label)
    put('other-panel', 25, { ...panel, width: 400 })
    put('other-label', 27, { ...label, parentComponent: 'other-panel', value: 'label B' })
    await h.tick(); await h.tick(); width('label A', 360)
    await update('panel', { ...panel, width: 180 }); width('label A', 360)
    await update('other-label', { ...label, parentComponent: 'other-panel', value: 'changed B' }); width('label A', 360)
    put('sibling', 27, { ...label, value: 'sibling A' }); await h.tick(); await h.tick(); width('label A', 180)
    await update('panel', { ...panel, width: 120 }); width('label A', 180)
    await update('label', { ...label, value: 'changed A' }); width('changed A', 120)
    await update('label', { ...label, parentComponent: 'other-panel', value: 'reparented A' }); width('reparented A', 400)
    const scroll = { ...panel, width: 300, isHorizontal: false, isVertical: false }
    put('scroll', 30, scroll); put('scroll-label', 27, { ...label, parentComponent: 'scroll', value: 'scroll label' })
    await h.tick(); await h.tick(); width('scroll label', 300)
    await update('scroll', { ...scroll, width: 200 }); width('scroll label', 200)
    const wire = h.trace.filter(t => t.kind === 'crdt').flatMap(t => t.messages)
    if (expectedWire) assert.deepEqual(wire, expectedWire)
    else expectedWire = wire
  }
  console.log('SDK6 UIText layout refresh: parent-only resize, isolated roots, sibling refresh, own update, reparenting and scroll refresh; readable/minified PASS')
})().catch(e => { console.error(e); process.exitCode = 1 })

}
if (process.exitCode) throw Error("ui-text-layout-reference failed")
{
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { boot } = require('./harness.cjs')
const {atlas,reference,wrap}=require('./fixtures/glyph-layout.json')
const paragraph=wrap.lines.map(l=>l.text).join(' ')
const near = (a, b) => assert(Math.abs(a - b) < .0001, `${a} != ${b}`)
await (async () => {
  let expectedWire
  for (const file of process.argv.length > 2 ? process.argv.slice(2) : ['dist/index.js', 'dist/index.min.js']) {
    const h = await boot(path.resolve(file), undefined, { metadata: { main: 'bin/game.js', scene: { base: '0,0', parcels: ['0,0'] }, sdk6Adapter: { glyphAtlases: [atlas] } } })
    const put = (id, cls, value) => { h.dcl.componentCreated(id, 'engine.shape', cls); h.dcl.componentUpdated(id, JSON.stringify(value)) }
    put('canvas', 24, {})
    const label = { parentComponent: 'canvas', width: 240, height: 120, hAlign: 'left', vAlign: 'top', hTextAlign: 'left', vTextAlign: 'bottom', fontSize: 16, value: paragraph }
    put('label', 27, label)
    await h.tick(); await h.tick()
    const glyphs = () => Object.values(h.snapshot()).filter(n => n['core::UiBackground']?.texture?.tex?.texture?.src === atlas.source)
    let nodes = glyphs()
    if (h.engine && !nodes.length) throw Error('Missing glyph atlas backgrounds: ' + JSON.stringify(h.snapshot()).slice(0, 2000))
    if (h.engine) assert.equal(nodes.length, reference.quads.length)
    for (let i = 0; i < nodes.length; i++) {
      const t = nodes[i]['core::UiTransform'], q = reference.quads[i]
      assert.equal(t.positionLeft, Math.floor(q.x)); assert.equal(t.positionTop, Math.floor(q.y))
      assert.equal(t.width, Math.ceil(q.x + q.width) - Math.floor(q.x))
      assert.equal(t.height, Math.ceil(q.y + q.height) - Math.floor(q.y))
      const uv = nodes[i]['core::UiBackground'].uvs, original = atlas.characters[q.character.codePointAt(0)].uvs
      const u = uv[0] + (q.x - t.positionLeft) / t.width * (uv[4] - uv[0])
      const v = uv[3] + (q.y - t.positionTop) / t.height * (uv[1] - uv[3])
      near(u, original[0]); near(v, original[3])
      near((uv[4] - uv[0]) / t.width, (original[4] - original[0]) / q.width)
      near((uv[1] - uv[3]) / t.height, (original[1] - original[3]) / q.height)
    }
    h.dcl.componentUpdated('label', JSON.stringify({ ...label, value: 'Updated 42' }))
    await h.tick(); await h.tick()
    if (h.engine) assert.equal(glyphs().length, 9)
    h.dcl.componentUpdated('label', JSON.stringify({ ...label, value: '' }))
    await h.tick(); await h.tick()
    if (h.engine) assert.equal(glyphs().length, 0)
    h.dcl.componentUpdated('label', JSON.stringify({ ...label, value: 'Missing: 漢' }))
    await h.tick(); await h.tick()
    if (h.engine) assert.equal(glyphs().length, 0)
    if (h.engine) assert(Object.values(h.snapshot()).some(n => n['core::UiText']?.value === 'Missing: 漢'))
    const wire = h.trace.filter(t => t.kind === 'crdt').flatMap(t => t.messages)
    if (expectedWire) assert.deepEqual(wire, expectedWire)
    else expectedWire = wire
  }
  console.log('Dynamic glyph atlas: 101 archived glyph positions, replacement, empty text, uncovered-character fallback, readable/minified PASS')
})().catch(e => { console.error(e); process.exitCode = 1 })

}
if (process.exitCode) throw Error("glyph-atlas-reference failed")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
