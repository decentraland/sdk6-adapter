import { TextShape } from '@dcl/sdk/ecs'
import { sdk7EnsureEntity } from '../ecs7/ecs7'
import { type AdaptationLayerState, type ComponentAdaptation } from '../types'

import { type ECS6ComponentFont, type ECS6ComponentTextShape } from '~system/EngineApi'
import { applyBillboard } from './commons/billboard'
import { stringToTextAlignMode, textAlignFromHV } from './commons/ui/uiText'
import { convertFont } from './commons/utils'

/**
 * Field by field port of the legacy renderer's TextShape model and ApplyModelChanges (unity-renderer TextShape.cs).
 * Values absent from the payload take the legacy model defaults, not the SDK6 constructor defaults, because the
 * renderer only saw the wire payload. docs/class21.md carries the parity table.
 */
type Rgb = { r?: number; g?: number; b?: number }

/** Legacy model defaults for fields the payload omits (TextShape.cs:26,33,34). */
const LEGACY_FONT_SIZE = 100
const LEGACY_WIDTH = 1
const LEGACY_HEIGHT = 0.2
const WHITE: Required<Rgb> = { r: 1, g: 1, b: 1 }

/**
 * Legacy font resources heavier than regular, which DCLFont.cs:23-30 mapped to the Bold, Heavy and SemiBold Inter
 * assets. PBTextShape carries no weight, so the adapter approximates every one of them with bold rich text; the legacy
 * renderer swapped the font asset and never emitted a tag.
 */
const BOLD_FONT_SOURCES = new Set([
  'SansSerif_Heavy',
  'SansSerif_Bold',
  'SansSerif_SemiBold',
  'builtin:SF-UI-Text-Heavy SDF',
  'builtin:SF-UI-Text-Semibold SDF'
])

/**
 * An unset or null SDK6 text field is empty text: the legacy serializer omitted undefined fields and the renderer
 * model defaulted them to "", so no text ever displays the literal "undefined" or "null". Other non-string values keep
 * their string form.
 */
export function sdk6TextValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : String(value)
}

/** A finite number, else 0; the legacy float fields defaulted to 0. */
function sdk6Number(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/** The legacy renderer stored these fields through a C# int cast, which truncates toward zero (TextShape.cs:180,185-192). */
function sdk6Int(value: unknown): number {
  return Math.trunc(sdk6Number(value))
}

/** A missing colour keeps the legacy model default; a missing channel reads as 0, as the wire decoders did. */
function sdk6Color3(color: Rgb | undefined, fallback: Required<Rgb>): Required<Rgb> {
  if (color === undefined || color === null) return { ...fallback }
  return { r: sdk6Number(color.r), g: sdk6Number(color.g), b: sdk6Number(color.b) }
}

/** GetAlignment lowercases both words before matching (TextShape.cs:233-234). */
function sdk6AlignWord(value: unknown): string | undefined {
  return typeof value === 'string' ? value.toLowerCase() : undefined
}

function sdk6FontIsBold(state: AdaptationLayerState, fontComponentId: unknown): boolean {
  if (typeof fontComponentId !== 'string') return false
  const font = state.ecs7.components[fontComponentId]?.data as ECS6ComponentFont | undefined
  return font?.src !== undefined && BOLD_FONT_SOURCES.has(font.src)
}

function update(state: AdaptationLayerState, ecs6EntityId: EntityID, payload: ECS6ComponentTextShape): void {
  const ecs7Entity = sdk7EnsureEntity(state, ecs6EntityId)

  const value = TextShape.getOrCreateMutable(ecs7Entity)

  // Legacy hid an invisible text by zeroing its alpha (TextShape.cs:179); empty text is the cheaper equivalent.
  let text = payload.visible === false ? '' : sdk6TextValue(payload.value)
  if (text !== '' && sdk6FontIsBold(state, payload.font)) text = `<b>${text}</b>`
  value.text = text
  value.font = convertFont(state, payload.font)

  // A wire font size of exactly 0 switched TMP auto-sizing on (TextShape.cs:86); any other size went through an int
  // cast (TextShape.cs:180). The SDK7 engines skip or hide a size of 0, so the auto-sized text carries no size at all.
  const fontSize = payload.fontSize === undefined || payload.fontSize === null ? LEGACY_FONT_SIZE : payload.fontSize
  const fontAutoSize = fontSize === 0
  value.fontAutoSize = fontAutoSize
  value.fontSize = fontAutoSize ? undefined : sdk6Int(fontSize)

  value.textColor = { ...sdk6Color3(payload.color, WHITE), a: sdk6Number(payload.opacity ?? 1) }

  value.textAlign = stringToTextAlignMode(
    textAlignFromHV(sdk6AlignWord(payload.hTextAlign), sdk6AlignWord(payload.vTextAlign))
  )

  // The text rect only had a size while wrapping (TextShape.cs:270-277); otherwise it was a point the text overflows.
  const textWrapping = payload.textWrapping === true
  value.textWrapping = textWrapping
  value.width = textWrapping ? sdk6Number(payload.width ?? LEGACY_WIDTH) : undefined
  value.height = textWrapping ? sdk6Number(payload.height ?? LEGACY_HEIGHT) : undefined

  // The SDK6 line spacing is a CSS length string that no legacy decoder ever applied (TextShape.cs:88), so the
  // renderer always used the model default of 0.
  value.lineSpacing = 0
  // A non-zero line count is clamped to at least one visible line (TextShape.cs:197-204); 0 is unlimited.
  const lineCount = sdk6Int(payload.lineCount)
  value.lineCount = lineCount === 0 ? 0 : Math.max(lineCount, 1)

  value.paddingTop = sdk6Int(payload.paddingTop)
  value.paddingRight = sdk6Int(payload.paddingRight)
  value.paddingBottom = sdk6Int(payload.paddingBottom)
  value.paddingLeft = sdk6Int(payload.paddingLeft)

  // The outline only existed for a positive width (TextShape.cs:219-228).
  const outlineWidth = sdk6Number(payload.outlineWidth)
  value.outlineWidth = outlineWidth > 0 ? outlineWidth : 0
  value.outlineColor = sdk6Color3(payload.outlineColor, WHITE)

  // Any non-zero offset enabled the underlay with the shadow colour and blur as softness (TextShape.cs:208-217).
  value.shadowOffsetX = sdk6Number(payload.shadowOffsetX)
  value.shadowOffsetY = sdk6Number(payload.shadowOffsetY)
  value.shadowBlur = sdk6Number(payload.shadowBlur)
  value.shadowColor = sdk6Color3(payload.shadowColor, WHITE)

  // billboard aligned the text with the camera on every axis (TextShape.cs:137-142). The entity's single
  // core::Billboard is resolved together with a scene Billboard on the same entity, which keeps its own axes.
  applyBillboard(state, ecs6EntityId)
}

function remove(state: AdaptationLayerState, ecs6EntityId: EntityID): void {
  const ecs7Entity = sdk7EnsureEntity(state, ecs6EntityId)
  TextShape.deleteFrom(ecs7Entity)
  applyBillboard(state, ecs6EntityId)
}

export const Ecs6TextShapeConvertion: ComponentAdaptation = {
  update,
  remove
}
