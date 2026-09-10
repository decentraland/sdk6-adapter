const esbuild = require('esbuild')
const fs = require('node:fs')
const crypto = require('node:crypto')
const outdir = 'dist'
;(async () => {
  for (const minify of [false, true]) {
    const result = await esbuild.build({
      entryPoints: ['src/index.ts'],
      bundle: true,
      format: 'cjs',
      platform: 'browser',
      target: 'es2020',
      external: ['~system/*'],
      alias: { '~sdk/all-composites': './src/empty-composites.ts' },
      minify,
      metafile: minify,
      sourcemap: 'external',
      outfile: `${outdir}/index${minify ? '.min' : ''}.js`
    })
    if (minify) {
      const contributions = {}
      for (const output of Object.values(result.metafile.outputs)) {
        for (const [file, input] of Object.entries(output.inputs)) {
          const dependency = file.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
          const name = dependency ? dependency[1] : 'adapter'
          contributions[name] = (contributions[name] || 0) + input.bytesInOutput
        }
      }
      const data = fs.readFileSync(outdir + '/index.min.js')
      fs.writeFileSync(
        outdir + '/bundle-size.json',
        JSON.stringify(
          {
            sha256: crypto.createHash('sha256').update(data).digest('hex'),
            bytes: data.length,
            contributions: Object.fromEntries(Object.entries(contributions).sort((a, b) => b[1] - a[1]))
          },
          null,
          2
        ) + '\n'
      )
    }
  }
  const artifacts = ['index.js', 'index.min.js'].map((file) => ({
    file,
    sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(`${outdir}/${file}`))
      .digest('hex')
  }))
  fs.writeFileSync(
    outdir + '/manifest.json',
    JSON.stringify({ name: 'sdk6-adapter', version: require('./package.json').version, artifacts }, null, 2) + '\n'
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
