import { type ECS6ComponentBillboard } from '~system/EngineApi'
import { type AdaptationLayerState, type ComponentAdaptation } from '../types'
import { applyBillboard } from './commons/billboard'

/** The class 32 payload lives in the entity record, so the resolver reads it from there together with the text flag. */
function update(state: AdaptationLayerState, ecs6EntityId: EntityID, _payload: ECS6ComponentBillboard): void {
  applyBillboard(state, ecs6EntityId)
}

function remove(state: AdaptationLayerState, ecs6EntityId: EntityID): void {
  applyBillboard(state, ecs6EntityId)
}

export const Ecs6BillboardConvertion: ComponentAdaptation = {
  update,
  remove
}
