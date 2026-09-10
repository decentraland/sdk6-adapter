import ReactEcs, { UiEntity, type JSX } from '@dcl/sdk/react-ecs'
import { currentCrate, dismissCrate } from './AirdropController'

export function renderAirdrop(): JSX.Element[] {
  const crate = currentCrate()
  if (!crate) return []
  const white = { r: 1, g: 1, b: 1, a: 1 }
  return [
    <UiEntity
      key="sdk6-airdrop"
      uiTransform={{
        positionType: 'absolute',
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2147483647
      }}
      uiBackground={{ color: { r: 0, g: 0, b: 0, a: 0.75 } }}
    >
      <UiEntity
        uiTransform={{ width: 540, maxWidth: '95%', padding: 20, flexDirection: 'column' }}
        uiBackground={{ color: { r: 0.08, g: 0.08, b: 0.12, a: 1 } }}
      >
        <UiEntity
          uiTransform={{ height: 100, padding: 10, flexShrink: 0, flexDirection: 'column' }}
          uiBackground={{ color: { r: 1, g: 0.72, b: 0.12, a: 1 } }}
        >
          <UiEntity
            uiTransform={{ height: 28 }}
            uiText={{ value: '! WARNING: AIRDROP DOES NOT WORK', fontSize: 18, color: { r: 0, g: 0, b: 0, a: 1 } }}
          />
          <UiEntity
            uiTransform={{ height: 52 }}
            uiText={{
              value: 'This legacy airdrop does not work in this adapter.\nYou cannot claim items here.',
              fontSize: 16,
              color: { r: 0, g: 0, b: 0, a: 1 }
            }}
          />
        </UiEntity>
        <UiEntity uiTransform={{ height: 54 }} uiText={{ value: crate.title, fontSize: 24, color: white }} />
        <UiEntity uiTransform={{ height: 60 }} uiText={{ value: crate.subtitle ?? '', fontSize: 16, color: white }} />
        <UiEntity
          uiTransform={{ height: 120, overflow: 'hidden' }}
          uiText={{
            value:
              crate.items
                .slice(0, 5)
                .map((item) => item.name)
                .join('\n') + (crate.items.length > 5 ? `\n+ ${crate.items.length - 5} more items` : ''),
            fontSize: 16,
            color: white
          }}
        />
        <UiEntity
          uiTransform={{ width: '100%', height: 44 }}
          uiBackground={{ color: { r: 0.2, g: 0.3, b: 0.6, a: 1 } }}
          uiText={{ value: 'Close', fontSize: 18, color: white }}
          onMouseDown={() => dismissCrate(crate.id)}
        />
      </UiEntity>
    </UiEntity>
  ]
}
