import { duringPointerDispatch } from './interaction'
import { type AdaptationLayerState } from '../types'

import {
  CameraMode,
  CameraType,
  InputAction,
  PointerEventType,
  PointerLock,
  Transform,
  engine,
  inputSystem
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { PointerEventStateComponent, convertPointerEventToSDK6 } from '../components-bridge/UuidCallback'

export function sendEventToSDK6(onEventFunctions: Array<(event: any) => void>, event: EngineEvent): void {
  const pointer = event.type === 'uuidEvent' && (event.data as any)?.payload?.buttonId !== undefined
  duringPointerDispatch(pointer, () => {
    for (const cb of onEventFunctions) {
      try {
        cb(event)
      } catch (err: any) {
        console.error('Error sendEventToSDK6', err)
      }
    }
  })
}

function vector3CloseTo(a: Vector3, b: Vector3): boolean {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001 && Math.abs(a.z - b.z) < 0.001
}

function quaterniongCloseTo(a: Quaternion, b: Quaternion): boolean {
  return (
    Math.abs(a.x - b.x) < 0.001 &&
    Math.abs(a.y - b.y) < 0.001 &&
    Math.abs(a.z - b.z) < 0.001 &&
    Math.abs(a.w - b.w) < 0.001
  )
}

export function updateEventSystem(state: AdaptationLayerState): void {
  if (state.subscribedEvents.has('positionChanged')) {
    const playerPosition: Vector3.ReadonlyVector3 = Transform.getOrNull(engine.PlayerEntity)?.position ?? Vector3.Zero()
    const cameraPosition: Vector3.ReadonlyVector3 = Transform.getOrNull(engine.CameraEntity)?.position ?? Vector3.Zero()
    const needUpdate =
      state.eventState.lastPositionChanged === null ||
      !vector3CloseTo(playerPosition, state.eventState.lastPositionChanged.position)
    if (needUpdate) {
      const data: IEvents['positionChanged'] = {
        position: playerPosition,
        cameraPosition,
        playerHeight: 1.6
      }

      sendEventToSDK6(state.onEventFunctions, {
        type: 'positionChanged',
        data
      })

      state.eventState.lastPositionChanged = data
    }
  }

  if (state.subscribedEvents.has('rotationChanged')) {
    const rotation = Transform.getOrNull(engine.CameraEntity)?.rotation ?? Quaternion.Identity()

    if (
      state.eventState.lastRotationChanged === null ||
      !quaterniongCloseTo(rotation, state.eventState.lastRotationChanged.quaternion)
    ) {
      const data = {
        quaternion: rotation,
        rotation: Quaternion.toEulerAngles(rotation)
      } satisfies IEvents['rotationChanged']

      sendEventToSDK6(state.onEventFunctions, {
        type: 'rotationChanged',
        data
      })

      state.eventState.lastRotationChanged = data
    }
  }

  for (const [entity, component] of engine.getEntitiesWith(PointerEventStateComponent)) {
    for (const action of component.registeredActions) {
      const event = inputSystem.getInputCommand(action.inputAction, action.eventType)
      if (event != null) {
        if (event?.hit?.entityId === entity) {
          let send = true
          if (action.inputAction === InputAction.IA_ANY) {
            if (
              event.button === InputAction.IA_WALK ||
              event.button === InputAction.IA_BACKWARD ||
              event.button === InputAction.IA_LEFT ||
              event.button === InputAction.IA_RIGHT
            ) {
              send = false
            }
          }

          send &&
            sendEventToSDK6(state.onEventFunctions, {
              type: 'uuidEvent',
              data: {
                uuid: action.uuid,
                payload:
                  action.eventType === PointerEventType.PET_HOVER_ENTER ||
                  action.eventType === PointerEventType.PET_HOVER_LEAVE
                    ? {}
                    : convertPointerEventToSDK6(state, event)
              } satisfies IEvents['uuidEvent']
            })
        }
      }
    }
  }

  for (const [name, type] of [
    ['pointerDown', PointerEventType.PET_DOWN],
    ['pointerUp', PointerEventType.PET_UP]
  ] as const) {
    const modern = state.subscribedEvents.has('actionButtonEvent') || state.subscribedEvents.has(name)
    const legacy = state.subscribedEvents.has('pointerEvent')
    const oldest = state.subscribedEvents.has(name)
    if (!modern && !legacy && !oldest) continue
    for (const button of [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      if (!modern && button > 2) continue
      const event = inputSystem.getInputCommand(button, type)
      if (!event) continue
      const data = { payload: convertPointerEventToSDK6(state, event) }
      if (modern) sendEventToSDK6(state.onEventFunctions, { type: 'actionButtonEvent', data })
      if (legacy && button <= 2) sendEventToSDK6(state.onEventFunctions, { type: 'pointerEvent', data })
      if (oldest && (button === 0 || button === 2))
        sendEventToSDK6(state.onEventFunctions, {
          type: name,
          data: { ...data.payload, pointerId: button === 0 ? 1 : 2 }
        } as EngineEvent)
    }
  }

  if (state.subscribedEvents.has('cameraModeChanged')) {
    const currentMode = CameraMode.getOrNull(engine.CameraEntity)?.mode ?? CameraType.CT_THIRD_PERSON
    if (state.eventState.lastCameraMode !== currentMode) {
      sendEventToSDK6(state.onEventFunctions, {
        type: 'cameraModeChanged',
        data: {
          cameraMode: currentMode as any
        } satisfies IEvents['cameraModeChanged']
      })
      state.eventState.lastCameraMode = currentMode
    }
  }

  if (state.subscribedEvents.has('onPointerLock')) {
    const isPointerLocked = PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked ?? false
    if (state.eventState.lastIsPointerLock !== isPointerLocked) {
      sendEventToSDK6(state.onEventFunctions, {
        type: 'onPointerLock',
        data: {
          locked: isPointerLocked
        } satisfies IEvents['onPointerLock']
      })
      state.eventState.lastIsPointerLock = isPointerLocked
    }
  }
}
