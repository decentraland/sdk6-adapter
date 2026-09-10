import { AudioEvent, AudioSource, MediaState } from '@dcl/sdk/ecs'
import { sdk7EnsureEntity } from '../ecs7/ecs7'
import { type AdaptationLayerState, type ComponentAdaptation } from '../types'

// SDK7 supplies spatial gain and panning together. An adapter gain would double
// attenuate; global audio with manual gain would lose panning. Some clients also
// restart on any playing=true PUT, preventing portable per-frame gain updates.
const reported = new WeakSet<AdaptationLayerState>()

type Clip = { src: string; loop: boolean; playing: boolean; stamp: number; state: MediaState; restarts: number }
const clips = new WeakMap<AdaptationLayerState, Map<string, Clip>>()
export const Ecs6SoundConversion: ComponentAdaptation = {
  update(state, id, value) {
    const src = typeof value.src === 'string' ? value.src : ''
    if (!src) return
    if (!reported.has(state)) {
      reported.add(state)
      console.log(
        'SDK6 adapter: Sound (class 67) uses SDK7 spatial audio; historical distanceModel and rolloffFactor are unavailable. Client attenuation is used.'
      )
    }
    const entity = sdk7EnsureEntity(state, id)
    const entities = clips.get(state) ?? new Map<string, Clip>()
    clips.set(state, entities)
    let clip = entities.get(id)
    const fresh = clip?.src !== src
    if (!clip || fresh) {
      clip = { src, loop: value.loop === true, playing: false, stamp: -1, state: MediaState.MS_NONE, restarts: 0 }
      entities.set(id, clip)
    }
    const playing = typeof value.playing === 'boolean' ? value.playing : true
    const current = AudioSource.getOrNull(entity)
    let ended = !fresh && clip.playing && current !== null && current.audioClipUrl === src && current.playing === false
    for (const event of AudioEvent.get(entity)) {
      if (event.timestamp <= clip.stamp) continue
      if (!fresh) {
        if (event.state === MediaState.MS_PLAYING) ended = false
        else if (!clip.loop && clip.state === MediaState.MS_PLAYING && event.state === MediaState.MS_READY) ended = true
        clip.state = event.state
      }
      clip.stamp = event.timestamp
    }
    const currentTime = playing && ended ? (clip.restarts++ % 2 === 0 ? 0 : Number.EPSILON) : undefined
    clip.playing = playing
    const next = {
      audioClipUrl: src,
      playing,
      volume: typeof value.volume === 'number' && Number.isFinite(value.volume) ? value.volume : 1,
      loop: clip.loop,
      global: false,
      currentTime
    }
    if (
      currentTime === undefined &&
      current !== null &&
      current.audioClipUrl === next.audioClipUrl &&
      current.playing === next.playing &&
      Math.fround(current.volume ?? 1) === Math.fround(next.volume) &&
      current.loop === next.loop &&
      current.global === next.global &&
      current.currentTime === undefined &&
      current.pitch === undefined
    )
      return
    AudioSource.createOrReplace(entity, next)
  },
  remove(state, id) {
    clips.get(state)?.delete(id)
    AudioSource.deleteFrom(sdk7EnsureEntity(state, id))
  }
}
