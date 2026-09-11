import { renderUiButton } from '../../UiButton'
import { renderUiScrollRect } from '../../UiScrollRect'
import { Input } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity, type JSX, type UiBackgroundProps } from '@dcl/sdk/react-ecs'
import {
  type ECS6ComponentUiContainerRect,
  type ECS6ComponentUiContainerStack,
  type ECS6ComponentUiImage,
  type ECS6ComponentUiText,
  type Vector2
} from '~system/EngineApi'
import { ECS6_CLASS_ID, type AdaptationLayerState } from '../../../types'
import { convertFont, convertTexture } from '../utils'
import { type ComponentNode } from './core'
import { blocksPointer, computeTransform, textParentSize } from './layout'
import { convertUiFontFromFont, textAlignFromHV } from './uiText'

import { getClickHandler, sendUiEvent } from './events'
import { layoutGlyphText } from './glyphAtlas'

// ~system/AdaptationLayerHelper is host-optional: some hosts provide it, others ship no
// such module and its scene runtime throws on any unknown ~system import. A static
// import compiles to an unconditional top-level require() that would abort adapter init
// for every SDK6 scene, so resolve getTextureSize defensively and degrade gracefully
// (texture sizeInPixels sizing is skipped) where the host does not provide it.
declare const require: (name: string) => any
const getTextureSize: typeof import('~system/AdaptationLayerHelper').getTextureSize | undefined = (() => {
  try {
    return require('~system/AdaptationLayerHelper').getTextureSize
  } catch {
    return undefined
  }
})()

function uiColor(color?: Partial<Color4>): Color4 {
  return Color4.create(color?.r ?? 1, color?.g ?? 1, color?.b ?? 1, color?.a ?? 1)
}

const pendingInputChanges = new Map<string, object>()
const submittedInputChanges = new Map<string, string>()

const textureSizes = new Map<string, Vector2 | null>()
const glyphCache = new WeakMap<
  ComponentNode,
  { width: number; height: number; zoom: number; elements: JSX.Element[] | undefined }
>()

function glyphElements(c: ComponentNode, size: Vector2, zoom: number): JSX.Element[] | undefined {
  const previous = glyphCache.get(c)
  if (previous && previous.width === size.x && previous.height === size.y && previous.zoom === zoom)
    return previous.elements
  const text = c.value as ECS6ComponentUiText
  const layout =
    !text.font &&
    layoutGlyphText(
      `${text.value ?? ''}`,
      size.x,
      size.y,
      Math.trunc(text.fontSize ?? 10),
      zoom,
      text.textWrapping !== false && text.fontAutoSize !== true,
      text.hTextAlign,
      text.vTextAlign
    )
  const elements = layout
    ? layout.quads.map((q, i) => (
        <UiEntity
          key={'glyph' + c.__id + '-' + i}
          uiTransform={{
            positionType: 'absolute',
            position: { left: q.x, top: q.y },
            width: q.width,
            height: q.height,
            pointerFilter: 'none'
          }}
          uiBackground={{
            texture: { src: layout.atlas.source },
            textureMode: 'stretch',
            uvs: q.uvs,
            color: uiColor(text.color)
          }}
        />
      ))
    : undefined
  glyphCache.set(c, { width: size.x, height: size.y, zoom, elements })
  return elements
}

export type StackContext = {
  offset: Vector2
}

