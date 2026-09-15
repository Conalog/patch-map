# Direct Canvas versus optimized Flame

Explicit renderer reevaluation requested by the user. Flame 1.38.2 is pinned as
an example-only development dependency; shipping packages remain unchanged.

## Design

The user clarified that schema compatibility is required, while all Dart internals
may change for performance. Keeping the old controller in every candidate would
artificially retain its bottleneck. The revised variants are:

- A: shipping `PatchMapView`, controller and Canvas renderer, unchanged.
- B: schema compiled once into dense numeric columns; direct CustomPainter host
  with retained `Canvas.drawRawAtlas` buffers.
- C: identical dense columns, atlas, text cache and culling; FlameGame host with
  Flame 1.38.2 `SpriteBatch(useAtlas: true)` retained handles.
- D (supplemental control): FlameGame/Camera host with B's raw buffers and Picture
  adapter. This allows the best measured low-level path inside Flame itself.

A→B measures the architecture and host-service change. The stock host also owns
input, focus, accessibility and publication services absent from this experiment.
B→C compares optimized implementations,
including their host costs; do not attribute the shared gain to Flame. Prebound
column updates are a different API from the stock string-target transaction and
this must be disclosed. All values validate before writes. Offscreen retargeting
samples the correct 200ms cubic curve at command time. Group-visible bar sampling (100 bars per intersecting group) and
lazy panel-visible semantic text layout preserve stored values and first re-entry correctness.

The production schema parser compiles the initial scene; neither candidate
reconstructs its geometry object graph per frame. Text uses the same semantic
layout authority with a bounded style/frame/text-keyed cache. No test-input
prebaking. One host clock; idle pauses. No component/effect per panel.

Static backgrounds use retained vector pictures: Canvas Picture versus Flame
Snapshot. A background atlas failed the visual gate and was discarded. Bar atlas
slices preserve radius; heights below twice the radius use vectors. The 4× bar
atlas covers the tested zoom/DPR. The threshold option retains the initial
fit-all vector control; the final primary run enables the qualified atlas at
all scales with `PATCHMAP_FIT_ATLAS=true`. Lane reordering requires disjoint, contained panels. This is
service-panel qualification, not full package/API support. Unsupported features
fail explicitly. Both adapters ultimately use Flutter's rendering engine.

## Measurement

Shared scene: 50 groups × 5 rows × 20 columns. Same logical viewport/DPR at fit-all
and 86% zoom. Cases: immediate height, animated height, text with full bars,
warm text pan/zoom (five repeating positions). A supplemental case changes all
texts with previously unseen values, then enters another group; this measures
uncached text re-entry separately. Seed `0x5eed`, input generation outside timing, no equal consecutive
values. Android profile/AOT: 5 warmups + 20 samples; reverse variant order in a
second block. Add a host-only control if host overhead obscures close backend results. No concurrent build/video/benchmark or forced GC. Cold atlas/setup
time is separate; retain adverse samples. RSS includes the retained schema
controller in both experimental candidates and is not a standalone SDK estimate. Simulator evidence is diagnostic only.

Observe commit, first changed/final publication, animation frame count/gaps and
matched Flutter build/raster times. Exclude idle-frame averages from animation
FPS. Check all 5,000 final semantic values and actual changed renders. Store
source/lock/scene/APK identity and raw results in `.artifacts/performance/flame/`.

Supplemental native checks assert that both hosts stop painting while idle and
resume on mutation, and compare atlas versus vector bars at 86% zoom.

Before timing, compare thin/mid/full bar and numeric/Korean/emoji/empty text
captures at fit/zoom; verify retargeting, offscreen re-entry, teardown and idle.
Capture tolerance: mean absolute RGB error below 3/255 and fewer than 2.5% of pixels with summed RGB error above 96; Flame/raw atlas pixels must match exactly.
clipping, wrong radii, text metrics or paint order are not acceptable shortcuts.
Retain optimizations only when measured gains preserve those invariants. This
does not claim a universal maximum; results can differ by workload.

