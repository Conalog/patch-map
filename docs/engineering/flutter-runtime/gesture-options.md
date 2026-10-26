# Gesture permissions and zoom limits

Status: implemented, unreleased. Configuration belongs to `PatchMapView` and
changes through normal widget rebuilds, without creating another controller.
Public names are exported from `conalog_patch_map.dart`.

```dart
PatchMapView(
  controller: controller,
  gestures: const PatchMapGestureOptions(
    zoomEnabled: true,
    rotationEnabled: true,
    zoomThreshold: .02,
    rotationThresholdDegrees: 10,
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

Touch permissions and thresholds are captured at `onScaleStart` and retained until that gesture
ends. A rebuild affects the next gesture; wheel uses the latest flags. Disabled
wheel input is not registered with Flutter's pointer signal resolver, allowing
an enclosing scroll surface to handle it. Existing pointer/selection detection
and interruption rules are unchanged.

`zoomThreshold` is a relative span change, default .02 (2%): zoom activates at
a span factor of at least 1.02 or at most 0.98. `rotationThresholdDegrees` is in
degrees and defaults to 10; camera commands still use radians. Rotation's default
was raised from the initial 5-degree trial. Thresholds are configurable through
widget rebuilds. Zoom requires a finite value in [0, 1); rotation requires a
finite nonnegative value. Zero disables that axis's threshold and applies the
first input delta immediately from the gesture-start camera. Permissions still
take precedence. Nonzero thresholds change the prior immediate touch behavior.
Each axis activates independently, using the actual crossing sample and current
camera value as its new baseline. The crossing sample, including overshoot, does
not transform that axis. Later zoom uses a ratio to its activation span; rotation
uses the angle difference from its activation angle. Both can then run together.
An activated axis stays active through small changes and reversals until the
recognizer gesture ends/restarts; no repeated dead zone is applied. Pending axes
preserve camera commands. Wheel and two-finger translation remain immediate.
Wrapped input angles are unwrapped before testing the rotation threshold; a tiny
movement across atan2's branch cut cannot falsely activate it. A zero finger span
does not activate zoom or become a divisor. No timer/delay is used.

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
Invalid initial options/limits fail before attachment/resources. Invalid rebuild
values report through Flutter's error handler and retain prior valid settings while the
widget remains mounted; other valid widget properties can still update. A throwing
host error reporter is isolated so it cannot interrupt that rebuild.

## Ownership and verification

The widget validates configuration; `interaction/touch_camera_gesture.dart` captures
permissions/thresholds and adapts
recognizer samples with scalar baselines, without applying or scheduling camera
changes. The existing input coordinator applies its targets. `MapCamera` owns bound values,
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

## Verification evidence — 2026-10-26

The original permissions/bounds and fixed 2%/5-degree implementations passed
their focused host checks and extracted consumers. Records remain under
`.artifacts/flutter/gesture-options-qa-20261026/` and
`.artifacts/flutter/gesture-thresholds-qa-20261026/`. A host AOT scalar probe of the
fixed thresholds added approximately 0.004–0.006 microseconds per update; this
excludes recognition/rendering and is not native frame qualification.

The fixed-threshold profile app launched successfully on SM-S936N and displayed
10,000 panels (`.artifacts/flutter/gesture-thresholds-manual-20261026/`). Earlier
automated native attempts disconnected during installation; native gesture
assertions and subjective feel are not qualified by the startup check.

Configurable thresholds/default 10-degree rotation passed analysis and 51 focused
host tests, including zero thresholds, held-gesture configuration and invalid
initial/rebuild settings. The extracted consumer resolved the new named options
and passed (`.artifacts/flutter/installed-consumer-bu7dSY/report.json`). Current
logs: `.artifacts/flutter/gesture-config-qa-20261026/`.
