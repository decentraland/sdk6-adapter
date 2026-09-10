const { boot } = require('./harness.cjs'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict')
const root = __dirname,
  results = []
const wire = (h) => h.trace.filter((x) => x.kind === 'crdt').flatMap((x) => x.messages)
;(async () => {
  const current = JSON.parse(fs.readFileSync(path.join(root, 'results.json'))).reports[0]
  for (const file of current.traceFiles) {
    const reference = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', file)))
    if (!reference.actions?.length || reference.actions.some((a) => a.args.some((v) => v?.callback))) continue
    const h = await boot(path.join(root, '../dist/index.min.js'))
    for (const action of reference.actions) {
      if (action.method === '__incoming') {
        h.incoming.push(Buffer.from(action.args[0], 'base64'))
        continue
      }
      assert(action.outcome && !action.unreplayable, 'Regenerate regression trace: ' + file)
      let outcome
      try {
        const value =
          action.method === '__tick' ? await h.tick(action.args[0]) : await h.dcl[action.method](...action.args)
        outcome = { value: JSON.parse(JSON.stringify(value ?? null)) }
      } catch (error) {
        outcome = { error: String(error) }
      }
      assert.deepEqual(outcome, action.outcome, file + ': ' + action.method)
    }
    assert.deepEqual(wire(h), wire(reference), file)
    results.push({ scenario: file, status: 'IDENTICAL_CRDT' })
  }
  for (const name of ['sdk6-basic', 'sdk6-6.12.4']) {
    const source =
      name === 'sdk6-basic'
        ? fs.readFileSync(path.join(root, 'fixtures/sdk6-basic.js'), 'utf8')
        : fs.readFileSync(path.join(root, 'fixtures/sdk6-6.12.4/package/dist/src/index.js'), 'utf8') +
          '\n' +
          fs.readFileSync(path.join(root, 'synthetic-scene.js'), 'utf8')
    const a = await boot(path.join(root, '../dist/index.js'), source),
      b = await boot(path.join(root, '../dist/index.min.js'), source)
    assert.deepEqual(wire(a), wire(b), name)
    results.push({ scenario: name, status: 'IDENTICAL_CRDT' })
  }
  const reference = JSON.parse(fs.readFileSync(path.join(root, 'results.json'))).reports[0]
  for (const rpc of reference.rpcs) {
    if (!rpc.method) continue
    const h = await boot(path.join(root, '../dist/index.min.js'))
    await h.dcl.loadModule(rpc.module)
    let value, error
    try {
      value = await h.dcl.callRpc(rpc.module, rpc.method, rpc.args)
    } catch (e) {
      error = String(e)
    }
    if (rpc.status === 'ERROR') assert.equal(error, rpc.error)
    else {
      assert.equal(error, undefined)
      assert.deepEqual(
        rpc.method === 'getProvider' ? 'provider object' : JSON.parse(JSON.stringify(value ?? null)),
        rpc.result ?? null
      )
    }
    results.push({ scenario: rpc.module + '.' + rpc.method, status: 'IDENTICAL_RPC' })
  }
  fs.writeFileSync(path.join(root, 'minified-results.json'), JSON.stringify(results, null, 2))
  console.log('Minified parity:', results.length, 'PASS')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
