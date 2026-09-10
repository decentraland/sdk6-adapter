import { engine, MeshRenderer, Material, Transform, GltfContainer, type Entity } from '@dcl/ecs'
import { sdk7EnsureEntity } from '../ecs7/ecs7'
import { type AdaptationLayerState, type ComponentAdaptation } from '../types'

type Highlight = { state: AdaptationLayerState; id: EntityID; edges: Entity[]; width: number; depth: number }
const active = new Map<Entity, Highlight>()
const reported = new WeakSet<AdaptationLayerState>()
const thickness = 0.012

export function legacyHighlightEnabled(value: any): boolean {
  if (value == null) return true
  if (value === false || value === 'false' || value === 0 || value === '') return false
  if (value === true || value === 'true') return true
  return isFinite(value) ? parseFloat(value) !== 0 : true
}

function clear(highlight: Highlight): void {
  for (const edge of highlight.edges) engine.removeEntity(edge)
  highlight.edges.length = 0
  highlight.width = highlight.depth = 0
}

function refresh(entity: Entity, highlight: Highlight): void {
  const mesh = MeshRenderer.getOrNull(entity)?.mesh
  if (!mesh) {
    clear(highlight)
    if (GltfContainer.has(entity) && !reported.has(highlight.state)) {
      reported.add(highlight.state)
      console.log(
        'SDK6 adapter: HighlightEntity imported/animated mesh bounds and overlay are unavailable in stock SDK7.'
      )
    }
    return
  }
  let width = 1
  if (mesh.$case === 'cylinder') {
    width = 2 * Math.max(Math.abs(mesh.cylinder.radiusBottom ?? 0.5), Math.abs(mesh.cylinder.radiusTop ?? 0.5))
  }
  const depth = mesh.$case === 'plane' ? thickness : width
  if (!Number.isFinite(width) || !Number.isFinite(depth)) {
    clear(highlight)
    return
  }
  if (highlight.edges.length && highlight.width === width && highlight.depth === depth) return
  const dimensions = [width, 1, depth]
  let edgeIndex = 0
  for (let axis = 0; axis < 3; axis++) {
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        let edge = highlight.edges[edgeIndex++]
        if (edge === undefined) {
          edge = engine.addEntity()
          highlight.edges.push(edge)
          MeshRenderer.setBox(edge)
          Material.setPbrMaterial(edge, {
            albedoColor: { r: 1, g: 0, b: 0, a: 1 },
            emissiveColor: { r: 1, g: 0, b: 0 },
            emissiveIntensity: 1,
            metallic: 0,
            roughness: 1,
            castShadows: false
          })
        }
        const position = [0, 0, 0]
        const scale = [thickness, thickness, thickness]
        const second = (axis + 1) % 3
        const third = (axis + 2) % 3
        position[second] = (a * dimensions[second]) / 2
        position[third] = (b * dimensions[third]) / 2
        scale[axis] = Math.max(thickness, dimensions[axis])
        Transform.createOrReplace(edge, {
          parent: entity,
          position: { x: position[0], y: position[1], z: position[2] },
          scale: { x: scale[0], y: scale[1], z: scale[2] }
        })
      }
    }
  }
  highlight.width = width
  highlight.depth = depth
}

engine.addSystem(() => {
  for (const [entity, highlight] of active) {
    if (highlight.state.ecs7.entities[highlight.id] !== entity) {
      clear(highlight)
      active.delete(entity)
    } else refresh(entity, highlight)
  }
})

export const Ecs6HighlightConversion: ComponentAdaptation = {
  update(state, id, payload) {
    const entity = sdk7EnsureEntity(state, id)
    let highlight = active.get(entity)
    if (!legacyHighlightEnabled(payload)) {
      if (highlight) clear(highlight)
      active.delete(entity)
      return
    }
    if (!highlight) {
      highlight = { state, id, edges: [], width: 0, depth: 0 }
      active.set(entity, highlight)
    }
    refresh(entity, highlight)
  },
  remove(state, id) {
    const entity = state.ecs7.entities[id]
    if (entity === undefined) return
    const highlight = active.get(entity)
    if (highlight) clear(highlight)
    active.delete(entity)
  }
}
