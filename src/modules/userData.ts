import { type GetUserDataResponse } from '~system/UserIdentity'

export function toUserData(data: GetUserDataResponse['data'], publicKey: string | null) {
  return {
    displayName: data?.displayName ?? '',
    publicKey,
    hasConnectedWeb3: data?.hasConnectedWeb3 ?? false,
    userId: data?.userId ?? '',
    version: data?.version ?? 0,
    avatar: {
      bodyShape: data?.avatar?.bodyShape ?? '',
      skinColor: data?.avatar?.skinColor ?? '',
      hairColor: data?.avatar?.hairColor ?? '',
      eyeColor: data?.avatar?.eyeColor ?? '',
      wearables: data?.avatar?.wearables ?? [],
      snapshots: {
        face: data?.avatar?.snapshots?.face256 ?? '',
        face256: data?.avatar?.snapshots?.face256 ?? '',
        face128: data?.avatar?.snapshots?.face256 ?? '',
        body: data?.avatar?.snapshots?.body ?? ''
      }
    }
  }
}
