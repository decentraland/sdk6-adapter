import ReactEcs, { UiEntity, type JSX } from '@dcl/sdk/react-ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { ECS6_CLASS_ID, type AdaptationLayerState } from '../types'
import { updateComponent, type ComponentNode } from './commons/ui/core'
import { Ecs6UiComponent, type StackContext } from './commons/ui/UiComponent'
import { computeTransform } from './commons/ui/layout'
import { type Vector2, type ECS6ComponentUiShape } from '~system/EngineApi'
import { engine, PrimaryPointerInfo, InputAction, PointerEventType, inputSystem, Transform } from '@dcl/sdk/ecs'
import { sendUiEvent } from './commons/ui/events'

type ScrollRectValue = ECS6ComponentUiShape & {
  backgroundColor?: Color4
  valueX?: number
  valueY?: number
  isHorizontal?: boolean
  isVertical?: boolean
  onChanged?: string
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
}
type Binding = {
  state: AdaptationLayerState
  value: ScrollRectValue
  position: Vector2
  range: Vector2
  travel: Vector2
  mounted: boolean
  ref: (instance: unknown) => void
}
type Drag = { binding: Binding; mode: 'content' | 'x' | 'y'; pointer: Vector2; ray?: Vector3; rotation?: string }
const bindings = new Map<string, Binding>()
let drag: Drag | undefined
let pointerYUp: boolean | undefined
const normalized = (value: number | undefined) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : 0)
const pointer = () => PrimaryPointerInfo.getOrNull(engine.RootEntity)?.screenCoordinates

export function removeUiScrollRect(cid: string): void {
  const binding = bindings.get(cid)
  if (drag?.binding === binding) drag = undefined
  bindings.delete(cid)
}

engine.addSystem(() => {
  if (!drag) return
  const { binding, mode } = drag
  if (
    !binding.mounted ||
    binding.value.visible === false ||
    inputSystem.getInputCommand(InputAction.IA_POINTER, PointerEventType.PET_UP)
  ) {
    drag = undefined
    return
  }
  const p = pointer()
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return
  const dx = p.x - drag.pointer.x
  const rawDy = p.y - drag.pointer.y
  const info = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  const camera = Transform.getOrNull(engine.CameraEntity)
  const rotation = camera ? JSON.stringify(camera.rotation) : undefined
  // Clients expose different screen-Y origins. Infer orientation from ray
  // motion in camera-up space instead of identifying clients by name.
  if (rawDy !== 0 && info?.worldRayDirection && drag.ray && camera && rotation === drag.rotation) {
    const up = Vector3.rotate(Vector3.Up(), camera.rotation)
    const forward = Vector3.rotate(Vector3.Forward(), camera.rotation)
    const previousDepth = Vector3.dot(drag.ray, forward)
    const currentDepth = Vector3.dot(info.worldRayDirection, forward)
    if (previousDepth > 1e-7 && currentDepth > 1e-7) {
      const vertical =
        Vector3.dot(info.worldRayDirection, up) / currentDepth - Vector3.dot(drag.ray, up) / previousDepth
      if (Math.abs(vertical) > 1e-7) pointerYUp = vertical * rawDy > 0
    }
  }
  drag.ray = info?.worldRayDirection ? { ...info.worldRayDirection } : undefined
  drag.rotation = rotation
  // Unknown orientation cannot justify inventing a vertical direction.
  const dy = pointerYUp === undefined ? 0 : pointerYUp ? rawDy : -rawDy
  drag.pointer = { x: p.x, y: p.y }
  const old = binding.position
  const x =
    binding.value.isHorizontal === true && mode !== 'y' && binding.range.x > 0
      ? normalized(old.x + (mode === 'x' ? dx / binding.travel.x : -dx / binding.range.x))
      : old.x
  const y =
    (binding.value.isVertical ?? true) && mode !== 'x' && binding.range.y > 0
      ? normalized(old.y + (mode === 'y' ? dy / binding.travel.y : -dy / binding.range.y))
      : old.y
  if (x === old.x && y === old.y) return
  binding.position = { x, y }
  if (binding.value.onChanged) sendUiEvent(binding.state, binding.value.onChanged, { value: { x, y }, pointerId: 0 })
})

export const Ecs6UiScrollRectConversion = {
  update(state: AdaptationLayerState, cid: string, payload: ScrollRectValue): void {
    let binding = bindings.get(cid)
    if (!binding) {
      const created: Binding = {
        state,
        value: payload,
        position: { x: 0, y: 0 },
        range: { x: 0, y: 0 },
        travel: { x: 1, y: 1 },
        mounted: false,
        ref(instance) {
          created.mounted = Boolean(instance)
          if (!instance && drag?.binding === created) drag = undefined
        }
      }
      bindings.set(cid, (binding = created))
    }
    if (drag?.binding === binding) drag = undefined
    binding.state = state
    binding.value = payload
    binding.position = { x: normalized(payload.valueX), y: normalized(payload.valueY) }
    updateComponent(cid, ECS6_CLASS_ID.UI_SLIDER_SHAPE, payload)
  }
}