References: [Flame batching](https://docs.flame-engine.org/latest/flame/rendering/images.html),
[Flame caching](https://docs.flame-engine.org/latest/flame/rendering/layers.html),
[verification policy](../../docs/engineering/verification.md),
[native benchmark](benchmark.md).

## Native qualification and controls

The actual GameWidget/CustomPainter output is captured outside timed samples and
compared to the stock host at fit-all and 86% zoom. Every sample also checks the
host's actual culling rectangle against the requested camera, within 0.01 physical
pixel (Flame's camera matrices use Float32 storage). A prior camera-getter mistake
rendered unrelated regions; those results are retained only as invalid evidence.
The viewport check prevents a blank or partially omitted scene from appearing as
a performance gain. An earlier double-precision camera assertion was corrected
for Float32 roundoff; the image-quality gates were not relaxed.

`renderer_comparison_supplement_test.dart` owns:

- Uncached re-entry: 2 warmups + 10 samples per block, all 5,000 texts get unseen
  values, then the camera enters the last group. Measure the preceding text frame
  and the re-entry frame separately. This prevents lazy work from hiding behind
  a fast synchronous setter.
- Zoom animation: atlas versus vectors for each host, 5 warmups + 20 samples.
  The vector control does not update sprite buffers it never renders.
- Fit-all animation: per-bar vectors versus a bar-only atlas for each host,
  5 warmups + 20 samples. Static backgrounds remain vector pictures in both.
  The atlas candidate passed the same five-height image gate before measurement.
- Idle: each host stops painting for a 250 ms observation, resumes after a camera
  mutation, then stops again. No perpetual ticker is required.

Raw Canvas updates its retained Float32 buffers without intermediate Rect or
RSTransform objects; Flame uses its retained SpriteBatch handles and required
objects. Both use the same numeric slice calculations. Avoid forcing a framework
interface onto another backend when that would prevent its native optimization.

First/final latency ends at the painted frame callback, not a physical display
presentation fence. Actual UI/raster FrameTiming records are joined by frame
number. Animation gaps use observed animation frames only. Primary warm text
inputs are numeric values in 1…9999, so their bounded cache can become warm;
uncached strings have a separate control. Failed async cases stop the matrix and
cannot set the report's completion flag.


## Reproduce

Use the pinned Flutter SDK and one explicitly selected Android device. Build the
primary profile APK from `packages/flutter/example` with
`--target=integration_test/renderer_comparison_test.dart`,
`--target-platform=android-arm64`, `--dart-define=PATCHMAP_FIT_ATLAS=true` and
`--dart-define=PATCHMAP_REVISION=VERIFIED_SOURCE_IDENTITY`. Preserve that APK.
Record SHA-256 hashes in a manifest with `apkSha256` and `files` (repository-relative
source/lock/fixture paths mapped to their hashes). Include all renderer-comparison
sources, both integration targets and their environment helper, driver, shipping
Dart library, shared fixtures, example lockfile and Android activity.

Save the device's brightness, brightness mode and stay-awake settings. Keep the
screen awake and set manual brightness 35 for the entire matrix. Install the APK
once with `adb -s DEVICE_ID install -r /absolute/path/comparison.apk`. Repeated
installation can trigger package verification/background work and is outside the
measurement protocol. The runner verifies the installed APK hash, waits for
thermal status zero and actual HAL SKIN ≤35.5°C, launches a fresh process, attaches
the driver to its VM service, then force-stops that process after each case.

From the repository root:

```sh
python3 verification/flutter/renderer-comparison.py run \
  --device DEVICE_ID --apk /absolute/path/comparison.apk \
  --manifest /absolute/path/sources.json --output /absolute/path/new-run \
  --adb /absolute/path/adb --flutter /absolute/path/flutter

python3 verification/flutter/renderer-comparison.py assemble \
  --output /absolute/path/new-run
```

The runner never overwrites failed evidence. Explicit `--resume` skips only
validated complete cases with the same APK and route. Use a new directory for a new run;
do not silently combine differing APK, install or cache protocols. The 48 fresh
processes cover both views and all four workloads, with stock/Canvas/Flame order
in block zero and reversed order in block one. Each process has five warmups and
20 measured samples. Assembly requires every exact tuple once, all 25 numbered
rows, correct warmup flags, matching metadata/APK, actual frame timings and thermal
zero. It reports median, nearest-rank p95 and adverse maxima, plus each order block.

The supplemental target is `renderer_comparison_supplement_test.dart`. Its runtime
route uses the same `/VARIANT/BLOCK/VIEW/WORKLOAD` layout: `cold-reentry` at zoom
for stock/Canvas/Flame; `animated` at zoom for Canvas/Canvas-vector/Flame/Flame-vector/Flame-raw;
and `fit-animated` at fit for Canvas/Canvas-atlas/Flame/Flame-atlas/Flame-raw. Build one
supplemental APK and preserve its separate hash. Run and assemble it with the
same runner and `--suite supplement` (26 cases). Cold text uses two warmups and ten
samples; other cases use five plus twenty. Native host picture comparisons run in
the unfiltered supplemental target; isolated cases explicitly record that this
cross-host capture phase was skipped and cannot claim it passed independently.

The experiment lives only in example and verification roots, excluded by
`.pubignore`; it introduces no shipping npm/Dart dependency. Restore the regular
interactive demo and temporary device settings after measurement.

## Thermal control

A preliminary run reached Android thermal status MODERATE and is excluded from
final speed conclusions. Final runs lower screen brightness consistently, retain
all original device preferences, and restore them afterward. Before each case
and trial, the harness waits for Android-reported THERMAL_STATUS_NONE; after the
trial it records `thermalAfter` and requires zero. A thermal transition fails the
run rather than deleting an adverse sample. For uncached re-entry the check
brackets the combined text-update/re-entry sequence. Polling and cooldown happen
outside timed windows. The read-only native channel is example-only, registers no
listener, and requires Android 10+ for these measurements.

This controls reported throttling, not CPU/GPU clocks or laboratory temperature.
Normal adaptive refresh behavior is retained. Keep reversed order blocks and
interpret isolated 1–2 ms differences using the repository materiality policy.
See [Android PowerManager thermal status](https://developer.android.com/reference/android/os/PowerManager#getCurrentThermalStatus()).

## Process isolation and incomplete stress evidence

A long shared-process run stopped during Flame fit-text measurement: the thermal
cooldown did not complete, and adb observed the native raster thread consuming
one CPU core during the wait. Native stack capture required root and was not
available. The run also recorded touch and UI-hidden activity. This does not
isolate a Flame defect. An identical fresh-process Flame fit-text case completed
all 25 rows. Preserve the long-run failure; do not label it fixed or use its
incomplete matrix as a complete performance result.

The final comparison uses one already-installed APK and a fresh app process for
each individual case. Runtime `--route=/VARIANT/BLOCK/VIEW/WORKLOAD` selects it;
MaterialApp still uses `/` internally. The earlier eight-cases-per-process and
repeated-install protocols are excluded from the final assembled matrix.

The stock animation completion check requires both the destination value and no
pending transient frame callback from its host. A first-bar epsilon alone could
finish just before the common timeline ended, leaving another bar outside the
strict final-value tolerance. All 5,000 final values remain checked. This is a
benchmark observer correction; production animation/easing is unchanged.

## Text optimization boundary

Both optimized hosts retain the semantic TextPainter path and its bounded caches.
Flame TextPaint uses the same kind of painter cache. SpriteFontRenderer supports
registered glyphs and explicit advances; it does not supply equivalent font
fallback, bidi shaping or autoFont behavior. Its standard text element still draws
one atlas per string, so simply replacing 5,000 paragraphs does not combine 5,000
labels into one draw. A digit atlas with fallback and cross-panel glyph batching
is a possible separate renderer optimization, not an impossibility imposed by the
schema. This experiment does not establish the lowest achievable text cost.
Preserve first cold-update observations alongside warm distributions.

## Flame host with direct batching

The supplemental `flame-raw` candidate keeps FlameGame, CameraComponent and its
on-demand frame lifecycle while using raw atlas buffers and retained Pictures.
It changes both SpriteBatch and Snapshot adapters, so its delta must not be
attributed solely to SpriteBatch object creation. Compare it against Canvas and
Flame atlas candidates in the same supplemental APK. Its report must confirm
`host: flame`, `flameBatch: false`, `atlasBars: true`, `minAtlasScale: 0`.
Both fit and zoom animations run in reversed blocks. Select Flame's best measured
variant; using a lower-level draw path inside Flame is a valid optimization.

## Decision from the qualified Android comparison

The completed primary and supplemental matrices support the compiled numeric
state and retained raw-atlas architecture. During this service-panel bar animation,
direct Canvas and Flame with the raw adapter have equivalent frame costs/cadence;
the Flame host does not require the higher-level SpriteBatch adapter. Keep the
shipping Canvas host as the default; a Flame host is also valid when its camera
or game integration is useful. Flame's raw path had shorter fit-view first-paint
latency in both supplemental blocks; the equivalence does not include every
response metric. This is not evidence that Flame itself is slower.

Full-view text remains over the frame budget with both measured text adapters.
Do not infer full-SDK, iOS or npm performance equivalence from these scene-specific
Android results. Preserve the current-run distributions and unresolved long-process
stress evidence in ignored performance artifacts. Production adoption must retain
schema/feature conformance while allowing Dart-native internals and APIs.
