import { movePlayerTo, triggerEmote, triggerSceneEmote, type TriggerSceneEmoteRequest } from '~system/RestrictedActions'

export type PositionType = { x: number; y: number; z: number }

export type Emote = {
  predefined: PredefinedEmote
}

export const enum PredefinedEmote {
  WAVE = 'wave',
  FIST_PUMP = 'fistpump',
  ROBOT = 'robot',
  RAISE_HAND = 'raiseHand',
  CLAP = 'clap',
  MONEY = 'money',
  KISS = 'kiss',
  TIK = 'tik',
  HAMMER = 'hammer',
  TEKTONIK = 'tektonik',
  DONT_SEE = 'dontsee',
  HANDS_AIR = 'handsair',
  SHRUG = 'shrug',
  DISCO = 'disco',
  DAB = 'dab',
  HEAD_EXPLODDE = 'headexplode'
}

export function create(): Record<string, any> {
  async function internalMovePlayerTo(newPosition: PositionType, cameraTarget?: PositionType): Promise<void> {
    await movePlayerTo({ newRelativePosition: newPosition, cameraTarget })
  }

  async function internalTriggerEmote(emote: Emote): Promise<void> {
    await triggerEmote({
      predefinedEmote: emote.predefined
    })
  }

  return {
    movePlayerTo: internalMovePlayerTo,
    triggerEmote: internalTriggerEmote,
    async triggerSceneEmote(request: TriggerSceneEmoteRequest) {
      return await triggerSceneEmote(request)
    }
  }
}
