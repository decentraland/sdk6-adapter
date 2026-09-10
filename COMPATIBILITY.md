# SDK6 support

The adapter uses stock SDK7. Status applies to each named behavior, not an entire SDK6 class. **FULL** means that translation is implemented; **PARTIAL** identifies an approximation or unsupported guarantee; **WONTFIX** means intentionally unsupported in this adapter. Renderer fidelity and gameplay depend on the host; FULL describes adapter translation. Assets, services, wallets and host event delivery remain dependencies.

[Setup and usage](README.md) · [Licenses and dependencies](NOTICE.md)

## Supported behavior

| Behavior | Status | Scope |
|---|---|---|
| Scene code, entities, components, systems | FULL | Original SDK6 execution; ordered lifecycle, shared resources, parenting and cycle protection. |
| Transform and standard primitive mapping | FULL | Box, plane, sphere, cylinder and cone meshes/colliders; visibility and pointer flags. |
| GLTF, NFT, animation, billboard and TextShape component mapping | FULL | SDK7 component writes and resource references. See visual limitations below. |
| Basic/PBR materials, Texture and AvatarTexture resource lifecycle | FULL | Resource binding, updates and disposal. |
| AvatarShape and AttachToAvatar mapping | FULL | Standard avatar components and anchors. |
| AudioClip, AudioSource, AudioStream | FULL | Playback component translation; audio output depends on the host. |
| SoundController | FULL | Scene-wide play/pause, loop and percentage volume. |
| VideoClip and VideoTexture resource mapping | FULL | VideoPlayer resources, material references and result events. |
| Screen UI component mapping | FULL | Canvas, rectangles, stacks, text, images and input; fullscreen aliases canvas. |
| Pointer callbacks and class-8 handlers | FULL | Entity clicks/hover and legacy global input formats. Ray priority: event hit, primary pointer, camera fallback. A ray without an entity is not a hit. |
| PhysicsCast request/result mapping | FULL | HitFirst/HitAll with correlated results. Capacity and unanswered-query limits below. |
| AvatarModifierArea, CameraModeArea | FULL | Component translation; interaction depends on the host. |
| Initial attached-GLTF readiness barrier | FULL | Ends on completion, failure, removal or a 30-second frame-time timeout. |
| Position, rotation, camera mode, pointer lock | FULL | Polled and translated. |
| SocialController public avatar events | FULL | Identity, profile, world pose, emote and departure from stock components. |
| Host-supplied player/realm/scene/comms events | FULL | Forwarded when delivered by the host. |
| Identity, Players, ParcelIdentity, EnvironmentAPI queries | FULL | Profile/player queries, scene metadata, realm/platform/time. Legacy configuration defaults are listed below. |
| CommunicationsController, SignedFetch | FULL | String/binary messages, signed requests and headers through host APIs. |
| EthereumController, web3 provider | FULL | Async wallet/RPC forwarding, signing and payment requests; requires host capability and authorization. |
| RestrictedActions, UserActionModule, PortableExperiences | FULL | Movement, teleport, emote and portable-experience lifecycle requests through host APIs. |
| Frame-time timers and async fetch/XHR requests | FULL | Timer scheduling and asynchronous networking. Browser API gaps below. |
| WebSocket | FULL | Host capability forwarding; no replacement network implementation. |
| Shipped scene-state reads | FULL | Reads scene-state-definition.json from existing scenes; independent of the retired in-world editor. |
| [CircleShape silhouette and helper lifecycle](docs/class31.md) | FULL | Default discs use a thin cylinder; supported polygons/arcs use 3–128 flattened-cone triangles. Material/flags, pointer hit identity and cleanup propagate. |
| [UIScrollRect clipping, positions and callbacks](docs/class30.md) | FULL | Clipped viewport, programmatic positions, pointer drag/thumbs and callbacks when required pointer/camera data is available. |
| [UIButton standard styling and offset shadow](docs/class41.md) | FULL | SDK7 UI text, background, borders, clicks and crisp offset shadow. |
| [Deprecated Sound playback mapping](docs/class67.md) | FULL | Spatial AudioSource playback. |
| [HighlightEntity primitive bounds marker](docs/class66.md) | FULL | Twelve-edge marker for supported primitive bounds. |

## Separate limitations

