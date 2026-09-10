# Legacy collider skins

A small number of legacy GLB/glTF assets carry skinned collider nodes: a node whose name contains `_collider` also has a `skin`, sometimes with joints outside the selected scene. Such assets can fail to load or collide correctly. Repairing them is optional preprocessing outside the SDK6 adapter and outside scene deployment; an explorer that wants repaired geometry performs it in its own asset pipeline.

## Regenerate a repair tool

Implement a standalone Node CLI using built-in filesystem, path and crypto modules; the repair core needs about 60 readable lines:

1. Parse `.gltf` as UTF-8 JSON. For `.glb`, validate GLB v2 magic, declared file length, aligned chunk sizes and bounds; require one JSON chunk first.
2. For each node whose string name contains the **case-sensitive** `_collider`, delete its `skin` property if present. Preserve all other node properties, meshes, skins, animations and buffers. Return original bytes if nothing changes.
3. Reserialize changed JSON. For GLB, pad JSON with spaces to a multiple of four, update chunk and total lengths, and preserve every other chunk byte-for-byte. JSON reserialization can turn `-0` into `0`.
4. Accept a scene record with `sceneDir` and `content: [{file, sha256}]`, an output directory and a report path. Require a separate output directory, contained asset paths and verified source hashes. Copy the complete scene first; replace only repaired models in that copy. Report changes and rejected files; preserve rejected files unchanged.
5. Serve repaired models in place of the originals from the explorer's own asset pipeline. Never overwrite content-addressed originals. Rebuild or bypass cached asset bundles; changing the adapter URL alone cannot select repaired assets.

Validate skin removal, unchanged binary chunks, unaffected skinned meshes, idempotence, malformed inputs and path containment. Then check rendering, raycasts and collision in the target explorer; byte-level repair alone does not establish native correctness.

Reference fixture: POAP button, raw CID `bafkreidr2qcyve3glh7ko3qez7e3z5bhzvii462mtw5sdjd6sjyunvewkm`, SHA-256 `71d4058a936659fea76e04cfc9bcf427cd508e7b4c9dbb21a47e927146d49653`, 178,608 bytes. Node 3 is `Button_collider`, skin 0; its joints 0–2 are outside scene 0. Retrieve it from a content store by CID and verify its hash.
