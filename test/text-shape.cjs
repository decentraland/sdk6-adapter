const assert = require('node:assert/strict')
const path = require('node:path')
const { boot } = require('./harness.cjs')

// Expected PbTextShape values per docs/class21.md. Each rule cites the legacy renderer line it mirrors.
const ALIGN = {
  'top-left': 0,
  'top-center': 1,
  'top-right': 2,
  'middle-left': 3,
  'middle-center': 4,
  'middle-right': 5,
  'bottom-left': 6,
  'bottom-center': 7,
  'bottom-right': 8
}
const FONTS = {
  regular: 'SansSerif',
  heavy: 'SansSerif_Heavy',
  bold: 'SansSerif_Bold',
  semibold: 'SansSerif_SemiBold',
  sf: 'builtin:SF-UI-Text-Regular SDF',
  sfHeavy: 'builtin:SF-UI-Text-Heavy SDF',
  sfSemibold: 'builtin:SF-UI-Text-Semibold SDF',
  liberation: 'builtin:LiberationSans SDF'
}
const BOLD_FONTS = new Set(['heavy', 'bold', 'semibold', 'sfHeavy', 'sfSemibold'])

function alignment(h, v) {
  // TextShape.cs:231-257 lowercases both words; unknown words fall to the centre of that axis.
  const hw = typeof h === 'string' ? h.toLowerCase() : ''
  const vw = typeof v === 'string' ? v.toLowerCase() : ''
  const row = vw === 'top' ? 'top' : vw === 'bottom' ? 'bottom' : 'middle'
  const column = hw === 'left' ? 'left' : hw === 'right' ? 'right' : 'center'
  return ALIGN[`${row}-${column}`]
}
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const int = (value) => Math.trunc(num(value))
const color3 = (color) => (color == null ? { r: 1, g: 1, b: 1 } : { r: num(color.r), g: num(color.g), b: num(color.b) })

function expected(payload) {
  const wrapping = payload.textWrapping === true
  let text = payload.visible === false ? '' : payload.value == null ? '' : String(payload.value)
  if (text !== '' && BOLD_FONTS.has(payload.fontKey)) text = `<b>${text}</b>`
  const rawSize = payload.fontSize == null ? 100 : payload.fontSize
  const lineCount = int(payload.lineCount)
  const outlineWidth = num(payload.outlineWidth)
  return {
    text,
    font: payload.fontKey === undefined ? undefined : 0,
    fontSize: rawSize === 0 ? undefined : int(rawSize),
    fontAutoSize: rawSize === 0,
    textAlign: alignment(payload.hTextAlign, payload.vTextAlign),
    textWrapping: wrapping,
    width: wrapping ? num(payload.width ?? 1) : undefined,
    height: wrapping ? num(payload.height ?? 0.2) : undefined,
    lineSpacing: 0,
    lineCount: lineCount === 0 ? 0 : Math.max(lineCount, 1),
    paddingTop: int(payload.paddingTop),
    paddingRight: int(payload.paddingRight),
    paddingBottom: int(payload.paddingBottom),
    paddingLeft: int(payload.paddingLeft),
    outlineWidth: outlineWidth > 0 ? outlineWidth : 0,
    outlineColor: color3(payload.outlineColor),
    shadowOffsetX: num(payload.shadowOffsetX),
    shadowOffsetY: num(payload.shadowOffsetY),
    shadowBlur: num(payload.shadowBlur),
    shadowColor: color3(payload.shadowColor),
    textColor: { ...color3(payload.color), a: num(payload.opacity ?? 1) },
    billboard: payload.billboard === true ? 7 : undefined
  }
}

const FIELDS = Object.keys(expected({}))

function near(actual, wanted, label) {
  if (typeof wanted === 'number' && typeof actual === 'number') {
    assert(Math.abs(actual - wanted) < 1e-6, `${label}: ${actual} != ${wanted}`)
  } else if (wanted !== null && typeof wanted === 'object') {
    assert(actual !== null && typeof actual === 'object', `${label}: missing object`)
    for (const key of Object.keys(wanted)) near(actual[key], wanted[key], `${label}.${key}`)
  } else {
    assert.equal(actual, wanted, label)
  }
}

