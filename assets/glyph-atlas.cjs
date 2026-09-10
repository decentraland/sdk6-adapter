const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const { PNG } = require('pngjs')
const [fontArg, outputArg, source, sizeArg = '16'] = process.argv.slice(2)
if (!fontArg || !outputArg || !source) throw Error('Pass extracted font.json, new output directory, scene texture path and optional render size')
const file = path.resolve(fontArg), root = path.resolve(outputArg), font = JSON.parse(fs.readFileSync(file)), size = Number(sizeArg)
assert(Number.isFinite(size) && size > 0)
assert(!fs.existsSync(root), 'Output directory already exists')
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
for (const [p, h] of Object.entries(font.sourceHashes)) assert.equal(hash(p), h)
const input = path.join(path.dirname(file), 'atlas-sdf.png')
assert.equal(hash(input), font.atlasSha256)
const atlas = PNG.sync.read(fs.readFileSync(input)), upsample = 4, out = new PNG({ width: atlas.width * upsample, height: atlas.height * upsample })
const params = font.material.floats, scale = Math.SQRT2 * size / font.face.m_PointSize * params._GradientScale * 1.5
assert.equal(params._OutlineWidth, 0); assert.equal(params._OutlineSoftness, 0); assert.equal(font.material.keywords || '', '')
const weight = (params._WeightNormal / 4 + params._FaceDilate) * params._ScaleRatioA * .5
for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
  const u = (x + .5) / upsample - .5, v = (y + .5) / upsample - .5, ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy
  let d = 0
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const px = Math.max(0, Math.min(atlas.width - 1, ix + i)), py = Math.max(0, Math.min(atlas.height - 1, iy + j))
    d += atlas.data[(py * atlas.width + px) * 4 + 3] / 255 * (i ? fx : 1 - fx) * (j ? fy : 1 - fy)
  }
  const n = (y * out.width + x) * 4
  out.data[n] = out.data[n + 1] = out.data[n + 2] = 255
  out.data[n + 3] = Math.round(255 * Math.max(0, Math.min(1, (d - .5 + weight) * scale + .5)))
}
const characters = Object.fromEntries(Object.entries(font.characters).map(([code, g]) => {
  assert.equal(g.scale, 1)
  const m = g.metrics, r = g.rect, p = font.padding
  const l = (r.m_X - p) / atlas.width, b = (r.m_Y - p) / atlas.height, right = (r.m_X + r.m_Width + p) / atlas.width, t = (r.m_Y + r.m_Height + p) / atlas.height
  return [code, { advance: m.m_HorizontalAdvance, x: m.m_HorizontalBearingX, y: m.m_HorizontalBearingY, width: m.m_Width, height: m.m_Height, uvs: [l, b, l, t, right, t, right, b] }]
}))
const config = { version: 1, source, renderSize: size, pointSize: font.face.m_PointSize, padding: font.padding, ascent: font.face.m_AscentLine, descent: font.face.m_DescentLine, lineHeight: font.face.m_LineHeight, characters }
fs.mkdirSync(root, { recursive: true })
fs.writeFileSync(root + '/atlas.png', PNG.sync.write(out, { colorType: 4, deflateStrategy: 1 }))
fs.writeFileSync(root + '/atlas.json', JSON.stringify(config) + '\n')
fs.writeFileSync(root + '/provenance.json', JSON.stringify({ status: 'GLYPH_COVERAGE_ATLAS_PREPARED', size, upsample, glyphs: Object.keys(characters).length, scope: 'Normal default font at the selected screen size; native atlas rendering and general layout parity require separate validation.', hashes: Object.fromEntries([file, input, __filename, root + '/atlas.png', root + '/atlas.json'].map(p => [p, hash(p)])) }, null, 2) + '\n')
console.log({ root, size, glyphs: Object.keys(characters).length, pngBytes: fs.statSync(root + '/atlas.png').size })
