import { type Entity, type TransformType } from '@dcl/ecs'

type Message = { type: number; entityId: Entity; timestamp: number; data?: Uint8Array }
const defaults = (value?: Partial<TransformType>): TransformType => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  parent: 0 as Entity,
  ...value
})

export function encodeTransform(value: TransformType): Uint8Array {
  const bytes = new Uint8Array(44)
  const view = new DataView(bytes.buffer)
  const p = value.position,
    r = value.rotation,
    s = value.scale
  const fields = [p.x, p.y, p.z, r.x, r.y, r.z, r.w, s.x, s.y, s.z]
  for (let i = 0; i < 10; i++) view.setFloat32(i * 4, fields[i], true)
  view.setUint32(40, value.parent || 0, true)
  return bytes
}

function decodeTransform(bytes: Uint8Array): TransformType {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const read = (offset: number) => view.getFloat32(offset, true)
  return {
    position: { x: read(0), y: read(4), z: read(8) },
    rotation: { x: read(12), y: read(16), z: read(20), w: read(24) },
    scale: { x: read(28), y: read(32), z: read(36) },
    parent: view.getUint32(40, true) as Entity
  }
}

function compare(a?: Uint8Array, b?: Uint8Array): number {
  if (!a || !b) return a ? 1 : b ? -1 : 0
  if (a.length !== b.length) return a.length - b.length
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

function packet(entity: Entity, timestamp: number, payload?: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(payload ? 68 : 20)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, bytes.length, true)
  view.setUint32(4, payload ? 1 : 2, true)
  view.setUint32(8, entity, true)
  view.setUint32(12, 1, true)
  view.setUint32(16, timestamp, true)
  if (payload) {
    view.setUint32(20, 44, true)
    bytes.set(payload, 24)
  }
  return bytes
}

export function createDirectTransform(onChange: (entity: Entity, value?: TransformType) => void = () => {}) {
  const data = new Map<Entity, TransformType>()
  const dirty = new Set<Entity>()
  const timestamps = new Map<Entity, number>()
  const sent = new Map<Entity, Uint8Array>()
  let pending: Uint8Array[] = []
  const api = {
    has: (entity: Entity) => data.has(entity),
    getOrNull: (entity: Entity) => (data.has(entity) ? Object.freeze({ ...data.get(entity)! }) : null),
    get(entity: Entity) {
      const value = api.getOrNull(entity)
      if (!value) throw new Error(`[getFrom] Component core::Transform for entity #${entity} not found`)
      return value
    },
    create(entity: Entity, value?: Partial<TransformType>) {
      if (data.has(entity)) throw new Error(`[create] Component core::Transform for ${entity} already exists`)
      const result = defaults(value)
      data.set(entity, result)
      dirty.add(entity)
      return result
    },
    createOrReplace(entity: Entity, value?: Partial<TransformType>) {
      sent.delete(entity)
      data.delete(entity)
      return api.create(entity, value)
    },
    getMutableOrNull(entity: Entity) {
      if (!data.has(entity)) return null
      dirty.add(entity)
      return data.get(entity)!
    },
    getMutable(entity: Entity) {
      const value = api.getMutableOrNull(entity)
      if (!value) throw new Error(`[mutable] Component core::Transform for ${entity} not found`)
      return value
    },
    getOrCreateMutable(entity: Entity, value?: Partial<TransformType>) {
      return api.getMutableOrNull(entity) ?? api.create(entity, value)
    },
    deleteFrom(entity: Entity, markAsDirty = true) {
      const previous = data.get(entity)
      if (data.delete(entity) && markAsDirty) dirty.add(entity)
      sent.delete(entity)
      return previous ?? null
    },
    entityDeleted(entity: Entity, markAsDirty: boolean) {
      api.deleteFrom(entity, markAsDirty)
    },
    iterator: () => data.entries(),
    dirtyIterator: () => dirty.values(),
    *getCrdtUpdates(): Generator<never> {
      for (const entity of dirty) {
        const value = data.get(entity)
        const payload = value ? encodeTransform(value) : undefined
        if (payload && compare(payload, sent.get(entity)) === 0) continue
        const timestamp = (timestamps.get(entity) ?? 0) + 1
        timestamps.set(entity, timestamp)
        if (payload) sent.set(entity, payload)
        else sent.delete(entity)
        pending.push(packet(entity, timestamp, payload))
        onChange(entity, value)
      }
      dirty.clear()
    },
    updateFromCrdt(message: Message) {
      const entity = message.entityId
      if (![1, 2, 5, 6].includes(message.type)) return [null, data.get(entity)]
      const payload = message.type === 1 || message.type === 5 ? message.data : undefined
      const timestamp = timestamps.get(entity)
      const value = data.get(entity)
      const order =
        timestamp === undefined
          ? -1
          : timestamp - message.timestamp || compare(value ? encodeTransform(value) : undefined, payload)
      if (order < 0) {
        const decoded = payload ? decodeTransform(payload) : undefined
        timestamps.set(entity, message.timestamp)
        if (decoded) {
          data.set(entity, decoded)
          sent.set(entity, new Uint8Array(payload!))
        } else {
          data.delete(entity)
          sent.delete(entity)
        }
      }
      const conflict =
        order > 0
          ? {
              type: value ? 1 : 2,
              componentId: 1,
              entityId: entity,
              timestamp,
              ...(value ? { data: encodeTransform(value) } : {})
            }
          : null
      return [conflict, data.get(entity)]
    },
    dumpCrdtStateToBuffer(
      buffer: { writeBuffer: (data: Uint8Array, writeLength?: boolean) => void },
      filter?: (entity: Entity) => boolean
    ) {
      for (const [entity, timestamp] of timestamps) {
        if (filter && !filter(entity)) continue
        const value = data.get(entity)
        buffer.writeBuffer(packet(entity, timestamp, value ? encodeTransform(value) : undefined), false)
      }
    }
  }
  return {
    api,
    takePackets() {
      const result = pending
      pending = []
      return result
    }
  }
}
