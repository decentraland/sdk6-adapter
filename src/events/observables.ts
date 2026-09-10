import { invalidateSocialProfile } from '../modules/SocialController'
import { sendBatch } from '~system/EngineApi'
import * as events from '@dcl/sdk/observables'
import { type AdaptationLayerState } from '../types'
import { sendEventToSDK6 } from './events'

export function bridgeObservables(state: AdaptationLayerState): void {
  const sources: Record<string, any> = {
    onEnterScene: events.onEnterSceneObservable,
    onLeaveScene: events.onLeaveSceneObservable,
    playerExpression: events.onPlayerExpressionObservable,
    videoEvent: events.onVideoEvent,
    profileChanged: events.onProfileChanged,
    playerConnected: events.onPlayerConnectedObservable,
    playerDisconnected: events.onPlayerDisconnectedObservable,
    onRealmChanged: events.onRealmChangedObservable,
    playerClicked: events.onPlayerClickedObservable,
    comms: (events as any).onCommsMessage
  }
  for (const [type, source] of Object.entries(sources)) {
    source.add((data: any) => {
      if (type === 'profileChanged' && typeof data?.ethAddress === 'string') invalidateSocialProfile(data.ethAddress)
      if (state.subscribedEvents.has(type)) sendEventToSDK6(state.onEventFunctions, { type, data } as EngineEvent)
    })
  }
}

export async function pollLegacyEvents(state: AdaptationLayerState): Promise<void> {
  const response = await sendBatch({ actions: [] })
  for (const event of response.events) {
    if (!event.generic || event.generic.eventId === 'sceneStart' || !state.subscribedEvents.has(event.generic.eventId))
      continue
    try {
      sendEventToSDK6(state.onEventFunctions, {
        type: event.generic.eventId,
        data: JSON.parse(event.generic.eventData)
      } as EngineEvent)
    } catch (error) {
      console.error('Invalid SDK6 host event', error)
    }
  }
}
