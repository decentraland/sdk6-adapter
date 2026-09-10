import {
  type ContentMapping,
  getExplorerInformation,
  getRealm,
  getWorldTime,
  getSceneInformation
} from '~system/Runtime'
import { type SceneJsonData } from './ParcelIdentity'

type Realm = {
  domain: string
  layer: string
  room: string
  serverName: string
  displayName: string
}

type ExplorerConfiguration = {
  clientUri: string
  configurations: Record<string, string | number | boolean>
}

const enum Platform {
  DESKTOP = 'desktop',
  BROWSER = 'browser'
}

type BootstrapData = {
  sceneId: string
  name: string
  main: string
  baseUrl: string
  mappings: ContentMapping[]
  useFPSThrottling: boolean
  data: BootstrapSceneData
}

type ParcelPosition = { x: number; y: number }

/**
 * SDK6 exposed a normalized loading descriptor in `getBootstrapData().data`.
 * A few early scenes read `basePosition` directly instead of parsing
 * `scene.json` themselves, so retain the scene metadata and add that legacy
 * descriptor around it.
 */
type BootstrapSceneData = SceneJsonData & {
  id: string
  basePosition: ParcelPosition
  name: string
  parcels: ParcelPosition[]
  baseUrl: string
  baseUrlBundles: string
  contents: ContentMapping[]
  land: {
    sceneId: string
    scene: SceneJsonData
    sceneJsonData: SceneJsonData
    baseUrl: string
    baseUrlBundles: string
    mappingsResponse: {
      parcel_id: string
      root_cid: string
      contents: ContentMapping[]
    }
  }
}

function parseParcelPosition(value: unknown): ParcelPosition {
  const [x, y] = typeof value === 'string' ? value.split(',').map(Number) : []
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
}

export function create(): Record<string, any> {
  async function getCurrentRealm(): Promise<Realm | undefined> {
    const realm = await getRealm({})
    return {
      domain: realm.realmInfo?.baseUrl ?? '',
      layer: realm.realmInfo?.room ?? '',
      room: realm.realmInfo?.room ?? '',
      serverName: realm.realmInfo?.realmName ?? '',
      displayName: realm.realmInfo?.realmName ?? ''
    }
  }

  async function isPreviewMode(): Promise<boolean> {
    const realm = await getRealm({})
    return realm.realmInfo?.isPreview ?? false
  }

  async function getExplorerConfiguration(): Promise<ExplorerConfiguration> {
    return {
      clientUri: 'https://play.decentraland.org/',
      configurations: {}
    }
  }

  async function getPlatform(): Promise<Platform> {
    const config = await getExplorerInformation({})

    if (config.platform === 'web') {
      return Platform.BROWSER
    } else if (config.platform === 'desktop') {
      return Platform.DESKTOP
    }

    return config.platform as Platform
  }

  async function getDecentralandTime(): Promise<{ seconds: number }> {
    const time = await getWorldTime({})
    return { seconds: time.seconds }
  }

  async function getBootstrapData(): Promise<BootstrapData> {
    const sceneInformation = await getSceneInformation({})
    const sceneJsonData = JSON.parse(sceneInformation.metadataJson ?? '{}')
    const sceneId = sceneInformation.urn ?? ''
    const baseUrl = sceneInformation.baseUrl ?? ''
    const contents = sceneInformation.content ?? []
    const basePosition = parseParcelPosition(sceneJsonData.scene?.base)
    const parcels = (sceneJsonData.scene?.parcels ?? []).map(parseParcelPosition)
    const land = {
      sceneId,
      scene: sceneJsonData,
      sceneJsonData,
      baseUrl,
      baseUrlBundles: '',
      mappingsResponse: {
        parcel_id: sceneId,
        root_cid: sceneId,
        contents
      }
    }
    return {
      sceneId,
      name: sceneJsonData.name ?? '',
      main: sceneJsonData.main ?? '',
      baseUrl,
      mappings: contents,
      useFPSThrottling: true,
      data: {
        ...sceneJsonData,
        id: sceneId,
        basePosition,
        name: sceneJsonData.display?.title ?? sceneJsonData.name ?? '',
        parcels,
        baseUrl,
        baseUrlBundles: '',
        contents,
        land
      }
    }
  }

  async function areUnsafeRequestAllowed(): Promise<boolean> {
    return true
  }

  return {
    getCurrentRealm,
    isPreviewMode,
    getExplorerConfiguration,
    getPlatform,
    getDecentralandTime,
    getBootstrapData,
    areUnsafeRequestAllowed
  }
}
