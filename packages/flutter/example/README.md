# PatchMap 10k native experiment

Android/iOS development host consuming `conalog_patch_map` through its public
entry point and local `path: ..` dependency. Runtime integration and device qualification
remain in progress; this app is not a performance qualification result.

For the separate mobile consumer replay, run
`flutter run -t lib/mobile_replay_main.dart -d DEVICE_ID`.
It covers equipment states, filter/memo highlight, selection, date replacement
and sheet focus through the public package API. Captured builder/SVG provenance,
required input mappings and verification limits are documented in the
[mobile replay checkpoint](../../../docs/engineering/flutter-runtime/mobile-replay.md).
Regenerate its fixture with `bun tool/capture_mobile_replay.mjs /path/to/patch-webview`;
this reads that checkout and writes only `assets/mobile_replay.json` here.

For completion synchronization, run `flutter run -t lib/mobile_sync_main.dart -d DEVICE_ID`.
Four buttons exercise normal, partial, superseded and replacement-interrupted
results beside two map-linked app rows. See the
[synchronization checkpoint](../../../docs/engineering/flutter-runtime/mobile-sync.md)
for the real failure inputs, host responsibilities and bounded verification.

Run commands from this directory. Current-run device evidence belongs in the
repository's ignored `.artifacts/performance/flutter/` directory and is tied to
the source and APK hashes recorded there.

```sh
/Users/minholim/devsettings/flutter-3.47.6/bin/flutter pub get
/Users/minholim/devsettings/flutter-3.47.6/bin/flutter analyze --no-pub
/Users/minholim/devsettings/flutter-3.47.6/bin/flutter test --no-pub test
/Users/minholim/devsettings/flutter-3.47.6/bin/flutter run --profile -d DEVICE_ID
```

The grid/random selector now creates 100 ordered panel groups in five columns.
Each group contains one 10×10 grid and one separate 60×70 SVG image using the
package's real `device` builtin. There are exactly 10,000 panel IDs plus 100
device IDs. Group slots are 800×1120 with 64-unit outer insets; panels start at
(96,32), leaving a separate device gutter. Conservative world AABBs, including
panel border outsets, have zero panel, device or group overlaps. Both fixtures
are unrotated and opaque; rotation/overlap coverage belongs to contract tests.

The default seed is `MapWorkload.defaultSeed` (3476). `grid` uses 40×80 panels,
padding 3, gap 4, background radius 6 and border 2. `random` means seeded values
and template variety inside the same ordered groups, never scattered random
coordinates: 8,000 panels use (40×80,padding3), 1,000 use (32×64,padding2), and
1,000 use (52×92,padding3). Every bar has 100% content width, giving one actual
width in grid and three in random. Random uses four bar radii (1–4), five bar
colors, and three coupled background radius/border styles. Grid uses bar radius
3 and the first three colors. The shared palette is `#0c73bf`, `#063559`,
`#636363`, `#2ecc71`, `#e74c3c`; backgrounds are `#636363`.

The app starts in **number** mode. Each button prepares its own scene:

- **number**: a fixed 100% width/height bar with a number on top; updates change
  only the number.
- **bar**: a 100% width bar with no text component; updates change only its
  percentage height (15–90%) and tint, retaining the 200 ms animation.
- **mixed**: a 100% width animated bar and number; updates change height, tint
  and number together.

Pressing a different mode first draws that scene and restores the camera center,
scale and rotation, then measures its update. Scene preparation is outside that
update's `responseMs`. Pressing the current mode only updates values. The metrics
show the current mode. Stress repeats only that mode. Replace and layout changes
prepare the selected mode. `MapWorkload` defaults to `mixed` for callers that
exercise multiple update kinds against one fixture.

