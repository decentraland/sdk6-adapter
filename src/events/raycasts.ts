import { raycastGround, raycastCamera, updateRaycastWorld } from './raycastWorld'
import { engine, Transform, Raycast, RaycastResult, RaycastQueryType, ColliderLayer, type Entity } from '@dcl/sdk/ecs'
import { ECS6_CLASS_ID, type AdaptationLayerState } from '../types'
import { getSdk6Entity } from '../ecs7/ecs7'
import { sendEventToSDK6 } from './events'

const pending = new Map<string, { entity: Entity; queryId: string; queryType: string; timestamp: number; ray: any }>()
let sequence = 0

export function queryRaycast(type: string, request: any): void {
  if (type !== 'raycast') throw new Error(`Unsupported SDK6 query: ${type}`)
  if (
    !request ||
    typeof request.queryId !== 'string' ||
    !['HitFirst', 'HitAll'].includes(request.queryType) ||
    !request.ray
  )
    throw new Error('Invalid SDK6 raycast')
  const ray = request.ray
  if (
    ![
      ray.origin?.x,
      ray.origin?.y,
      ray.origin?.z,
      ray.direction?.x,
      ray.direction?.y,
      ray.direction?.z,
      ray.distance
    ].every(Number.isFinite) ||
    ray.distance < 0
  )
    throw new Error('Invalid SDK6 raycast coordinates')
  const previous = pending.get(request.queryId)
  if (!previous && pending.size >= 1024) throw new Error('Too many pending SDK6 raycasts')
  const entity = previous?.entity ?? engine.addEntity()
  const timestamp = ++sequence
  Transform.createOrReplace(entity, { position: ray.origin })
  Raycast.createOrReplace(entity, {
    timestamp,
    direction: { $case: 'globalDirection', globalDirection: ray.direction },
    maxDistance: ray.distance,
    queryType: request.queryType === 'HitAll' ? RaycastQueryType.RQT_QUERY_ALL : RaycastQueryType.RQT_HIT_FIRST,
    collisionMask: ColliderLayer.CL_PHYSICS,
    continuous: false
  })
  pending.set(request.queryId, {
    entity,
    queryId: request.queryId,
    queryType: request.queryType,
    timestamp,
    ray: JSON.parse(JSON.stringify(ray))
  })
}

export function flushRaycasts(state: AdaptationLayerState): void {
  updateRaycastWorld()
  for (const [queryId, request] of pending) {
    const entity = request.entity
    const result = RaycastResult.getOrNull(entity)
    if (!result || result.timestamp !== request.timestamp) continue
    const hits = result.hits.map((hit) => ({
      didHit: true,
      entity: {
        isValid: getSdk6Entity(state, hit.entityId as Entity) !== undefined,
        entityId: getSdk6Entity(state, hit.entityId as Entity) ?? '0',
        meshName:
          hit.meshName ??
          (Object.values(
            state.ecs6.entities[getSdk6Entity(state, hit.entityId as Entity) ?? '']?.componentsName ?? {}
          ).some((component) => component?.classId === ECS6_CLASS_ID.BOX_SHAPE)
            ? 'New Game Object(Clone)'
            : '')
      },
      ray: request.ray,
      hitPoint: hit.position,
      hitNormal: hit.normalHit,
      length: hit.length
    }))
    const ground = raycastGround(request.ray)
    const camera = raycastCamera(request.ray)
    const external = camera && (!ground || camera.length < ground.length) ? camera : ground
    const first = external && (!hits[0] || external.length < hits[0].length) ? external : hits[0]
    const allHeader = camera ?? ground ?? hits[0]
    const payload =
      request.queryType === 'HitAll'
        ? {
            didHit: hits.length > 0 || external !== undefined,
            ray: request.ray,
            hitPoint: allHeader?.hitPoint ?? { x: 0, y: 0, z: 0 },
            hitNormal: allHeader?.hitNormal ?? { x: 0, y: 0, z: 0 },
            entities: hits
          }
        : first ?? {
            didHit: false,
            ray: request.ray,
            hitPoint: { x: 0, y: 0, z: 0 },
            hitNormal: { x: 0, y: 0, z: 0 },
            entity: { isValid: false, entityId: '', meshName: '' }
          }
    pending.delete(queryId)
    engine.removeEntity(entity)
    sendEventToSDK6(state.onEventFunctions, { type: 'raycastResponse', data: { ...request, payload } })
  }
}
