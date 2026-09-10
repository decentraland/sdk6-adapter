import { type Callback } from '@dcl/sdk/react-ecs'
import { sendEventToSDK6 } from '../../../events/events'
import { type AdaptationLayerState } from '../../../types'

export function sendUiEvent(state: AdaptationLayerState, uuid: string, payload: any): void {
  sendEventToSDK6(state.onEventFunctions, { type: 'uuidEvent', data: { uuid, payload } } as EngineEvent)
}

export function getClickHandler(state: AdaptationLayerState, onClick?: string): Callback | undefined {
  if (onClick !== undefined && onClick !== '' && onClick !== null)
    return () => sendUiEvent(state, onClick, { buttonId: 0 })
}
