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

This mounts the service panel template through `PatchMap.create` and
`PatchMapView`. `commitMs` measures
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

## 10,000-panel optimization checkpoint

The panel target accepts `PATCHMAP_COUNT=10000` and `PATCHMAP_CASE=text|icon`.
It mounts the service panel template directly on a fixed 360×640 Canvas, fits
100 grids of 5×20 cells, and enables only the selected component. Icon samples
alternate the bundled `object` and `loading` SVG aliases for every instance;
text samples retain the seeded 1…9999 workload. Five warmups and twenty samples
are retained, including adverse values. Input generation is outside timing.
Asset readiness is measured separately and must finish before the observed
publication. Native frame numbers map to build/raster timings. This measures
warm resource replacement after warmup, not network or first-download latency.

Run on one Android emulator in profile mode, sequentially with no competing
build or benchmark. Record revision, source hashes, APK SHA256, Flutter/Dart,
device properties, viewport and DPR with raw results. Compare baseline/candidates
and repeat the selected final candidate in a fresh app lifecycle. Emulator
evidence is diagnostic, not real-device qualification. Before measurements,
the interactive goal is p95 commit and publication each at most 100 ms; the
60 Hz frame goal is p95 build/raster each at most 16.67 ms. Material, correct
improvements may be retained when goals remain unmet, but the final performance
verdict must report that failure.

Candidate hypotheses, only after a failing baseline: repeated semantic text
layout, native paragraph/cache churn, and icon updates forcing full projection
and resource/render rebuilds. Measure individual candidates first; combine only
independently beneficial changes. Preserve atomic updates, null restoration,
query/hit bounds, paint order, text shaping, asset replacement and cleanup.

The September 2026 experiment detected guest memory pressure after repeated
installs on the default 2 GB Pixel AVD (swap and system-process contention).
Those runs remain diagnostic artifacts. Final comparisons use a cold-started
dedicated 4 GB Pixel 6a API 34 emulator (`PatchMap_10k_Perf_API34`) with explicit
`-gpu host -no-window` and prebuilt profile APKs installed sequentially. This
temporary AVD uses the existing ARM64 Play Store image with `com.android.vending`
disabled and Wi-Fi/cellular data off; no network assets enter this workload.
The user's ordinary AVD settings are unchanged. No compilation runs during
measured updates. Guest RAM/swap and process load must be checked before
accepting repeat measurements. Record the emulator's
graphics adapter at startup: headless `-gpu auto` can select SwiftShader rather
than the host GPU and is a separate environment, not a comparable repeat.

Build each revision/case before starting measurements, using identical profile
and architecture flags. From `packages/flutter/example`:

```sh
flutter build apk --profile --no-pub --target-platform=android-arm64 \
  --target=integration_test/panel_text_performance_test.dart \
  --dart-define=PATCHMAP_COUNT=10000 --dart-define=PATCHMAP_CASE=icon \
  --dart-define=PATCHMAP_REVISION=VERIFIED_SOURCE_ID
# Copy app-profile.apk to a revision/case-specific path, then record its SHA256.
PATCHMAP_CONTRACT_OUTPUT=/absolute/path/panel-icon-native.json \
flutter drive --profile --no-pub -d DEVICE_ID \
  --driver=test_driver/native_contract_driver.dart \
  --target=integration_test/panel_text_performance_test.dart \
  --use-application-binary=/absolute/path/profile.apk
```

The report also records process RSS before warmup, after warmup, after sampling,
and the peak RSS. These are whole-process observations, not isolated cache or
Dart-heap measurements. Keep startup/warmup samples separate from measured
updates. Repeat baseline/candidate in reverse order to expose environment drift.
Use median and nearest-rank p95 (`ceil(0.95 × n) - 1` in a sorted zero-based
array). Match publication frame IDs to engine timings; publication acknowledges
the accepted frame and resource readiness, while raster duration is a separate
measurement and can finish later.

## Rendering-strategy matrix

`PATCHMAP_STRATEGY_SUITE=true` extends the same panel target with eight cases:
text/icon all-target updates in fit and zoom views, text 1% updates in zoom,
warm camera movement, text reentry after an offscreen update, and immediate
bar fit updates. `PATCHMAP_VIEW=zoom` selects zoom for a single text/icon case;
`PATCHMAP_CASE=bar` selects the immediate bar guard. For a single zoom workload,
use `PATCHMAP_ACTION=sparse|camera|reentry` with `PATCHMAP_CASE=text` and
`PATCHMAP_VIEW=zoom`; the default action is `all`. Unsupported tuples are refused.
Suite output is `panelRuns`,
with a fresh controller and 25 rows per case. Single-case output remains
`panelText`. Reentry times the camera change after the text update has settled;
it does not include or hide that update's cost in an all-update metric.

Match both interaction and viewport publication revisions. Require a matching
FrameTiming for every measured frame; report missing records as incomplete,
never as zero. Fit, zoom, partial update and movement are separate workloads.
Full-suite real-device heat can invalidate later cases: use separate prebuilt
case APKs and cooldown when needed, recording thermal samples and restoring
changed screen preferences. Emulator and physical results remain separate.
