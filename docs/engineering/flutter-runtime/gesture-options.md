# Gesture permissions and zoom limits

Status: implemented, unreleased. Configuration belongs to `PatchMapView` and
changes through normal widget rebuilds, without creating another controller.
Public names are exported from `conalog_patch_map.dart`.

```dart
PatchMapView(
  controller: controller,
  gestures: const PatchMapGestureOptions(
    zoomEnabled: true,
    rotationEnabled: false,
  ),
  zoomLimits: const PatchMapZoomLimits(minScale: 0.1, maxScale: 8),
);
```

## Contract

Both gesture permissions default to true. `zoomEnabled` gates pinch and wheel
scaling; `rotationEnabled` gates two-finger rotation. Explicit `setCamera`, fit
and focus commands remain available. Translation remains available even with
both flags false; the existing single-pointer `dragMode` still owns pan/range/
paint behavior. Two-finger translation retains the prior camera behavior.

Touch permissions are captured at `onScaleStart` and retained until that gesture
ends. A rebuild affects the next gesture; wheel uses the latest flags. Disabled
wheel input is not registered with Flutter's pointer signal resolver, allowing
an enclosing scroll surface to handle it. Existing pointer/selection detection
and interruption rules are unchanged.

Zoom limits are optional absolute logical scales; either bound may be null.
Provided values must be finite, positive and ordered, with equality allowed.
Camera input itself must still be finite and positive: invalid scale is rejected,
not repaired by a bound. Every accepted scale is limited centrally, including
pinch, wheel, explicit commands, first/replacement fit and later fit calls.
Clamping happens before anchored/padded center calculation. Attempts to keep
zooming past a bound do not move the anchor or accumulate floating-point drift.

An explicit minimum may prevent fit from showing the whole drawing. This is an
opt-in difference from the previous unbounded policy; omitted bounds preserve
that behavior. These values are not device-pixel ratios or relative pinch factors.

Rebuilding with tighter limits immediately clamps the current scale while
preserving world center/rotation. It does not automatically refit. Existing
camera observation reports `configuration` only when values actually change.
Inactivity still defers rendering/notification. Removing limits does not undo
earlier clamping. Numeric/transform validation precedes committing limits and
camera state; unrepresentable transforms are rejected by the existing authority.
Invalid initial limits fail before attachment/resources. Invalid rebuild limits
report through Flutter's error handler and retain prior camera/limits while the
widget remains mounted; other valid widget properties can still update. A throwing
host error reporter is isolated so it cannot interrupt that rebuild.

## Ownership and verification

The widget gates/captures user permissions. `MapCamera` owns the bound values,
validation and limited scale, keeping the same transform/publication authority.
Backend construction installs limits before resource owners are created.
No per-item work, extra timer, ticker, listener collection or frame loop is added.
Existing frame invalidation and [camera observation](camera-observation.md) are reused.

Focused witnesses: `test/widget/gesture_options_test.dart` covers independent
permissions, explicit commands, translation, held-touch rebuild, wheel resolver
ownership, first fit and live bounds. `test/geometry/zoom_limits_test.dart` covers
rotated anchored clamping, asymmetric fit padding, invalid bounds/input and atomic
rejection. Existing camera, frame, input and attachment checks cover defaults.
The extracted public consumer exercises exported options and command clamping;
`example/integration_test/camera_test.dart` includes disabled native pinch/rotation,
bounded commands/fit and independent pixel projection.

## Executed checks — 2026-10-26

Flutter 3.47.6 host analysis passed. The focused camera/geometry/widget/input/frame
suite passed 50 tests. After isolating a throwing host error reporter, all nine
gesture-option tests passed, including the new reporter regression (51 distinct
focused witnesses in total). No performance gain or native frame-time claim is made.

The extracted package consumer passed public option resolution, bounded commands
and its existing draw/update/assets/attachment checks. Its report is
`.artifacts/flutter/installed-consumer-SPxE7t/report.json`; the final reporter guard
was subsequently covered by the focused widget tests.

Android integration built successfully, but SM-S936N disconnected during both
installation attempts, before any test executed. New option behavior is therefore
not yet qualified on a native device. The prior APK was restored and its SHA-256
verified against the backup. Logs and cleanup evidence are under
`.artifacts/flutter/gesture-options-qa-20261026/`.
