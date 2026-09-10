const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { boot } = require('./harness.cjs')
const {
  PBAudioSource
} = require('../node_modules/@dcl/ecs/dist-cjs/components/generated/pb/decentraland/sdk/components/audio_source.gen.js')

;(async () => {
  const results = []
  for (const file of ['index.js', 'index.min.js']) {
    const h = await boot(path.resolve('dist', file), '')
    const call = async (method, args = [], mod = 'SoundController') => {
      const result = await h.dcl.callRpc(mod, method, args)
      await h.tick()
      return result
    }
    const audio = () => {
      const latest = new Map()
      for (const m of h.trace.flatMap((t) => t.messages ?? [])) {
        if (m.component === 1020 && m.type === 1)
          latest.set(m.entity, { entity: m.entity, ...PBAudioSource.decode(Buffer.from(m.payload, 'hex')) })
        else if (m.type === 3 || (m.component === 1020 && m.type === 2)) latest.delete(m.entity)
      }
      return [...latest.values()]
    }
    await call('pauseSound')
    assert.equal(audio().length, 0)
    const module = await h.dcl.loadModule('@decentraland/SoundController')
    assert.deepEqual(Array.from(module.methods, (m) => m.name).sort(), ['pauseSound', 'playSound'])
    // Exact call recovered from deployment bundle QmeuRevoNgNfJKJhojxpfkkJ9NF2VefzWD4tVi6n7oRSXA.
    await call(
      'playSound',
      ['sounds/remotehorst_flatrocket.mp3', { loop: true, volume: 50 }],
      '@decentraland/SoundController'
    )
    await h.tick()
    let a = audio()
    assert.equal(a.length, 1, file + ' ' + JSON.stringify(h.snapshot()))
    const entity = a[0].entity
    assert.equal(a[0].audioClipUrl, 'sounds/remotehorst_flatrocket.mp3')
    assert.equal(a[0].volume, 0.5)
    assert.equal(a[0].loop, true)
    assert.equal(a[0].global, true)
    assert.equal(a[0].playing, true)
    const firstCursor = a[0].currentTime
    await call('playSound', ['sounds/remotehorst_flatrocket.mp3', { loop: true, volume: 50 }])
    await h.tick()
    assert.notEqual(audio()[0].currentTime, firstCursor)
    await call('pauseSound')
    await h.tick()
    assert.equal(audio()[0].playing, false)
    for (const volume of [0, 0.5, 25, 100, -10, 150]) {
      await call('playSound', ['other.mp3', { volume }])
      assert(Math.abs(audio()[0].volume - Math.max(0, Math.min(100, volume)) / 100) < 1e-7)
      assert.equal(audio()[0].loop, false)
    }
    await call('playSound', ['default.mp3'])
    assert.equal(audio()[0].volume, 1)
    for (const args of [
      [''],
      ['a', null],
      ['a', { volume: NaN }],
      ['a', { volume: Infinity }],
      ['a', { volume: '50' }],
      ['a', { loop: 'yes' }]
    ]) {
      await assert.rejects(call('playSound', args), /SoundController/)
    }
    assert.equal(audio().length, 1)
    assert.equal(audio()[0].entity, entity)
    assert.equal(audio()[0].audioClipUrl, 'default.mp3')
    assert(
      !h.logs.some((l) => l.args.some((a) => typeof a === 'string' && a.includes('not found, returning empty module')))
    )
    results.push({ file, sha256: h.hash, status: 'PASS' })
    h.dispose()
  }

  fs.writeFileSync(
    path.join(__dirname, 'sound-controller-results.json'),
    JSON.stringify({ status: 'PASS', results }, null, 2) + '\n'
  )
  console.log(`SoundController: ${results.length} bundle cases PASS`)
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
