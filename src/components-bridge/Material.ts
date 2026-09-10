import { type ECS6ComponentMaterial } from '~system/EngineApi'
import { sdk7EnsureEntity } from '../ecs7/ecs7'
import { type AdaptationLayerState, type ComponentAdaptation } from '../types'

import { Material } from '@dcl/ecs'
import { Color4 } from '@dcl/sdk/math'
import { convertTexture } from './commons/utils'

function update(state: AdaptationLayerState, ecs6EntityId: EntityID, payload: ECS6ComponentMaterial): void {
  const ecs7Entity = sdk7EnsureEntity(state, ecs6EntityId)
  Material.setPbrMaterial(ecs7Entity, {
    texture: convertTexture(state, payload.albedoTexture),
    alphaTest: payload.alphaTest,
    castShadows: payload.castShadows,
    alphaTexture: convertTexture(state, payload.alphaTexture),
    emissiveTexture: convertTexture(state, payload.emissiveTexture),
    bumpTexture: convertTexture(state, payload.bumpTexture),
    albedoColor: { ...Color4.White(), ...payload.albedoColor },
    emissiveColor: payload.emissiveColor,
    reflectivityColor: payload.reflectivityColor,
    transparencyMode: payload.transparencyMode,
    metallic: payload.metallic,
    roughness: payload.roughness,
    specularIntensity: payload.specularIntensity,
    emissiveIntensity: payload.emissiveIntensity,
    directIntensity: payload.directIntensity
  })
}

function remove(state: AdaptationLayerState, ecs6EntityId: EntityID): void {
  const ecs7Entity = sdk7EnsureEntity(state, ecs6EntityId)
  if (Material.getOrNull(ecs7Entity) !== null) {
    Material.deleteFrom(ecs7Entity)
  }
}

export const Ecs6MaterialConvertion: ComponentAdaptation = {
  update,
  remove
}
