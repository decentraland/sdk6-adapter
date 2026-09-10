const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { boot } = require('./harness.cjs')
const plain = (v) => JSON.parse(JSON.stringify(v))

;(async () => {
  const results = []
  for (const file of ['index.js', 'index.min.js']) {
    let stored = {
      schemaVersion: 1,
      entities: [
        {
          id: 'fixture',
          components: [
            { type: 'Transform', value: { position: { x: 1 } } },
            { type: 'Script', value: { src: 'item.js' } }
          ]
        }
      ]
    }
    let profile = { userId: 'guest', hasConnectedWeb3: false, avatar: { snapshots: { face256: 'face', body: 'body' } } }
    const calls = []
    const h = await boot(path.resolve('dist', file), '', {
      getSceneInformation: () => ({
        urn: 'scene-id',
        baseUrl: '',
        metadataJson: '{"scene":{"base":"0,0"}}',
        content: [{ file: 'scene-state-definition.json', hash: 'fixture' }]
      }),
      readFile: ({ fileName }) => ({
        content: Buffer.from(
          fileName === 'scene.json'
            ? '{"main":"game.js"}'
            : fileName === 'scene-state-definition.json'
            ? JSON.stringify(stored)
            : ''
        )
      }),
      rpcOverrides: {
        '~system/UserIdentity': { getUserData: () => ({ data: profile }) },
        '~system/Players': { getPlayerData: () => ({ data: profile }) },
        '~system/CommunicationsController': {
          sendBinary: (request) => {
            calls.push(['binary', plain(request)])
            return { data: [Uint8Array.from([255, 0, 1])] }
          }
        },
        '~system/RestrictedActions': {
          triggerSceneEmote: (request) => {
            calls.push(['emote', plain(request)])
            return { success: false }
          }
        },
        '~system/SignedFetch': {
          getHeaders: (request) => {
            calls.push(['headers', plain(request)])
            return { headers: { 'x-fixture-signed': 'not-a-real-signature' } }
          }
        }
      }
    })
    const call = (module, method, args = []) => h.dcl.callRpc(module, method, args)
    for (const connected of [false, true]) {
      profile.hasConnectedWeb3 = connected
      const identity = plain(await call('Identity', 'getUserData'))
      const player = plain(await call('Players', 'getPlayerData', [{ userId: 'guest' }]))
      assert.equal(identity.publicKey, connected ? 'guest' : null)
      assert.equal(await call('Identity', 'getUserPublicKey'), identity.publicKey)
      assert.equal(player.publicKey, 'guest')
      assert.deepEqual(player.avatar, identity.avatar)
      assert.deepEqual(identity.avatar.snapshots, { face: 'face', face256: 'face', face128: 'face', body: 'body' })
    }
    profile = undefined
    assert.equal(await call('Players', 'getPlayerData', [{ userId: 'missing' }]), null)
    assert.equal((await call('Identity', 'getUserData')).userId, '')
    assert.equal(await call('ParcelIdentity', 'getSceneId'), 'scene-id')
    assert.deepEqual(plain(await call('ParcelIdentity', 'getIsEmpty')), { isEmpty: false })
    const binary = {
      data: [Uint8Array.from([0, 128, 255])],
      peerData: [{ data: [Uint8Array.from([1])], address: ['peer'] }]
    }
    const received = await call('CommunicationsController', 'sendBinary', [binary])
    assert.deepEqual(Array.from(received.data[0]), [255, 0, 1])
    assert.deepEqual(calls[0], ['binary', plain(binary)])
    const emote = { src: 'dance.glb', loop: true, mask: 1 }
    assert.deepEqual(plain(await call('RestrictedActions', 'triggerSceneEmote', [emote])), { success: false })
    assert.deepEqual(calls[1], ['emote', emote])
    const request = {
      url: 'https://fixture.invalid/api',
      init: { method: 'POST', body: 'hi', headers: { test: 'yes' } }
    }
    assert.deepEqual(plain(await call('SignedFetch', 'getHeaders', [request])), {
      headers: { 'x-fixture-signed': 'not-a-real-signature' }
    })
    assert.deepEqual(calls[2], ['headers', request])
    await h.dcl.loadModule('SocialController')
    h.hostEvents.push({
      generic: { eventId: 'AVATAR_OBSERVABLE', eventData: JSON.stringify({ type: 'USER_DATA', uuid: 'fake' }) }
    })
    await h.tick()
    assert.deepEqual(plain(await call('SocialController', 'pullAvatarEvents')), { events: [] })
    const state = plain(await call('SceneStateStorageController', 'getStoredState', ['ignored-in-legacy-production']))
    assert.deepEqual(
      state.entities[0].components.map((c) => c.type),
      [1, 204]
    )
    stored.entities[0].components[0].type = '__proto__'
    await assert.rejects(call('SceneStateStorageController', 'getStoredState'), /Unknown stored component/)
    for (const method of ['publishSceneState', 'saveSceneState']) {
      const value = await call('SceneStateStorageController', method, [])
      assert.equal(value.ok, false)
      assert.match(value.error, /legacy Builder backend/)
    }
    for (const method of [
      'getProjectManifest',
      'getProjectManifestByCoordinates',
      'createProjectWithCoords',
      'createProjectFromStateDefinition',
      'saveProjectInfo',
      'sendAssetsToRenderer'
    ]) {
      await assert.rejects(call('SceneStateStorageController', method), /legacy Builder backend/)
    }
    await call('AirdropController', 'openCrate', [
      { title: 'Fixture reward', items: [{ name: 'Fixture item' }] },
      '0x1234',
      '0x' + '1'.repeat(40)
    ])
    await h.tick()
    await h.tick()
    assert(
      h.trace.flatMap((t) => t.messages ?? []).some((m) => m.component === 1052 && m.type === 1),
      'airdrop emits stock UiText'
    )
    assert(!h.trace.some((t) => t.module === '~system/EthereumController'))
    await assert.rejects(
      call('AirdropController', 'openCrate', [{ title: 'bad', items: [] }, '0x1', '0x' + '1'.repeat(40)]),
      /Invalid airdrop transaction/
    )
    const unavailable = () => {
      throw new Error('fixture host unavailable')
    }
    const missingHost = await boot(path.resolve('dist', file), '', {
      rpcOverrides: {
        '~system/UserIdentity': { getUserData: () => ({ data: profile }) },
        '~system/Players': { getPlayerData: () => ({ data: profile }) },
        '~system/SignedFetch': { getHeaders: unavailable },
        '~system/RestrictedActions': { triggerSceneEmote: unavailable },
        '~system/CommunicationsController': { sendBinary: unavailable },
        '~system/EngineApi': {
          subscribe: (request) => {
            if (request.eventId === 'AVATAR_OBSERVABLE') return unavailable()
            return {}
          }
        }
      }
    })
    for (const [module, method, args] of [
      ['SignedFetch', 'getHeaders', [request]],
      ['RestrictedActions', 'triggerSceneEmote', [emote]],
      ['CommunicationsController', 'sendBinary', [binary]]
    ])
      await assert.rejects(missingHost.dcl.callRpc(module, method, args), /fixture host unavailable/)
    assert.equal(await missingHost.dcl.callRpc('SceneStateStorageController', 'getStoredState', []), undefined)
    missingHost.dispose()
    results.push({ file, sha256: h.hash, status: 'PASS' })
    h.dispose()
  }

  fs.writeFileSync('test/module-shims-results.json', JSON.stringify({ status: 'PASS', results }, null, 2) + '\n')
  console.log(`Module shims: ${results.length} bundle cases PASS (Builder rejection is not support)`)
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
