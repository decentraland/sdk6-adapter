# CircleShape (31)

Default discs use one thin cylinder. Polygons and arcs use flattened-cone triangles, with material, visibility, collision flags and pointer identity propagated to each helper. Removing the shape removes its helpers.

Segments are limited to 3–128; zero selects 64. Arc interpretation preserves SDK6 conventions. Degenerate closing triangles are omitted.

Normals, UVs, thickness and collisions differ from a flat disc. Fans can show texture seams and cost more geometry than a single mesh. Prefer default discs or provisioned GLB assets when exact geometry matters.

[Compatibility](../COMPATIBILITY.md)
