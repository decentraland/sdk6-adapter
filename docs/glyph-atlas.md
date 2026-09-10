# Glyph atlas

An opt-in path renders default-font UIText as stock SDK7 image quads, using archived legacy glyph metrics and a prepared coverage atlas. Changing strings are supported; unchanged labels reuse their UI elements and emit no CRDT updates.

The atlas is supplied by the explorer client, never by scenes. Deployed SDK6 scenes are not modified. The adapter reads `sdk6Adapter.glyphAtlases` from the `scene.json` the host serves through `~system/Runtime.readFile`. A host that wants this path adds that array to the scene metadata it hands the adapter and serves the atlas texture at each entry's `source`, which the adapter uses as the UiBackground texture `src`. Without the metadata, UIText uses the ordinary SDK7 text path.

## Prepare an atlas

With the repository dependencies installed, generate an atlas from extracted legacy font data (`font.json` with its sibling `atlas-sdf.png`):

```sh
node assets/glyph-atlas.cjs FONT_JSON NEW_OUTPUT_DIR TEXTURE_SOURCE 16
```

`atlas.png` is the texture to serve at `TEXTURE_SOURCE`. `atlas.json` is the object to place in `sdk6Adapter.glyphAtlases`.

Atlas selection uses font size multiplied by canvas zoom. Prepare separate entries for other screen sizes. Explicit font resources, uncovered characters, tabs and rich-text markup continue through the existing text path.

UIText preserves its computed parent dimensions when a plain rectangle parent alone is resized. A text update refreshes its UI subtree; stack and scroll-container refreshes also invalidate the cached dimensions. This matches the observed SDK6 update behavior and applies to both atlas and native text.

Validation covers the normal default font at 16 screen pixels. Other typography, fallback fonts, autosizing, layout and interactions still require implementation or validation; this path does not certify a supported scene.
