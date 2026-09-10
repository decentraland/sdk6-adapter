import { type ECS6ComponentAudioSource } from '~system/EngineApi'
import { sdk7EnsureEntity } from '../ecs7/ecs7'
import { type AdaptationLayerState, type ComponentAdaptation } from '../types'
import { AudioSource } from '@dcl/sdk/ecs'
import { convertAudioClip } from './commons/utils'

type PlayOnceToken = { timestamp: number; nonce: unknown; restarts: number }

// SDK6 uses playedAtTimestamp and its private nonce as playOnce() markers, not playback offsets.
const playOnceTokens = new WeakMap<AdaptationLayerState, Map<EntityID, PlayOnceToken>>()

function update(state: AdaptationLayerState, ecs6EntityId: EntityID, payload: ECS6ComponentAudioSource): void {
  const ecs7Entity = sdk7EnsureEntity(state, ecs6EntityId)
  const audioClip = convertAudioClip(state, payload.audioClipId)
  const playedAtTimestamp = payload.playedAtTimestamp
  const nonce = (payload as ECS6ComponentAudioSource & { nonce?: unknown }).nonce
  const tokens = playOnceTokens.get(state) ?? new Map<EntityID, PlayOnceToken>()
  playOnceTokens.set(state, tokens)
  const previous = tokens.get(ecs6EntityId)
  const restarted =
    typeof playedAtTimestamp === 'number' &&
    Number.isFinite(playedAtTimestamp) &&
    previous !== undefined &&
    (previous.timestamp !== playedAtTimestamp || previous.nonce !== nonce)

  if (typeof playedAtTimestamp === 'number' && Number.isFinite(playedAtTimestamp)) {
    tokens.set(ecs6EntityId, {
      timestamp: playedAtTimestamp,
      nonce,
      restarts: (previous?.restarts ?? 0) + (restarted ? 1 : 0)
    })
  }

  AudioSource.createOrReplace(ecs7Entity, {
    audioClipUrl: audioClip?.url ?? '',
    volume: payload.volume ?? audioClip?.volume ?? 1.0,
    playing: payload.playing ?? false,
    loop: payload.loop ?? audioClip?.loop ?? false,
    pitch: payload.pitch ?? 1.0,
    // The SDK7 LWW transport suppresses byte-identical PUTs. Alternate an
    // imperceptible positive offset so consecutive playOnce() calls still reach the renderer.
    currentTime: restarted ? ((previous?.restarts ?? 0) % 2 === 0 ? 0 : Number.EPSILON) : undefined
  })
}

function remove(state: AdaptationLayerState, ecs6EntityId: EntityID): void {
  const ecs7Entity = sdk7EnsureEntity(state, ecs6EntityId)
  playOnceTokens.get(state)?.delete(ecs6EntityId)
  AudioSource.deleteFrom(ecs7Entity)
}

export const Ecs6AudioSourceConvertion: ComponentAdaptation = {
  update,
  remove
}
