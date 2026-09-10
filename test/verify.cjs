const fs = require('node:fs')
const assert = require('node:assert/strict')
const { suite, inputs, hash } = require('./run.cjs')
function verify() {
  const manifest = JSON.parse(fs.readFileSync('dist/manifest.json'))
  const run = JSON.parse(fs.readFileSync('test/run-results.json'))
  assert.deepEqual(run.results.map(r => r.name), suite, 'Run the complete retained suite')
  assert(run.results.every(r => r.status === 'PASS'))
  assert.deepEqual(run.inputs, inputs(), 'Source, fixtures or tests changed: rerun npm test')
  assert.deepEqual(run.artifacts, manifest.artifacts, 'Build changed: rerun npm test')
  for (const artifact of manifest.artifacts) assert.equal(hash('dist/' + artifact.file), artifact.sha256)
  const regression = JSON.parse(fs.readFileSync('test/results.json')).reports[0]
  assert.equal(regression.hash, hash('dist/index.js'))
  assert(regression.tests.length && regression.tests.every(t => t.status === 'PASS'))
  const combinations = JSON.parse(fs.readFileSync('test/combination-results.json'))
  assert.equal(combinations.failures.length, 0)
  const parity = JSON.parse(fs.readFileSync('test/minified-results.json'))
  assert(parity.length && parity.every(t => ['IDENTICAL_CRDT', 'IDENTICAL_RPC'].includes(t.status)))
  const summary = {
    version: manifest.version,
    artifacts: manifest.artifacts,
    status: 'PASS_RETAINED_REGRESSIONS',
    suites: suite.length,
    regressions: regression.tests.length,
    minifiedParity: parity.length,
    scope: 'Core regression suite; excludes broad fuzz, corpus replay and native conformance.',
    native: 'NOT_RUN'
  }
  fs.writeFileSync('test/validation.json', JSON.stringify(summary, null, 2) + '\n')
  return summary
}
module.exports = verify
if (require.main === module) console.log(JSON.stringify(verify(), null, 2))
