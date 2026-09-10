import { getConnectedPlayers, getPlayersInScene, getPlayerData as fetchPlayerData } from '~system/Players'
import { toUserData } from './userData'

export function create(): Record<string, any> {
  async function getPlayerData(opt: { userId: string }): Promise<ReturnType<typeof toUserData> | null> {
    const userData = await fetchPlayerData({ userId: opt.userId })
    if (!userData.data) return null
    return toUserData(userData.data, userData.data.userId ?? null)
  }

  async function internalGetConnectedPlayers(): Promise<Array<{ userId: string }>> {
    const connectedPlayers = await getConnectedPlayers({})
    return connectedPlayers.players
  }

  async function internalGetPlayersInScene(): Promise<Array<{ userId: string }>> {
    const playersInScene = await getPlayersInScene({})
    return playersInScene.players
  }

  return {
    getPlayerData,
    getConnectedPlayers: internalGetConnectedPlayers,
    getPlayersInScene: internalGetPlayersInScene
  }
}
