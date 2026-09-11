import { invalidateSocialProfile } from '../modules/SocialController'
import { sendBatch } from '~system/EngineApi'
import * as events from '@dcl/sdk/observables'
import { type AdaptationLayerState } from '../types'
import { sendEventToSDK6 } from './events'

type ObservableSource = { add: (callback: (data: any) => void) => unknown }

// Observable events raised while the scene's start-up identity calls are still pending are held and delivered,
// in order, once every tracked call has settled or the hold cap expires. The hold is adapter-side ordering with no
// legacy counterpart: the legacy runtime carried identity replies and player events over independent channels, and
// scenes that cache user data from those calls dereference it inside their enter-scene handlers. A capped release
// hands the events over with the cache still empty, and the scene's own guards decide the outcome.
const HOLD_MAX_TICKS = 120
const HOLD_MAX_MS = 2000

const startupGate = {
  open: false,
  pendingIdentityCalls: 0,
  ticks: 0,
  armedAt: 0,
  held: [] as Array<{ types: string[]; data: any }>
}

/** Counts an identity call issued during start-up; calls made after the gate opens pass through untracked. */
export function trackIdentityCall<T>(call: Promise<T>): Promise<T> {
  if (!startupGate.open) {
    startupGate.pendingIdentityCalls++
    const settle = (): void => {
      startupGate.pendingIdentityCalls--
    }
    call.then(settle, settle)
  }
  return call
}

function deliver(state: AdaptationLayerState, types: string[], data: any): void {
  for (const type of types) {
    if (state.subscribedEvents.has(type)) sendEventToSDK6(state.onEventFunctions, { type, data } as EngineEvent)
  }
}

function releaseHeldEvents(state: AdaptationLayerState): void {
  if (startupGate.open) return
  startupGate.ticks++
  const capped = startupGate.ticks >= HOLD_MAX_TICKS || Date.now() - startupGate.armedAt >= HOLD_MAX_MS
  if (startupGate.pendingIdentityCalls > 0 && !capped) return
  startupGate.open = true
  for (const { types, data } of startupGate.held.splice(0)) deliver(state, types, data)
}

export function bridgeObservables(state: AdaptationLayerState): void {
  // The SDK7 enter/connected and leave/disconnected observables are both notified from one engine subscription
  // per subscribed name, so observing one member of each pair and fanning out keeps every SDK6 event single.
  const sources: Array<[ObservableSource, string[]]> = [
    [events.onEnterSceneObservable, ['onEnterScene', 'playerConnected']],
    [events.onLeaveSceneObservable, ['onLeaveScene', 'playerDisconnected']],
    [events.onPlayerExpressionObservable, ['playerExpression']],
    [events.onVideoEvent, ['videoEvent']],
    [events.onProfileChanged, ['profileChanged']],
    [events.onRealmChangedObservable, ['onRealmChanged']],
    [events.onPlayerClickedObservable, ['playerClicked']],
    [(events as any).onCommsMessage, ['comms']]
  ]
  startupGate.armedAt = Date.now()
  for (const [source, types] of sources) {
    source.add((data: any) => {
      if (types.includes('profileChanged') && typeof data?.ethAddress === 'string')
        invalidateSocialProfile(data.ethAddress)
      if (startupGate.open) deliver(state, types, data)
      else startupGate.held.push({ types, data })
    })
  }
}

export async function pollLegacyEvents(state: AdaptationLayerState): Promise<void> {
  const response = await sendBatch({ actions: [] })
  releaseHeldEvents(state)
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
