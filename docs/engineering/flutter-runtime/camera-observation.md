# Camera state and observation

Status: implemented, unreleased. Public entry points are described in the
[Flutter README](../../../packages/flutter/README.md). This extends F17 without
changing dataset fields, camera transforms or draw/update completion.

## Public contract

`controller.camera` returns an immutable `PatchMapCameraState`: world `center`,
logical `scale`, clockwise `rotation` in radians, and logical-pixel `viewportSize`.
It reflects applied camera values immediately, not a physical display fence.
It is null when detached, empty, preparing or failed. An inactive ready widget
retains its state. Unchanged reads reuse the snapshot; held snapshots never mutate.

`PatchMapView.onCameraChanged` receives `PatchMapCameraChange` at most once per
submitted map frame. Its `state` is the latest applied snapshot at delivery, and
its immutable `sources` combines all actual changes in the pending interval:
`gesture` (drag, wheel, pinch/rotation), `programmatic` (`setCamera` and
[rotateTo](rotation-animation.md)), `fit`,
`focus`, `replacement` (new-diagram fit), `resize`, and `configuration` (changed
[zoom limits](gesture-options.md)). This is not an ordered
action log. A gesture followed by an app command preserves both causes.
No-op/rejected commands do not contribute; returning to the last notified state
before delivery emits nothing. Subscribing does not replay initial/past state;
read the getter for that. A replacement marks adoption of the new diagram's camera
even if its fit needs no additional transform; equal last-notified state stays quiet.

The existing submitted-frame callback delivers after session completion/ready
notification, outside build/paint. A ready callback may already have applied a
new camera command; the camera notification reports those latest applied values,
not necessarily the transform in the just-submitted display list. It is not an
animation-end or raster-completion notification. Reentrant commands from the
camera callback are notified on a subsequent frame. Callback exceptions use the
existing host-error boundary and cannot break session/resource cleanup.

Accepted replacement resets rotation to zero and discards pending old-diagram causes. Invalid replacement
preserves them. If ready notification accepts another replacement, the prior
generation cannot emit a camera callback. Inactivity defers pending notification;
resume delivers the latest state if it differs. Removing the callback clears its
pending history. Widget removal drops observation entirely; controller reattach
starts an empty session. No sensor, heading-tracking or business policy is added.

## Ownership and cost

`MapCamera` remains the sole transform authority. Commit invalidates its lazy
snapshot and, only when observed, combines one source bit. It does not allocate
an event, source set or state per pointer input. `takeChange()` materializes these
only for a changed delivery, clearing pending bits before invoking the host.
The widget configures observation and uses the existing frame coordinator's
submission callback plus `MapSession.notify`; there is no new ticker, timer,
frame callback, map traversal, listener collection or publication authority.
Normal value updates do not notify when camera values remain unchanged.

With no callback, no notification state/source collections are created. Getter
calls may create one cached snapshot until the next camera change. Observation
does not schedule frames; existing accepted camera commands/input/layout own
invalidation, including their existing no-op behavior.

## Compatibility and verification

JS release/1.0 exposes center/scale snapshots and a separate rotation getter,
with `onSettled` after a 100ms quiet period. Main exposes raw viewport events and
`patchmap:rotated`. Flutter deliberately uses one immutable state and frame-based
delivery without that debounce. Angle units remain radians in Flutter.

Focused checks: `test/geometry/camera_test.dart`,
`test/widget/camera_observation_test.dart`, existing frame/input/attachment tests,
and the extracted public consumer. They cover actual gestures, mixed causes,
resize, no-op/coalescing, callback failure/reentry, replacement, inactivity and
removal. Host tests establish notification semantics, not native FPS/CPU gains.

Flutter 3.47.6: 8 observation widget cases and 4 camera cases passed; unchanged
frame/input/attachment cases (7) also passed. Analysis and documentation checks
passed. The extracted consumer passed the exported getter/callback with two
coalesced commands, along with its existing draw/update/assets/lifetime checks.
Evidence: `.artifacts/flutter/camera-{observation-tests,initial-tests,analysis}.log`
and `.artifacts/flutter/installed-consumer-Gj1VN8/report.json`. That artifact
precedes only a camera Dartdoc wording correction; runtime code is unchanged.
Independent review caught the no-op replacement adoption gap; the implementation
and regression test above resolve it. No native performance claim is made.

The public-API `example/integration_test/camera_test.dart` subsequently passed
on SM-S936N, Android 16, Flutter 3.47.6 debug with Impeller Vulkan. Native pixel
readbacks matched independent projection from the reported camera after commands,
drag and two-pointer zoom/rotation. A 100-command burst coalesced; recorded frame
timestamps were unique across deliveries. Reentry, unchanged commands, inactivity,
replacement adoption and removal also passed. No runtime correction was needed;
the native harness uses synchronous assertions inside frame callbacks.
Evidence: `.artifacts/flutter/camera-native-qa-20261026/{device.log,summary.json,cleanup.json}`.
The original phone APK was restored by hash. This functional run does not measure
profile performance or establish iOS qualification.
