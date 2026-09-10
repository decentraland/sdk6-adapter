import { type ECS6ComponentUuidCallback } from '~system/EngineApi'
import { getSdk6Entity, sdk7EnsureEntity } from '../ecs7/ecs7'
import { type AdaptationLayerState } from '../types'
import { convertInputAction } from './commons/utils'
import {
  type Entity,
  type PBPointerEventsResult,
  PointerEventType,
  PointerEvents,
  PrimaryPointerInfo,
  Transform,
  Schemas,
  engine
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

export const PointerEventStateComponent = engine.defineComponent('pointerEventStateComponent', {
  registeredActions: Schemas.Array(
    Schemas.Map({
      inputAction: Schemas.Number,
      eventType: Schemas.Number,
      uuid: Schemas.String
    })
  )
})

function convertPointerEventTypeToSDK6(type: PointerEventType): 0 | 1 {
  switch (type) {
    case PointerEventType.PET_DOWN:
    case PointerEventType.PET_HOVER_ENTER:
      return 0
    case PointerEventType.PET_UP:
    case PointerEventType.PET_HOVER_LEAVE:
      return 1
    default:
      throw new Error(`Unsupported SDK6 pointer event type: ${type}`)
  }
}

function getPointerEventType(type: string | undefined): PointerEventType | undefined {
  switch (type) {
    case 'onClick':
    case 'pointerDown':
      return PointerEventType.PET_DOWN
    case 'pointerUp':
      return PointerEventType.PET_UP
    case 'pointerHoverEnter':
      return PointerEventType.PET_HOVER_ENTER
    case 'pointerHoverExit':
      return PointerEventType.PET_HOVER_LEAVE
    default:
      return undefined
  }
}

export function convertPointerEventToSDK6(
  state: AdaptationLayerState,
  event: PBPointerEventsResult
): GlobalInputEventResult {
  const camera = Transform.getOrNull(engine.CameraEntity)
  const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  const direction =
    event.hit?.direction ??
    pointer?.worldRayDirection ??
    (camera ? Vector3.rotate(Vector3.Forward(), camera.rotation) : Vector3.Zero())
  const origin = event.hit?.globalOrigin ?? camera?.position ?? Vector3.Zero()
  return {
    buttonId: event.button,
    direction: { ...direction },
    origin: { ...origin },
    type: convertPointerEventTypeToSDK6(event.state),
    hit:
      event.hit?.entityId !== undefined
        ? {
            entityId: getSdk6Entity(state, event.hit.entityId as Entity) ?? '',
            hitPoint: event.hit.position ?? Vector3.create(0.0, 0.0, 0.0),
            length: event.hit.length,
            meshName: event.hit.meshName ?? '',
            normal: event.hit.normalHit ?? Vector3.create(0.0, 0.0, 0.0),
            worldNormal: event.hit.normalHit ?? Vector3.create(0.0, 0.0, 0.0)
          }
        : undefined
  }
}

function update(state: AdaptationLayerState, ecs6EntityId: EntityID, payload: ECS6ComponentUuidCallback): void {
  const ecs7Entity = sdk7EnsureEntity(state, ecs6EntityId)

  const payloads: ECS6ComponentUuidCallback[] = []
  for (const record of Object.values(state.ecs6.entities[ecs6EntityId]?.componentsName ?? {})) {
    if (!record || record.classId !== 8) continue
    const value = record.id === undefined ? record.data : state.ecs7.components[record.id]?.data
    if (value && getPointerEventType(value.type) !== undefined) payloads.push(value)
  }
  if (!payloads.length) {
    PointerEvents.deleteFrom(ecs7Entity)
    PointerEventStateComponent.deleteFrom(ecs7Entity)
    return
  }
  PointerEventStateComponent.createOrReplace(ecs7Entity, {
    registeredActions: payloads.map((value) => ({
      eventType: getPointerEventType(value.type)!,
      inputAction: convertInputAction(value.button),
      uuid: value.uuid ?? ''
    }))
  })
  PointerEvents.createOrReplace(ecs7Entity, {
    pointerEvents: payloads.map((value) => ({
      eventType: getPointerEventType(value.type)!,
      eventInfo: {
        button: convertInputAction(value.button),
        hoverText: value.hoverText,
        maxDistance: value.distance,
        showFeedback: value.showFeedback
      }
    }))
  })
}

function remove(state: AdaptationLayerState, ecs6EntityId: EntityID): void {
  update(state, ecs6EntityId, {})
}

export const Ecs6UuidCallbackConvertion = {
  update,
  remove
}
