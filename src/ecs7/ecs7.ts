import { type AdaptationLayerState } from '../types'

import { type Entity, engine, type LastWriteWinElementSetComponentDefinition } from '@dcl/ecs'

export function sdk7ExistsEntity(state: AdaptationLayerState, ecs6EntityId: EntityID): boolean {
  return state.ecs7.entities[ecs6EntityId] !== undefined
}

export function sdk7EnsureEntity(state: AdaptationLayerState, ecs6EntityId: EntityID): Entity {
  if (ecs6EntityId === '0') return engine.RootEntity
  if (ecs6EntityId === 'AvatarEntityReference' || ecs6EntityId === 'AvatarPositionEntityReference')
    return engine.PlayerEntity
  if (ecs6EntityId === 'FirstPersonCameraEntityReference' || ecs6EntityId === 'PlayerEntityReference')
    return engine.CameraEntity
  if (state.ecs7.entities[ecs6EntityId] === undefined) {
    state.ecs7.entities[ecs6EntityId] = engine.addEntity()
    state.ecs7.reverseEntities.set(state.ecs7.entities[ecs6EntityId], ecs6EntityId)
  }
  return state.ecs7.entities[ecs6EntityId]
}

export function getSdk6Entity(state: AdaptationLayerState, ecs7EntityId: Entity | undefined): EntityID | undefined {
  if (ecs7EntityId === undefined) return undefined
  if (ecs7EntityId === engine.RootEntity) return '0'
  if (ecs7EntityId === engine.PlayerEntity) return 'AvatarEntityReference'
  if (ecs7EntityId === engine.CameraEntity) return 'FirstPersonCameraEntityReference'
  return state.ecs7.reverseEntities.get(ecs7EntityId)
}

export function sdk7EnsureMutable<T>(
  state: AdaptationLayerState,
  component: LastWriteWinElementSetComponentDefinition<T>,
  ecs6EntityId: EntityID
): T {
  const entity = sdk7EnsureEntity(state, ecs6EntityId)
  if (component.has(entity)) {
    return component.getMutable(entity)
  } else {
    return component.createOrReplace(entity)
  }
}
