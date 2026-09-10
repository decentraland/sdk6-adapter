export type GlyphAtlas = {
  version: 1
  source: string
  renderSize: number
  pointSize: number
  padding: number
  ascent: number
  descent: number
  lineHeight: number
  characters: Record<string, { advance: number; x: number; y: number; width: number; height: number; uvs: number[] }>
}

let atlases: GlyphAtlas[] = []

export function configureGlyphAtlases(value: GlyphAtlas[]): void {
  if (!Array.isArray(value) || value.some(a => a.version !== 1 || !a.source || !(a.pointSize > 0) || !(a.renderSize > 0)))
    throw Error('Invalid SDK6 glyph atlas')
  atlases = value
}

export function layoutGlyphText(
  text: string,
  width: number,
  height: number,
  fontSize: number,
  zoom: number,
  wrap: boolean,
  horizontal = 'center',
  vertical = 'center'
): { atlas: GlyphAtlas; quads: { x: number; y: number; width: number; height: number; uvs: number[] }[] } | undefined {
  const atlas = atlases.find(a => Math.abs(a.renderSize - fontSize * zoom) < 1e-6)
  if (!atlas || /[\t\r<>]/.test(text)) return
  const glyphs = atlas.characters, scale = fontSize / atlas.pointSize
  if ([...text].some(c => c !== '\n' && !glyphs[c.codePointAt(0)!])) return
  const advance = (s: string): number => [...s].reduce((n, c) => n + glyphs[c.codePointAt(0)!].advance * scale, 0)
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    let lineWidth = 0
    for (const token of paragraph.match(/\S+| +/g) ?? []) {
      if (wrap && line && token.trim() && lineWidth + advance(token) > width) {
        lines.push(line.trimEnd())
        line = ''
        lineWidth = 0
      }
      for (const c of token) {
        const nextWidth = glyphs[c.codePointAt(0)!].advance * scale
        if (wrap && line && c !== ' ' && lineWidth + nextWidth > width) {
          lines.push(line)
          line = ''
          lineWidth = 0
        }
        line += c
        lineWidth += nextWidth
      }
    }
    lines.push(line)
  }
  const span = (lines.length - 1) * atlas.lineHeight * scale
  const top = atlas.ascent * scale
  const bottom = height + atlas.descent * scale - span
  const baseline = vertical === 'top' ? top : vertical === 'bottom' ? bottom : (top + bottom) / 2
  const quads = []
  for (let i = 0; i < lines.length; i++) {
    const lineWidth = advance(lines[i])
    let x = horizontal === 'left' ? 0 : horizontal === 'right' ? width - lineWidth : (width - lineWidth) / 2
    for (const c of lines[i]) {
      const g = glyphs[c.codePointAt(0)!]
      if (g.width && g.height) quads.push({
        x: (x + (g.x - atlas.padding) * scale) * zoom,
        y: (baseline + i * atlas.lineHeight * scale - (g.y + atlas.padding) * scale) * zoom,
        width: (g.width + 2 * atlas.padding) * scale * zoom,
        height: (g.height + 2 * atlas.padding) * scale * zoom,
        uvs: g.uvs
      })
      x += g.advance * scale
    }
  }
  return { atlas, quads: quads.map(q => {
    const left = Math.floor(q.x), top = Math.floor(q.y)
    const right = Math.ceil(q.x + q.width), bottom = Math.ceil(q.y + q.height)
    const du = (q.uvs[4] - q.uvs[0]) / q.width, dv = (q.uvs[1] - q.uvs[3]) / q.height
    const u0 = q.uvs[0] + (left - q.x) * du, u1 = q.uvs[0] + (right - q.x) * du
    const v0 = q.uvs[3] + (top - q.y) * dv, v1 = q.uvs[3] + (bottom - q.y) * dv
    return { x: left, y: top, width: right - left, height: bottom - top, uvs: [u0, v1, u0, v0, u1, v0, u1, v1] }
  }) }
}
