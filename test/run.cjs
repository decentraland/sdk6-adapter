const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const suite = ['regression', 'combinations', 'latest-sdk6', 'ui-layout', 'ui-resources', 'xhr', 'security', 'module-shims', 'social-controller', 'sound-controller', 'minified']
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')
function inputs() {
  const files = ['package.json', 'package-lock.json', 'build.cjs', 'package.cjs', '.github/workflows/build.yml', 'test/run.cjs', 'test/verify.cjs', 'assets/glyph-atlas.cjs']
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = dir + '/' + entry.name
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile()) files.push(file)
    }
  }
  walk('src')
  walk('test/fixtures')
  files.push(...fs.readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.cjs')).map(f => 'test/' + f))
  return Object.fromEntries(files.sort().map(file => [file, hash(file)]))
}
module.exports = { suite, inputs, hash }
if (require.main === module) {
  process.chdir(root)
  const requested = process.argv.slice(2)
  const names = requested.length ? [...new Set(requested)] : suite
  const full = !requested.length
  if (full) fs.rmSync('test/run-results.json', { force: true })
  const before = full ? inputs() : null
  const bundles = full ? ['index.js', 'index.min.js'].map(file => ({ file, sha256: hash('dist/' + file) })) : null
  const results = []
  for (const name of names) {
    if (!/^[a-z0-9-]+$/.test(name)) throw Error('Use a test filename without .cjs')
    const result = spawnSync(process.execPath, ['test/' + name + '.cjs'], { cwd: root, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status || 1)
    results.push({ name, status: 'PASS' })
  }
  if (full) {
    fs.writeFileSync('test/run-results.json', JSON.stringify({ inputs: before, artifacts: bundles, results }, null, 2) + '\n')
    console.log(JSON.stringify(require('./verify.cjs')(), null, 2))
  }
}
