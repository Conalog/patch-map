# Full SDK native bar frame benchmark

The integration target uses only `package:patch_map/patch_map.dart`, constructs
`PatchMap.create`, and attaches the real `PatchMapView`. It does not import the
geometry-only benchmark, install a mock surface, manually advance the engine
clock, or call renderer internals. The public controller's snapshot is inspected
only to verify painted first/last bar heights.

The target is
`packages/patch_map/example/integration_test/bar_performance_test.dart`; the host
JSON collector is `packages/patch_map/example/test_driver/bar_performance_driver.dart`.

## Workload and environment

- 50 and 100 grids, each 4 rows × 25 columns: 5,000 / 10,000 bars.
- The same original bar geometry as the earlier mobile slice: 8×20 item, height
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
validation. Run from `packages/patch_map/example`, with a connected device selected
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
Do not combine different modes or compare this complete SDK frame measurement as
though it were the earlier geometry-only bridge benchmark.

The integration driver persists report data on failure as well as success. A
successful report must contain `completed: true`, all eight case blocks and 20
non-warmup samples per block; missing or partial output is not a passing result.

The mapping follows [Flutter 3.41.4 Animator](https://github.com/flutter/flutter/blob/3.41.4/engine/src/flutter/shell/common/animator.cc) and [FrameData.frameNumber](https://api.flutter.dev/flutter/dart-ui/FrameData/frameNumber.html).
