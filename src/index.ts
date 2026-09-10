import { configureRaycastWorld } from './events/raycastWorld'
import { updateSocialController } from './modules/SocialController'
import { installDirectTransform } from './crdt/install'
import { engine } from '@dcl/sdk/ecs'
import { state } from './runtime/DecentralandInterface'
import { pollLegacyEvents } from './events/observables'
import { TextDecoder } from 'text-encoding'
import { readFile } from '~system/Runtime'
import { createAdaptionLayer } from './runtime/DecentralandInterface'
import { customEval } from './sandbox'
import { configureGlyphAtlases } from './components-bridge/commons/ui/glyphAtlas'

import * as sdk from '@dcl/sdk'

async function getSceneJsonData(fileName: string): Promise<any> {
  const res = await readFile({ fileName })
  const content = new TextDecoder().decode(res.content)
  return JSON.parse(content)
}

async function getSceneCode(): Promise<string> {
  const sceneJson = await getSceneJsonData('scene.json')
  configureGlyphAtlases(sceneJson.sdk6Adapter?.glyphAtlases ?? [])
  configureRaycastWorld(sceneJson.scene?.base)

  const res = await readFile({ fileName: sceneJson.main })
  return new TextDecoder().decode(res.content)
}

const sdkRef = sdk as any

const engineOnUpdate = async (dt: number): Promise<void> => {
  engine.seal()
  await engine.update(dt)
  await pollLegacyEvents(state)
  await updateSocialController(dt)
}
const engineOnStart = sdkRef.onStart

export async function onUpdate(dt: number): Promise<void> {
  await engineOnUpdate(dt)
}

export async function onStart(): Promise<void> {
  const code = await getSceneCode()
  installDirectTransform()
  await engineOnStart()

  const adaptionLayer = createAdaptionLayer()
  await customEval(code, { dcl: adaptionLayer.decentralandInterface })

  await onUpdate(0.0)
  adaptionLayer.flushEvents()

  await engineOnUpdate(0.0)
  adaptionLayer.flushEvents()

  adaptionLayer.start()

  await engineOnUpdate(0.0)
  adaptionLayer.forceUpdate(0.0)
  adaptionLayer.flushEvents()

  await engineOnUpdate(0.0)
}
