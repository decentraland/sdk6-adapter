import { XMLHttpRequest } from './runtime/polyfill/XMLHttpRequest'
import * as timers from './runtime/timers'
import { TextEncoder, TextDecoder } from 'text-encoding'
import { FormData } from 'formdata-polyfill/esm.min'
import { isModuleNotAvailableError } from './modules/modulesWrapper'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function customEval(code: string, context: any) {
  const sandbox: any = {}

  Object.keys(context).forEach(function (key) {
    sandbox[key] = context[key]
  })

  sandbox.clearInterval = timers.clearInterval
  sandbox.clearTimeout = timers.clearTimeout
  sandbox.setInterval = timers.setInterval
  sandbox.setTimeout = timers.setTimeout

  sandbox.XMLHttpRequest = XMLHttpRequest
  sandbox.TextEncoder = TextEncoder
  sandbox.TextDecoder = TextDecoder
  sandbox.FormData = FormData

  sandbox.window = sandbox
  sandbox.self = sandbox
  sandbox.globalThis = sandbox

  // UMD dependencies in SDK6 bundles must choose their browser-global branch.
  // Without these own properties, `with` falls through to the adapter's CommonJS
  // wrapper and lets a scene overwrite its lifecycle exports.
  sandbox.module = undefined
  sandbox.exports = undefined
  sandbox.require = (name: string): never => {
    throw new Error(`SDK6 CommonJS require is not available: ${name}`)
  }

  sandbox.fetch = async (url: string, init: any) => {
    return await fetch(url, init)
  }

  // The SDK6 AMD loader hands every dependency rejection to a global `onerror` and rethrows when none exists,
  // which the host runtime reports as an unhandled rejection. A host-module miss is the loader's normal path for a
  // package the bundle defines itself, so it stays silent; the loader's own start-up check names a package that
  // never gets defined. Every other loader error is a scene error.
  sandbox.onerror = (error: unknown): void => {
    if (isModuleNotAvailableError(error)) return
    console.error('Error in module loader', error)
  }

  // Install own overrides before inheriting host globals, which can expose
  // read-only window/self accessors in browser and worker runtimes.
  Object.setPrototypeOf(sandbox, globalThis)
  new Function('code', `with (this) { ${code} }`).call(sandbox, code)
}
