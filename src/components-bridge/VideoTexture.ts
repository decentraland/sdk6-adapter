import { engine, VideoPlayer, VideoEvent, type Entity } from '@dcl/sdk/ecs'
import { type AdaptationLayerState } from '../types'
import { sendEventToSDK6 } from '../events/events'

const videos = new Map<string, { entity: Entity; lastTimestamp: number }>()

export function updateVideo(state: AdaptationLayerState, id: string, value: any): void {
  const clip = state.ecs7.components[value.videoClipId]?.data
  let video = videos.get(id)
  if (!video) {
    video = { entity: engine.addEntity(), lastTimestamp: -1 }
    videos.set(id, video)
  }
  VideoPlayer.createOrReplace(video.entity, {
    src: clip?.url ?? '',
    playing: value.playing ?? false,
    volume: value.volume ?? 1,
    playbackRate: value.playbackRate ?? 1,
    // SDK6 serializes -1 after a seek has been consumed; it means "do not seek".
    position: typeof value.seek === 'number' && value.seek >= 0 ? value.seek : undefined,
    loop: value.loop ?? false
  })
}

export function videoEntity(id: string): Entity | undefined {
  return videos.get(id)?.entity
}

export function removeVideo(id: string): void {
  const video = videos.get(id)
  if (video) engine.removeEntity(video.entity)
  videos.delete(id)
}

export function flushVideoEvents(state: AdaptationLayerState): void {
  for (const [id, video] of videos) {
    for (const event of VideoEvent.has(video.entity) ? VideoEvent.get(video.entity) : []) {
      if (event.timestamp <= video.lastTimestamp) continue
      video.lastTimestamp = event.timestamp
      if (state.subscribedEvents.has('videoEvent'))
        sendEventToSDK6(state.onEventFunctions, {
          type: 'videoEvent',
          data: {
            componentId: id,
            videoClipId: state.ecs7.components[id]?.data?.videoClipId ?? '',
            videoStatus: event.state === 6 ? 5 : event.state === 7 ? 3 : event.state,
            currentOffset: event.currentOffset,
            totalVideoLength: event.videoLength ?? -1
          }
        })
    }
  }
}
