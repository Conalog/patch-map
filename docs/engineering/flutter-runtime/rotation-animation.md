# Commanded camera rotation

This extends F17/F32 with `controller.rotateTo(radians)` and widget configuration
`PatchMapRotationAnimationOptions`. Public setup is in the
[package README](../../../packages/flutter/README.md). Existing setCamera, gesture,
selection and data-update contracts remain unchanged. Sensors, heading tracking
and plant-north interpretation remain host responsibilities.

## Contract

- Default command travel is enabled, 180ms cubic ease-out, shortest orientation
  path; an equal half-turn travels clockwise. Center and scale remain fixed.
  Intermediate angles are unwrapped from the applied start; the last sample
  stores the exact requested angle. Equivalent orientations apply immediately.
- `enabled: false` or zero duration makes rotateTo immediate. Negative durations
  reject initial setup before attachment. Invalid rebuild options report through
  Flutter and preserve the last valid configuration. Disabling active travel
  applies its target immediately; duration changes affect subsequent commands.
- A new valid command retargets from the last applied angle without a jump.
  Duration starts at the first actual animation frame, not a stale queued vsync.
  Finite angles and a representable target transform are required. If the current
  unwrapped angle cannot represent the travel delta, normalize it with setCamera.
- New pointer-down or handled wheel input interrupts. Accepted setCamera,
  focus/fit (including no-op commands), actual zoom-limit clamping, accepted
  replacement, inactivity, failure and removal cancel at the applied angle.
  Invalid commands/replacements preserve travel. Resume never replays it.
  Resize alone preserves travel and existing world-center/scale/rotation rules.
- Like other synchronous camera commands, the result acknowledges acceptance,
  not submission or animation completion. Existing onCameraChanged delivery
  reports programmatic changes once per submitted map frame. Value update
  completion still confirms the relevant drawing submission independently of
  camera/bar-animation completion. No additional completion callback is added.
- This is viewport navigation. Only bars retain data-schema-driven animation;
  gesture rotation and immediate setCamera never acquire implicit easing.

## Ownership and cost

MapCamera remains the only transform authority. It owns configuration and one
optional scalar `RotationTransition`. The transition computes elapsed-time samples
without a timer, ticker, listener, copied camera or scheduler. Camera mutations
validate before cancelling existing travel. Widget composition cancels on input;
backend lifecycle cancels on hide/inactivity/close.

The backend's existing onFrame advances both bars and rotation without short
circuiting either. FrameCoordinator remains the sole scheduler and stops when
both finish. Idle rotation is one null check; active rotation uses ordinary camera
matrix updates and viewport paint, with no dataset traversal or resource admission.
Resource/LOD work caused by the changed view follows the existing renderer.

## Focused verification

- `test/geometry/rotation_animation_test.dart`: deterministic timing/easing,
  wrap/half-turn/exact target, retarget and validation, live policy changes,
  interruption, resize, simultaneous bar progression and backend lifecycle.
- `test/widget/rotation_animation_test.dart`: public configuration/commands,
  actual frame progression, observation, value submission during travel,
  touch/wheel cancellation, inactivity/replacement/removal, natural completion
  with no remaining scheduled frame and invalid-rebuild recovery.
- Existing camera/zoom-limit/observation/frame tests preserve prior defaults.
- The extracted installed consumer exercises exported options and immediate-off
  rotation without changing selection or values.

Flutter 3.47.6: 27 focused cases passed. The four widget cases also passed after
adding pixel comparison against immediate rotation and invalid-initial-setup
checks. Analysis, formatting and documentation checks passed. The extracted
consumer passed both bundled-asset and public-runtime scenarios; evidence is
`.artifacts/flutter/installed-consumer-w9AKJE/report.json`.
These host checks establish behavior, not Android/iOS frame-rate qualification.
