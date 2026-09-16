# Full SDK native bar frame benchmark

The integration target uses only `package:conalog_patch_map/conalog_patch_map.dart`, constructs
`PatchMap.create`, and attaches the real `PatchMapView`. It uses the production
controller, host frame scheduler and Canvas renderer; the native target does not
install a mock surface or manually advance the engine clock. The public
controller's snapshot is inspected only to verify painted first/last bar heights.

The target is
`packages/flutter/example/integration_test/bar_performance_test.dart`; the host
JSON collector is `packages/flutter/example/test_driver/bar_performance_driver.dart`.

## Workload and environment

- 50 and 100 grids, each 4 rows × 25 columns: 5,000 / 10,000 bars.
- Bar geometry: 8×20 item, height
  10 initially, radius 3, 5 grid columns, gaps 2/4, origin spacing 270/110.
- Every bar receives a different integer height in 1…20 on every update. LCG seed
  `0x5eed`, multiplier 1664525, increment 1013904223, uint32 wrap; equal-to-previous
  heights advance once. Input generation is outside timing; a checksum is stored.
- Immediate and animated full `updateBatch` with `recordHistory: false` and zero
  history capacity. Five warmups and 20 measured updates per case, two blocks.
  Block 1 reverses block 0's case order to reduce ordering bias.
- Fixed 360×640 logical map, world center `[675,1100]`, uniform scale `360/1350`
  for every case. All grids fit without changing the camera across counts.
- Actual device DPR is held constant throughout each run. View physical size and
  refresh rate are recorded; layout/DPR changes fail the run. Cross-device
  comparison requires matching these report fields, render mode and revision.
- No capture/readback, forced GC, logging, fake time or tester pump runs inside a
  measured update. Creation, fonts, warmups, teardown and the two-second batched
  FrameTiming flush are outside sample windows.

## Measurements

Each sample records synchronous `commitMs`, `nextPublishedMs`, and
`finalPublishedMs` from command start. A post-frame observer reads the controller's
published revision and first/last geometry height; this small observer overhead
is disclosed in every report. For animation, final latency includes its actual
200ms presentation duration and is not comparable to immediate latency as pure
CPU work.

The engine supplies real FrameTiming build/raster/total-span records. Samples
match `PlatformDispatcher.frameData.frameNumber` to `FrameTiming.frameNumber`
exactly. Engine onBeginFrame timestamps are frame target times, while FrameTiming
vsyncStart is the start signal; treating them as the same instant fails. Empty frame observations fail rather than becoming zero-millisecond
success. Reports include warmup rows separately and measured median/p95/min/max.
First and last painted bar IDs/heights, authored semantic hash preservation and
history exclusion are checked after every update. The test does not infer raster
completion solely from a synchronous command return.

## Controlled invocation

Do not run this concurrently with builds, another benchmark, or interactive UI
validation. Run from `packages/flutter/example`, with a connected device selected
explicitly. The root task owns device setup and execution; creating this harness
does not itself run a benchmark.

```sh
PATCHMAP_BENCH_OUTPUT=/absolute/path/full-sdk-bars-android-profile.json \
flutter drive --profile -d DEVICE_ID \
  --driver=test_driver/bar_performance_driver.dart \
  --target=integration_test/bar_performance_test.dart \
  --dart-define=PATCHMAP_RUN_ID=android-profile \
  --dart-define=PATCHMAP_REVISION=VERIFIED_GIT_REVISION
```

Use `--debug` and a distinct output/run ID for simulator debug evidence. Reports
explicitly label `debug/JIT`, `profile/AOT` or `release/AOT`. Debug/JIT results are
diagnostic; they cannot establish AOT performance equivalence. The harness marks
optimization comparisons eligible only for profile mode with an explicit revision.
Do not combine different modes. npm/Pixi equivalence requires a separate
measurement of the complete browser SDK with matched inputs and viewport; these
Flutter-only measurements cannot establish it.

The integration driver persists report data on failure as well as success. A
successful report must contain `completed: true`, all eight case blocks and 20
non-warmup samples per block; missing or partial output is not a passing result.

