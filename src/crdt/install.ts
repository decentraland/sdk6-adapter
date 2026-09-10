import { engine, Transform } from '@dcl/ecs'
import * as sdk from '@dcl/sdk'
import { createDirectTransform } from './transform'

let installed = false
export function installDirectTransform(): void {
  if (installed) return
  installed = true
  const rendererTransport = (sdk as any).rendererTransport as { send: (message: Uint8Array) => Promise<void> }
  const component = engine.getComponent(1) as typeof Transform & {
    __onChangeCallbacks: (entity: number, value: unknown) => void
  }
  const direct = createDirectTransform((entity, value) => component.__onChangeCallbacks(entity, value))
  Object.assign(component, direct.api)
  Object.assign(Transform, direct.api)
  const send = rendererTransport.send.bind(rendererTransport)
  rendererTransport.send = (message: Uint8Array) => {
    const packets = direct.takePackets()
    if (!packets.length) return send(message)
    const bytes = new Uint8Array(packets.reduce((n, p) => n + p.length, message.length))
    let offset = 0
    for (const packet of packets) {
      bytes.set(packet, offset)
      offset += packet.length
    }
    bytes.set(message, offset)
    return send(bytes)
  }
}
