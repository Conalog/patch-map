# Mobile bar benchmark protocol (v1)

Experiment only; not a Flutter distribution of the full PatchMap API. Production
npm sources are unmodified. Run artifacts and generated host apps live under
`.artifacts/performance/mobile/` and never enter the published package.

## Scope fixed before timing

- 50 and 100 grids, each 4 rows × 25 columns: 5,000 and 10,000 bars.
- All bars visible. Grid layout, radius 3, width 8, max height 20; 21 vertices
  and 20 triangles per rounded bar, matching the production geometry kernel.
- Immediate full random height replacement and scattered 10% replacement.
  No interpolation/animation controller: one replacement starts on each next
  scheduled frame, measuring repeated-update throughput rather than a 1 Hz feed.
- LCG seed 0x5eed, heights 1..20, each update differs from previous height.
  Identical prepared inputs in Dart and every JS runtime; RNG outside timing.
- Actual imported `writeRoundedBarPositionValues` in JS. Independent Dart port
  implements equivalent axis-aligned output, with float32 vertex oracle checks.
  JS retains its production transform/change-detection branches; Dart specializes
  this fixed fixture. This ranks these implementation paths, not languages or
  equally complete general geometry engines. Rotation/projection/UV conformance
  and costs remain outside this slice.
- This measures the geometry/update-to-frame slice, excluding dataset parsing,
  transactions/history, text, selection and full API conformance. It cannot rank
  complete library architectures. No-op callbacks never count as rendering.
- Compare common JSON transport and each package’s actual buffer API.
  Common transport is a controlled baseline, not every package's optimal path.
  JSF 1.1.0 `arraybuffer-api` uses tagged JSON internally. QuickJS wrappers use
  `JSInvokable` with input/output buffer copies; flutter_js on iOS uses exposed
  JSC bindings to copy output, with JSON input. None is claimed as zero-copy.
- Native Flutter Canvas uses the same indexed triangle buffers for all routes.
  Chunk size 1,000 bars keeps each index inside uint16. No per-bar widgets.

## Sampling and acceptance

- Android arm64 emulator, profile build; iOS simulator debug build (JIT proxy).
  Never pool platform scores or claim either simulator result as physical phone speed.
- Source-built JS engines use `-O3` and `NDEBUG` on both platforms. Verify actual
  Android compiler commands and iOS target settings, not just Flutter's build mode:
  Flutter profile can otherwise select an unoptimized native Debug configuration.
  flutter_js uses its shipped Android binary and system JSC on iOS; those engine
  compiler flags cannot be normalized by the host app. This ranks package paths,
  not pure VM implementations. Preserve default/unoptimized runs as diagnostic only.
- quickjs_engine 0.1.5's iOS pod omitted native sources and failed `jsNewRuntime`
  lookup. This host's Podfile explicitly includes the package's published C/C++
  files and verifies FFI exports. Report this as an integration fix, not an
  unmodified working iOS package. No engine or geometry source was changed.
- Same Flutter version, locked dependencies, logical viewport 360 × 640, native
  device pixel ratio, render backend, USB power state and display for each platform.
- Six alternating blocks per case: Dart→JS / JS→Dart; each variant gets 10 warmups
  then 30 measured updates. No benchmark overlap with builds, tests or downloads.
- Record stage wall time: update including bridge, vertices creation, sum; Flutter
  build/raster/totalSpan frame timings and update-to-postFrame (submission only).
  FrameTiming is not photon latency. Keep raw samples, including adverse outliers.
- Check ALL vertices of every prepared input in a separate differential pass,
  then the last result of each measured block, outside timing;
  tolerance 0.0001 scene units. Nonfinite/missing/wrong vertices invalidate sample.
- Capture OS/SDK/package/source identities, battery/thermal/display state before
  and after each run. Thermal throttling, interruption, incomplete samples or
  correctness failure make the run inconclusive; preserve it and repeat separately.
- Report per-block median and pooled p95 with absolute ms first. A winner needs
  consistent direction across at least 5/6 blocks and >2 ms median improvement;
  smaller differences are neutral. Report 16.67 ms frame budget crossings as an
  additional 60 Hz reference, with actual refresh rate recorded separately.
- Fresh runtime per block, explicit dispose. Initialization and warmup are separate
  from steady state. Do not call warm start a cold application launch measurement.

## Execution

Use Node 22 and the installed Flutter CLI. Set `FLUTTER_BIN` and `ADB_BIN` when
not on PATH. From the repository root, prepare all candidate builds first:

```sh
python3 performance/mobile/build.py jsf
python3 performance/mobile/build.py flutter_js
python3 performance/mobile/build.py quickjs_engine
```

This generates the host app, restores each dependency lock, analyzes Dart, builds
both platforms, and archives each candidate before the next package is loaded.
One native JS package per app avoids conflicting QuickJS library names/symbols.

Run one prebuilt candidate after builds/tests/downloads finish:

```sh
python3 performance/mobile/run.py android jsf --device ANDROID_SERIAL --run-id android-jsf-v1 --build-dir .artifacts/performance/mobile/builds/jsf/v1
python3 performance/mobile/run.py ios jsf --device SIMULATOR_UUID --run-id ios-jsf-v1 --build-dir .artifacts/performance/mobile/builds/jsf/v1
python3 performance/mobile/summarize.py .artifacts/performance/mobile/runs/android-jsf-v1/result.json
```

Repeat with `--attempt 2` to preserve previous artifacts; the embedded run ID
continues to identify the exact prebuilt app. Use a new build `--label` when code
changes. Physical Android targets require authorized USB debugging. App and plugin NDK versions
are pinned to installed 28.2.13676358. The benchmark activity keeps its screen on
without changing global settings. At least 2 GiB free disk space is required.
The runner records environment state and always terminates its benchmark app.

`summarize.py` rejects incomplete runs, failed correctness, missing or reused
frames, nonfinite durations and qualification-only sample counts. After all runs,
generate the combined report without pooling platforms or paired Dart baselines:

```sh
python3 performance/mobile/report.py RUN_ONE/result.json RUN_TWO/result.json
```

This writes `.artifacts/performance/mobile/report.md` and `comparison.csv`;
the latter preserves every metric and each variant's sample/frame-budget counts.

For qualification only, use `prepare.mjs`, then build manually with
`--dart-define=BLOCKS=1 --dart-define=SAMPLES=2` and an explicit `RUN_ID`. This smoke
is not speed evidence. macOS CocoaPods needs UTF-8 locale (set by `build.py`).