The mapping follows [Flutter 3.41.4 Animator](https://github.com/flutter/flutter/blob/3.41.4/engine/src/flutter/shell/common/animator.cc) and [FrameData.frameNumber](https://api.flutter.dev/flutter/dart-ui/FrameData/frameNumber.html).

## Comparing Dart optimizations

Keep correctness fixes on both sides of an optimization comparison. Record the
base commit and a source hash manifest when the candidate is not yet committed.
Run baseline and candidate sequentially on the same booted emulator, preserving
viewport, DPR, inputs, warmups and both reversed-order blocks. Pause other
simulators, builds and tests during measurements.

Report command latency and first/final publication alongside engine timings.
Lower animation build cost does not imply faster synchronous commits or sustained
60 FPS: work outside the engine build interval and gaps between frames remain
observable. Preserve adverse results and all raw samples. The opt-in host
`packages/flutter/test/rendering/bar_pipeline_profile_test.dart` diagnoses commit,
geometry, renderer preparation and animation sampling stages using the production
Dart SDK. Its input helper is package-local test support; there is no independent
geometry implementation or alternative runtime baseline. Protocol version 2
writes `.artifacts/performance/flutter/full-dart-pipeline-*.json`. It cannot
replace this native profile/AOT comparison or establish npm/Pixi performance
equivalence.

Run the CPU diagnostic from `packages/flutter`:

```sh
flutter test --no-pub --concurrency=1 --dart-define=PATCHMAP_PROFILE=true \
  test/rendering/bar_pipeline_profile_test.dart
```

The separate `integration_test/height_animation_test.dart` validates real native
intermediate publications after idle and after retargeting. Run it using
`test_driver/native_contract_driver.dart` and `PATCHMAP_CONTRACT_OUTPUT` on Android
and iOS; captures happen outside its frame observations. It is a correctness
check, not a performance measurement.

## Service panel text updates

The current demo checkpoint uses `conformance/scenes/panel-groups.json`: 50 panel
groups × 5 rows × 20 columns, including panel backgrounds, borders, padding,
full-height bars and visible autoFont text. Both runners submit all 5,000 targets
in one synchronous `updateBatch`, with history disabled. They use 5 warmups and
20 measured samples, seed `0x5eed` and the LCG above, with strings in 1…9999.
Unlike the interactive button, these runners allow a generated value to equal
its previous value. Inputs are generated outside timing, with 100 ms between
samples. Do not run the two runners or other builds concurrently.

From `packages/flutter/example`:

```sh
PATCHMAP_CONTRACT_OUTPUT=/absolute/path/panel-text-native.json \
flutter drive --profile -d DEVICE_ID \
  --driver=test_driver/native_contract_driver.dart \
  --target=integration_test/panel_text_performance_test.dart \
  --dart-define=PATCHMAP_REVISION=VERIFIED_GIT_REVISION
```

This mounts the actual `BarDemoApp` and switches to text mode. `commitMs` measures
the synchronous command; `publishedMs` waits for a post-frame observation of the
new published interaction revision. It is not a GPU completion timestamp.
Engine build/raster timings are recorded separately by frame number. A passing
report has `panelText.completed: true` and 25 rows, including warmups, and verifies
the count and first/last text values after each update. Preserve device, mode,
viewport and DPR between baseline and candidate. Keep the device awake throughout
both runs and restore any changed device preference afterward.

For web, start the existing conformance Vite server, then run from repository root:

```sh
node verification/conformance/panel-performance.mjs \
  .artifacts/performance/panel-text-web.json
```

The web runner opens the real `panels.html` demo in headless Chromium at 1100×900,
DPR 1. It records the browser version, source diff hash, scene hash and viewport.
`twoRafMs` measures command start through two subsequent RAF opportunities; it is
a browser scheduling proxy, not native publication or GPU completion. Compare
baseline/candidate within each runner. Different surfaces and milestones do not
establish npm versus Dart speed equivalence or sustained 60 FPS.

Keep raw samples and the baseline commit/candidate source manifest in ignored
`.artifacts/performance/`, including neutral or adverse experiments. The text
optimization preserves atomic updates and uses the general transaction/geometry
path when incremental projection is unsafe. Validate null restoration, refusal,
target aliases, text bounds, Unicode, resource disposal and incremental/full
render equivalence with the focused engine, geometry and renderer tests.
