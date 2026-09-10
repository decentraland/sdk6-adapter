import { MeshRenderer, MeshCollider, type Entity } from '@dcl/ecs'
import { type ComponentAdaptation } from '../types'
import { sdk7EnsureEntity } from '../ecs7/ecs7'
import { getColliderLayer } from './commons/utils'

function primitive(
  render: (entity: Entity, value: any) => void,
  collide: (entity: Entity, value: any, mask: number) => void
): ComponentAdaptation {
  return {
    update(state, id, value) {
      const entity = sdk7EnsureEntity(state, id)
      if (value.visible !== false) render(entity, value)
      else MeshRenderer.deleteFrom(entity)
      const mask = getColliderLayer(value)
      if (mask != null) collide(entity, value, mask)
      else MeshCollider.deleteFrom(entity)
    },
    remove(state, id) {
      const entity = sdk7EnsureEntity(state, id)
      MeshRenderer.deleteFrom(entity)
      MeshCollider.deleteFrom(entity)
    }
  }
}

export const BoxShapeConversion = primitive(
  (entity, value) => MeshRenderer.setBox(entity, value.uvs ?? []),
  (entity, _, mask) => MeshCollider.setBox(entity, mask)
)
export const SphereShapeConversion = primitive(
  (entity) => MeshRenderer.setSphere(entity),
  (entity, _, mask) => MeshCollider.setSphere(entity, mask)
)
export const CylinderShapeConversion = primitive(
  (entity, value) => MeshRenderer.setCylinder(entity, value.radiusBottom ?? 1, value.radiusTop ?? 1),
  (entity, value, mask) => MeshCollider.setCylinder(entity, value.radiusBottom ?? 1, value.radiusTop ?? 1, mask)
)
export const PlaneShapeConversion = primitive(
  (entity, value) => {
    const uvs = value.uvs?.length ? value.uvs : [0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]
    MeshRenderer.setPlane(entity, [...uvs.slice(2), ...uvs.slice(0, 2)])
  },
  (entity, _, mask) => MeshCollider.setPlane(entity, mask)
)
