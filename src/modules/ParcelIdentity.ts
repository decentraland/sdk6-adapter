import { getSceneInformation } from '~system/Runtime'

declare type ContentMapping = {
  file: string
  hash: string
}

type MappingsResponse = {
  parcel_id: string
  root_cid: string
  contents: ContentMapping[]
}

type ILand = {
  sceneId: string
  scene: SceneJsonData
  sceneJsonData: SceneJsonData
  baseUrl: string
  baseUrlBundles: string
  mappingsResponse: MappingsResponse
}

export type SceneJsonData = {
  display?: SceneDisplay
  owner?: string
  contact?: SceneContact
  tags?: string[]
  scene: SceneParcels
  spawnPoints?: SceneSpawnPoint[]
  requiredPermissions?: string[]
}

type SceneDisplay = {
  title?: string
  favicon?: string
  description?: string
  navmapThumbnail?: string
}

type SceneContact = {
  name?: string
  email?: string
  url?: string
}

type SceneParcels = {
  base: string
  parcels: string[]
}

type SceneSpawnPoint = {
  name?: string
  position: {
    x: number | number[]
    y: number | number[]
    z: number | number[]
  }
  default?: boolean
}

export function create(): Record<string, any> {
  async function getParcel(): Promise<{ land: ILand; cid: string }> {
    const sceneInformation = await getSceneInformation({})
    const sceneJsonData: SceneJsonData = JSON.parse(sceneInformation.metadataJson || '{}') ?? {}
    return {
      land: {
        sceneId: sceneInformation.urn ?? '',
        scene: sceneJsonData,
        sceneJsonData,
        baseUrl: sceneInformation.baseUrl ?? '',
        baseUrlBundles: '',
        mappingsResponse: {
          parcel_id: sceneInformation.urn ?? '',
          root_cid: sceneInformation.urn ?? '',
          contents: sceneInformation.content ?? []
        }
      },
      cid: sceneInformation.urn ?? ''
    }
  }

  return {
    getParcel,
    async getSceneId(): Promise<string> {
      return (await getSceneInformation({})).urn ?? ''
    },
    async getIsEmpty(): Promise<{ isEmpty: boolean }> {
      return { isEmpty: false }
    }
  }
}
