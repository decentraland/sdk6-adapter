import { engine, Material, MeshCollider, MeshRenderer, PointerEvents, Transform, type Entity } from '@dcl/sdk/ecs'
import { sdk7EnsureEntity } from '../ecs7/ecs7'
import { type AdaptationLayerState, type ComponentAdaptation } from '../types'
import { getColliderLayer } from './commons/utils'
import { PointerEventStateComponent } from './UuidCallback'

const proxies = new Map<Entity, Entity[]>()
let warnedApproximation = false

function number(value: unknown, fallback: number): number {
  if (value == null) return fallback
  const result = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(result) ? result : fallback
}

export function syncCircleAppearance(state: AdaptationLayerState, entityId: EntityID): void {
  const parent = state.ecs7.entities[entityId]
  if (parent === undefined) return
  const children = proxies.get(parent)
  if (!children) return
  for (const child of children) {
    const material = Material.getOrNull(parent)
    if (material) Material.createOrReplace(child, material)
    else Material.deleteFrom(child)
    const pointer = PointerEvents.getOrNull(parent)
    if (pointer)
      PointerEvents.createOrReplace(child, {
        pointerEvents: pointer.pointerEvents.map((entry) => ({
          ...entry,
          eventInfo: entry.eventInfo ? { ...entry.eventInfo } : undefined
        }))
      })
    else PointerEvents.deleteFrom(child)
    const actions = PointerEventStateComponent.getOrNull(parent)
    if (actions)
      PointerEventStateComponent.createOrReplace(child, {
        registeredActions: actions.registeredActions.map((action) => ({ ...action }))
      })
    else PointerEventStateComponent.deleteFrom(child)
  }
}

function remove(state: AdaptationLayerState, entityId: EntityID): void {
  const parent = state.ecs7.entities[entityId]
  if (parent === undefined) return
  const children = proxies.get(parent)
  if (!children) return
  proxies.delete(parent)
  for (const child of children) {
    state.ecs7.reverseEntities.delete(child)
    engine.removeEntity(child)
  }
}

export const Ecs6CircleShapeConversion: ComponentAdaptation = {
  update(state, entityId, payload) {
    const parent = sdk7EnsureEntity(state, entityId)
    const fraction = (number(payload.arc, 360) * Math.PI) / 180
    const arc = fraction > 0 && fraction <= 1 ? fraction : 1
    const segments = Math.min(128, Math.max(3, number(payload.segments, 36) || 64))
    const fan = arc < 1 || segments !== 36
    const transforms: Array<Parameters<typeof Transform.createOrReplace>[1]> = []
    if (fan) {
      const theta = 2 * Math.PI * arc
      const step = theta / segments
      const angles: number[] = []
      for (let angle = 0; angle < theta && angles.length < 130; angle += step) angles.push(angle)
      if (arc === 1) angles.push(theta)
      for (let i = 1; i < angles.length; i++) {
        const half = (angles[i] - angles[i - 1]) / 2
        if (half < 1e-10) continue
        const middle = (angles[i] + angles[i - 1]) / 2
        const altitude = 0.5 * Math.cos(half)
        const rotation = middle + Math.PI / 2
        transforms.push({
          parent,
          position: { x: (altitude * Math.cos(middle)) / 2, y: (altitude * Math.sin(middle)) / 2, z: 0 },
          rotation: { x: 0, y: 0, z: Math.sin(rotation / 2), w: Math.cos(rotation / 2) },
          scale: { x: Math.sin(half), y: altitude, z: 0.001 }
        })
      }
    } else
      transforms.push({
        parent,
        rotation: { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 },
        scale: { x: 1, y: 0.001, z: 1 }
      })
    if (!warnedApproximation) {
      warnedApproximation = true
      console.log(
        'SDK6 adapter: CircleShape uses thin stock primitives; UVs, normals and collision thickness differ; custom fans are capped at 128 segments.'
      )
    }
    let children = proxies.get(parent)
    if (!children) proxies.set(parent, (children = []))
    while (children.length > transforms.length) {
      const child = children.pop()!
      state.ecs7.reverseEntities.delete(child)
      engine.removeEntity(child)
    }
    for (let i = 0; i < transforms.length; i++) {
      let child = children[i]
      if (child === undefined) {
        child = engine.addEntity()
        children.push(child)
        state.ecs7.reverseEntities.set(child, entityId)
      }
      Transform.createOrReplace(child, transforms[i])
      if (payload.visible !== false) MeshRenderer.setCylinder(child, 0.5, fan ? 0 : 0.5)
      else MeshRenderer.deleteFrom(child)
      const mask = getColliderLayer(payload)
      if (mask !== undefined) MeshCollider.setCylinder(child, 0.5, fan ? 0 : 0.5, mask)
      else MeshCollider.deleteFrom(child)
    }
    syncCircleAppearance(state, entityId)
  },
  remove
}
