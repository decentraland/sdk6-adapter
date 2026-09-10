import { removeUiButton } from '../components-bridge/UiButton'
import { removeUiScrollRect } from '../components-bridge/UiScrollRect'
import { getDependents, updateDependencies, removeDependencies } from './dependencies'
import { removeVideo } from '../components-bridge/VideoTexture'
import { engine, Transform } from '@dcl/ecs'
import { type AdaptationLayerState, type EventItem } from '../types'
import { ecs7DeleteComponent, ecs7UpdateComponent, ecs7UpdateComponentWithoutEntityId } from './bridge'
import { sdk7EnsureEntity, sdk7EnsureMutable } from './ecs7'
import { removeComponent as removeUiComponent } from '../components-bridge/commons/ui/core'

function parseComponent(json: string, classId?: number): any {
  const data = JSON.parse(json)
  if (classId === 66) return data
  if (data === null || typeof data !== 'object' || Array.isArray(data))
    throw new Error('SDK6 component payload must be an object')
  return data
}

function entityRecord(state: AdaptationLayerState, entityId: string) {
  return (state.ecs6.entities[entityId] ??= { componentsName: Object.create(null) })
}

function detach(state: AdaptationLayerState, entityId: string, name: string): void {
  const record = state.ecs6.entities[entityId]?.componentsName[name]
  if (!record) return
  if (record.id === undefined) removeDependencies(state, { entityId, name })
  if (record.id !== undefined) state.ecs7.components[record.id]?.entitiesId.delete(entityId)
  const entityState = state.ecs6.entities[entityId]
  if (entityState) delete entityState.componentsName[name]
  if (state.ecs7.entities[entityId] !== undefined) ecs7DeleteComponent(state, entityId, record.classId)
}

function applyShared(state: AdaptationLayerState, id: string): void {
  const component = state.ecs7.components[id]
  if (!component || component.classId === undefined || component.data === undefined) return
  if (component.entitiesId.size) {
    for (const entityId of component.entitiesId) ecs7UpdateComponent(state, entityId, component.classId, component.data)
  } else {
    ecs7UpdateComponentWithoutEntityId(state, id, component.classId, component.data)
  }
}

function refreshDependents(state: AdaptationLayerState, id: string): void {
  const visited = new Set<string>([id]),
    inline = new Set<string>(),
    queue = [id]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const dependent of getDependents(state, queue[cursor])) {
      if ('sharedId' in dependent) {
        if (visited.has(dependent.sharedId)) continue
        visited.add(dependent.sharedId)
        applyShared(state, dependent.sharedId)
        queue.push(dependent.sharedId)
      } else {
        const key = JSON.stringify([dependent.entityId, dependent.name])
        if (inline.has(key)) continue
        inline.add(key)
        const component = state.ecs6.entities[dependent.entityId]?.componentsName[dependent.name]
        if (component && component.id === undefined)
          ecs7UpdateComponent(state, dependent.entityId, component.classId, component.data)
      }
    }
  }
}