Text uses one authored metric style: FiraCode weight 500, centered auto font size
8–14, word wrapping with automatic width, margin 4 and explicit white tint/fill.
Decimal length cycles through 1–6 digits. Public grid JSON has one template per
group, so the first draw shares each group's initial number, color and height
across its 100 cells. Updates address every panel separately and never devices.
Number/bar/mixed sends 10,000/10,000/20,000 updates. Layouts share the same
seed+sequence update streams.

The fixture identifier is `mode-scenes-full-width-v3`. Earlier
`aligned-grid-groups-v2` results used simultaneous text/bar scenes and varied
bar widths, so their timings are not comparable as the same workload.

The source references are the prior standalone experiment's
`integrated-playground3476-optimized-device-20261019/app/lib/main.dart:210–375`,
`app/assets/fixture.json`, and the numeric distribution/text preparation in
`app/lib/plant_text.dart`. Only application JSON and generation rules are reused;
the example imports the package's public entry point and no experimental renderer.
The previous scattered-coordinate random dataset and any measurements from it
are overlap-stress evidence only, not representative layout results. These modes separate number, bar and combined rendering workloads; they do
not claim equivalence to a consumer replay.

Overview fits the drawing; Panel zoom uses absolute scale 0.75 (a 40-unit
panel is 30 logical pixels wide), independent of drawing size. Pan shifts the
camera, and raw drag, wheel and pinch remain available in the map. Tapping an
item tells the package to toggle its selection through the controller.
The manual rotation switch enables/disables the package's 180ms animation.
The −90°/+90° buttons rotate from the current angle; 0° restores the original
orientation. They call public `rotateTo`, with no host animation loop. Switching
off during travel applies the accepted target immediately. Touching the map
interrupts rotation. These controls are omitted from automated benchmarks so
their viewport dimensions remain unchanged.
Manual number/mixed modes hide panel numbers at scale <= 0.45 and show them
above 0.45, matching patch-webview's `detailLodPolicy`. A keyed presentation layer
affects only text drawing; values continue updating while hidden. Camera changes
only change the layer when crossing that boundary. Replacement/reattachment
rebinds its targets. Automated benchmarks keep all text rendered as before.
Stress submits every 250 ms with at most two outstanding measurement windows,
skipping ticks under pressure. Replace creates a new generation. Remove
unmounts the widget; Reconnect attaches the same controller and redraws the
current layout. The host owns generators, controls and selection actions.

## Automated profile workload

```sh
/Users/minholim/devsettings/flutter-3.47.6/bin/flutter run --profile -d DEVICE_ID \
  --dart-define=PATCHMAP_BENCHMARK=true \
  --dart-define=PATCHMAP_WARMUP=2 --dart-define=PATCHMAP_SAMPLES=5 \
  --dart-define=PATCHMAP_CHANGED_PERCENT=100
```

Optional `PATCHMAP_LAYOUT=grid|random`, `PATCHMAP_VIEW=overview|zoom-pan`, and
`PATCHMAP_WORKLOAD=number|bar|mixed` select a focused case; each defaults to `all`.
Unknown filters fail explicitly. These selectors reduce repeated matrix work;
record their values and compare only matching cases.

The sequence waits for a valid viewport and DPR, then runs grid and random.
For each viewport/workload pair, it prepares a matching mode scene before the
update warmup and samples. Preparation records carry separate stage tags.
Automated zoom focuses the same representative central panel before each workload
at absolute scale 0.75, so an odd sample count does not move later workloads into
an aisle; manual Panel zoom retains the current center. Each mode uses alternating
400 ms of camera motion concurrent with each update. For each viewport it runs number, bar and mixed, each with at least two
warmup requests followed by the requested sample count (minimum one). Initial
preparation/replacement, warmup and measurement have separate `stage` tags.
Initial camera settling is separate from sampling; zoom-pan movement overlaps the update and its bar animation. Bars retain 200 ms animation.

