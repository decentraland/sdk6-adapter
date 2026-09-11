import * as AirdropController from './AirdropController'
import * as SceneStateStorageController from './SceneStateStorageController'
import * as UserActionModule from './UserActionModule'
import { DEBUG_CONFIG } from '../debug/config'
import * as CommunicationsController from './CommunicationsController'
import * as EnvironmentAPI from './EnvironmentApi'
import * as EthereumController from './EthereumController'
import * as Identity from './Identity'
import * as ParcelIdentity from './ParcelIdentity'
import * as Players from './Players'
import * as PortableExperiences from './PortableExperiences'
import * as RestrictedActions from './RestrictedActions'
import * as SignedFetch from './SignedFetch'
import * as SocialController from './SocialController'
import * as SoundController from './SoundController'
import * as web3Provider from './Web3Provider'

type ModuleDescriptorWithImplementation = ModuleDescriptor & {
  implementation: any
}

function getModuleMethods(module: any): MethodDescriptor[] {
  return Object.keys(module)
    .filter((value) => value !== 'default')
    .map((e): MethodDescriptor => ({ name: e }))
}

const LoadableModules: Record<string, () => Record<string, any>> = {
  AirdropController: AirdropController.create,
  SceneStateStorageController: SceneStateStorageController.create,
  CommunicationsController: CommunicationsController.create,
  EnvironmentAPI: EnvironmentAPI.create,
  EthereumController: EthereumController.create,
  Identity: Identity.create,
  ParcelIdentity: ParcelIdentity.create,
  Players: Players.create,
  PortableExperiences: PortableExperiences.create,
  RestrictedActions: RestrictedActions.create,
  RestrictedActionModule: RestrictedActions.create,
  SignedFetch: SignedFetch.create,
  SocialController: SocialController.create,
  SoundController: SoundController.create,
  UserActionModule: UserActionModule.create,
  'web3-provider': web3Provider.create
}

/**
 * The SDK6 AMD loader imports host APIs with an `@decentraland/` prefix, while
 * some older hand-authored bundles call `dcl.callRpc` with the bare handle.
 * Resolve both spellings to one built-in implementation.
 */
export function getLoadableModuleName(maybeModuleName: string): string | undefined {
  if (typeof maybeModuleName !== 'string') return undefined
  const onlyNameModule = maybeModuleName.replace(/^@decentraland\//, '')
  if (Object.prototype.hasOwnProperty.call(LoadableModules, maybeModuleName)) return maybeModuleName
  if (Object.prototype.hasOwnProperty.call(LoadableModules, onlyNameModule)) return onlyNameModule
  return undefined
}

const NOT_AVAILABLE = 'The module is not available in the list!'

/**
 * Rejection for a name that is not a host module. The bundle's AMD loader
 * hands it to the sandbox `onerror`, which keeps it out of the scene log
 * because the bundle may define that name itself further on.
 */
export class ModuleNotAvailableError extends Error {
  readonly original = new Error(NOT_AVAILABLE)

  constructor(legacyName: string) {
    super(`Error getting the methods of ${legacyName}: ${NOT_AVAILABLE}`)
  }
}

export function isModuleNotAvailableError(error: unknown): error is ModuleNotAvailableError {
  return error instanceof ModuleNotAvailableError
}

/** The legacy runtime named `@decentraland/` modules with a `Legacy` prefix in its errors. */
function legacyModuleName(name: string): string {
  return name.replace(/^@decentraland\//, 'Legacy').replace(/^~system\//, '')
}

/**
 * Resolves a host module or throws, as the legacy runtime did. A bundle's AMD
 * loader asks the host for every `@`-prefixed dependency and treats the
 * rejection as "not a host module", keeping the dependants waiting for a
 * `define` of that name later in the bundle. Resolving with a placeholder
 * would release them with a still-empty exports object.
 */
export function loadWrappedModule(maybeModuleName: string): ModuleDescriptorWithImplementation {
  if (typeof maybeModuleName !== 'string') throw new TypeError('SDK6 module name must be a string')
  const moduleName = getLoadableModuleName(maybeModuleName)
  if (moduleName === undefined) throw new ModuleNotAvailableError(legacyModuleName(maybeModuleName))

  if (DEBUG_CONFIG.RPC_MODULE) console.log(`Loading module ${moduleName}`)

  const module = LoadableModules[moduleName]()
  return {
    methods: getModuleMethods(module),
    rpcHandle: moduleName,
    implementation: module
  }
}
