import { isPointerDispatch } from '../events/interaction'
import { beginReadiness, advanceReadiness } from '../events/readiness'
import { sendEventToSDK6 } from '../events/events'
import { advanceTimers } from './timers'
import { queryRaycast, flushRaycasts } from '../events/raycasts'
import { flushVideoEvents } from '../components-bridge/VideoTexture'
import { bridgeObservables } from '../events/observables'
import { printState } from '../debug'
import { updateEventSystem } from '../events/events'
import { getLoadableModuleName, loadWrappedModule } from '../modules/modulesWrapper'
import {
  proxyAddEntity,
  proxyAttachEntityComponent,
  proxyComponentCreated,
  proxyComponentDisposed,
  proxyComponentUpdated,
  proxyHandleTick,
  proxyRemoveEntity,
  proxyRemoveEntityComponent,
  proxySetParent,
  proxyUpdateEntityComponent
} from './../ecs6/proxy'
import { type AdaptationLayerState } from './../types'

import { engine } from '@dcl/ecs'
import { ReactEcsRenderer } from '@dcl/react-ecs'
import { renderEcs6Ui } from '../components-bridge/commons/ui/core'
import { CameraType } from '@dcl/sdk/ecs'
import { logMiddleware } from './LogMiddleware'
import { openExternalUrl, openNftDialog } from '~system/RestrictedActions'
import { DEBUG_CONFIG } from '../debug/config'

type AdaptionLayerType = {
  decentralandInterface: DecentralandInterface

  start: () => void

  forceUpdate: (dt: number) => void
  flushEvents: () => void
}

export const state: AdaptationLayerState = {
  onUpdateFunctions: [],
  onStartFunctions: [],
  onEventFunctions: [],
  subscribedEvents: new Set<string>(),
  ecs7: {
    reverseEntities: new Map(),
    entities: Object.create(null),
    components: Object.create(null)
  },

  ecs6: {
    entities: Object.create(null),
    componentsWithId: Object.create(null),
    events: []
  },

  loadedModules: Object.create(null),

  eventState: {
    lastRotationChanged: null,
    lastPositionChanged: null,
    lastCameraMode: CameraType.CT_FIRST_PERSON,
    lastIsPointerLock: false
  },

  disableUpdate: true
}

function attachEntityComponent(entityId: string, componentName: string, id: string): void {
  if (!/^engine\./.test(componentName)) return
  proxyAttachEntityComponent(state, entityId, componentName, id)
}

function removeEntityComponent(entityId: string, componentName: string): void {
  if (!/^engine\./.test(componentName)) return
  proxyRemoveEntityComponent(state, entityId, componentName)
}

function addEntity(entityId: EntityID): void {
  proxyAddEntity(state, entityId)
}

function setParent(entityId: string, parentId: string): void {
  proxySetParent(state, entityId, parentId)
}

function removeEntity(entityId: EntityID): void {
  proxyRemoveEntity(state, entityId)
}

function componentCreated(id: string, componentName: string, classId: number): void {
  if (!/^engine\./.test(componentName)) return
  proxyComponentCreated(state, id, componentName, classId)
}

function componentDisposed(id: string): void {
  proxyComponentDisposed(state, id)
}

function componentUpdated(id: string, json: string): void {
  proxyComponentUpdated(state, id, json)
}

function updateEntityComponent(entityId: string, componentName: string, classId: number, json: string): void {
  if (!/^engine\./.test(componentName)) return
  proxyUpdateEntityComponent(state, entityId, componentName, classId, json)
}

function sdk6OpenExternalUrl(url: string): void {
  if (!isPointerDispatch() || typeof url !== 'string' || !url.startsWith('https://') || url.length > 49000) {
    console.error('SDK6 openExternalUrl requires an HTTPS URL inside a pointer callback')
    return
  }
  openExternalUrl({ url }).catch(console.error)
}
function sdk6OpenNftDialog(assetContractAddress: string, tokenId: string, comment: string | null): void {
  if (!isPointerDispatch() || JSON.stringify({ assetContractAddress, tokenId, comment }).length > 49000) {
    console.error('SDK6 openNFTDialog requires a pointer callback and a payload of at most 49000 characters')
    return
  }
  openNftDialog({
    urn: `urn:decentraland:ethereum:erc721:${assetContractAddress}:${tokenId}`
  }).catch(console.error)
}

function query(queryType: any, payload: any): void {
  queryRaycast(queryType, payload)
}
function subscribe(eventName: string): void {
  state.subscribedEvents.add(eventName)
}
function unsubscribe(eventName: string): void {
  state.subscribedEvents.delete(eventName)
}