export function adaptToEcs7(state: AdaptationLayerState, event: EventItem): void {
  switch (event.method) {
    case 'addEntity':
      entityRecord(state, event.data.entityId)
      sdk7EnsureEntity(state, event.data.entityId)
      break
    case 'removeEntity': {
      const { entityId } = event.data
      const entity = state.ecs7.entities[entityId]
      if (entityId === '0' || entity === engine.RootEntity) break
      for (const name of Object.keys(state.ecs6.entities[entityId]?.componentsName ?? {})) detach(state, entityId, name)
      // Deferred attachments can exist before any SDK7 entity is allocated. They
      // must be detached too, or a later resource update resurrects the entity.
      if (entity !== undefined) {
        for (const [child, transform] of engine.getEntitiesWith(Transform)) {
          if (transform.parent === entity) Transform.getMutable(child).parent = engine.RootEntity
        }
        engine.removeEntity(entity)
        state.ecs7.reverseEntities.delete(entity)
      }
      delete state.ecs7.entities[entityId]
      delete state.ecs6.entities[entityId]
      break
    }
    case 'setParent': {
      const { entityId, parentId } = event.data
      const entity = sdk7EnsureEntity(state, entityId)
      const parent = parentId === '0' ? engine.RootEntity : sdk7EnsureEntity(state, parentId)
      const visited = new Set<number>([entity])
      let ancestor = parent
      while (ancestor !== engine.RootEntity) {
        if (visited.has(ancestor)) throw new Error('SDK6 entity parent cycle')
        visited.add(ancestor)
        ancestor = Transform.getOrNull(ancestor)?.parent ?? engine.RootEntity
      }
      sdk7EnsureMutable(state, Transform, entityId).parent = parent
      break
    }
    case 'componentCreated': {
      const { id, componentName, classId } = event.data
      const previous = state.ecs7.components[id]
      if (previous?.classId === 41 && classId !== 41) removeUiButton(id)
      if (previous?.classId === 30 && classId !== 30) removeUiScrollRect(id)
      state.ecs7.components[id] = {
        entitiesId: previous?.entitiesId ?? new Set(),
        classId,
        componentName,
        data: previous?.data,
        json: previous?.json
      }
      state.ecs6.componentsWithId[id] = {
        componentName,
        classId,
        disposed: false,
        json: JSON.stringify(previous?.data ?? {})
      }
      for (const entityId of state.ecs7.components[id]!.entitiesId) {
        entityRecord(state, entityId).componentsName[componentName] = { id, classId }
      }
      applyShared(state, id)
      refreshDependents(state, id)
      break
    }
    case 'componentUpdated': {
      const { id, json } = event.data
      const previous = state.ecs7.components[id]
      if (previous?.json === json && [68, 70, 72, 200].includes(previous.classId ?? -1)) break
      const data = parseComponent(json, previous?.classId)
      const component = (state.ecs7.components[id] ??= { entitiesId: new Set() })
      component.data = data
      component.json = json
      updateDependencies(state, { sharedId: id }, data)
      if (state.ecs6.componentsWithId[id]) state.ecs6.componentsWithId[id].json = json
      applyShared(state, id)
      refreshDependents(state, id)
      break
    }
    case 'attachEntityComponent': {
      const { entityId, componentName, id } = event.data
      const record = entityRecord(state, entityId)
      if (record.componentsName[componentName]?.id !== id) detach(state, entityId, componentName)
      const component = (state.ecs7.components[id] ??= { entitiesId: new Set() })
      component.entitiesId.add(entityId)
      record.componentsName[componentName] = { id, classId: component.classId ?? 0 }
      if (component.classId !== undefined && component.data !== undefined)
        ecs7UpdateComponent(state, entityId, component.classId, component.data)
      break
    }
    case 'removeEntityComponent':
      detach(state, event.data.entityId, event.data.componentName)
      break
    case 'componentDisposed': {
      const { id } = event.data
      const component = state.ecs7.components[id]
      if (component) {
        for (const entityId of [...component.entitiesId]) {
          for (const [name, record] of Object.entries(state.ecs6.entities[entityId]?.componentsName ?? {})) {
            if (record?.id === id) detach(state, entityId, name)
          }
        }
      }
      removeDependencies(state, { sharedId: id })
      removeUiButton(id)
      removeUiScrollRect(id)
      removeUiComponent(id)
      removeVideo(id)
      delete state.ecs7.components[id]
      delete state.ecs6.componentsWithId[id]
      refreshDependents(state, id)
      break
    }
    case 'updateEntityComponent': {
      const { entityId, componentName, classId, json } = event.data
      const data = parseComponent(json, classId)
      const record = entityRecord(state, entityId)
      const previous = record.componentsName[componentName]
      if (previous && (previous.id !== undefined || previous.classId !== classId))
        detach(state, entityId, componentName)
      record.componentsName[componentName] = { classId, data }
      updateDependencies(state, { entityId, name: componentName }, data)
      ecs7UpdateComponent(state, entityId, classId, data)
      break
    }
  }
}
