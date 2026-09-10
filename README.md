# SDK6 adapter

Runs original SDK6 JavaScript through stock SDK7 components and host APIs. Some features are approximate or unavailable; see [support](COMPATIBILITY.md).

This adapter serves the same purpose as [sdk6-adaption-layer](https://github.com/decentraland/sdk6-adaption-layer): it lets explorer clients render existing SDK6 scenes. It is not intended for scene owners. Scenes are not rebuilt, wrapped or redeployed; an explorer loads the adapter as the scene runtime for any SDK6 scene it encounters.

## Build and test

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run package
```

The [build workflow](.github/workflows/build.yml) uploads the minified runtime, licenses, SHA-256 checksums and build provenance. `release/artifact/` contains the same files locally; CI adds a signed attestation. Source maps and test fixtures stay out of this artifact. Preserve `provenance.json` when embedding the runtime: it identifies the exact source commit and generating Actions run.

## Host integration

Use `dist/index.min.js` as the SDK6 scene's runtime entry point. Preserve the original scene metadata, main bundle and asset paths: the adapter loads that original main itself. Do not overwrite an original asset at the adapter's URL. The host must supply SDK7 rendering and `~system/*` APIs.

For the opt-in legacy UI font atlas a host can supply, see [glyph atlas](docs/glyph-atlas.md).

For rare legacy skinned-collider assets, see [repair requirements](docs/collider-skins.md).