export function Ecs6UiComponent(
  state: AdaptationLayerState,
  c: ComponentNode,
  parentSize: Vector2,
  zoom: number,
  stack?: StackContext,
  ancestorsBlock = true
): JSX.Element {
  const blocks = blocksPointer(c.value, ancestorsBlock)
  switch (c.classId) {
    case ECS6_CLASS_ID.UI_BUTTON_SHAPE:
      return renderUiButton(state, c, parentSize, zoom, stack, blocks)
    case ECS6_CLASS_ID.UI_SLIDER_SHAPE:
      return renderUiScrollRect(state, c, parentSize, zoom, stack, blocks)
    case ECS6_CLASS_ID.UI_CONTAINER_RECT: {
      const [uiTransform, size] = computeTransform(c.value, parentSize, zoom, stack, blocks)
      const container = c.value as ECS6ComponentUiContainerRect
      const color = uiColor(container.color)
      // The legacy renderer drew a thickness-wide Outline effect in its default half-transparent black.
      const thickness = container.thickness ?? 0
      if (thickness > 0) {
        uiTransform.borderWidth = thickness * zoom
        uiTransform.borderColor = Color4.create(0, 0, 0, 0.5)
      }

      return (
        <UiEntity key={'w' + c.__id} uiTransform={uiTransform} uiBackground={{ color }}>
          {c.children.map(($) => Ecs6UiComponent(state, $, size, zoom, undefined, blocks))}
        </UiEntity>
      )
    }

    case ECS6_CLASS_ID.UI_CONTAINER_STACK: {
      const [, size] = computeTransform(c.value, parentSize, zoom, stack, blocks)
      const container = c.value as ECS6ComponentUiContainerStack

      const color = uiColor(container.color)

      const sizes = c.children.map((child) => {
        return computeTransform(child.value, { x: 100, y: 50 }, zoom)
      })

      const totalSize: Vector2 = { x: 0, y: 0 }
      const positions: number[] = Array.from({ length: c.children.length })
      const spacing = container.spacing ?? 0
      for (let i = 0; i < c.children.length; i++) {
        if (container.stackOrientation === 0) {
          positions[i] = totalSize.y
        } else {
          positions[i] = totalSize.x
        }

        if (container.stackOrientation === 0) {
          totalSize.x = Math.max(sizes[i][1].x, totalSize.x)
          totalSize.y += sizes[i][1].y + spacing
        } else {
          totalSize.x += sizes[i][1].x + spacing
          totalSize.y = Math.max(sizes[i][1].y, totalSize.y)
        }
      }

      if (c.children.length) {
        if (container.stackOrientation === 0) totalSize.y -= spacing
        else totalSize.x -= spacing
      }

      if (container.adaptWidth !== false) {
        c.value.width = {
          type: 1,
          value: totalSize.x
        }
      }

      if (container.adaptHeight !== false) {
        c.value.height = {
          type: 1,
          value: totalSize.y
        }
      }

      const [realUiTransform] = computeTransform(c.value, parentSize, zoom, stack, blocks)

      const stackOrientation = container.stackOrientation ?? 0
      return (
        <UiEntity key={'w' + c.__id} uiTransform={realUiTransform} uiBackground={{ color }}>
          {c.children.map(($, index) => {
            return Ecs6UiComponent(
              state,
              $,
              size,
              zoom,
              {
                offset: {
                  x: stackOrientation === 1 ? positions[index] : 0,
                  y: stackOrientation === 0 ? positions[index] : 0
                }
              },
              blocks
            )
          })}
        </UiEntity>
      )
    }

    case ECS6_CLASS_ID.UI_IMAGE_SHAPE: {
      const [uiTransform, size] = computeTransform(c.value, parentSize, zoom, stack, blocks)
      const imageValue = c.value as ECS6ComponentUiImage
      const texture = convertTexture(state, imageValue.source ?? '')

      let uiBackground: UiBackgroundProps = {}
      if (texture?.tex?.$case === 'texture') {
        const src = texture.tex.texture.src
        uiBackground = { texture: { src }, textureMode: 'stretch' }
        if (!textureSizes.has(src)) {
          textureSizes.set(src, null)
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (getTextureSize) {
            getTextureSize({ src })
              .then((data) => {
                textureSizes.set(src, { x: data.size.width, y: data.size.height })
              })
              .catch((e) => {
                console.error('Error getting texture size', e)
              })
          }
        }
        // The legacy renderer cropped to the source rect whenever the texture was loaded; without
        // the texture size the whole texture shows. With sizeInPixels false the source values are
        // fractions of the parent rect, which the legacy renderer multiplied in before dividing by
        // the texture size.
        const size = textureSizes.get(src)
        if (size && size.x > 0 && size.y > 0) {
          const kx = imageValue.sizeInPixels === false ? parentSize.x : 1
          const ky = imageValue.sizeInPixels === false ? parentSize.y : 1
          const sX = (imageValue.sourceLeft ?? 0) * kx
          const sY = (imageValue.sourceTop ?? 0) * ky
          const sW = imageValue.sourceWidth === undefined ? size.x : imageValue.sourceWidth * kx
          const sH = imageValue.sourceHeight === undefined ? size.y : imageValue.sourceHeight * ky
          const uvLeft = sX / size.x
          const uvTop = 1 - sY / size.y
          const uvRight = (sX + sW) / size.x
          const uvBottom = 1 - (sY + sH) / size.y
          uiBackground.uvs = [uvLeft, uvBottom, uvLeft, uvTop, uvRight, uvTop, uvRight, uvBottom]
        }
      }

      const onMouseDown = blocks ? getClickHandler(state, imageValue.onClick) : undefined
      return (
        <UiEntity key={'w' + c.__id} uiTransform={uiTransform} uiBackground={uiBackground} onMouseDown={onMouseDown}>
          {c.children.map(($) => Ecs6UiComponent(state, $, size, zoom, undefined, blocks))}
        </UiEntity>
      )
    }

    case ECS6_CLASS_ID.UI_TEXT_SHAPE: {
      const [uiTransform, size] = computeTransform(c.value, textParentSize(c.value, parentSize), zoom, stack, blocks)
      const textValue = c.value as ECS6ComponentUiText

      if (textValue.textWrapping === true) {
        uiTransform.flexWrap = 'wrap'
      }

      // The legacy renderer disabled word wrapping while auto-sizing the font.
      const textWrap = textValue.textWrapping !== false && textValue.fontAutoSize !== true ? 'wrap' : 'nowrap'
      const glyphs = glyphElements(c, size, zoom)
      if (glyphs)
        return (
          <UiEntity key={'w' + c.__id} uiTransform={uiTransform}>
            {glyphs}
            {c.children.map(($) => Ecs6UiComponent(state, $, size, zoom, undefined, blocks))}
          </UiEntity>
        )

      return (
        <UiEntity
          key={'w' + c.__id}
          uiTransform={uiTransform}
          uiText={{
            textAlign: textAlignFromHV(textValue.hTextAlign, textValue.vTextAlign),
            fontSize: Math.trunc(textValue.fontSize ?? 10) * zoom,
            font: convertUiFontFromFont(convertFont(state, textValue.font)),
            value: `${textValue.value ?? ''}`,
            color: uiColor(textValue.color),
            textWrap
          }}
        >
          {c.children.map(($) => Ecs6UiComponent(state, $, size, zoom, undefined, blocks))}
        </UiEntity>
      )
    }

    case ECS6_CLASS_ID.UI_INPUT_TEXT_SHAPE: {
      const [uiTransform] = computeTransform(c.value, parentSize, zoom, stack, blocks)
      const value = c.value as any
      // The legacy input coloured its text and placeholder with placeholderColor (white by
      // default), painted focusedBackground (black by default) at all times and dropped
      // empty submissions. SDK6 6.x serialises one onTextChanged uuid whose payload carries
      // value and isSubmit and routes it to onChanged/onTextSubmit itself; older payloads
      // carry those two uuids directly.
      const textColor = uiColor(value.placeholderColor)
      const emit = (text: string, submit: boolean) => {
        if (submit && text === '') return
        if (value.onTextChanged) {
          sendUiEvent(state, value.onTextChanged, { value: { value: text, isSubmit: submit } })
          return
        }
        const uuid = submit ? value.onTextSubmit : value.onChanged
        if (uuid) sendUiEvent(state, uuid, submit ? { text } : { value: text })
      }
      return (
        <Input
          key={'w' + c.__id}
          uiTransform={uiTransform}
          uiBackground={{ color: value.focusedBackground ? uiColor(value.focusedBackground) : Color4.Black() }}
          value={value.value ?? ''}
          placeholder={value.placeholder ?? ''}
          color={textColor}
          placeholderColor={textColor}
          textAlign={textAlignFromHV(value.hTextAlign, value.vTextAlign)}
          font={convertUiFontFromFont(convertFont(state, value.font))}
          fontSize={Math.trunc(value.fontSize ?? 10) * zoom}
          onChange={(text) => {
            if (submittedInputChanges.get(c.__id) === text) return
            const token = {}
            pendingInputChanges.set(c.__id, token)
            Promise.resolve().then(() => {
              if (pendingInputChanges.get(c.__id) !== token) return
              pendingInputChanges.delete(c.__id)
              emit(text, false)
            })
          }}
          onSubmit={(text) => {
            pendingInputChanges.delete(c.__id)
            submittedInputChanges.set(c.__id, text)
            Promise.resolve().then(() => submittedInputChanges.delete(c.__id))
            emit(text, true)
          }}
        />
      )
    }

    default: {
      const [uiTransform, size] = computeTransform(c.value, parentSize, zoom, stack, blocks)
      return (
        <UiEntity key={'w' + c.__id} uiTransform={uiTransform}>
          {c.children.map(($) => Ecs6UiComponent(state, $, size, zoom, undefined, blocks))}
        </UiEntity>
      )
    }
  }
}
