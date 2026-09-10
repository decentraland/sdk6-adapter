import { AvatarShape, AvatarAttach } from '@dcl/sdk/ecs'
import { type ComponentAdaptation } from '../types'
import { sdk7EnsureEntity } from '../ecs7/ecs7'

export const AvatarShapeConversion: ComponentAdaptation = {
  update(state, id, value) {
    const entity = sdk7EnsureEntity(state, id)
    if (value.visible === false) {
      AvatarShape.deleteFrom(entity)
      return
    }
    AvatarShape.createOrReplace(entity, {
      id: value.id ?? id,
      name: value.name,
      bodyShape: value.bodyShape,
      skinColor: value.skinColor,
      hairColor: value.hairColor,
      eyeColor: value.eyeColor,
      wearables: value.wearables ?? [],
      emotes: (value.emotes ?? []).map((emote: any) => (typeof emote === 'string' ? emote : emote.urn)).filter(Boolean),
      expressionTriggerId: value.expressionTriggerId,
      expressionTriggerTimestamp: value.expressionTriggerTimestamp,
      talking: value.talking
    })
  },
  remove(state, id) {
    AvatarShape.deleteFrom(sdk7EnsureEntity(state, id))
  }
}

export const AvatarAttachConversion: ComponentAdaptation = {
  update(state, id, value) {
    AvatarAttach.createOrReplace(sdk7EnsureEntity(state, id), {
      avatarId: value.avatarId,
      anchorPointId: value.anchorPointId ?? 0
    })
  },
  remove(state, id) {
    AvatarAttach.deleteFrom(sdk7EnsureEntity(state, id))
  }
}
