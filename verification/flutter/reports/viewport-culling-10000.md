# Direct viewport culling — 10,000 panels

2026-09-16. **Performance verdict: FAIL. Default-candidate qualification:
INCONCLUSIVE. No rendering candidate is retained.** Direct culling can remove
substantial offscreen drawing work, but this experiment did not establish a
repeatable completion-time improvement without an all-visible regression.
JavaScript production code and the final Dart renderer are unchanged.

This is a historical experiment, not a release performance guarantee. The
[machine-readable record](viewport-culling-10000.json) preserves source/APK
identities, every run's median/p95/maximum/first sample, the 25 update rows with
matched frame timings, RSS, thermal observations and environment records.
Raw files, candidate source snapshots and APKs remain in ignored
`.artifacts/performance/viewport-culling/`; their hashes cannot reconstruct them.

## Contract and environment

Owners: `AGENTS.md`, [verification policy](../../../docs/engineering/verification.md),
[native benchmark](../benchmark.md), and the existing
`panel_text_performance_test.dart` integration target. Baseline production is
`912ca365e6954aca8b453a332ec00168d782297f`, not a culling-disabled candidate.
The predeclared goals remain p95 commit/publication ≤100ms and build/raster
≤16.67ms. Correctness and whole-process memory are separate observations.

The unchanged service fixture supplies 100 grids × 5 rows × 20 columns, a
360×640 map, seed `0x5eed`, five warmups and twenty measured updates. Inputs are
prepared outside timing. Publication requires matching interaction/view revisions
and asset readiness. Every measured frame is matched to native `FrameTiming`.
No measured row is excluded. Median is the upper middle value; p95 is nearest
rank. Publication acknowledges an accepted frame, not GPU completion or FPS.

**The original service text is unclipped.** Its semantic layout rectangle does
not conservatively bound glyph ink, so it remains eager and is not skipped by
these candidates. `PATCHMAP_CLIP_TEXT=true` is a separate supplemental workload
that explicitly sets `overflow: hidden`; its results must not be advertised as
an improvement of the original service text. Shared fixture data is unchanged.

The first stage used a dedicated Pixel6a API34 ARM64 emulator: four cores,
4GiB RAM, host GPU/Impeller OpenGLES,1080×2400,DPR2.625, profile mode. The old
PatchMap iOS demo was found using a host CPU core and stopped during baseline1;
that run is mixed-environment diagnostic evidence. Fresh baseline2/cull1 still
had variable Spotlight/system load and large fit/raster variation. No emulator
speedup qualifies real-device performance, and adverse values are not simply
attributed to host load without evidence.

The physical stage used SM-S936N/Android16,1440×3120,DPR3.75, profile ARM64,
Impeller Vulkan, Flutter3.41.4/Dart3.11.1. All APKs were prebuilt; no emulator,
build or test suite ran concurrently with measured updates. Screen brightness
was90/manual, with USB stayawake during measurement. The gate was SKIN start
≤33°C, maximum≤36°C, thermal status0. Five-second thermal sampling continued
15 seconds after stopping the app to expose delayed readings. Cooldown waits
were bounded at180 seconds. These thresholds were not relaxed after failures.

## Candidates and correctness

| Candidate | Work removed / retained behavior |
| --- | --- |
| A | Attach conservative world-space bounds to existing ordered paint commands; skip draws outside the actual transformed Canvas clip |
| A+B | Additionally prepare clipped native paragraphs only when the command is first admitted in paint |
| A2+B2 | Remove scratch-list allocation from bound transforms; reuse icon transforms; prepare visible clipped text eagerly and defer only definitely-offscreen text |

The renderer still scans commands linearly. No spatial index, semantic update
skipping, text replacement, font substitution or visual LOD is involved. Unknown
bounds fall back to drawing. Dirty bar bounds follow mesh publication. Image
bounds cover only actual images/rasterized icons; unbounded vector Pictures
retain their drawing path. Paint order, readable orientation, semantic/query
bounds, asset readiness and disposal keep their existing owners.

B2's snapshot viewport AABB is only a preparation hint. The actual Canvas clip
alone decides drawing exclusion. Capture or camera changes can expose a lazy
command, which prepares immediately in the same paint. It does not create a
second publication path. Previously visited paragraphs may remain in the
existing cache; memory does not become a strict visible-only working set.

