const { boot } = require('./harness.cjs')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const scene = `globalThis.__dcl=dcl; globalThis.XHR=XMLHttpRequest;`
const bundle = path.join(__dirname, '../dist/index.js')
;(async () => {
  let count = 0
  for (const responseType of ['', 'text', 'json', 'arraybuffer', 'blob']) {
    const h = await boot(bundle, scene, {
      fetch: async () => new Response('{"ok":true}', { status: 200, headers: { 'X-Fixture': 'yes' } })
    })
    const x = new h.sceneContext.XHR(),
      events = []
    x.onreadystatechange = function (e) {
      assert.equal(this, x)
      assert.equal(e.target, x)
      events.push(this.readyState)
    }
    x.open('GET', 'https://fixture.invalid/test')
    x.responseType = responseType
    let loaded = 0
    x.onload = () => loaded++
    x.addEventListener('load', () => loaded++)
    x.send()
    for (let i = 0; i < 5; i++) await h.tick()
    assert.equal(loaded, 2)
    assert.deepEqual(events, [1, 2, 3, 4])
    assert.equal(x.getResponseHeader('X-FIXTURE'), 'yes')
    if (responseType === 'json') assert.equal(x.response.ok, true)
    else if (responseType === 'arraybuffer') assert.equal(x.response.byteLength, 11)
    else if (responseType === 'blob') assert.equal(x.response.size, 11)
    else assert.equal(x.responseText, '{"ok":true}')
    count++
  }
  for (const mode of ['abort', 'timeout', 'error']) {
    let resolve, reject
    const h = await boot(bundle, scene, {
      fetch: () =>
        new Promise((a, b) => {
          resolve = a
          reject = b
        })
    })
    const x = new h.sceneContext.XHR(),
      events = []
    for (const name of ['load', 'abort', 'timeout', 'error', 'loadend'])
      x.addEventListener(name, () => events.push(name))
    x.open('GET', 'https://fixture.invalid/slow')
    if (mode === 'timeout') x.timeout = 20
    x.send()
    await h.tick()
    if (mode === 'abort') x.abort()
    if (mode === 'error') reject(new Error('fixture error'))
    for (let i = 0; i < 5; i++) await h.tick()
    if (mode !== 'error') resolve(new Response('late'))
    for (let i = 0; i < 5; i++) await h.tick()
    assert.deepEqual(events, [mode, 'loadend'])
    assert.equal(x.status, 0)
    assert.equal(x.response, null)
    count++
  }
  fs.writeFileSync(path.join(__dirname, 'xhr-results.json'), JSON.stringify({ status: 'PASS', cases: count }, null, 2))
  console.log('XHR response types, headers, callback binding, abort, timeout and network error:', count, 'PASS')
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
