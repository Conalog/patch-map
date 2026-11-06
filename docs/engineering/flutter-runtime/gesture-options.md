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
    longPressDuration: Duration(milliseconds: 300),
  ),
  zoomLimits: const PatchMapZoomLimits(minScale: 0.1, maxScale: 8),
);
```

## Contract

Long press defaults to 300ms, replacing this surface's implicit Flutter 500ms default.
`longPressDuration` must be nonnegative; zero recognizes on the next timer turn.
Flutter captures the duration on primary pointer down; a rebuild affects the next
press without restarting the current arena. Flutter owns movement rejection,
cancellation and disposal; input epochs still suppress stale callbacks on replacement/inactivity.
The host chooses actions, including switching the held pointer's drag to range/paint.
The map rejects a pending hold in the arena on second-pointer down, allowing slow pinch.
It tracks until all pointers end; remaining fingers cannot rearm. Recognized holds retain their lifecycle.

Both gesture permissions default to true. `zoomEnabled` gates pinch, wheel and
[one-finger zoom](double-tap-drag-zoom.md); `rotationEnabled` gates two-finger rotation. Explicit `setCamera`, fit
and focus commands remain available. Translation remains available even with
both flags false; the existing single-pointer `dragMode` still owns pan/range/
paint behavior. Two-finger translation retains the prior camera behavior.

Touch permissions and thresholds are captured at `onScaleStart` and retained until that gesture
ends. A rebuild affects the next gesture; wheel uses the latest flags. Disabled
wheel input is not registered with Flutter's pointer signal resolver, allowing
an enclosing scroll surface to handle it. Existing pointer/selection detection
and interruption rules are unchanged.

Touch defaults are `zoomThreshold: .02` (2% relative span change) and
`rotationThresholdDegrees: 15`. If rotation activated in an earlier input sample,
pending zoom uses `zoomThresholdAfterRotation: .05` (5%). If zoom activated first,
pending rotation uses `rotationThresholdAfterZoomDegrees: 25`. Each follow-on
threshold is the maximum of its configured value and the base, so it never lowers
a custom base. Span/angle thresholds stay relative to this recognizer gesture's
start, without resetting accumulated input when the other axis activates.
This replaces the prior 2%/10-degree policy, which ignored activation order.

Both axes evaluate the same pre-sample activation state: simultaneous base
crossings start both, with no call-order preference. A disabled axis cannot
suppress the other. An active axis remains active through reversals or the other
axis starting; a new recognizer gesture resets both histories. There is no timer.
Zoom thresholds require finite values in [0, 1); rotation thresholds require
finite nonnegative degrees. A zero base stays immediate regardless of follow-on
settings, applying deltas from the gesture-start camera. Neutral zero-threshold
input does not mark that axis active or raise the other axis's threshold.

With nonzero thresholds, each crossing sample and current camera value become
that axis's new baseline. The entire crossing sample, including overshoot, is
discarded. Later zoom uses a ratio to the activation span. Rotation uses finger
travel from activation and rebases onto the current angle after external
rotation. Wheel and two-finger translation remain immediate.
Wrapped angles are unwrapped before threshold checks; an atan2 branch cut cannot
falsely activate rotation. Invalid samples cannot activate an axis or poison its
baseline, and a zero finger span cannot become a divisor.

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

The widget validates configuration. `interaction/touch_camera_gesture.dart` adapts
recognizer samples using captured thresholds/scalar baselines; the input coordinator applies targets.
`MapCamera` owns limits and clamping; backend construction installs limits before resources.
`widget/map_gesture_detector.dart` wires the Flutter gesture arena and updates
the hold deadline without replacing an active recognizer. Its semantics
delegate preserves the surface's existing tap and long-press actions.
No per-item work, extra timer, ticker, listener collection or frame loop is added.
Existing invalidation and [camera observation](camera-observation.md) are reused.

`test/widget/gesture_options_test.dart` covers permissions, commands, translation,
held-touch rebuilds, wheel resolution, first fit and live bounds. `test/geometry/zoom_limits_test.dart`
covers rotated anchored clamping, asymmetric padding and atomic rejection. Input/attachment tests cover defaults.
The extracted consumer exercises exported options/clamping; `example/integration_test/camera_test.dart`
covers disabled native pinch/rotation, bounded commands/fit and independent pixel projection.

`test/widget/long_press_options_test.dart` covers default/custom/zero duration, invalid options,
rebuilds, paint switching, movement/cancel/replacement/inactivity/removal, taps, slow pinch
across the hold deadline with an update, remaining fingers and subsequent 300ms holds.

## Verification evidence

2026-11-02: 34 widget tests and SM-S936N profile checks passed: three 10k-update pinches,
hold/paint selection and hold during update. Evidence: `.artifacts/performance/flutter/pinch-longpress-fix-20261102/`.

2026-10-27: analysis, 36 focused tests and extracted-consumer checks passed (`.artifacts/flutter/gesture-priority-qa-20261027/`; prior: `.artifacts/flutter/gesture-config-qa-20261026/`).
Matched host AOT added 0.00035–0.00123µs/sample for the adapter only, not native frames or feel. No physical device was connected for that checkpoint.
