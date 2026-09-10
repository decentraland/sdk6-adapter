import { sdk7EnsureEntity } from '../ecs7/ecs7'
import { type AdaptationLayerState, type ComponentAdaptation } from '../types'

import { ColliderLayer, GltfContainer, VisibilityComponent } from '@dcl/ecs'
import { type ECS6ComponentGltfShape } from '~system/EngineApi'

function update(state: AdaptationLayerState, ecs6EntityId: EntityID, payload: ECS6ComponentGltfShape): void {
  const ecs7Entity = sdk7EnsureEntity(state, ecs6EntityId)

  GltfContainer.createOrReplace(ecs7Entity, {
    src: payload.src ?? '',
    visibleMeshesCollisionMask: payload.isPointerBlocker === false ? 0 : ColliderLayer.CL_POINTER,
    invisibleMeshesCollisionMask:
      ColliderLayer.CL_PHYSICS |
      (payload.withCollisions !== false && payload.isPointerBlocker === false ? 0 : ColliderLayer.CL_POINTER)
  })
  VisibilityComponent.createOrReplace(ecs7Entity, { visible: payload.visible !== false })
}

function remove(state: AdaptationLayerState, ecs6EntityId: EntityID): void {
  const ecs7Entity = sdk7EnsureEntity(state, ecs6EntityId)
  GltfContainer.deleteFrom(ecs7Entity)
  VisibilityComponent.deleteFrom(ecs7Entity)
}

export const Ecs6GltfShapeConvertion: ComponentAdaptation = {
  update,
  remove
}
