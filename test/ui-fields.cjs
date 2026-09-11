// Field matrix for the SDK6 UI classes (24 canvas, 25 rect, 26 stack, 27 text, 28 input, 29 image,
// 30 scroll rect, 41 button). Every expected number is derived by hand from the legacy renderer
// semantics (UIShape alignment and positions, UIImage source rect, UIText paddings, UIContainerStack
// adapt defaults, UIInputText colours) on the harness canvas: 1280x720 at zoom 1, whose root spans
// 1280x612 below the reserved top band. The last section switches the canvas to 2560x1440 (zoom 2).
const assert = require('node:assert/strict')
const path = require('node:path')
const vm = require('node:vm')
const { boot, putWire } = require('./harness.cjs')

const c = (r, g = 0, b = 0, a = 1) => ({ r, g, b, a })
const near = (actual, expected, what) =>
  assert(Math.abs(actual - expected) < 1e-6, `${what}: expected ${expected}, got ${actual}`)
const ledger = new Map()
const cover = (cls, ...fields) => {
  if (!ledger.has(cls)) ledger.set(cls, new Set())
  for (const f of fields) ledger.get(cls).add(f)
}
// Fields the SDK7 UI protocol cannot carry; the adapter drops them and COMPATIBILITY.md lists them.
const dropped = {
  24: ['isPointerBlocker (the legacy canvas ignored it too)'],
  25: ['alignmentUsesSize'],
  27: [
    'outlineWidth',
    'outlineColor',
    'lineSpacing',
    'lineCount',
    'fontWeight',
    'shadowBlur',
    'shadowOffsetX',
    'shadowOffsetY',
    'shadowColor',
    'adaptWidth',
    'adaptHeight'
  ],
  28: ['onFocus', 'onBlur', 'color (the legacy input painted placeholderColor over it)'],
  30: ['valueX', 'valueY', 'isHorizontal', 'isVertical (host-driven scrolling, see test/regression.cjs)']
}

