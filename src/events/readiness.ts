import { engine, GltfContainer, GltfContainerLoadingState, LoadingState, type Entity } from '@dcl/sdk/ecs'

let pending: Set<Entity> | undefined
let elapsed = 0
let ready = false
export function beginReadiness(): void {
  if (pending || ready) return
  pending = new Set([...engine.getEntitiesWith(GltfContainer)].map(([entity]) => entity))
}
export function advanceReadiness(dt: number): boolean {
  if (ready) return true
  if (!pending) return false
  elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0)
  for (const entity of pending) {
    const state = GltfContainerLoadingState.getOrNull(entity)
    if (
      !GltfContainer.has(entity) ||
      state?.currentState === LoadingState.FINISHED ||
      state?.currentState === LoadingState.NOT_FOUND ||
      state?.currentState === LoadingState.FINISHED_WITH_ERROR
    )
      pending.delete(entity)
  }
  if (pending.size && elapsed < 30) return false
  if (pending.size)
    console.log(`SDK6 adapter: initial asset readiness timed out after 30s (${pending.size} GLTF containers)`)
  pending.clear()
  ready = true
  return true
}
