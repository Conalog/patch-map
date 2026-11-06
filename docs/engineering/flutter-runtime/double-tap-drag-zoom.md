# Double-tap drag zoom

`doubleTapDragZoomEnabled` defaults to false. It requires `zoomEnabled` and
`PatchMapDragMode.pan`. Both contacts must be primary touches. The first tap
must complete and the second down must qualify for a normal double tap. For
zoom the two down positions must also be within 18 local logical pixels.
The first move beyond the normal drag slop chooses zoom when the vertical
displacement is at least 1.5 times the horizontal displacement. Otherwise
that drag continues as pan. The eligible second contact skips long-press
recognition and can still zoom after a wait. Releasing without dragging
emits `doubleTap` if the second contact lasted less than 300ms. A longer
stationary release emits no classified tap or hold. The existing time window
between the first up and second down still applies. Long presses outside
the zoom candidate follow the configured duration.

Zoom preserves the viewport's world center and rotation.
The activation sample sets the baseline. After that, 160 logical pixels
down doubles scale and 160 up halves it, subject to zoom limits. Reversing
at a limit responds to the next move. Zoom uses the existing frame and
camera observation path. The first `down`/`up` and second `down` still
publish; a claimed zoom consumes the remaining touch without classified tap,
hold or drag events. The up sample does not apply another camera delta.

An additional finger while zoom is pending starts the ordinary pinch path.
When another finger joins a claimed zoom, the first valid two-finger
sample sets the pinch baseline at the current camera. The remaining finger
cannot resume zoom or pan after either finger lifts. Later changes to the
finger count use the ordinary pinch baseline. Turning the option or
zoom permission off, switching away from pan, resizing, replacing the
diagram or accepting a command that changes center/scale interrupts zoom.
Pointer cancellation and inactivity retire the touch. Ordinary pinch
continues to use its existing permissions and thresholds.

## Ownership and verification

The double-tap recognizer keeps Flutter's timing and supplies the actual
pointer pair to the input coordinator. The scale recognizer takes ownership
of the second pointer so it remains tracked for pinch. The coordinator reuses
the camera's scale change and existing frame invalidation.
Zoom adds no per-item work, timer, ticker or frame loop.

`test/widget/double_tap_drag_zoom_test.dart` covers centered zoom and clamping,
tap/hold/pan behavior, input modes, stale pairs and both pinch release orders.
