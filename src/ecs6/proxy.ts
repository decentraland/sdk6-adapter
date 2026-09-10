import { adaptToEcs7 } from '../ecs7/adapter'
import { type AdaptationLayerState } from '../types'

export function proxyAttachEntityComponent(
  state: AdaptationLayerState,
  entityId: string,
  componentName: string,
  id: string
): void {
  state.ecs6.events.push({
    method: 'attachEntityComponent',
    data: {
      entityId,
      componentName,
      id
    }
  })
}

export function proxyRemoveEntityComponent(state: AdaptationLayerState, entityId: string, componentName: string): void {
  state.ecs6.events.push({
    method: 'removeEntityComponent',
    data: {
      entityId,
      componentName
    }
  })
}

export function proxyAddEntity(state: AdaptationLayerState, entityId: EntityID): void {
  state.ecs6.events.push({
    method: 'addEntity',
    data: {
      entityId
    }
  })
}

export function proxySetParent(state: AdaptationLayerState, entityId: string, parentId: string): void {
  state.ecs6.events.push({
    method: 'setParent',
    data: {
      entityId,
      parentId
    }
  })
}

export function proxyRemoveEntity(state: AdaptationLayerState, entityId: EntityID): void {
  state.ecs6.events.push({
    method: 'removeEntity',
    data: {
      entityId
    }
  })
}

export function proxyComponentCreated(
  state: AdaptationLayerState,
  id: string,
  componentName: string,
  classId: number
): void {
  state.ecs6.events.push({
    method: 'componentCreated',
    data: {
      id,
      componentName,
      classId
    }
  })
}

export function proxyComponentDisposed(state: AdaptationLayerState, id: string): void {
  state.ecs6.events.push({
    method: 'componentDisposed',
    data: {
      id
    }
  })
}

export function proxyComponentUpdated(state: AdaptationLayerState, id: string, json: string): void {
  state.ecs6.events.push({
    method: 'componentUpdated',
    data: {
      id,
      json
    }
  })
}

export function proxyUpdateEntityComponent(
  state: AdaptationLayerState,
  entityId: string,
  componentName: string,
  classId: number,
  json: string
): void {
  state.ecs6.events.push({
    method: 'updateEntityComponent',
    data: {
      entityId,
      componentName,
      classId,
      json
    }
  })
}

export function proxyHandleTick(state: AdaptationLayerState): void {
  const events = state.ecs6.events
  state.ecs6.events = []
  for (const event of events) {
    try {
      adaptToEcs7(state, event)
    } catch (error) {
      console.error('SDK6 mutation rejected', event.method, error)
    }
  }
}
