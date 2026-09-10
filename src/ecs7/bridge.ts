import {
  BoxShapeConversion,
  CylinderShapeConversion,
  PlaneShapeConversion,
  SphereShapeConversion
} from '../components-bridge/Primitives'
import { updateComponent } from '../components-bridge/commons/ui/core'
import { syncCircleAppearance } from '../components-bridge/CircleShape'
import { Ecs6UiWorldSpaceRejection } from '../components-bridge/UiWorldSpace'
import { Ecs6HighlightConversion } from '../components-bridge/Highlight'
import { Ecs6CircleShapeConversion } from '../components-bridge/CircleShape'
import { Ecs6SoundConversion } from '../components-bridge/Sound'
import { Ecs6UiButtonConversion } from '../components-bridge/UiButton'
import { Ecs6UiScrollRectConversion } from '../components-bridge/UiScrollRect'
import { updateVideo } from '../components-bridge/VideoTexture'
import { AvatarShapeConversion, AvatarAttachConversion } from '../components-bridge/AdditionalShapes'
import {
  type ComponentAdaptation,
  type AdaptationLayerState,
  ECS6_CLASS_ID,
  type UiComponentAdaptation
} from '../types'

import { Ecs6TransformConvertion } from '../components-bridge/Transform'
import { Ecs6MaterialConvertion } from '../components-bridge/Material'
import { Ecs6BasicMaterialConvertion } from '../components-bridge/BasicMaterial'
import { Ecs6GltfShapeConvertion } from '../components-bridge/GltfShape'
import { Ecs6NftShapeConvertion } from '../components-bridge/NftShape'
import { Ecs6TextShapeConvertion } from '../components-bridge/TextShape'
import { Ecs6UuidCallbackConvertion } from '../components-bridge/UuidCallback'
import { Ecs6AnimationConvertion } from '../components-bridge/Animation'
import { Ecs6AudioStreamConvertion } from '../components-bridge/AudioStream'
import { DEBUG_CONFIG } from '../debug/config'
import { Ecs6BillboardConvertion } from '../components-bridge/Billboard'
import { Ecs6AudioSourceConvertion } from '../components-bridge/AudioSource'
import { Ecs6AvatarModifierAreaConvertion } from '../components-bridge/AvatarModifierArea'
import { Ecs6CameraModeAreaConvertion } from '../components-bridge/CameraModeArea'

const componentUpdates = new Map<ECS6_CLASS_ID, ComponentAdaptation>([
  [ECS6_CLASS_ID.HIGHLIGHT_ENTITY, Ecs6HighlightConversion],
  [ECS6_CLASS_ID.CIRCLE_SHAPE, Ecs6CircleShapeConversion],
  [ECS6_CLASS_ID.SOUND, Ecs6SoundConversion],
  [ECS6_CLASS_ID.TRANSFORM, Ecs6TransformConvertion],
  [ECS6_CLASS_ID.SPHERE_SHAPE, SphereShapeConversion],
  [ECS6_CLASS_ID.AVATAR_SHAPE, AvatarShapeConversion],
  [ECS6_CLASS_ID.AVATAR_ATTACH, AvatarAttachConversion],
  [ECS6_CLASS_ID.BOX_SHAPE, BoxShapeConversion],
  [ECS6_CLASS_ID.CYLINDER_SHAPE, CylinderShapeConversion],
  [
    ECS6_CLASS_ID.CONE_SHAPE,
    {
      update: (state, id, value) =>
        CylinderShapeConversion.update(state, id, { ...value, radiusTop: value.radiusTop ?? 0 }),
      remove: CylinderShapeConversion.remove
    }
  ],
  [ECS6_CLASS_ID.PLANE_SHAPE, PlaneShapeConversion],
  [ECS6_CLASS_ID.PBR_MATERIAL, Ecs6MaterialConvertion],
  [ECS6_CLASS_ID.BASIC_MATERIAL, Ecs6BasicMaterialConvertion],
  [ECS6_CLASS_ID.GLTF_SHAPE, Ecs6GltfShapeConvertion],
  [ECS6_CLASS_ID.NFT_SHAPE, Ecs6NftShapeConvertion],
  [ECS6_CLASS_ID.UUID_CALLBACK, Ecs6UuidCallbackConvertion],
  [ECS6_CLASS_ID.ANIMATION, Ecs6AnimationConvertion],
  [ECS6_CLASS_ID.AUDIO_STREAM, Ecs6AudioStreamConvertion],
  [ECS6_CLASS_ID.TEXT_SHAPE, Ecs6TextShapeConvertion],
  [ECS6_CLASS_ID.BILLBOARD, Ecs6BillboardConvertion],
  [ECS6_CLASS_ID.AUDIO_SOURCE, Ecs6AudioSourceConvertion],
  [ECS6_CLASS_ID.AVATAR_MODIFIER_AREA, Ecs6AvatarModifierAreaConvertion],
  [ECS6_CLASS_ID.CAMERA_MODE_AREA, Ecs6CameraModeAreaConvertion]
])

