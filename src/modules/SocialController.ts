import {
  AvatarBase,
  AvatarEquippedData,
  AvatarEmoteCommand,
  PlayerIdentityData,
  Transform,
  engine,
  getWorldPosition,
  getWorldRotation,
  type Entity
} from '@dcl/sdk/ecs'
import { getSceneInformation } from '~system/Runtime'
import { getPlayerData } from '~system/Players'

type SocialEvent = { event: string; payload: string }
type Peer = {
  entity: Entity
  uuid: string
  base?: unknown
  profile?: any
  profileJson?: string
  renderedProfile?: unknown
  guest?: boolean
  pose?: number[]
  emoteTime: number
  dirty: boolean
  fetching: boolean
  nextFetch: number
}
const peers = new Map<string, Peer>()
const entityEmoteTimes = new Map<Entity, number>()
let active = false
let localUuid: string | undefined
let pending: SocialEvent[] = []
let elapsed = 0
let origin: { x: number; z: number } | undefined
let initialization: Promise<void> | undefined
let initializationError: unknown
let nextInitialization = 0
let fetches = 0

function emit(type: string, uuid: string, fields: Record<string, unknown> = {}): void {
  if (pending.length >= 4096) {
    const index = pending.findIndex((event) => event.event === 'USER_POSE')
    if (index >= 0) pending.splice(index, 1)
    else {
      pending.shift()
      console.error('SocialController event buffer overflow')
    }
  }
  pending.push({ event: type, payload: JSON.stringify({ type, uuid, ...fields }) })
}

function initialize(): Promise<void> {
  if (!initialization)
    initialization = (async () => {
      const info = await getSceneInformation({})
      const metadata = JSON.parse(info.metadataJson || '{}')
      const base = metadata.scene?.base
      if (typeof base !== 'string' || !/^-?\d+,-?\d+$/.test(base))
        throw new Error('SocialController requires a valid scene base for world-space avatar poses')
      const [x, z] = base.split(',').map(Number)
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) throw new Error('Invalid scene base')
      origin = { x: x * 16, z: z * 16 }
      initializationError = undefined
    })().catch((error) => {
      initializationError = error
      initialization = undefined
      nextInitialization = elapsed + 5
    })
  return initialization
}

function refreshProfile(peer: Peer): void {
  if (peer.fetching || fetches >= 4 || elapsed < peer.nextFetch) return
  peer.dirty = false
  peer.fetching = true
  peer.nextFetch = elapsed + 1
  fetches++
  void getPlayerData({ userId: peer.uuid })
    .then((response) => {
      if (peers.get(peer.uuid) === peer && response.data?.userId === peer.uuid) peer.profile = response.data
    })
    .catch((error) => {
      console.error('SocialController profile enrichment failed', peer.uuid, error)
    })
    .finally(() => {
      peer.fetching = false
      fetches--
    })
}

function color(value: any): { r: number; g: number; b: number; a: number } | undefined {
  if (value && ['r', 'g', 'b'].every((key) => Number.isFinite(value[key])))
    return { r: value.r, g: value.g, b: value.b, a: 1 }
  return undefined
}

function poseFor(entity: Entity): number[] | undefined {
  if (!Transform.has(entity) || !origin) return undefined
  const seen = new Set<Entity>()
  let parent = entity
  while (parent !== engine.RootEntity) {
    if (seen.has(parent) || seen.size >= 256) return undefined
    seen.add(parent)
    const transform = Transform.getOrNull(parent)
    if (!transform) return undefined
    parent = transform.parent ?? engine.RootEntity
  }
  const p = getWorldPosition(engine, entity),
    q = getWorldRotation(engine, entity)
  const sign = q.w < 0 ? -1 : 1
  const pose = [p.x + origin.x, p.y, p.z + origin.z, q.x * sign, q.y * sign, q.z * sign, q.w * sign]
  return pose.every(Number.isFinite) ? pose : undefined
}

