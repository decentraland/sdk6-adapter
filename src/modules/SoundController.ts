import { AudioSource, Transform, engine, type Entity } from '@dcl/sdk/ecs'

interface SoundOptions {
  loop?: boolean
  volume?: number
}

export function create(): Record<string, any> {
  let entity: Entity | undefined
  let plays = 0

  async function playSound(src: string, options: SoundOptions = {}): Promise<void> {
    if (typeof src !== 'string' || src.trim().length === 0)
      throw new TypeError('SoundController requires an audio path')
    if (options === null || typeof options !== 'object')
      throw new TypeError('SoundController options must be an object')
    if (options.volume !== undefined && (typeof options.volume !== 'number' || !Number.isFinite(options.volume))) {
      throw new TypeError('SoundController volume must be finite')
    }
    if (options.loop !== undefined && typeof options.loop !== 'boolean') {
      throw new TypeError('SoundController loop must be a boolean')
    }
    if (entity === undefined) {
      entity = engine.addEntity()
      Transform.create(entity)
    }
    // Recovered SDK6 callers use percentage volume (50/100), unlike AudioSource's 0..1.
    // Alternate the cursor to make identical consecutive play requests visible to LWW.
    AudioSource.createOrReplace(entity, {
      audioClipUrl: src,
      playing: true,
      global: true,
      loop: options.loop ?? false,
      volume: Math.max(0, Math.min(100, options.volume ?? 100)) / 100,
      currentTime: plays++ % 2 === 0 ? 0 : Number.EPSILON
    })
  }

  async function pauseSound(): Promise<void> {
    if (entity !== undefined && AudioSource.has(entity)) AudioSource.getMutable(entity).playing = false
  }

  return { playSound, pauseSound }
}
