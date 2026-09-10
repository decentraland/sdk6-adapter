const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { boot, putWire } = require('./harness.cjs')
const pb = (name) =>
  require(`../node_modules/@dcl/ecs/dist-cjs/components/generated/pb/decentraland/sdk/components/${name}.gen.js`)
const { PBPlayerIdentityData } = pb('player_identity_data')
const { PBAvatarBase } = pb('avatar_base')
const { PBAvatarEquippedData } = pb('avatar_equipped_data')
const { PBAvatarEmoteCommand } = pb('avatar_emote_command')
const plain = (value) => JSON.parse(JSON.stringify(value))
const transform = (position, parent = 0, scale = [1, 1, 1]) => {
  const bytes = Buffer.alloc(44)
  ;[...position, 0, 0, 0, 1, ...scale].forEach((value, i) => bytes.writeFloatLE(value, i * 4))
  bytes.writeUInt32LE(parent, 40)
  return bytes
}
const remove = (entity) => {
  const b = Buffer.alloc(12)
  b.writeUInt32LE(12)
  b.writeUInt32LE(3, 4)
  b.writeUInt32LE(entity, 8)
  return b
}

;(async () => {
  const results = []
  for (const file of ['index.js', 'index.min.js']) {
    let profileCalls = 0,
      resolveLate
    const h = await boot(path.resolve('dist', file), '', {
      metadata: { main: 'game.js', scene: { base: '2,-3', parcels: ['2,-3'] } },
      rpcOverrides: {
        '~system/Players': {
          getPlayerData: ({ userId }) => {
            profileCalls++
            if (userId === 'late')
              return new Promise((resolve) => {
                resolveLate = resolve
              })
            return {
              data: { userId, version: 7, avatar: { snapshots: { face256: 'face.png', body: 'body.png' } } }
            }
          }
        },
        '~system/EngineApi': {
          subscribe: ({ eventId }) => {
            assert.notEqual(eventId, 'AVATAR_OBSERVABLE')
            return {}
          }
        }
      }
    })
    await h.dcl.loadModule('SocialController')
    let timestamp = 1
    const put = (entity, component, message, codec, append = false) => {
      const bytes = putWire(entity, component, codec ? codec.encode(message).finish() : message, timestamp++)
      if (append) bytes.writeUInt32LE(4, 4)
      h.incoming.push(bytes)
    }
    const base = (name) => ({
      name,
      bodyShapeUrn: 'urn:body',
      skinColor: { r: 0.25, g: 0.5, b: 0.75 },
      eyesColor: { r: 0, g: 0, b: 0 },
      hairColor: { r: 1, g: 1, b: 1 }
    })
    const add = (entity, address, name, position) => {
      put(entity, 1089, { address, isGuest: true }, PBPlayerIdentityData)
      put(entity, 1087, base(name), PBAvatarBase)
      put(entity, 1091, { wearableUrns: ['urn:hat'], emoteUrns: [] }, PBAvatarEquippedData)
      put(entity, 1, transform(position))
    }
    const step = async () => {
      await h.tick()
      await h.tick()
      await Promise.resolve()
    }
    const pull = async () =>
      plain(await h.dcl.callRpc('SocialController', 'pullAvatarEvents', [])).events.map((e) => {
        const p = JSON.parse(e.payload)
        assert.equal(e.event, p.type)
        return p
      })
    add(1, 'local', 'Local', [1, 2, 3])
    add(700, 'remote', 'Remote', [4, 5, 6])
    await step()
    let events = await pull()
    assert(events.some((e) => e.type === 'SET_LOCAL_UUID' && e.uuid === 'local'))
    const data = events.filter((e) => e.type === 'USER_DATA' && e.uuid === 'remote').at(-1)
    assert.equal(data.profile.name, 'Remote')
    assert.deepEqual(data.profile.avatar.skinColor, { r: 0.25, g: 0.5, b: 0.75, a: 1 })
    assert.deepEqual(data.profile.avatar.wearables, ['urn:hat'])
    assert.equal(data.profile.hasConnectedWeb3, false)
    assert.equal(data.profile.version, 7)
    assert.deepEqual(events.find((e) => e.type === 'USER_POSE' && e.uuid === 'remote').pose, [
      36,
      5,
      -42,
      0,
      0,
      0,
      1,
      true
    ])
    const count = profileCalls
    for (let i = 0; i < 100; i++) await h.tick()
    assert.deepEqual(await pull(), [])
    assert.equal(profileCalls, count, 'idle ticks must not poll profiles')
    put(701, 1, transform([10, 0, 20], 0, [2, 2, 2]))
    put(700, 1, transform([1, 2, 3], 701))
    await step()
    events = await pull()
    assert.deepEqual(events.find((e) => e.type === 'USER_POSE').pose, [44, 4, -22, 0, 0, 0, 1, false])
    put(700, 1087, base('Renamed'), PBAvatarBase)
    await step()
    events = await pull()
    assert.equal(events.filter((e) => e.type === 'USER_DATA').length, 1)
    assert.equal(events.find((e) => e.type === 'USER_DATA').profile.name, 'Renamed')
    const emote = { emoteUrn: 'wave', loop: false, timestamp: 42 }
    put(700, 1088, emote, PBAvatarEmoteCommand, true)
    await step()
    events = await pull()
    assert.deepEqual(
      events.filter((e) => e.type === 'USER_EXPRESSION'),
      [{ type: 'USER_EXPRESSION', uuid: 'remote', expressionId: 'wave', timestamp: 42 }]
    )
    put(700, 1088, emote, PBAvatarEmoteCommand, true)
    put(700, 1088, { ...emote, timestamp: 43, state: 1 }, PBAvatarEmoteCommand, true)
    await step()
    assert.deepEqual(await pull(), [])
    h.incoming.push(remove(700))
    await step()
    assert.deepEqual(await pull(), [{ type: 'USER_REMOVED', uuid: 'remote' }])
    add(702, 'late', 'Late', [0, 0, 0])
    await step()
    await pull()
    assert(resolveLate)
    h.incoming.push(remove(702))
    await step()
    await pull()
    resolveLate({ data: { userId: 'late', version: 99 } })
    await step()
    assert.deepEqual(await pull(), [], 'late profile must not resurrect a departed avatar')
    assert(!h.trace.some((t) => t.method === 'subscribe' && t.args?.eventId === 'AVATAR_OBSERVABLE'))
    assert(!h.logs.some((l) => l.args.some((a) => a.includes('Invalid SDK6 host event'))))
    // Some hosts dispatch metadata RPCs only after the scene yields its frame.
    // A pending metadata response must never stall updates or invent a zero-offset pose.
    let resolveMetadata
    const delayed = await boot(path.resolve('dist', file), '', {
      getSceneInformation: () =>
        new Promise((resolve) => {
          resolveMetadata = resolve
        })
    })
    await delayed.dcl.loadModule('SocialController')
    delayed.incoming.push(
      putWire(1, 1089, PBPlayerIdentityData.encode({ address: 'deferred', isGuest: true }).finish(), 1)
    )
    delayed.incoming.push(putWire(1, 1, transform([1, 2, 3]), 2))
    let timer
    try {
      await Promise.race([
        delayed.tick(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('metadata RPC blocked scene frame')), 1000)
        })
      ])
    } finally {
      clearTimeout(timer)
    }
    const beforeMetadata = await delayed.dcl.callRpc('SocialController', 'pullAvatarEvents', [])
    assert(!beforeMetadata.events.some((e) => e.event === 'USER_POSE'))
    assert.equal(typeof resolveMetadata, 'function')
    resolveMetadata({
      metadataJson: JSON.stringify({ scene: { base: '2,-3' } }),
      content: [],
      urn: 'fixture',
      baseUrl: ''
    })
    await delayed.tick()
    await delayed.tick()
    const afterMetadata = await delayed.dcl.callRpc('SocialController', 'pullAvatarEvents', [])
    assert.deepEqual(JSON.parse(afterMetadata.events.find((e) => e.event === 'USER_POSE').payload).pose, [
      33,
      2,
      -45,
      0,
      0,
      0,
      1,
      true
    ])
    delayed.dispose()
    results.push({ file, sha256: h.hash, profileCalls, status: 'PASS' })
    h.dispose()
  }

  fs.writeFileSync(
    'test/social-controller-results.json',
    JSON.stringify(
      {
        status: 'PASS',
        scope: 'Stock CRDT identity, appearance, hierarchy, emotes and removal; no injected legacy avatar events',
        results
      },
      null,
      2
    ) + '\n'
  )
  console.log(`Stock SDK7 SocialController: ${results.length} bundle cases PASS`)
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