| Behavior | Status | Limitation |
|---|---|---|
| Primitive tessellation, arcs, open ends and UV parity | PARTIAL | SDK7 primitive geometry differs from historical meshes. |
| GLTF/NFT/animation/billboard/TextShape visual parity | PARTIAL | Renderer fidelity varies; TextShape visibility is not guaranteed. Legacy skinned colliders may require external [asset repair](docs/collider-skins.md). |
| Material shader, sampling and transparency parity | PARTIAL | Exact shader, sampling and transparency parity is not guaranteed. |
| Avatar wearables and skeleton fidelity | PARTIAL | Depends on client avatar/anchor behavior; exact skeleton and wearable parity is not guaranteed. |
| Video codecs, streaming, seek and playback fidelity | PARTIAL | Codec support, streaming, seek and playback fidelity depend on the host. |
| Screen UI fonts, outlines, autosizing and complex layout | PARTIAL | Historical inset remains; typography and layout differ. |
| UiImage `sizeInPixels` intrinsic texture sizing | PARTIAL | Requires the host's optional `~system/AdaptationLayerHelper.getTextureSize`; where the host does not provide it, the image renders but pixel sizing derived from the texture's natural size is skipped. |
| Event-time and unlocked-cursor pointer rays | PARTIAL | Required data may be unavailable; camera fallback is not equivalent to the original cursor ray. |
| PhysicsCast capacity and unanswered-query cleanup | PARTIAL | At most 1,024 outstanding queries; unanswered queries remain pending until unload. |
| NFT/audio/video and later-asset readiness | PARTIAL | Excluded from the initial GLTF barrier. |
| Talking, mute/block/friendship and actual avatar visibility | PARTIAL | Not supplied by the bridged stock components. |
| Historical social transport UUIDs | PARTIAL | Addresses replace historical transport UUIDs. |
| Independent idle-state events | PARTIAL | No idle-state generation. |
| Historical environment configuration fields | PARTIAL | Some fields use defaults rather than original host configuration. |
| DOM and synchronous XMLHttpRequest | PARTIAL | Not implemented. |
| XHR progress/upload streaming and host cancellation | PARTIAL | Streaming is incomplete; abort may suppress callbacks without cancelling the host request. |
| Builder in-world editor | WONTFIX | Retired feature. Saving, publishing, project management and editor asset registration fail explicitly. |
| [CircleShape exact mesh and collision parity](docs/class31.md) | PARTIAL | Normals, UVs, finite thickness and collisions differ; segments are capped at 128 and degenerate closing triangles are omitted. |
| [UIScrollRect wheel, inertia and complex layout](docs/class30.md) | PARTIAL | Wheel/inertia unsupported; intrinsic layout and scrollbar styling incomplete. |
| [UIScrollRect vertical drag without calibration data](docs/class30.md) | PARTIAL | Waits for sufficient pointer/camera information; locked-pointer deltas do not substitute for screen motion. |
| [UIButton Gaussian shadow blur](docs/class41.md) | PARTIAL | Only crisp offset shadows are implemented. |
| [Deprecated Sound distance model and rolloff](docs/class67.md) | PARTIAL | Exact historical attenuation is unavailable. |
| [HighlightEntity imported/animated mesh overlay](docs/class66.md) | PARTIAL | Not implemented by the primitive bounds marker. |
| Standalone UUID classes 9–13 | PARTIAL | No independent translator; supported class-8 handlers are listed above. |
| Legacy orphan-UI fallback to an existing screen canvas | PARTIAL | Missing-parent children are dropped instead of using the legacy renderer fallback. |
| [UIWorldSpace rendering](docs/class23.md) | WONTFIX | Rejected; no defined world-placement contract. |
| [OBJShape](docs/class55.md) | WONTFIX | Unsupported by scope decision. |
| SmartItem, Gizmos and editor-metadata rendering | WONTFIX | No renderer behavior; smart-item JavaScript can still execute. |
| Airdrop claims | WONTFIX | Does not work. Warning dialog with Close only; no wallet submission. |

No SDK6 API is invented for SDK7-only features. Exact generated geometry can sometimes be supplied as deployment assets; runtime blob/data URLs are not universally loadable. Legacy collider-skin repair is outside the adapter; see [regeneration requirements](docs/collider-skins.md).