The [Canvas clip API](https://api.flutter.dev/flutter/dart-ui/Canvas/getLocalClipBounds.html)
returns conservative clip bounds; `saveLayer` bounds are not clips. Flutter's
[glyph layout bounds](https://api.flutter.dev/flutter/dart-ui/GlyphInfo/graphemeClusterLayoutBounds.html)
are layout metrics, not glyph-ink bounds. Unclipped text cannot safely use those
bounds as proof that drawing is invisible. A font-family name also does not prove
which font bytes were registered. No heuristic glyph overhang margin was adopted.

Candidate pixel witnesses passed against culling-disabled drawing for:

- Clipped text updates, scale/rotation/reflection and screen-edge strokes.
- Offscreen changes and same-paint capture reentry with a different transform.
- Dirty bar meshes expanding into view.
- Asset refresh, SVG raster/tint output and disposal.
- All-visible dirty text preparation before paint in B2.

Targeted tests and analyze passed. An independent review found no remaining
correctness blocker in the tested candidate. These tests do not establish a
performance benefit. Experimental renderer code and its dedicated tests were
removed after qualification failed; the measured snapshots remain local artifacts.

## Initial results

All latency values below are p95 milliseconds; RSS is whole-process memory after
sampling, not an isolated text cache or Dart-heap measurement.

| Physical workload | Variant | Commit | Publication | Build | Raster | RSS MiB | Thermal |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Clipped text, zoom | Baseline |163.1|242.2|55.5|4.1|520.6|Pass|
| Clipped text, zoom | A |170.4|203.6|1.2|1.3|515.1|Pass|
| Clipped text, zoom | A+B |140.4|172.2|2.6|1.5|367.3|Pass|
| Original icons, zoom | Baseline |65.4|174.0|47.7|3.7|354.0|Pass|
| Original icons, zoom | A |148.3|236.4|0.8|1.1|339.9|Pass|
| Clipped text, fit | Baseline |182.5|336.4|86.1|121.0|1276.0|Fail:37.9°C|
| Clipped text, fit | A+B |185.1|541.1|213.3|184.5|1295.6|Fail:37.7°C|
| Clipped text, fit | A2+B2 |224.6|423.4|102.8|135.4|1269.7|Fail:36.9°C|
| Immediate bars, fit | A+B |39.3|132.5|29.9|41.5|654.1|Fail:37.0°C|

The initial clipped zoom result isolates draw skipping from paragraph deferral:
A reduced publication by38.6ms; A+B by70.0ms. It is a favorable single comparison,
not proof of a universal speedup. It applies to explicitly clipped text only.

The icon result is adverse despite the lower build time. A's first ten measured
commits were97–160ms, the last ten approximately52–66ms; baseline was49–67ms.
All twenty remain included. Neither GC nor temperature was established as its
cause. Removing early measured samples would make the comparison misleading.

The all-visible failures remain in the record. Invalid temperature means they
cannot qualify gains; it does not turn them into evidence of no regression.
B2 recorded lower publication than the first lazy candidate, but all fit runs
failed thermal qualification, so the difference is not an attributed improvement. Further unstarted fit/bar repetitions were stopped after repeated
thermal-envelope failures. Only a bounded fresh zoom text/icon comparison was
continued with the refined source.

## Refined zoom comparison

The candidate-first fresh text pair met the same thermal envelope. It uses the
refined A2+B2 source, so it is not a repeat of the earlier A+B implementation.

| Physical clipped text, zoom | Baseline repeat | A2+B2 |
| --- | ---: | ---: |
| p95 commit |161.3ms|140.9ms|
| p95 publication |243.9ms|170.1ms|
| p95 build |64.6ms|1.1ms|
| p95 raster |4.4ms|1.3ms|
| RSS after sampling |504.8MiB|371.1MiB|
| Maximum SKIN |35.9°C|35.4°C|

Publication improved by 73.8ms in this matched pair. It still misses100ms and
does not solve the unclipped service fixture or qualify the all-visible guard.

| Physical original icons, zoom | Baseline repeat | A2+B2 |
| --- | ---: | ---: |
| p95 commit |67.6ms|143.7ms|
| p95 publication |184.3ms|213.8ms|
| Median publication |146.2ms|151.5ms|
| Maximum publication |191.6ms|226.1ms|
| p95 build |58.5ms|0.9ms|
| p95 raster |4.2ms|1.0ms|
| RSS after sampling |345.7MiB|344.3MiB|
| Maximum SKIN |35.2°C|34.7°C|

Both refined icon runs met the thermal gate. The candidate's p95 completion was
29.5ms slower despite 58ms less frame build time. Commit cost increased, with
slower early measured updates; all rows are retained. Its cause was not isolated,
and the refined candidate is not claimed faster. These observations,
together with unqualified all-visible guards, support removing the candidates.

Across the experiment, 16 fresh app runs covered 37 workloads and 740 measured
updates (plus 185 warmups); each measured update had its native frame timing.
Three emulator runs were diagnostic. Four of 13 native runs failed the thermal
envelope; they remain explicitly labelled.

B without visibility filtering was omitted because deferral needs the visibility
admission decision. The refined eager-text APK was built but not measured after
all-visible qualification failed; no isolated scalar-bound or B2-only speedup is
claimed. Further final fit/bar/reverse repeats were deliberately not run. The
clipped workload extension remains useful; abandoned candidate switches do not.

## Final disposition and remaining bottleneck

The safe decision is to retain the existing renderer. This is **not a finding
that culling is useless**: skipped draws substantially reduce zoom-view frame
build cost. The missing evidence is a qualified overall improvement with no
all-visible regression. Culling also does not remove the synchronous work of
committing all 10,000 values and calculating semantic layout.

A future focused attempt should preserve eager visible preparation, establish
reliable bounds for the actual service's text policy, and qualify both zoom and
all-visible updates. Explicitly clipping labels or showing detailed text only
above a zoom threshold could reduce work, but each changes product behavior and
must be a deliberate shared contract decision. This experiment changes neither.

No npm, iOS or sustained60FPS comparison was made. No claim is made that every
10,000-object update can meet the100ms goal. The retained benchmark extension
labels clipped workloads separately so future comparisons cannot silently change
text semantics to manufacture a gain.

## Retained files and cleanup

Only the benchmark's explicit clipped-fixture option, report and documentation
links remain. All Flutter production source files match the baseline hashes.
Final retained-harness analysis passed. Candidate-only source/tests/flags were
removed; no culling option was added to the public package.

The temporary `PatchMap_Culling` AVD was deleted; existing user AVDs were preserved.
Phone brightness 184, manual mode0, timeout600000 and stayawake0 were restored and
read back. A fresh profile build of the original `lib/main.dart` demo was installed
and its native UI showed `Ready · service`. No cleanup remains pending.