function uiComponent(classId: ECS6_CLASS_ID): UiComponentAdaptation {
  return { update: (_state, id, value) => updateComponent(id, classId, value) }
}

const uiComponentUpdates = new Map<ECS6_CLASS_ID, UiComponentAdaptation>([
  [ECS6_CLASS_ID.UI_WORLD_SPACE_SHAPE, Ecs6UiWorldSpaceRejection],
  [ECS6_CLASS_ID.UI_BUTTON_SHAPE, Ecs6UiButtonConversion],
  [ECS6_CLASS_ID.UI_SLIDER_SHAPE, Ecs6UiScrollRectConversion],
  [ECS6_CLASS_ID.VIDEO_TEXTURE, { update: updateVideo }],
  [ECS6_CLASS_ID.UI_SCREEN_SPACE_SHAPE, uiComponent(ECS6_CLASS_ID.UI_SCREEN_SPACE_SHAPE)],
  [ECS6_CLASS_ID.UI_FULLSCREEN_SHAPE, uiComponent(ECS6_CLASS_ID.UI_SCREEN_SPACE_SHAPE)],
  [ECS6_CLASS_ID.UI_TEXT_SHAPE, uiComponent(ECS6_CLASS_ID.UI_TEXT_SHAPE)],
  [ECS6_CLASS_ID.UI_IMAGE_SHAPE, uiComponent(ECS6_CLASS_ID.UI_IMAGE_SHAPE)],
  [ECS6_CLASS_ID.UI_CONTAINER_RECT, uiComponent(ECS6_CLASS_ID.UI_CONTAINER_RECT)],
  [ECS6_CLASS_ID.UI_CONTAINER_STACK, uiComponent(ECS6_CLASS_ID.UI_CONTAINER_STACK)],
  [ECS6_CLASS_ID.UI_INPUT_TEXT_SHAPE, uiComponent(ECS6_CLASS_ID.UI_INPUT_TEXT_SHAPE)]
])

const resourceOrMetadata = new Set([34, 68, 70, 72, 200, 203, 204, 300, 301, 302])
const warned = new Set<number>()
function warnUnsupported(classId: number): void {
  if (
    componentUpdates.has(classId) ||
    uiComponentUpdates.has(classId) ||
    resourceOrMetadata.has(classId) ||
    classId >= 1000 ||
    warned.has(classId)
  )
    return
  warned.add(classId)
  console.log(`SDK6 adapter: class ${classId} has no SDK7 translation. See COMPATIBILITY.md.`)
}

export function ecs7DeleteComponent(state: AdaptationLayerState, ecs6EntityId: EntityID, ecs6ClassId: number): void {
  const deleteFn = componentUpdates.get(ecs6ClassId as ECS6_CLASS_ID)?.remove
  if (deleteFn !== undefined) {
    deleteFn(state, ecs6EntityId)
    if ([8, 64, 65].includes(ecs6ClassId)) syncCircleAppearance(state, ecs6EntityId)
  }
}

export function ecs7UpdateComponent(
  state: AdaptationLayerState,
  ecs6EntityId: EntityID,
  ecs6ClassId: number,
  payload: any
): void {
  const updateFn = componentUpdates.get(ecs6ClassId as ECS6_CLASS_ID)?.update
  if (updateFn !== undefined) {
    updateFn(state, ecs6EntityId, payload)
    if ([8, 64, 65].includes(ecs6ClassId)) syncCircleAppearance(state, ecs6EntityId)
  } else {
    warnUnsupported(ecs6ClassId)
    if (DEBUG_CONFIG.MISSING_UPDATES) console.log('missing update fn', ecs6EntityId, ecs6ClassId, payload)
  }
}

export function ecs7UpdateComponentWithoutEntityId(
  state: AdaptationLayerState,
  componentId: string,
  ecs6ClassId: number,
  payload: any
): void {
  const updateFn = uiComponentUpdates.get(ecs6ClassId as ECS6_CLASS_ID)?.update
  if (updateFn !== undefined) {
    updateFn(state, componentId, payload)
  } else {
    warnUnsupported(ecs6ClassId)
    if (DEBUG_CONFIG.MISSING_UPDATES)
      console.log('missing update fn without entityId', componentId, ecs6ClassId, payload)
  }
}
