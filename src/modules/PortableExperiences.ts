import { exit, getPortableExperiencesLoaded, kill, spawn } from '~system/PortableExperiences'

type PortableExperienceUrn = string
type PortableExperienceHandle = {
  pid: PortableExperienceUrn
  parentCid: string
}
type PortableExperienceLoaded = {
  portableExperiences: PortableExperienceHandle[]
}

export function create(): Record<string, any> {
  async function internalSpawn(pid: PortableExperienceUrn): Promise<PortableExperienceHandle> {
    const response = await spawn({ pid })
    return {
      pid: response.pid,
      parentCid: response.parentCid
    }
  }

  async function internalKill(pid: PortableExperienceUrn): Promise<boolean> {
    const response = await kill({ pid })
    return response.status
  }

  async function internalExit(): Promise<boolean> {
    const response = await exit({})
    return response.status
  }

  async function internalGetPortableExperiencesLoaded(): Promise<PortableExperienceLoaded> {
    const response = await getPortableExperiencesLoaded({})
    return {
      portableExperiences: response.loaded
    }
  }

  return {
    spawn: internalSpawn,
    kill: internalKill,
    exit: internalExit,
    getPortableExperiencesLoaded: internalGetPortableExperiencesLoaded
  }
}
