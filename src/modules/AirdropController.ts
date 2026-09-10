type Item = { name: string; subtitle?: string; thumbnailURL?: string; rarity?: string; type?: string }
type Input = { title: string; subtitle?: string; items: Item[] }
type Crate = Input & { id: number }
const pending: Crate[] = []
let nextId = 1

export function currentCrate(): Crate | undefined {
  return pending[0]
}
export function dismissCrate(id: number): void {
  if (pending[0]?.id === id) pending.shift()
}

export function create(): Record<string, any> {
  return {
    async openCrate(data: Input, transaction: string, targetContract: string): Promise<void> {
      if (!data || typeof data.title !== 'string' || !Array.isArray(data.items) || data.items.length > 100)
        throw new TypeError('Invalid airdrop presentation')
      if (!/^0x[0-9a-fA-F]{40}$/.test(targetContract) || typeof targetContract !== 'string')
        throw new TypeError('Invalid airdrop target contract')
      if (
        typeof transaction !== 'string' ||
        !/^0x(?:[0-9a-fA-F]{2})*$/.test(transaction) ||
        transaction.length > 131074
      )
        throw new TypeError('Invalid airdrop transaction data')
      if (pending.length >= 16) throw new Error('Too many pending airdrops')
      const items = data.items.map((item) => {
        if (!item || typeof item.name !== 'string') throw new TypeError('Invalid airdrop item')
        return {
          name: item.name.slice(0, 256),
          subtitle: typeof item.subtitle === 'string' ? item.subtitle.slice(0, 256) : undefined
        }
      })
      pending.push({
        title: data.title.slice(0, 256),
        subtitle: typeof data.subtitle === 'string' ? data.subtitle.slice(0, 512) : undefined,
        items,
        id: nextId++
      })
    }
  }
}