`PATCHMAP_CHANGED_PERCENT` accepts 0, 1 or 100 (default). Every call still sends
the full 10,000/20,000 component input; the seeded selected panel subset alone
changes between requests. Warmup first normalizes other values, and 0% must then
return `unchanged`. Benchmark bar values follow a seeded noncolliding revision
sequence so the changed count is exact; manual buttons retain the random bar
sequence described above. Do not compare these new benchmark inputs directly
to earlier 100% runs that used random heights/tints with possible equal values.


`dart:developer` TimelineTask intervals surround each draw/update request.
One ASCII JSON object per log line is prefixed `PATCHMAP_BENCHMARK `. Records
include metadata, sample, raw frame, summary, error and complete. A runner can
preserve raw records without changing the app, for example on Android:

```sh
adb logcat -v brief > patchmap-logcat.txt
# After completion, stop capture and extract the prefixed JSON payloads:
sed -n 's/.*PATCHMAP_BENCHMARK //p' patchmap-logcat.txt > patchmap-results.jsonl
```

`responseMs` measures the call to public draw/updateValues through its Future
completion, which represents runtime submission. Payload generation time is
reported separately as `generationUs`. It does not include animation completion
or physical display presentation. FrameTiming callbacks arrive asynchronously.
Automated samples first wait for preceding frame timings, then capture the engine
frame number and CPU counter before starting the command and concurrent motion.
After response/motion plus a 250 ms tail, the host drains already scheduled
frames and extends the end number if more were submitted during raster work. The engine
reports its final timing batch without another frame; the host waits for that
frame number or a later one (at most 10 seconds for the drain). It does not paint an artificial
pixel or refresh the metrics label between automated samples. A missing timing
marks the sample incomplete and stops the automated run. The frame window may
contain zero frames for an unchanged request. Raw build/raster/total, vsync
timestamps, frame numbers and nearest-rank p95 are retained.
These are whole-app frames, not isolated renderer timings, GPU completion or
exact submission-revision attribution. Measurement requires a stable foreground
surface after startup; a removed/inactive surface can time out. Manual actions
start immediately and may include overlapping host frames; stress windows may
count the same frame more than once. Empty frame windows do not imply zero CPU.

Android-only host telemetry reports process CPU counters and PSS/Graphics/native
heap snapshots through an example-owned platform channel. The ending CPU counter
is read **after selected raster timings arrive**, so a long raster task is not
cut off at the 250 ms tail. Callback delivery may add idle wall time; report CPU
milliseconds separately from elapsed duration. This is process-wide accounting,
not exact request-exclusive CPU. Memory is read after timing delivery, outside
the response stopwatch. Graphics is an Android accounting category, not exact
GPU-only memory. Other platforms return unavailable values. The package runtime
has no telemetry channel.
Each sample records viewport, DPR, camera scale/center, seed and device count.
The metrics area has a fixed height so status text does not resize the map.

First preparation includes resource loading. Warmup is reported separately;
release/profile, device identity, refresh rate and thermal conditions must be
recorded by the runner. Existing standalone baseline artifacts remain separate
and untouched. No speed, memory or rendering-equivalence claim is made here.

Earlier package checkpoints 01–03 used four times the fit scale for zoom-pan;
this was not equivalent to the prior standalone experiment's panel zoom. Keep
those results under their recorded camera conditions; do not compare them as
same-workload optimization evidence against the corrected panel-zoom sequence.

Checkpoint 01–03 and earlier emulator attempts compared scheduler timestamps
with buildStart/vsyncStart. The engine sends a target presentation time to
onBeginFrame, so those timestamps are not interchangeable; the earlier frame
summaries are incomplete evidence. The corrected runner matches shared engine
frame numbers. Compare only runs using this
same measurement rule. The current protocol is `settled-frame-window-v2`.
Its predecessor added a later host fence, repainted status between requests and
closed CPU counters before delayed raster work completed. Keep those earlier
frame/CPU results separate; their response stopwatches remain valid for the
recorded input/camera conditions.
