declare const require: (name: string) => any
export function create(): Record<string, any> {
  return {
    async requestTeleport(destination: string): Promise<void> {
      const api: typeof import('~system/UserActionModule') = require('~system/UserActionModule')
      await api.requestTeleport({ destination })
    }
  }
}
