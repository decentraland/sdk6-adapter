# UIScrollRect (30)

Supports clipping, normalized positions, content dragging, draggable thumbs and change callbacks. Vertical position runs from 0 at the bottom to 1 at the top. Axis flags control dragging; explicit positions still apply. Only user movement emits change callbacks.

Vertical dragging needs pointer rays and camera data to determine screen direction. It waits when that information is missing; locked-pointer deltas are not used as screen movement.

Wheel input and inertia are unsupported. Intrinsic sizing, complex layout and scrollbar styling are incomplete.

[Compatibility](../COMPATIBILITY.md)