function bounds(
  elements: JSX.Element[],
  width: number,
  height: number,
  tight = false
): { left: number; top: number; width: number; height: number } {
  let left = tight ? Infinity : 0,
    top = tight ? Infinity : 0,
    right = tight ? -Infinity : width,
    bottom = tight ? -Infinity : height
  function visit(element: any, x: number, y: number, pw: number, ph: number): void {
    if (!element || !element.props) return
    const t = element.props.uiTransform
    if (!t || t.display === 'none') return
    const unit = (v: unknown, parent: number) =>
      typeof v === 'number' ? v : typeof v === 'string' && v.endsWith('%') ? (parseFloat(v) * parent) / 100 : 0
    const w = unit(t.width, pw),
      h = unit(t.height, ph)
    const px = x + unit(t.position?.left, pw),
      py = y + unit(t.position?.top, ph)
    left = Math.min(left, px)
    top = Math.min(top, py)
    right = Math.max(right, px + w)
    bottom = Math.max(bottom, py + h)
    if (t.overflow === 'hidden' || t.overflow === 'scroll') return
    const children = element.props.children
    for (const child of Array.isArray(children) ? children.flat() : [children]) visit(child, px, py, w, h)
  }
  for (const element of elements) visit(element, 0, 0, width, height)
  if (!Number.isFinite(left)) return { left: 0, top: 0, width: 0, height: 0 }
  return { left, top, width: right - left, height: bottom - top }
}

export function renderUiScrollRect(
  state: AdaptationLayerState,
  c: ComponentNode,
  parentSize: Vector2,
  zoom: number,
  stack?: StackContext,
  blocks = true
): JSX.Element {
  const value = c.value as ScrollRectValue
  const [transform, size] = computeTransform(
    {
      ...value,
      paddingLeft: undefined,
      paddingRight: undefined,
      paddingTop: undefined,
      paddingBottom: undefined
    } as ScrollRectValue,
    parentSize,
    zoom,
    stack,
    blocks
  )
  const left = Math.max(0, value.paddingLeft ?? 0) * zoom,
    top = Math.max(0, value.paddingTop ?? 0) * zoom
  const width = Math.max(0, size.x * zoom - left - Math.max(0, value.paddingRight ?? 0) * zoom)
  const height = Math.max(0, size.y * zoom - top - Math.max(0, value.paddingBottom ?? 0) * zoom)
  const children = c.children.map((child) =>
    Ecs6UiComponent(state, child, { x: width / zoom, y: height / zoom }, zoom, undefined, blocks)
  )
  const content = bounds(children, width, height)
  const background = bounds(children, width, height, true)
  const binding = bindings.get(c.__id)!
  binding.range = { x: content.width - width, y: content.height - height }
  const thumbWidth = Math.min(width, Math.max(10 * zoom, (width * width) / content.width))
  const thumbHeight = Math.min(height, Math.max(10 * zoom, (height * height) / content.height))
  binding.travel = { x: Math.max(1, width - thumbWidth), y: Math.max(1, height - thumbHeight) }
  const start = (mode: Drag['mode']) => () => {
    const p = pointer()
    if (p && binding.mounted && value.visible !== false) {
      const ray = PrimaryPointerInfo.getOrNull(engine.RootEntity)?.worldRayDirection
      const camera = Transform.getOrNull(engine.CameraEntity)
      drag = {
        binding,
        mode,
        pointer: { x: p.x, y: p.y },
        ray: ray ? { ...ray } : undefined,
        rotation: camera ? JSON.stringify(camera.rotation) : undefined
      }
    }
  }
  const stop = () => {
    if (drag?.binding === binding) drag = undefined
  }
  const viewport = (
    <UiEntity
      key={'clip' + c.__id}
      uiTransform={{
        positionType: 'absolute',
        position: { left, top },
        width,
        height,
        overflow: 'hidden',
        pointerFilter: blocks ? 'block' : 'none'
      }}
      onMouseDown={start('content')}
      onMouseUp={stop}
    >
      <UiEntity
        key={'content' + c.__id}
        uiTransform={{
          positionType: 'absolute',
          position: {
            left: -content.left - binding.position.x * binding.range.x,
            top: -content.top - (1 - binding.position.y) * binding.range.y
          },
          width,
          height
        }}
      >
        <UiEntity
          key={'background' + c.__id}
          uiTransform={{
            positionType: 'absolute',
            position: { left: background.left, top: background.top },
            width: background.width,
            height: background.height,
            pointerFilter: 'none'
          }}
          uiBackground={{ color: value.backgroundColor ?? Color4.Clear() }}
        />
        {children}
      </UiEntity>
      {value.isHorizontal === true && binding.range.x > 0 ? (
        <UiEntity
          key={'h' + c.__id}
          uiTransform={{
            positionType: 'absolute',
            position: { left: binding.position.x * binding.travel.x, top: Math.max(0, height - 8 * zoom) },
            width: thumbWidth,
            height: 8 * zoom,
            pointerFilter: blocks ? 'block' : 'none'
          }}
          uiBackground={{ color: Color4.create(0.6, 0.6, 0.6, 1) }}
          onMouseDown={start('x')}
          onMouseUp={stop}
        />
      ) : null}
      {(value.isVertical ?? true) && binding.range.y > 0 ? (
        <UiEntity
          key={'v' + c.__id}
          uiTransform={{
            positionType: 'absolute',
            position: { left: Math.max(0, width - 8 * zoom), top: (1 - binding.position.y) * binding.travel.y },
            width: 8 * zoom,
            height: thumbHeight,
            pointerFilter: blocks ? 'block' : 'none'
          }}
          uiBackground={{ color: Color4.create(0.6, 0.6, 0.6, 1) }}
          onMouseDown={start('y')}
          onMouseUp={stop}
        />
      ) : null}
    </UiEntity>
  )
  transform.pointerFilter = blocks ? 'block' : 'none'
  const element = UiEntity({ uiTransform: transform })
  return ReactEcs.createElement('entity', { ...element.props, key: 'w' + c.__id, ref: binding.ref } as any, viewport)
}
