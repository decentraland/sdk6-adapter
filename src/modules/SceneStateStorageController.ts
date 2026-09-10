import { TextDecoder } from 'text-encoding'
import { getSceneInformation, readFile } from '~system/Runtime'

const unsupported = (method: string): Error =>
  new Error(
    `SceneStateStorageController.${method} requires the authenticated legacy Builder backend and editor asset pipeline, unavailable on stock SDK7`
  )
const types = new Map<string, number>([
  ['Transform', 1],
  ['GLTFShape', 54],
  ['NFTShape', 22],
  ['Name', 300],
  ['LockedOnEdit', 301],
  ['VisibleOnEdit', 302],
  ['Script', 204]
])

export function create(): Record<string, any> {
  async function getStoredState(_sceneId?: string): Promise<unknown> {
    // Historical production getStoredState also reads the current scene, ignoring sceneId.
    const scene = await getSceneInformation({})
    const fileName = 'scene-state-definition.json'
    if (!scene.content.some((entry) => entry.file === fileName)) return undefined
    const file = await readFile({ fileName })
    const state = JSON.parse(new TextDecoder().decode(file.content))
    if (state.schemaVersion !== 1 || !Array.isArray(state.entities))
      throw new Error('Invalid stored scene-state schema')
    return {
      entities: state.entities.map((entity: any) => {
        if (typeof entity.id !== 'string' || !Array.isArray(entity.components)) throw new Error('Invalid stored entity')
        return {
          id: entity.id,
          components: entity.components.map((component: any) => {
            const type = types.get(component.type)
            if (type === undefined) throw new Error(`Unknown stored component type: ${component.type}`)
            return { type, value: component.value }
          })
        }
      })
    }
  }
  return {
    getStoredState,
    async publishSceneState() {
      return { ok: false, error: unsupported('publishSceneState').message }
    },
    async saveSceneState() {
      return { ok: false, error: unsupported('saveSceneState').message }
    },
    async getProjectManifest() {
      throw unsupported('getProjectManifest')
    },
    async getProjectManifestByCoordinates() {
      throw unsupported('getProjectManifestByCoordinates')
    },
    async createProjectWithCoords() {
      throw unsupported('createProjectWithCoords')
    },
    async createProjectFromStateDefinition() {
      throw unsupported('createProjectFromStateDefinition')
    },
    async saveProjectInfo() {
      throw unsupported('saveProjectInfo')
    },
    async sendAssetsToRenderer() {
      throw unsupported('sendAssetsToRenderer')
    }
  }
}
