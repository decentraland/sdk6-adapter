import { getUserData } from '~system/UserIdentity'
import { trackIdentityCall } from '../events/observables'

import { toUserData } from './userData'

export function create(): Record<string, any> {
  async function getUserPublicKey(): Promise<string | null> {
    const userData = await getUserData({})
    return userData.data?.hasConnectedWeb3 ? userData.data.userId ?? null : null
  }

  async function internalGetUserData(): Promise<ReturnType<typeof toUserData>> {
    const userData = await getUserData({})
    const publicKey = userData.data?.hasConnectedWeb3 ? userData.data.userId ?? null : null
    return toUserData(userData.data, publicKey)
  }

  return {
    getUserPublicKey: () => trackIdentityCall(getUserPublicKey()),
    getUserData: () => trackIdentityCall(internalGetUserData())
  }
}
