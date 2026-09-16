# Shared brush selection verification

Date: 2026-09-16. Baseline: `909e53fd`; candidate is the commit containing this
report. No release or publication was performed.

## Contract and implementation

The authoritative behavior is [pointer and selection](../../../docs/api/pointer-and-selection.md).
Both packages provide one brush mode shared by longpress and application controls.
The mode is disabled by default; the lab explicitly configures toggle longpress.
Hold restores the prior mode, while explicit mode API calls override restoration.
External selection changes cancel hold with restoration. Live segment selection
preserves off-path IDs and visits each ID once per stroke.

JS extends the existing pointer coordinator and cached region-selection query.
Dart uses its native pointer binding and a lazily constructed per-stroke spatial
index. Neither path installs a per-frame brush traversal or a permanent timer.
Timers, indexes, listeners and pointer ownership have explicit cancellation and
destroy paths. An independent review found lifecycle/eligibility issues; these
were corrected and covered by focused regression tests before completion.

## Executed evidence

- npm: focused brush and coordinator tests, typecheck, lint, build, packed
  ESM/CJS/declarations/examples/capture/lifecycle verification with audit.
- Dart: native pointer tests and analyzer including public compilation probe,
  demo and integration tests. Packed consumer validation passed.
- Shared tooling: typecheck, lint, conformance witness-index tests and documentation
  verification. Public inventory is 882 entries; the added brush bindings have
  explicit npm/Dart witnesses. Static bindings do not claim platform qualification.
- Browser: `node verification/conformance/brush-smoke.mjs`, Chromium headless,
  1360 × 980 host viewport, 480 × 520 map, DPR 1. Actual pointer input on the
  service-derived 50 × (5 × 20) panel scene verified toggle, manual disable then
  longpress reactivation, toggle-off without selection mutation, add/erase,
  unchanged viewport during brush, and rotation by 90 degrees.
- Android: Galaxy S25+ SM-S936N, Android 16, Flutter 3.41.4 profile mode,
  `example/integration_test/brush_selection_test.dart` with the same 5,000-panel
  scene. Actual Flutter touch dispatch verified the same behaviors, including
  the rendered demo's disable button and 90-degree rotation. Initial attempts
  were interrupted while the device was locked; after waking/unlocking, the
  integration test passed. The normal profile demo was then rebuilt for use.
- iOS was not rerun for this change. Native pointer unit tests cover the common
  Dart path; this report does not claim a new iOS device qualification.
- Memory runner: `npm run js:verify:memory` passed 2 warmup + 7 measured lifecycles,
  retained-heap median 226,840 bytes, mount/load/destroy resources released.
  A Vite optional dependency-scan warning about the virtual font module did not
  prevent the actual memory lifecycle run.

Current-run evidence is under ignored `.artifacts/flutter/brush/`; raw outputs
are not release authority. Tests are reproducible from the checked-in runners.

## Performance scope

This is a no-regression feature change governed by
[verification policy](../../../docs/engineering/verification.md). Renderer and
animation scheduling were not changed. The representative input checkpoint is
5,000 service panels with a four-cell stroke, 3 warmups and 9 recorded samples.
Android test-driver `moveTo` completion observations were 6.192–21.681 ms
(median 12.963 ms) in the recorded rotation-capable integration run. These include
harness dispatch overhead, exclude final presentation latency, and have no
pre-feature brush baseline. They are diagnostic observations, **not FPS or a
speedup/regression verdict**. No cross-runtime timing comparison is claimed.
The project memory gate and functional input checks passed; a full renderer
benchmark matrix was not repeated for this input-only feature.
