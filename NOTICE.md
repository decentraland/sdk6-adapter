# Provenance and notices

The adapter is derived from decentraland/sdk6-adaption-layer. See LICENSE for the upstream Apache 2.0 license.

Test fixtures:

- `test/fixtures/sdk6-basic.js`: compiled SDK6 cube scene fixture from the Decentraland explorer test assets. Its bundled notices are retained.
- `test/fixtures/sdk6-6.12.4/package/`: published npm decentraland-ecs@6.12.4 runtime and package license.

Distribution bundles contain third-party SDK/polyfill code and preserved bundled license notices. Exact dependency versions and integrity hashes are in package-lock.json. SDK6 test fixtures are not included in the runtime artifact.

The runtime artifact includes `THIRD_PARTY_NOTICES.txt`, generated from the packages contributing code to the bundle. Identical license texts are shared between packages.

`vendor/sdk-runtime.tgz` contains @dcl/sdk 7.27.0 with its unused @dcl/sdk-commands dependency replaced by the protobuf dependencies the runtime imports. Runtime files and licenses are unchanged. `vendor/sdk-runtime.json` pins the original npm tarball. npm verifies the resulting local archive through package-lock.json.
