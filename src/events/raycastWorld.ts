import { engine, Transform } from '@dcl/sdk/ecs'

let baseX = 0
let baseZ = 0
let offsetX = 0
let offsetZ = 0

export function configureRaycastWorld(base: unknown): void {
  const parts = typeof base === 'string' ? base.split(',').map(Number) : []
  baseX = parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 16 : 0
  baseZ = parts.length === 2 && parts.every(Number.isFinite) ? parts[1] * 16 : 0
  offsetX = offsetZ = 0
}

export function updateRaycastWorld(): void {
  const player = Transform.getOrNull(engine.PlayerEntity)?.position
  if (!player) return
  const x = Math.fround(player.x + baseX) - offsetX
  const z = Math.fround(player.z + baseZ) - offsetZ
  if (Math.abs(x) > 100) offsetX += Math.trunc(x / 100) * 100
  if (Math.abs(z) > 100) offsetZ += Math.trunc(z / 100) * 100
}

export function raycastGround(ray: any): any | undefined {
  const origin = [
    Math.fround(ray.origin.x + baseX) - offsetX,
    Math.fround(ray.origin.y),
    Math.fround(ray.origin.z + baseZ) - offsetZ
  ]
  const direction = [Math.fround(ray.direction.x), Math.fround(ray.direction.y), Math.fround(ray.direction.z)]
  const hit = rayBox(origin, direction, ray.distance, [-200, -1, -220], [200, 0, 220])
  if (!hit) return undefined
  return externalHit(
    ray,
    [hit.point[0] + offsetX - baseX, hit.point[1], hit.point[2] + offsetZ - baseZ],
    hit.normal,
    hit.length
  )
}

function rayBox(
  origin: number[],
  direction: number[],
  distance: number,
  min: number[],
  max: number[]
): any | undefined {
  const norm = Math.hypot(...direction)
  if (!norm) return undefined
  for (let i = 0; i < 3; i++) direction[i] /= norm
  if (origin.every((v, i) => v > min[i] && v < max[i])) return undefined
  let near = -Infinity,
    far = Infinity,
    axis = -1,
    sign = 0
  for (let i = 0; i < 3; i++) {
    if (direction[i] === 0) {
      if (origin[i] < min[i] || origin[i] > max[i]) return undefined
      continue
    }
    const a = (min[i] - origin[i]) / direction[i],
      b = (max[i] - origin[i]) / direction[i]
    const entry = Math.min(a, b)
    if (entry > near) {
      near = entry
      axis = i
      sign = a < b ? -1 : 1
    }
    far = Math.min(far, Math.max(a, b))
    if (near > far) return undefined
  }
  if (axis < 0 || near < 0 || near > Math.fround(distance)) return undefined
  const point = origin.map((v, i) => v + direction[i] * near)
  const normal = [0, 0, 0]
  normal[axis] = sign
  return { point, normal, length: near }
}

function externalHit(ray: any, point: number[], normal: number[], length: number): any {
  return {
    didHit: false,
    entity: { isValid: false, entityId: '', meshName: '' },
    ray,
    hitPoint: { x: point[0], y: point[1], z: point[2] },
    hitNormal: { x: normal[0], y: normal[1], z: normal[2] },
    length
  }
}

function rotate(v: number[], q: number[]): number[] {
  const t = [2 * (q[1] * v[2] - q[2] * v[1]), 2 * (q[2] * v[0] - q[0] * v[2]), 2 * (q[0] * v[1] - q[1] * v[0])]
  return [
    v[0] + q[3] * t[0] + q[1] * t[2] - q[2] * t[1],
    v[1] + q[3] * t[1] + q[2] * t[0] - q[0] * t[2],
    v[2] + q[3] * t[2] + q[0] * t[1] - q[1] * t[0]
  ]
}

export function raycastCamera(ray: any): any | undefined {
  const camera = Transform.getOrNull(engine.CameraEntity)
  if (!camera) return undefined
  const p = camera.position,
    r = camera.rotation
  const q = [r.x, r.y, r.z, r.w],
    n = Math.hypot(...q)
  if (!n) return undefined
  for (let i = 0; i < 4; i++) q[i] /= n
  const inverse = [-q[0], -q[1], -q[2], q[3]]
  const origin = rotate([ray.origin.x - p.x, ray.origin.y - p.y, ray.origin.z - p.z], inverse)
  const direction = rotate([ray.direction.x, ray.direction.y, ray.direction.z], inverse)
  const hit = rayBox(origin, direction, ray.distance, [-1, -1, -1], [1, 1, 1])
  if (!hit) return undefined
  const point = rotate(hit.point, q),
    normal = rotate(hit.normal, q)
  return externalHit(ray, [point[0] + p.x, point[1] + p.y, point[2] + p.z], normal, hit.length)
}