/** Read stock engine-written components; never synthesize talking/mute/block/hidden state. */
export async function updateSocialController(dt: number): Promise<void> {
  if (!active) return
  elapsed += Number.isFinite(dt) && dt > 0 ? dt : 0
  // Host RPCs can require the next CRDT flush; never await them in the frame callback.
  if (!origin && elapsed >= nextInitialization) void initialize()
  const present = new Map<string, Entity>()
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (!identity.address) continue
    if (!present.has(identity.address) || entity === engine.PlayerEntity) present.set(identity.address, entity)
  }
  const liveEntities = new Set(present.values())
  for (const entity of entityEmoteTimes.keys()) if (!liveEntities.has(entity)) entityEmoteTimes.delete(entity)
  const nextLocal = PlayerIdentityData.getOrNull(engine.PlayerEntity)?.address || undefined
  if (nextLocal && nextLocal !== localUuid) emit('SET_LOCAL_UUID', nextLocal)
  localUuid = nextLocal
  for (const [uuid] of peers) {
    if (!present.has(uuid)) {
      peers.delete(uuid)
      emit('USER_REMOVED', uuid)
    }
  }
  for (const [uuid, entity] of present) {
    let peer = peers.get(uuid)
    if (!peer) {
      peer = {
        uuid,
        entity,
        emoteTime: entityEmoteTimes.get(entity) ?? -Infinity,
        dirty: true,
        fetching: false,
        nextFetch: 0
      }
      peers.set(uuid, peer)
    }
    if (peer.entity !== entity) {
      peer.emoteTime = entityEmoteTimes.get(entity) ?? -Infinity
      peer.pose = undefined
    }
    peer.entity = entity
    const identity = PlayerIdentityData.get(entity)
    const base = AvatarBase.getOrNull(entity),
      equipped = AvatarEquippedData.getOrNull(entity)
    const appearance = JSON.stringify([base, equipped])
    const changed = peer.base !== appearance
    if (changed) peer.dirty = true
    if (peer.dirty) refreshProfile(peer)
    peer.base = appearance
    if (base && equipped && (changed || peer.renderedProfile !== peer.profile || peer.guest !== identity.isGuest)) {
      peer.renderedProfile = peer.profile
      peer.guest = identity.isGuest
      const profile = {
        userId: uuid,
        name: base.name,
        description: '',
        email: '',
        hasConnectedWeb3: !identity.isGuest,
        version: peer.profile?.version ?? 0,
        avatar: {
          bodyShape: base.bodyShapeUrn,
          skinColor: color(base.skinColor),
          hairColor: color(base.hairColor),
          eyeColor: color(base.eyesColor),
          wearables: [...equipped.wearableUrns]
        },
        snapshots: {
          face: peer.profile?.avatar?.snapshots?.face256 ?? '',
          body: peer.profile?.avatar?.snapshots?.body ?? ''
        }
      }
      const json = JSON.stringify(profile)
      if (json !== peer.profileJson) {
        peer.profileJson = json
        emit('USER_DATA', uuid, { data: { userId: uuid, version: profile.version }, profile })
      }
    }
    const pose = poseFor(entity)
    if (pose && (!peer.pose || pose.some((value, i) => Math.abs(value - peer!.pose![i]) > 1e-6))) {
      emit('USER_POSE', uuid, { pose: [...pose, peer.pose === undefined] })
      peer.pose = pose
    }
    if (AvatarEmoteCommand.has(entity)) {
      const commands = [...AvatarEmoteCommand.get(entity)].sort((a, b) => a.timestamp - b.timestamp)
      for (const command of commands) {
        if (!Number.isFinite(command.timestamp) || command.timestamp <= peer.emoteTime) continue
        peer.emoteTime = command.timestamp
        entityEmoteTimes.set(entity, command.timestamp)
        if ((command.state ?? 0) === 0 && command.emoteUrn)
          emit('USER_EXPRESSION', uuid, { expressionId: command.emoteUrn, timestamp: command.timestamp })
      }
    }
  }
}

export function invalidateSocialProfile(uuid: string): void {
  const peer = peers.get(uuid)
  if (peer) peer.dirty = true
}

export function create(): Record<string, any> {
  active = true
  return {
    async pullAvatarEvents(): Promise<{ events: SocialEvent[] }> {
      await updateSocialController(0)
      if (initializationError !== undefined) throw initializationError
      const events = pending
      pending = []
      return { events }
    }
  }
}
