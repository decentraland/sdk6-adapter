# Deprecated Sound (67)

Maps source, playing, volume and loop to spatial AudioSource. Defaults are playing=true, volume=1 and loop=false. Loop is captured when the source changes or the component is reattached. Removal deletes AudioSource.

Ordinary updates avoid seeking. Later component updates can replay a finished clip when renderer feedback permits it; missing, delayed or stale feedback can prevent exact replay behavior. Idle ticks do not poll playback.

Distance model and rolloff are unsupported. Adding adapter attenuation would apply gain on top of the renderer’s attenuation; global playback would lose spatial positioning.

[Compatibility](../COMPATIBILITY.md)