function onUpdate(cb: (deltaTime: number) => void): void {
  state.onUpdateFunctions.push(cb)
}
function onEvent(cb: (event: any) => void): void {
  state.onEventFunctions.push(cb)
}
function onStart(cb: () => void): void {
  state.onStartFunctions.push(cb)
}

function error(message: string, data: Error): void {
  console.error(message, data)
}
function log(...args: any[]): void {
  console.log(...args)
}

async function loadModule(moduleName: string): Promise<any> {
  if (DEBUG_CONFIG.RPC_MODULE) console.log('loadingModule', moduleName)

  const canonicalModuleName = getLoadableModuleName(moduleName)
  const maybeModule =
    state.loadedModules[moduleName] ?? (canonicalModuleName && state.loadedModules[canonicalModuleName])
  if (maybeModule !== undefined) {
    return maybeModule
  }

  const wrappedModule = loadWrappedModule(moduleName)
  wrappedModule.rpcHandle = moduleName
  state.loadedModules[moduleName] = wrappedModule
  if (canonicalModuleName !== undefined) {
    state.loadedModules[canonicalModuleName] = wrappedModule
    state.loadedModules[`@decentraland/${canonicalModuleName}`] = wrappedModule
  }

  return wrappedModule
}

async function callRpc(rpcHandle: string, methodName: string, args: ArrayLike<any> = []): Promise<any> {
  if (DEBUG_CONFIG.RPC_MODULE) console.log('callRpc', rpcHandle, methodName, args)

  // A few pre-AMD SDK6 bundles call a built-in host API directly without the
  // preceding `loadModule`. Support those deployed callers lazily, but never
  // turn an unknown handle into a module.
  if (state.loadedModules[rpcHandle] === undefined && getLoadableModuleName(rpcHandle) !== undefined) {
    await loadModule(rpcHandle)
  }

  const module = state.loadedModules[rpcHandle]
  if (module !== undefined) {
    const implementation = module.implementation
    if (
      Object.prototype.hasOwnProperty.call(implementation, methodName) &&
      typeof implementation[methodName] === 'function'
    ) {
      const res = await implementation[methodName](...Array.from(args))
      return res
    } else {
      throw new Error(`Method not found rpcHandle=${rpcHandle} methodName=${methodName}`)
    }
  }
  throw new Error(`Module not loaded rpcHandle=${rpcHandle} methodName=${methodName}`)
}

let lastTick = Date.now()
function flushEvents(): void {
  proxyHandleTick(state)
  updateEventSystem(state)
  flushRaycasts(state)
  flushVideoEvents(state)

  if (Date.now() - lastTick > 1000) {
    lastTick = Date.now()
    if (DEBUG_CONFIG.STATS_1_SECOND) {
      printState(state)
    }
  }
}

function onLegacyUpdate(dt: number): void {
  if (state.disableUpdate) {
    proxyHandleTick(state)
    if (!advanceReadiness(dt)) return
    startCallbacks()
  }
  advanceTimers(dt)

  for (const cb of state.onUpdateFunctions) {
    try {
      cb(dt)
    } catch (err: any) {
      error('Error onLegacyUpdate', err)
    }
  }
  flushEvents()
}

function startCallbacks(): void {
  if (!state.disableUpdate) return
  state.disableUpdate = false
  for (const cb of [...state.onStartFunctions]) {
    try {
      cb()
    } catch (err: any) {
      error('Error onStart', err)
    }
  }
  if (state.subscribedEvents.has('sceneStart'))
    sendEventToSDK6(state.onEventFunctions, { type: 'sceneStart', data: {} })

  if (DEBUG_CONFIG.STATS_1_SECOND) console.log('Adaption Layer sent start signal')
}

function start(): void {
  beginReadiness()
  if (advanceReadiness(0)) startCallbacks()
}

export function createAdaptionLayer(): AdaptionLayerType {
  bridgeObservables(state)

  ReactEcsRenderer.setUiRenderer(renderEcs6Ui(state), { virtualWidth: 0, virtualHeight: 0 })
  engine.addSystem(onLegacyUpdate)

  const decentralandInterface: DecentralandInterface = {
    DEBUG: true,
    updateEntityComponent,
    attachEntityComponent,
    removeEntityComponent,
    setParent,
    addEntity,
    removeEntity,
    query,
    subscribe,
    unsubscribe,
    componentCreated,
    componentDisposed,
    componentUpdated,
    log,
    openExternalUrl: sdk6OpenExternalUrl,
    openNFTDialog: sdk6OpenNftDialog,
    onUpdate,
    onEvent,
    loadModule,
    callRpc,
    onStart,
    error
  }

  return {
    decentralandInterface: DEBUG_CONFIG.LOG_MIDDLEWARE ? logMiddleware(decentralandInterface) : decentralandInterface,
    forceUpdate: onLegacyUpdate,
    flushEvents,
    start
  }
}