async function run(bundle) {
  const atlas = (tag) => `https://fixture.invalid/atlas.png?i=${tag}`
  const unknown = 'https://fixture.invalid/unknown.png'
  const lookups = []
  const h = await boot(bundle, '', {
    getTextureSize: ({ src }) => {
      lookups.push(src)
      if (src === unknown) throw new Error('size lookup failed')
      return { src, size: { width: 256, height: 128 } }
    }
  })
  const put = (id, cls, value) => {
    h.dcl.componentCreated(id, 'engine.shape', cls)
    h.dcl.componentUpdated(id, JSON.stringify(value))
  }
  const tick = async (n = 4) => {
    for (let i = 0; i < n; i++) await h.tick()
  }
  const nodes = () => Object.entries(h.snapshot()).filter(([, n]) => n['core::UiTransform'])
  const one = (pred, what) => {
    const hits = nodes().filter(([, n]) => pred(n))
    assert.equal(hits.length, 1, `exactly one node for ${what}`)
    return { entity: Number(hits[0][0]), node: hits[0][1], t: hits[0][1]['core::UiTransform'] }
  }
  const byColor = (r) => one((n) => n['core::UiBackground']?.color?.r === r, `colour ${r}`)
  const byText = (v) => one((n) => n['core::UiText']?.value === v, `text ${v}`)
  const byImage = (tag) =>
    one((n) => n['core::UiBackground']?.texture?.tex?.texture?.src === atlas(tag), `image ${tag}`)
  const byPlaceholder = (p) =>
    one((n) => n['core::UiInput']?.placeholder === p && (n['core::UiTransform'].display ?? 0) === 0, `input ${p}`)
  const box = ({ t }, left, top, width, height, what) => {
    near(t.positionLeft ?? 0, left, what + ' left')
    near(t.positionTop ?? 0, top, what + ' top')
    near(t.width, width, what + ' width')
    near(t.height, height, what + ' height')
    assert.equal(t.widthUnit, 1, what + ' width in points')
    assert.equal(t.heightUnit, 1, what + ' height in points')
  }
  const border = ({ t }, width, color, what) => {
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      assert.equal(t[`border${side}Width`] ?? 0, width, `${what} border ${side} width`)
      assert.deepEqual(t[`border${side}Color`] ?? color, color, `${what} border ${side} colour`)
    }
  }
  const DOWN = [{ eventType: 1, eventInfo: { button: 0, showFeedback: true }, interactionType: 0 }]
  const pointerEvents = (x) => x.node['core::PointerEvents']?.pointerEvents
  const uvNear = (x, expected, what) => {
    const actual = x.node['core::UiBackground'].uvs ?? []
    assert.equal(actual.length, expected.length, what + ' uv count')
    expected.forEach((v, i) => near(actual[i], v, `${what} uv[${i}]`))
  }

  put('canvas', 24, {})
  for (const tag of ['crop', 'frac', 'full', 'pad', 'click', 'hidden', 'nb', 'nested', 'zoom'])
    put('tex-' + tag, 68, { src: atlas(tag) })
  put('tex-unknown', 68, { src: unknown })
  put('font-bold', 34, { src: 'SansSerif_Bold' })

  // 25 UIContainerRect
  put('r-default', 25, { parentComponent: 'canvas', color: c(0.01) })
  put('r-lt', 25, {
    parentComponent: 'canvas',
    color: c(0.02),
    width: '50%',
    height: '25%',
    hAlign: 'left',
    vAlign: 'top',
    positionX: 10,
    positionY: 20
  })
  put('r-rb', 25, {
    parentComponent: 'canvas',
    color: c(0.03),
    width: 200,
    height: 100,
    positionX: '10%',
    positionY: '-10%',
    hAlign: 'right',
    vAlign: 'bottom'
  })
  put('r-hidden', 25, { parentComponent: 'canvas', color: c(0.04), visible: false })
  put('r-nb', 25, { parentComponent: 'canvas', color: c(0.05), isPointerBlocker: false, opacity: 0.5 })
  put('r-thick', 25, { parentComponent: 'canvas', color: c(0.06), thickness: 4 })
  put('r-parent', 25, {
    parentComponent: 'canvas',
    color: c(0.07),
    width: 400,
    height: 300,
    hAlign: 'left',
    vAlign: 'top'
  })
  put('r-child', 25, { parentComponent: 'r-parent', color: c(0.08) })
  put('r-child-pct', 25, {
    parentComponent: 'r-parent',
    color: c(0.09),
    width: '25%',
    height: '10%',
    hAlign: 'left',
    vAlign: 'top',
    positionX: '5%',
    positionY: '-5%'
  })
  put('r-nb-parent', 25, { parentComponent: 'canvas', color: c(0.1), isPointerBlocker: false })
  put('r-nb-child', 25, { parentComponent: 'r-nb-parent', color: c(0.11), isPointerBlocker: true })
  put('r-hidden-parent', 25, { parentComponent: 'canvas', color: c(0.12), visible: false })
  put('r-hidden-child', 25, { parentComponent: 'r-hidden-parent', color: c(0.13) })
  put('r-typed', 25, {
    parentComponent: 'canvas',
    color: c(0.15),
    name: 'panel',
    alignmentUsesSize: false,
    width: { type: 1, value: 40 },
    height: { type: 0, value: 50 }
  })

  // 27 UIText
  put('t-default', 27, { parentComponent: 'canvas', value: 't-default' })
  put('t-full', 27, {
    parentComponent: 'canvas',
    value: 't-full',
    fontSize: 20.9,
    color: c(1),
    hTextAlign: 'left',
    vTextAlign: 'bottom',
    textWrapping: false,
    width: 300,
    height: 100,
    paddingTop: 3,
    paddingLeft: 4,
    paddingRight: 5,
    paddingBottom: 6,
    opacity: 0.4,
    isPointerBlocker: false,
    outlineWidth: 0.2,
    outlineColor: c(0, 1),
    lineSpacing: 5,
    lineCount: 2,
    fontWeight: 'bold',
    shadowBlur: 1,
    shadowOffsetX: 1,
    shadowOffsetY: 1,
    shadowColor: c(0),
    adaptWidth: true,
    adaptHeight: true
  })
  put('t-wrap', 27, { parentComponent: 'canvas', value: 't-wrap', textWrapping: true })
  put('t-auto', 27, { parentComponent: 'canvas', value: 't-auto', textWrapping: true, fontAutoSize: true, fontSize: 0 })
  put('t-font', 27, { parentComponent: 'canvas', value: 't-font', font: 'font-bold' })
  put('t-number', 27, { parentComponent: 'canvas', value: 42 })
  const rows = ['top', 'center', 'bottom']
  const cols = ['left', 'center', 'right']
  for (const v of rows)
    for (const hh of cols)
      put(`t-${v}-${hh}`, 27, { parentComponent: 'canvas', value: `t-${v}-${hh}`, hTextAlign: hh, vTextAlign: v })

  // 29 UIImage
  put('i-crop', 29, {
    parentComponent: 'canvas',
    source: 'tex-crop',
    width: 64,
    height: 32,
    sourceLeft: 8,
    sourceTop: 4,
    sourceWidth: 16,
    sourceHeight: 8,
    sizeInPixels: true
  })
  put('i-frac-parent', 25, { parentComponent: 'canvas', color: c(0.2), width: 400, height: 200 })
  put('i-frac', 29, {
    parentComponent: 'i-frac-parent',
    source: 'tex-frac',
    sizeInPixels: false,
    sourceLeft: 0.25,
    sourceTop: 0.5,
    sourceWidth: 0.5,
    sourceHeight: 0.25
  })
  put('i-full', 29, { parentComponent: 'canvas', source: 'tex-full', positionX: 100 })
  put('i-unknown', 29, {
    parentComponent: 'canvas',
    source: 'tex-unknown',
    sourceLeft: 8,
    sourceTop: 4,
    sourceWidth: 16,
    sourceHeight: 8
  })
  put('i-pad', 29, {
    parentComponent: 'canvas',
    source: 'tex-pad',
    width: 300,
    height: 100,
    paddingTop: 3,
    paddingLeft: 4,
    paddingRight: 5,
    paddingBottom: 6,
    positionX: 200
  })
  put('i-click', 29, { parentComponent: 'canvas', source: 'tex-click', onClick: 'uuid-a', positionX: 300 })
  put('i-hidden-click', 29, {
    parentComponent: 'canvas',
    source: 'tex-hidden',
    onClick: 'uuid-b',
    visible: false,
    positionX: 400
  })
  put('i-nb-click', 29, {
    parentComponent: 'canvas',
    source: 'tex-nb',
    onClick: 'uuid-c',
    isPointerBlocker: false,
    positionX: 500
  })
  put('i-nested-nb', 29, { parentComponent: 'r-nb-parent', source: 'tex-nested', onClick: 'uuid-d', positionX: 600 })
  put('i-nosource', 29, {
    parentComponent: 'canvas',
    width: 12,
    height: 12,
    positionX: 700,
    onClick: 'uuid-e',
    isPointerBlocker: false,
    visible: false
  })

  // 26 UIContainerStack
  put('s-v', 26, {
    parentComponent: 'canvas',
    color: c(0.3),
    width: 400,
    height: 300,
    stackOrientation: 0,
    spacing: 10,
    hAlign: 'left',
    vAlign: 'top'
  })
  put('s-v-a', 25, { parentComponent: 's-v', color: c(0.31), width: 50, height: 40 })
  put('s-v-b', 25, { parentComponent: 's-v', color: c(0.32), width: 120, height: 10, positionX: 7 })
  put('s-h', 26, {
    parentComponent: 'canvas',
    color: c(0.33),
    stackOrientation: 1,
    spacing: 5,
    hAlign: 'left',
    vAlign: 'top',
    positionY: -400
  })
  put('s-h-c', 25, { parentComponent: 's-h', color: c(0.34), width: 30, height: 40 })
  put('s-h-d', 25, { parentComponent: 's-h', color: c(0.35), width: 50, height: 20 })
  put('s-fixed', 26, {
    parentComponent: 'canvas',
    color: c(0.36),
    width: 400,
    height: 300,
    adaptWidth: false,
    adaptHeight: false,
    hAlign: 'right',
    vAlign: 'bottom'
  })
  put('s-fixed-a', 25, { parentComponent: 's-fixed', color: c(0.37), width: 50, height: 40 })
  put('s-empty', 26, { parentComponent: 'canvas', color: c(0.38), hAlign: 'left', vAlign: 'top', positionY: -500 })
  put('s-nb', 26, { parentComponent: 'canvas', color: c(0.39), isPointerBlocker: false })
  put('s-nb-a', 25, { parentComponent: 's-nb', color: c(0.4), width: 50, height: 40 })

  // 28 UIInputText
  put('n-default', 28, { parentComponent: 'canvas' })
  put('n-full', 28, {
    parentComponent: 'canvas',
    placeholder: 'ph',
    placeholderColor: c(0, 0, 1),
    color: c(0, 1),
    fontSize: 14.9,
    hTextAlign: 'left',
    vTextAlign: 'top',
    focusedBackground: c(1, 1),
    width: 200,
    height: 40,
    value: 'initial',
    onChanged: 'u1',
    onTextSubmit: 'u2',
    onFocus: 'u3',
    onBlur: 'u4',
    font: 'font-bold'
  })
  put('n-hidden', 28, { parentComponent: 'canvas', visible: false, positionX: 300 })

  // 30 UIScrollRect
  put('c-scroll', 30, {
    parentComponent: 'canvas',
    width: 100,
    height: 100,
    backgroundColor: c(0.5),
    hAlign: 'left',
    vAlign: 'top',
    isPointerBlocker: false
  })
  put('c-scroll-a', 25, { parentComponent: 'c-scroll', color: c(0.51) })
  put('c-scroll2', 30, {
    parentComponent: 'canvas',
    width: 100,
    height: 100,
    backgroundColor: c(0.52),
    hAlign: 'left',
    vAlign: 'top',
    positionX: 200
  })
  put('c-scroll2-a', 25, { parentComponent: 'c-scroll2', color: c(0.53) })

  // 41 UIButton
  put('b-btn', 41, {
    parentComponent: 'canvas',
    text: 'go',
    onClick: 'uuid-btn',
    color: c(0.6),
    background: c(0.61),
    thickness: 2,
    cornerRadius: 3,
    fontSize: 12
  })

  await tick()

  // 25
  const rDefault = byColor(0.01)
  const chain = []
  for (let e = rDefault.t.parent; e !== 0 && chain.length < 8; e = h.snapshot()[e]['core::UiTransform'].parent)
    chain.push(e)
  assert.equal(chain.length, 2, 'a canvas child hangs off the canvas node under the screen root')
  box(rDefault, 590, 281, 100, 50, 'default rect (100x50 centred)')
  assert.equal(rDefault.t.display ?? 0, 0, 'default rect is displayed')
  assert.equal(rDefault.t.pointerFilter ?? 0, 1, 'default rect blocks the pointer')
  assert.equal(rDefault.t.opacity, 1, 'default opacity')
  assert.deepEqual(rDefault.node['core::UiBackground'].color, c(0.01), 'rect colour')
  cover(
    25,
    'color',
    'width',
    'height',
    'hAlign',
    'vAlign',
    'positionX',
    'positionY',
    'visible',
    'opacity',
    'isPointerBlocker',
    'thickness',
    'name',
    'parentComponent'
  )
  box(byColor(0.02), 10, -20, 640, 153, 'left/top rect with percent size and pixel offsets (positive Y is up)')
  box(byColor(0.03), 1208, 573.2, 200, 100, 'right/bottom rect with percent offsets of the parent size')
  assert.equal(byColor(0.04).t.display, 1, 'visible false hides the rect')
  assert.equal(byColor(0.04).t.pointerFilter ?? 0, 0, 'a hidden rect does not block the pointer')
  const rNb = byColor(0.05)
  assert.equal(rNb.t.display ?? 0, 0, 'isPointerBlocker false keeps the rect visible')
  assert.equal(rNb.t.pointerFilter ?? 0, 0, 'isPointerBlocker false lets the pointer through')
  assert.equal(rNb.t.opacity, 0.5, 'opacity is forwarded')
  border(byColor(0.06), 4, c(0, 0, 0, 0.5), 'thickness')
  border(rDefault, 0, c(0, 0, 0, 0.5), 'no thickness')
  const rParent = byColor(0.07)
  box(rParent, 0, 0, 400, 300, 'parent rect')
  const rChild = byColor(0.08)
  assert.equal(rChild.t.parent, rParent.entity, 'child hangs off its parent rect')
  box(rChild, 150, 125, 100, 50, 'default child centred in a 400x300 parent')
  box(
    byColor(0.09),
    20,
    15,
    100,
    30,
    'percent child sizes and offsets resolve against the parent rect (positive Y is up)'
  )
  assert.equal(
    byColor(0.11).t.pointerFilter ?? 0,
    0,
    'a blocking child of a non-blocking parent lets the pointer through'
  )
  assert.equal(byColor(0.11).t.display ?? 0, 0, 'a blocking child of a non-blocking parent stays displayed')
  assert.equal(byColor(0.13).t.pointerFilter ?? 0, 0, 'a child of a hidden parent does not block')
  box(byColor(0.15), 620, 153, 40, 306, 'typed width/height objects (px 40, 50% of 612)')

  // 27
  const tDefault = byText('t-default')
  assert.deepEqual(
    tDefault.node['core::UiText'],
    { value: 't-default', color: c(1, 1, 1), textAlign: 4, font: 0, fontSize: 10, textWrap: 0 },
    'text defaults: white, 10, middle-centre, sans-serif; an absent textWrapping wraps (the SDK6 library always sends the field)'
  )
  box(tDefault, 590, 281, 100, 50, 'default text box')
  assert.equal(tDefault.t.pointerFilter ?? 0, 1, 'text blocks the pointer by default')
  cover(
    27,
    'value',
    'fontSize',
    'color',
    'hTextAlign',
    'vTextAlign',
    'textWrapping',
    'fontAutoSize',
    'font',
    'width',
    'height',
    'positionX',
    'positionY',
    'hAlign',
    'vAlign',
    'visible',
    'opacity',
    'isPointerBlocker',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'parentComponent'
  )
  const tFull = byText('t-full')
  assert.deepEqual(
    tFull.node['core::UiText'],
    { value: 't-full', color: c(1), textAlign: 6, font: 0, fontSize: 20, textWrap: 1 },
    'text: fontSize truncates, bottom-left, no wrap'
  )
  box(tFull, 494, 259, 291, 91, 'text paddings inset the box')
  assert.equal(tFull.t.opacity, 0.4, 'text opacity')
  assert.equal(tFull.t.pointerFilter ?? 0, 0, 'text isPointerBlocker false')
  assert.equal(byText('t-wrap').node['core::UiText'].textWrap ?? 0, 0, 'textWrapping true wraps')
  assert.equal(
    byText('t-auto').node['core::UiText'].textWrap,
    1,
    'fontAutoSize disables wrapping as in the legacy renderer'
  )
  assert.equal(byText('t-font').node['core::UiText'].font ?? 0, 0, 'every legacy font maps to sans-serif')
  byText('42')
  for (const [ri, v] of rows.entries())
    for (const [ci, hh] of cols.entries())
      assert.equal(byText(`t-${v}-${hh}`).node['core::UiText'].textAlign ?? 0, ri * 3 + ci, `alignment ${v}/${hh}`)

  // 29 (texture 256x128; uvs run bottom-left, top-left, top-right, bottom-right)
  cover(
    29,
    'source',
    'sourceLeft',
    'sourceTop',
    'sourceWidth',
    'sourceHeight',
    'sizeInPixels',
    'onClick',
    'width',
    'height',
    'positionX',
    'visible',
    'isPointerBlocker',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'parentComponent'
  )
  const iCrop = byImage('crop')
  box(iCrop, 608, 290, 64, 32, 'image box')
  assert.equal(iCrop.node['core::UiBackground'].textureMode, 2, 'images stretch')
  uvNear(iCrop, [0.03125, 0.90625, 0.03125, 0.96875, 0.09375, 0.96875, 0.09375, 0.90625], 'pixel source rect 8,4 16x8')
  uvNear(
    byImage('frac'),
    [0.390625, -0.171875, 0.390625, 0.21875, 1.171875, 0.21875, 1.171875, -0.171875],
    'sizeInPixels false scales the source rect by the 400x200 parent'
  )
  uvNear(byImage('full'), [0, 0, 0, 1, 1, 1, 1, 0], 'no source rect shows the whole texture')
  const iUnknown = one((n) => n['core::UiBackground']?.texture?.tex?.texture?.src === unknown, 'unknown image')
  uvNear(iUnknown, [], 'a failed size lookup shows the whole texture')
  assert.equal(
    h.logs.filter((l) => l.level === 'error' && l.args.join(' ').includes('texture size')).length,
    1,
    'the failed lookup is logged once'
  )
  assert.equal(lookups.filter((s) => s === unknown).length, 1, 'the failed lookup is not retried every frame')
  box(byImage('pad'), 694, 259, 291, 91, 'image paddings inset the box')
  assert.deepEqual(pointerEvents(byImage('click')), DOWN, 'onClick registers a pointer-down listener')
  assert.equal(byImage('click').t.pointerFilter ?? 0, 1, 'a clickable image blocks the pointer')
  assert.equal(pointerEvents(byImage('hidden')), undefined, 'a hidden image has no listener')
  assert.equal(pointerEvents(byImage('nb')), undefined, 'a non-blocking image has no listener')
  assert.equal(pointerEvents(byImage('nested')), undefined, 'an image under a non-blocking parent has no listener')
  assert.equal(pointerEvents(iCrop), undefined, 'no onClick, no listener')
  const noSource = nodes().filter(
    ([, n]) => (n['core::UiTransform'].positionLeft ?? 0) === 634 + 700 && n['core::UiTransform'].width === 12
  )
  assert.equal(noSource.length, 1, 'an image without a source still lays out')
  assert.equal(noSource[0][1]['core::UiBackground']?.texture, undefined, 'an image without a source has no texture')

  // 26
  cover(
    26,
    'color',
    'stackOrientation',
    'spacing',
    'adaptWidth',
    'adaptHeight',
    'width',
    'height',
    'hAlign',
    'vAlign',
    'positionY',
    'isPointerBlocker',
    'parentComponent'
  )
  const sV = byColor(0.3)
  box(sV, 0, 0, 120, 60, 'vertical stack adapts to its children by default')
  assert.deepEqual(sV.node['core::UiBackground'].color, c(0.3), 'stack colour')
  const sVa = byColor(0.31)
  assert.equal(sVa.t.parent, sV.entity, 'stack child parent')
  box(sVa, 0, 0, 50, 40, 'first stacked child')
  box(byColor(0.32), 7, 50, 120, 10, 'second stacked child after height plus spacing, positionX kept')
  box(byColor(0.33), 0, 400, 85, 40, 'horizontal stack adapts to width sum plus spacing and max height')
  box(byColor(0.34), 0, 0, 30, 40, 'first horizontal child')
  box(byColor(0.35), 35, 0, 50, 20, 'second horizontal child after width plus spacing')
  box(byColor(0.36), 880, 312, 400, 300, 'adaptWidth/adaptHeight false keep the declared size')
  box(byColor(0.38), 0, 500, 0, 0, 'an empty adapting stack collapses')
  assert.equal(byColor(0.4).t.pointerFilter ?? 0, 0, 'children of a non-blocking stack let the pointer through')

  // 28
  cover(
    28,
    'placeholder',
    'placeholderColor',
    'focusedBackground',
    'fontSize',
    'hTextAlign',
    'vTextAlign',
    'value',
    'font',
    'width',
    'height',
    'visible',
    'positionX',
    'parentComponent'
  )
  const nDefault = byPlaceholder('')
  assert.deepEqual(
    nDefault.node['core::UiInput'],
    {
      placeholder: '',
      color: c(1, 1, 1),
      placeholderColor: c(1, 1, 1),
      disabled: false,
      textAlign: 4,
      font: 0,
      fontSize: 10,
      value: ''
    },
    'input defaults: white text, black background, 10, middle-centre'
  )
  assert.deepEqual(nDefault.node['core::UiBackground'].color, c(0), 'default focusedBackground is black')
  box(nDefault, 590, 281, 100, 50, 'default input box')
  assert.equal(nDefault.t.pointerFilter ?? 0, 1, 'inputs block the pointer')
  const nFull = byPlaceholder('ph')
  assert.deepEqual(
    nFull.node['core::UiInput'],
    {
      placeholder: 'ph',
      color: c(0, 0, 1),
      placeholderColor: c(0, 0, 1),
      disabled: false,
      textAlign: 0,
      font: 0,
      fontSize: 14,
      value: 'initial'
    },
    'input: placeholderColor colours the text, fontSize truncates, top-left'
  )
  assert.deepEqual(nFull.node['core::UiBackground'].color, c(1, 1), 'focusedBackground paints the background')
  box(nFull, 540, 286, 200, 40, 'input box')
  const nHidden = one((n) => n['core::UiInput'] && n['core::UiTransform'].display === 1, 'hidden input')
  assert.equal(nHidden.t.pointerFilter ?? 0, 0, 'a hidden input does not block')

  // 30
  cover(
    30,
    'backgroundColor',
    'width',
    'height',
    'hAlign',
    'vAlign',
    'positionX',
    'isPointerBlocker',
    'parentComponent'
  )
  assert.equal(byColor(0.51).t.pointerFilter ?? 0, 0, 'children of a non-blocking scroll rect let the pointer through')
  assert.equal(byColor(0.53).t.pointerFilter ?? 0, 1, 'children of a blocking scroll rect block')
  box(byColor(0.53), 0, 25, 100, 50, 'scroll rect child laid out against the 100x100 viewport')

  // 41
  cover(41, 'text', 'onClick', 'color', 'background', 'thickness', 'cornerRadius', 'fontSize', 'parentComponent')
  const btn = byColor(0.61)
  box(btn, 590, 281, 100, 50, 'button box')
  assert.deepEqual(pointerEvents(btn), DOWN, 'button onClick registers a pointer-down listener')
  border(btn, 2, c(0.6), 'button thickness and colour')
  for (const corner of ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'])
    assert.equal(btn.t[`border${corner}Radius`], 3, `button ${corner} radius`)
  const label = byText('go')
  assert.equal(label.t.parent, btn.entity, 'button label is a child of the button')
  assert.deepEqual(
    label.node['core::UiText'],
    { value: 'go', color: c(0.6), textAlign: 4, fontSize: 12, textWrap: 0 },
    'button label text'
  )
  assert.equal(label.t.pointerFilter ?? 0, 0, 'the label never blocks the button')

  // 24
  cover(24, 'visible', 'parentComponent')
  const shown = nodes().length
  put('canvas', 24, { visible: false })
  await tick()
  assert.equal(nodes().length, 1, 'a hidden canvas renders only the root')
  put('canvas', 24, { visible: true })
  await tick()
  assert.equal(nodes().length, shown, 'a shown canvas renders everything again')

  // zoom 2: 2560x1440 canvas information on the root entity
  const Buffer = vm.runInContext('ReadWriteByteBuffer', h.context)
  const buf = new Buffer()
  h.engine
    .getComponent(1054)
    .schema.serialize({ devicePixelRatio: 1, width: 2560, height: 1440, interactableArea: undefined }, buf)
  h.incoming.push(putWire(0, 1054, buf.toBinary(), 50))
  await tick()
  box(byColor(0.01), 1180, 562, 200, 100, 'zoom 2 doubles the default rect')
  border(byColor(0.06), 8, c(0, 0, 0, 0.5), 'zoom 2 doubles the border')
  assert.equal(byText('t-default').node['core::UiText'].fontSize, 20, 'zoom 2 doubles the text font size')
  assert.equal(byPlaceholder('ph').node['core::UiInput'].fontSize, 28, 'zoom 2 doubles the input font size')
  box(byColor(0.32), 14, 100, 240, 20, 'zoom 2 doubles stacked children and their offsets')
  uvNear(
    byImage('crop'),
    [0.03125, 0.90625, 0.03125, 0.96875, 0.09375, 0.96875, 0.09375, 0.90625],
    'zoom does not touch the source rect'
  )

  const errors = h.logs.filter((l) => l.level === 'error' && !l.args.join(' ').includes('texture size'))
  assert.deepEqual(errors, [], 'no errors logged')
}

;(async () => {
  await run(path.join(__dirname, '../dist/index.js'))
  const lines = [...ledger.entries()]
    .sort(([a], [b]) => a - b)
    .map(
      ([cls, fields]) =>
        `  class ${cls}: asserted ${[...fields].join(' ')}${
          dropped[cls] ? '; dropped by SDK7: ' + dropped[cls].join(', ') : ''
        }`
    )
  console.log('UI field matrix: PASS\n' + lines.join('\n'))
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
