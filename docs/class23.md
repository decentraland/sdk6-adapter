# UIWorldSpace (23)

World-space UI has no defined placement, size or entity-anchor contract. Class 23 is rejected with one diagnostic per scene.

Children whose parent never became a component follow the legacy renderer's `UIShape` fallback: they render under the scene's first screen-space canvas and are not rendered without one. Once the named parent exists the child moves under it; children of a disposed parent stay hidden until it is created again. `test/ui-orphan.cjs` covers the fallback.

[Compatibility](../COMPATIBILITY.md)
