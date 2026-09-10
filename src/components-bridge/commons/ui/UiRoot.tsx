import { UiCanvasInformation, engine } from '@dcl/sdk/ecs'
import ReactEcs, { UiEntity, type JSX } from '@dcl/sdk/react-ecs'
import { type AdaptationLayerState } from '../../../types'
import { type ComponentNode } from './core'
import { Ecs6UiComponent } from './UiComponent'

export function renderEcs6UiRootComponent(state: AdaptationLayerState, c: ComponentNode): JSX.Element {
  const canvasInfo = UiCanvasInformation.getOrNull(engine.RootEntity) ?? { width: 1280, height: 720 }

  const zoom = canvasInfo.height > 0 ? canvasInfo.height / 720 : 1
  const canvasSize = { x: canvasInfo.width / zoom, y: 612 }

  return (
    <UiEntity
      key={`root${c.__id}`}
      uiTransform={{
        positionType: 'absolute',
        position: { left: 0, top: 72 * zoom },
        width: '100%',
        height: '100%'
      }}
    >
      {c.children.map(($) => Ecs6UiComponent(state, $, canvasSize, zoom))}
    </UiEntity>
  )
}
