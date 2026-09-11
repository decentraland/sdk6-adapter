import { Billboard, BillboardMode } from '@dcl/sdk/ecs'
import { type ECS6ComponentBillboard, type ECS6ComponentTextShape } from '~system/EngineApi'
import { sdk7EnsureEntity } from '../../ecs7/ecs7'
import { ECS6_CLASS_ID, type AdaptationLayerState } from '../../types'

/** The payload of the SDK6 component of one class attached to the entity, on either wire path, or undefined. */
function attachedPayload(state: AdaptationLayerState, ecs6EntityId: EntityID, classId: number): unknown {
  for (const record of Object.values(state.ecs6.entities[ecs6EntityId]?.componentsName ?? {})) {
    if (record?.classId !== classId) continue
    return record.id === undefined ? record.data : state.ecs7.components[record.id]?.data
  }
  return undefined
}

/** A class 32 payload without any axis is the SDK6 constructor default, every axis; otherwise only the true axes. */
export function sdk6BillboardMode(payload: ECS6ComponentBillboard): number {
  if (payload.x === undefined && payload.y === undefined && payload.z === undefined) return BillboardMode.BM_ALL
  let mode: number = BillboardMode.BM_NONE
  if (payload.x === true) mode |= BillboardMode.BM_X
  if (payload.y === true) mode |= BillboardMode.BM_Y
  if (payload.z === true) mode |= BillboardMode.BM_Z
  return mode
}

/**
 * Resolves the single core::Billboard of an entity from both SDK6 sources that ask for one: a scene Billboard
 * (class 32) with its axes, and a TextShape (class 21) whose billboard flag turns the text toward the camera on every
 * axis (unity-renderer TextShape.cs:137-142). The legacy renderer applied the two independently, the scene component
 * on the entity transform and the text flag on the text mesh alone. SDK7 has one Billboard per entity, so the scene
 * axes win while a class 32 component is attached and the text flag only acts when none is. Either source going away
 * re-resolves from the one that remains, so neither ever deletes what the other still asks for.
 */
export function applyBillboard(state: AdaptationLayerState, ecs6EntityId: EntityID): void {
  const scene = attachedPayload(state, ecs6EntityId, ECS6_CLASS_ID.BILLBOARD) as ECS6ComponentBillboard | undefined
  const text = attachedPayload(state, ecs6EntityId, ECS6_CLASS_ID.TEXT_SHAPE) as ECS6ComponentTextShape | undefined
  const mode =
    scene !== undefined ? sdk6BillboardMode(scene) : text?.billboard === true ? BillboardMode.BM_ALL : undefined
  const ecs7Entity = sdk7EnsureEntity(state, ecs6EntityId)
  if (mode === undefined) {
    Billboard.deleteFrom(ecs7Entity)
  } else if (Billboard.getOrNull(ecs7Entity)?.billboardMode !== mode) {
    Billboard.createOrReplace(ecs7Entity, { billboardMode: mode })
  }
}
