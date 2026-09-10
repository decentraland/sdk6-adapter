const fs = require('node:fs')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const validation = require('./test/verify.cjs')()
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const commit = git('rev-parse', 'HEAD')
const dirty = !!git('status', '--porcelain', '--untracked-files=normal')
if (process.env.GITHUB_ACTIONS === 'true' && (dirty || commit !== process.env.GITHUB_SHA))
  throw Error('CI artifacts must be built from the clean workflow commit')
const dir = 'release/artifact'
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })
fs.copyFileSync('dist/index.min.js', `${dir}/sdk6-adapter.min.js`)
for (const file of ['LICENSE', 'NOTICE.md']) fs.copyFileSync(file, `${dir}/${file}`)
const licenses = new Map()
for (const name of Object.keys(require('./dist/bundle-size.json').contributions).filter(name => name !== 'adapter').sort()) {
  const root = `node_modules/${name}`
  const pkg = JSON.parse(fs.readFileSync(`${root}/package.json`))
  const files = fs.readdirSync(root).filter(file => /^(licen[cs]e|notice)(\.(md|txt))?$/i.test(file)).sort()
  if (!files.length && pkg.license !== 'Apache-2.0') throw Error(`Missing license for ${name}`)
  const text = files.length ? files.map(file => fs.readFileSync(`${root}/${file}`, 'utf8')).join('\n') : fs.readFileSync('LICENSE', 'utf8')
  licenses.set(text, [...(licenses.get(text) || []), `${name}@${pkg.version}`])
}
fs.writeFileSync(`${dir}/THIRD_PARTY_NOTICES.txt`, [...licenses].map(([text, names]) => `${names.join(', ')}\n\n${text}`).join('\n\n'))
const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT } = process.env
const runUrl = GITHUB_RUN_ID
  ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT}`
  : null
const provenance = {
  version: validation.version,
  file: 'sdk6-adapter.min.js',
  sha256: hash(`${dir}/sdk6-adapter.min.js`),
  bytes: fs.statSync(`${dir}/sdk6-adapter.min.js`).size,
  source: { repository: GITHUB_REPOSITORY || null, commit, dirty },
  build: { runUrl, workflow: process.env.GITHUB_WORKFLOW_REF || null, node: process.version },
  inputs: { 'package-lock.json': hash('package-lock.json'), 'vendor/sdk-runtime.tgz': hash('vendor/sdk-runtime.tgz') },
  validation
}
fs.writeFileSync(`${dir}/provenance.json`, JSON.stringify(provenance, null, 2) + '\n')
fs.writeFileSync(`${dir}/SHA256SUMS`, fs.readdirSync(dir).sort().map(file => `${hash(`${dir}/${file}`)}  ${file}\n`).join(''))
console.log(JSON.stringify(provenance, null, 2))