async function run(bundle = path.join(__dirname, '../dist/index.js')) {
  const h = await boot(bundle)
  let assertions = 0
  let cases = 0
  const tick = async () => {
    for (let i = 0; i < 2; i++) await h.tick()
  }
  for (const [key, src] of Object.entries(FONTS)) {
    h.dcl.componentCreated(`font-${key}`, 'engine.font', 34)
    h.dcl.componentUpdated(`font-${key}`, JSON.stringify({ src }))
  }
  const attached = new Set()
  const put = async (entity, payload) => {
    const { fontKey, ...wire } = payload
    if (fontKey !== undefined) wire.font = `font-${fontKey}`
    if (!attached.has(entity)) {
      h.dcl.addEntity(entity)
      h.dcl.componentCreated(`text-${entity}`, 'engine.text', 21)
      h.dcl.attachEntityComponent(entity, 'engine.text', `text-${entity}`)
      attached.add(entity)
    }
    h.dcl.componentUpdated(`text-${entity}`, JSON.stringify(wire))
    await tick()
  }
  const node = (entity) => h.snapshot()[h.state.ecs7.entities[entity]] ?? {}
  const shape = (entity) => node(entity)['core::TextShape']
  const check = (entity, payload, label) => {
    const actual = shape(entity)
    assert(actual, `${label}: TextShape present`)
    const want = expected(payload)
    for (const field of FIELDS) {
      if (field === 'billboard') continue
      near(actual[field], want[field], `${label}.${field}`)
      assertions++
    }
    assert.equal(node(entity)['core::Billboard']?.billboardMode, want.billboard, `${label}.billboard`)
    assertions++
    cases++
  }

  // 64 seeded permutations over every field.
  const pick = (random, options) => options[Math.floor(random() * options.length)]
  const colours = [
    undefined,
    { r: 1, g: 0.5, b: 0 },
    { r: 0.25 },
    { r: 0, g: 0, b: 0 },
    { r: 0.1, g: 0.2, b: 0.3, a: 0.4 }
  ]
  for (let seed = 1; seed <= 4; seed++) {
    let state = seed
    const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296
    for (let step = 0; step < 16; step++) {
      const payload = {
        value: pick(random, [`sign-${seed}-${step}`, '', undefined, null, 42, 'multi\nline']),
        visible: pick(random, [undefined, true, false]),
        color: pick(random, colours),
        opacity: pick(random, [undefined, 1, 0.5, 0]),
        fontSize: pick(random, [undefined, 0, 0.5, 1, 7.9, 10, 13.5, 40, -3]),
        fontKey: pick(random, [undefined, ...Object.keys(FONTS)]),
        hTextAlign: pick(random, [undefined, 'left', 'center', 'right', 'LEFT', 'Right', 'bottom', 'x']),
        vTextAlign: pick(random, [undefined, 'top', 'center', 'bottom', 'TOP', 'Bottom', 'left', 'x']),
        width: pick(random, [undefined, 0, 0.5, 2, 5]),
        height: pick(random, [undefined, 0, 0.25, 1, 3]),
        textWrapping: pick(random, [undefined, false, true]),
        lineSpacing: pick(random, [undefined, '0px', '12px', '1.5', 'abc']),
        lineCount: pick(random, [undefined, 0, 2, -1, 2.7]),
        paddingTop: pick(random, [undefined, 0, 0.4, 1.6, -2.3]),
        paddingRight: pick(random, [undefined, 0, 0.9, 3]),
        paddingBottom: pick(random, [undefined, 0, 0.5, 2.5]),
        paddingLeft: pick(random, [undefined, 0, 0.1, 1]),
        shadowOffsetX: pick(random, [undefined, 0, 1, -0.5]),
        shadowOffsetY: pick(random, [undefined, 0, 2, -1]),
        shadowBlur: pick(random, [undefined, 0, 0.3, 5]),
        shadowColor: pick(random, colours),
        outlineWidth: pick(random, [undefined, 0, -1, 0.1, 0.3]),
        outlineColor: pick(random, colours),
        billboard: pick(random, [undefined, false, true])
      }
      for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key]
      const entity = `seed-${seed}`
      await put(entity, payload)
      check(entity, payload, `seed ${seed} step ${step}`)
    }
  }

  // Wrapping unset, false and true against width and height.
  for (const textWrapping of [undefined, false, true]) {
    for (const [width, height] of [
      [undefined, undefined],
      [0, 0],
      [2, 0.5],
      [5, undefined],
      [undefined, 3]
    ]) {
      const payload = { value: 'wrap', textWrapping, width, height }
      for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key]
      await put('wrap', payload)
      check('wrap', payload, `wrapping ${textWrapping} ${width}x${height}`)
      const actual = shape('wrap')
      if (textWrapping === true) {
        assert.equal(actual.width, width ?? 1, 'wrapping forwards the width or the legacy default')
        assert.equal(actual.height, height ?? 0.2, 'wrapping forwards the height or the legacy default')
      } else {
        assert.equal(actual.width, undefined, 'no rect without wrapping')
        assert.equal(actual.height, undefined, 'no rect without wrapping')
      }
      assertions += 2
    }
  }

  // Outline: only a positive width keeps the outline; colour channels default to white and missing channels to 0.
  for (const outlineWidth of [undefined, 0, -0.2, 0.05, 0.3]) {
    for (const outlineColor of colours) {
      const payload = { value: 'outline', outlineWidth, outlineColor }
      for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key]
      await put('outline', payload)
      check('outline', payload, `outline ${outlineWidth} ${JSON.stringify(outlineColor)}`)
    }
  }

  // Shadow: offsets, blur and colour are forwarded verbatim; absent values are 0 and white.
  for (const [x, y, blur] of [
    [undefined, undefined, undefined],
    [0, 0, 3],
    [1, 0, 0],
    [0, -1, 0.5],
    [2.5, 2.5, 10]
  ]) {
    for (const shadowColor of colours) {
      const payload = { value: 'shadow', shadowOffsetX: x, shadowOffsetY: y, shadowBlur: blur, shadowColor }
      for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key]
      await put('shadow', payload)
      check('shadow', payload, `shadow ${x},${y},${blur}`)
    }
  }

  // Alignment matrix, including the swapped legacy default words and case-insensitive matching.
  const words = [undefined, 'left', 'center', 'right', 'top', 'bottom', 'Left', 'RIGHT', 'Top', 'BOTTOM', 'garbage']
  for (const hTextAlign of words) {
    for (const vTextAlign of words) {
      const payload = { value: 'align', hTextAlign, vTextAlign }
      for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key]
      await put('align', payload)
      check('align', payload, `align h=${hTextAlign} v=${vTextAlign}`)
    }
  }
  await put('align', { value: 'align' })
  assert.equal(shape('align').textAlign, 4, 'omitted alignment is middle-center')
  await put('align', { value: 'align', hTextAlign: 'bottom', vTextAlign: 'left' })
  assert.equal(shape('align').textAlign, 4, 'the legacy model default words resolve to middle-center')
  assertions += 2

  // Empty and undefined values, and the visible switch.
  for (const [payload, text] of [
    [{}, ''],
    [{ value: '' }, ''],
    [{ value: null }, ''],
    [{ value: 0 }, '0'],
    [{ value: 'undefined' }, 'undefined'],
    [{ value: 'hidden', visible: false }, ''],
    [{ value: 'shown', visible: true }, 'shown'],
    [{ value: '', fontKey: 'bold' }, ''],
    [{ value: 'strong', fontKey: 'bold' }, '<b>strong</b>'],
    [{ value: 'plain', fontKey: 'regular' }, 'plain']
  ]) {
    await put('values', payload)
    check('values', payload, `value ${JSON.stringify(payload)}`)
    assert.equal(shape('values').text, text)
    assertions++
  }

  // Font size: absent is the legacy model default, 0 is auto-size, fractions truncate like the legacy int cast.
  for (const [fontSize, size, auto] of [
    [undefined, 100, false],
    [0, undefined, true],
    [0.5, 0, false],
    [1, 1, false],
    [13.5, 13, false],
    [40, 40, false],
    [-3, -3, false]
  ]) {
    const payload = { value: 'size', fontSize }
    if (fontSize === undefined) delete payload.fontSize
    await put('size', payload)
    check('size', payload, `fontSize ${fontSize}`)
    assert.equal(shape('size').fontSize, size)
    assert.equal(shape('size').fontAutoSize, auto)
    assertions += 2
  }

  // Literal expectations written by hand from TextShape.cs, independent of the rule functions above.
  const WHITE = { r: 1, g: 1, b: 1 }
  const ZERO_TEXT = {
    lineSpacing: 0,
    lineCount: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    outlineWidth: 0,
    outlineColor: WHITE,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowBlur: 0,
    shadowColor: WHITE
  }
  const LITERAL = [
    {
      label: 'red label, size 13.5, right top',
      wire: {
        value: 'Hello',
        fontSize: 13.5,
        color: { r: 1, g: 0, b: 0 },
        opacity: 0.5,
        hTextAlign: 'Right',
        vTextAlign: 'TOP'
      },
      want: {
        ...ZERO_TEXT,
        text: 'Hello',
        font: undefined,
        fontSize: 13,
        fontAutoSize: false,
        textAlign: 2,
        textWrapping: false,
        width: undefined,
        height: undefined,
        textColor: { r: 1, g: 0, b: 0, a: 0.5 },
        billboard: undefined
      }
    },
    {
      label: 'auto-sized wrapped box with a numeric value',
      wire: {
        value: 0,
        fontSize: 0,
        textWrapping: true,
        width: 2.5,
        lineCount: 3.9,
        paddingTop: -2.7,
        paddingLeft: 1.2,
        outlineWidth: -1,
        outlineColor: { g: 0.5 },
        shadowOffsetX: 0.5,
        shadowBlur: 2,
        shadowColor: { r: 0.2 }
      },
      want: {
        text: '0',
        font: undefined,
        fontSize: undefined,
        fontAutoSize: true,
        textAlign: 4,
        textWrapping: true,
        width: 2.5,
        height: 0.2,
        lineSpacing: 0,
        lineCount: 3,
        paddingTop: -2,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 1,
        outlineWidth: 0,
        outlineColor: { r: 0, g: 0.5, b: 0 },
        shadowOffsetX: 0.5,
        shadowOffsetY: 0,
        shadowBlur: 2,
        shadowColor: { r: 0.2, g: 0, b: 0 },
        textColor: { r: 1, g: 1, b: 1, a: 1 },
        billboard: undefined
      }
    },
    {
      label: 'heavy billboarded sign with the swapped legacy default words',
      wire: {
        fontKey: 'sfHeavy',
        value: 'ARCADE',
        billboard: true,
        lineSpacing: '10px',
        hTextAlign: 'bottom',
        vTextAlign: 'left',
        outlineWidth: 0.075,
        outlineColor: { r: 0, g: 0, b: 0 }
      },
      want: {
        ...ZERO_TEXT,
        text: '<b>ARCADE</b>',
        font: 0,
        fontSize: 100,
        fontAutoSize: false,
        textAlign: 4,
        textWrapping: false,
        width: undefined,
        height: undefined,
        outlineWidth: 0.075,
        outlineColor: { r: 0, g: 0, b: 0 },
        textColor: { r: 1, g: 1, b: 1, a: 1 },
        billboard: 7
      }
    },
    {
      label: 'hidden bold text, bottom left, one visible line',
      wire: {
        fontKey: 'bold',
        value: 'gone',
        visible: false,
        fontSize: 30,
        vTextAlign: 'Bottom',
        hTextAlign: 'LEFT',
        lineCount: -1
      },
      want: {
        ...ZERO_TEXT,
        text: '',
        font: 0,
        fontSize: 30,
        fontAutoSize: false,
        textAlign: 6,
        textWrapping: false,
        width: undefined,
        height: undefined,
        lineCount: 1,
        textColor: { r: 1, g: 1, b: 1, a: 1 },
        billboard: undefined
      }
    },
    {
      label: 'black wrapped website label in the SDK default box',
      wire: { value: 'Website', fontSize: 1, textWrapping: true, width: 1, height: 1, color: { r: 0, g: 0, b: 0 } },
      want: {
        ...ZERO_TEXT,
        text: 'Website',
        font: undefined,
        fontSize: 1,
        fontAutoSize: false,
        textAlign: 4,
        textWrapping: true,
        width: 1,
        height: 1,
        textColor: { r: 0, g: 0, b: 0, a: 1 },
        billboard: undefined
      }
    }
  ]
  for (const [index, { label, wire, want }] of LITERAL.entries()) {
    const entity = `literal-${index}`
    await put(entity, wire)
    const actual = shape(entity)
    assert(actual, `${label}: TextShape present`)
    for (const field of Object.keys(want)) {
      if (field === 'billboard') continue
      near(actual[field], want[field], `${label}.${field}`)
      assertions++
    }
    assert.equal(node(entity)['core::Billboard']?.billboardMode, want.billboard, `${label}.billboard`)
    assertions++
    cases++
  }

  // Line spacing never reaches the renderer; line count clamps; paddings truncate.
  await put('lines', { value: 'lines', lineSpacing: '25px', lineCount: -4, paddingTop: 1.9, paddingLeft: -0.5 })
  check('lines', { value: 'lines', lineSpacing: '25px', lineCount: -4, paddingTop: 1.9, paddingLeft: -0.5 }, 'lines')
  assert.equal(shape('lines').lineSpacing, 0)
  assert.equal(shape('lines').lineCount, 1)
  assert.equal(shape('lines').paddingTop, 1)
  assert.equal(shape('lines').paddingLeft, 0)
  assertions += 4

  // Billboard toggles an SDK7 Billboard the TextShape owns; removal takes it away with the text.
  await put('board', { value: 'board', billboard: true })
  check('board', { value: 'board', billboard: true }, 'billboard on')
  await put('board', { value: 'board', billboard: false })
  check('board', { value: 'board', billboard: false }, 'billboard off')
  await put('board', { value: 'board', billboard: true })
  h.dcl.removeEntityComponent('board', 'engine.text')
  await tick()
  assert.equal(shape('board'), undefined, 'removal deletes the TextShape')
  assert.equal(node('board')['core::Billboard'], undefined, 'removal deletes the owned Billboard')
  assertions += 2

  // A scene Billboard (class 32) on the same entity keeps its own axes while attached; the text flag never overwrites
  // or deletes it, and acts again once the scene component goes away.
  const board = (entity) => node(entity)['core::Billboard']?.billboardMode
  const sceneBoard = async (entity, axes) => {
    h.dcl.updateEntityComponent(entity, 'engine.billboard', 32, JSON.stringify(axes))
    await tick()
  }
  const dropSceneBoard = async (entity) => {
    h.dcl.removeEntityComponent(entity, 'engine.billboard')
    await tick()
  }
  await put('shared', { value: 'shared', billboard: false })
  await sceneBoard('shared', { x: false, y: true, z: false })
  assert.equal(board('shared'), 2, 'scene axes on a text entity')
  await put('shared', { value: 'shared', billboard: true })
  assert.equal(board('shared'), 2, 'the text flag keeps the scene axes')
  await put('shared', { value: 'shared', billboard: false })
  assert.equal(board('shared'), 2, 'the text flag turning off keeps the scene Billboard')
  await dropSceneBoard('shared')
  assert.equal(board('shared'), undefined, 'no source left')
  await put('shared', { value: 'shared', billboard: true })
  assert.equal(board('shared'), 7, 'the text flag alone')
  await sceneBoard('shared', {})
  assert.equal(board('shared'), 7, 'scene default axes')
  await sceneBoard('shared', { x: true, y: false, z: false })
  assert.equal(board('shared'), 1, 'scene axes replace the text flag while attached')
  await dropSceneBoard('shared')
  assert.equal(board('shared'), 7, 'the text flag acts again once the scene Billboard goes')
  h.dcl.removeEntityComponent('shared', 'engine.text')
  await tick()
  assert.equal(board('shared'), undefined, 'text removal with no scene Billboard left')
  assertions += 9

  // Reverse order: text first, scene Billboard second; removing or disposing the text leaves the scene Billboard alone.
  await put('label', { value: 'label', billboard: true })
  await sceneBoard('label', { x: false, y: true, z: false })
  assert.equal(board('label'), 2, 'scene axes after the text flag')
  h.dcl.removeEntityComponent('label', 'engine.text')
  await tick()
  assert.equal(shape('label'), undefined, 'text removed')
  assert.equal(board('label'), 2, 'text removal keeps the scene Billboard')
  await put('disposed', { value: 'disposed', billboard: true })
  await sceneBoard('disposed', {})
  h.dcl.componentDisposed('text-disposed')
  await tick()
  assert.equal(shape('disposed'), undefined, 'text disposed')
  assert.equal(board('disposed'), 7, 'text disposal keeps the scene Billboard')
  await dropSceneBoard('disposed')
  assert.equal(board('disposed'), undefined, 'scene Billboard removal with no text left')
  assertions += 6

  // A scene Billboard on an entity without text still maps and unmaps on its own.
  h.dcl.addEntity('plain')
  await sceneBoard('plain', { x: true, y: true, z: false })
  assert.equal(board('plain'), 3, 'scene axes without text')
  await dropSceneBoard('plain')
  assert.equal(board('plain'), undefined, 'scene Billboard removed without text')
  assertions += 2

  // The updateEntityComponent path produces the same component.
  h.dcl.addEntity('direct')
  h.dcl.updateEntityComponent(
    'direct',
    'engine.text',
    21,
    JSON.stringify({ value: 'direct', fontSize: 8, textWrapping: true })
  )
  await tick()
  check('direct', { value: 'direct', fontSize: 8, textWrapping: true }, 'updateEntityComponent')

  // Disposal of the shared component removes the text from every entity that used it.
  h.dcl.componentDisposed('text-values')
  await tick()
  assert.equal(shape('values'), undefined, 'componentDisposed removes the TextShape')
  assertions++
  assert.equal(h.logs.filter((entry) => entry.level === 'error').length, 0, 'no adapter errors')
  assertions++

  console.log(`Class 21 text: PASS (${cases} cases, ${assertions} assertions)`)
  return {
    classId: 21,
    status: 'PASS',
    support: 'partial',
    seeds: 4,
    cases,
    assertions,
    failures: []
  }
}
if (require.main === module)
  run(process.argv[2]).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
module.exports = { run }
