import { InputAction, PointerEventType, PointerEvents, pointerEventsSystem } from '@dcl/sdk/ecs'
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

const uiListenerRemovals = [
  ['removeOnPointerDown', PointerEventType.PET_DOWN],
  ['removeOnPointerUp', PointerEventType.PET_UP],
  ['removeOnPointerHoverEnter', PointerEventType.PET_HOVER_ENTER],
  ['removeOnPointerHoverLeave', PointerEventType.PET_HOVER_LEAVE]
] as const

/**
 * react-ecs registers UI listeners through pointerEventsSystem without a hoverText, and the
 * system only strips the PointerEvents entry (the host's clickable marker) for listeners that
 * had one. A hidden, non-blocking or cleared onClick must take its marker with it, and a shape
 * shown again must get exactly one marker back, so the removal also drops the matching entry.
 */
export function installUiListenerCleanup(): void {
  for (const [method, eventType] of uiListenerRemovals) {
    const remove = pointerEventsSystem[method].bind(pointerEventsSystem)
    pointerEventsSystem[method] = (entity) => {
      remove(entity)
      const component = PointerEvents.getMutableOrNull(entity)
      if (component === null) return
      component.pointerEvents = component.pointerEvents.filter(
        (event) => !(event.eventType === eventType && event.eventInfo?.button === InputAction.IA_POINTER)
      )
      if (component.pointerEvents.length === 0) PointerEvents.deleteFrom(entity)
    }
  }
}
