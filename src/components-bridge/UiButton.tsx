import ReactEcs, { UiEntity, type JSX } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { ECS6_CLASS_ID, type AdaptationLayerState } from '../types'
import { updateComponent, type ComponentNode } from './commons/ui/core'
import { Ecs6UiComponent, type StackContext } from './commons/ui/UiComponent'
import { computeTransform } from './commons/ui/layout'
import { getClickHandler } from './commons/ui/events'
import { type Vector2, type ECS6ComponentUiShape } from '~system/EngineApi'

type ButtonValue = ECS6ComponentUiShape & {
  text?: string
  fontSize?: number
  fontWeight?: string
  thickness?: number
  cornerRadius?: number
  color?: Color4
  background?: Color4
  onClick?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowColor?: Color4
}

const finite = (value: number | undefined, fallback = 0) => (Number.isFinite(value) ? value! : fallback)
export function removeUiButton(_cid: string): void {}
export const Ecs6UiButtonConversion = {
  update(_state: AdaptationLayerState, cid: string, payload: ButtonValue): void {
    updateComponent(cid, ECS6_CLASS_ID.UI_BUTTON_SHAPE, payload)
  }
}

export function renderUiButton(
  state: AdaptationLayerState,
  c: ComponentNode,
  parentSize: Vector2,
  zoom: number,
  stack?: StackContext
): JSX.Element {
  const value = c.value as ButtonValue
  const [uiTransform, size] = computeTransform(value, parentSize, zoom, stack)
  const color = value.color ?? Color4.White()
  uiTransform.borderWidth = Math.max(0, value.thickness ?? 0) * zoom
  uiTransform.borderRadius = Math.max(0, value.cornerRadius ?? 0) * zoom
  uiTransform.borderColor = color
  const onMouseDown = getClickHandler(state, value.onClick)
  const text = value.text ?? 'button'
  const label = {
    value: value.fontWeight === 'bold' ? `<b>${text}</b>` : text,
    fontSize: (value.fontSize ?? 10) * zoom,
    color,
    textAlign: 'middle-center' as const
  }
  const offsetX = finite(value.shadowOffsetX) * zoom
  const offsetY = finite(value.shadowOffsetY) * zoom
  const shadowColor = value.shadowColor ?? Color4.Black()
  const shadow =
    (offsetX !== 0 || offsetY !== 0) && shadowColor.a > 0 ? (
      <UiEntity
        key="shadow"
        uiTransform={{
          positionType: 'absolute',
          position: { left: offsetX, top: offsetY },
          width: '100%',
          height: '100%',
          pointerFilter: 'none'
        }}
        uiText={{ ...label, color: shadowColor }}
      />
    ) : null
  return (
    <UiEntity
      key={'w' + c.__id}
      uiTransform={uiTransform}
      uiBackground={{ color: value.background ?? Color4.White() }}
      onMouseDown={onMouseDown}
    >
      {shadow}
      <UiEntity
        key="label"
        uiTransform={{
          positionType: 'absolute',
          position: { left: 0, top: 0 },
          width: '100%',
          height: '100%',
          pointerFilter: 'none'
        }}
        uiText={label}
      />
      {c.children.map((child) => Ecs6UiComponent(state, child, size, zoom))}
    </UiEntity>
  )
}
