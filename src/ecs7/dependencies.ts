import { type AdaptationLayerState } from '../types'

export type Dependent = { sharedId: string } | { entityId: string; name: string }
type Index = { owners: Map<string, { target: Dependent; references: Set<string> }>; incoming: Map<string, Set<string>> }
const indexes = new WeakMap<AdaptationLayerState, Index>()
function index(state: AdaptationLayerState): Index {
  let value = indexes.get(state)
  if (!value) {
    value = { owners: new Map(), incoming: new Map() }
    indexes.set(state, value)
  }
  return value
}
function key(target: Dependent): string {
  return 'sharedId' in target ? JSON.stringify([target.sharedId]) : JSON.stringify([target.entityId, target.name])
}
export function removeDependencies(state: AdaptationLayerState, target: Dependent): void {
  const value = index(state),
    owner = key(target),
    previous = value.owners.get(owner)
  if (!previous) return
  for (const id of previous.references) {
    const incoming = value.incoming.get(id)!
    incoming.delete(owner)
    if (!incoming.size) value.incoming.delete(id)
  }
  value.owners.delete(owner)
}
export function updateDependencies(state: AdaptationLayerState, target: Dependent, data: unknown): void {
  removeDependencies(state, target)
  const references = new Set<string>(),
    stack = [data]
  while (stack.length) {
    const item = stack.pop()
    if (typeof item === 'string') references.add(item)
    else if (item && typeof item === 'object') for (const value of Object.values(item)) stack.push(value)
  }
  if (!references.size) return
  const value = index(state),
    owner = key(target)
  value.owners.set(owner, { target, references })
  for (const id of references) {
    let incoming = value.incoming.get(id)
    if (!incoming) value.incoming.set(id, (incoming = new Set()))
    incoming.add(owner)
  }
}
export function getDependents(state: AdaptationLayerState, id: string): Dependent[] {
  const value = index(state)
  return [...(value.incoming.get(id) ?? [])].map((owner) => value.owners.get(owner)!.target)
}
