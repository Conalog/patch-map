# Dart 10,000-panel rendering strategy investigation

2026-09-16. **Performance verdict: FAIL. Candidate qualification: INCONCLUSIVE.**
No new performance candidate is retained. The predeclared p95 targets remain
100 ms for commit/publication and 16.67 ms for build/raster. Existing text/icon
optimizations from `7a543aa4` remain; this investigation does not establish an
additional speedup. JavaScript production code is unchanged.

This is a historical investigation, not a current release performance guarantee.
The [machine-readable record](render-strategies-10000.json) contains every run's
median, p95, maximum, first sample, frame coverage, process RSS, thermal samples,
source manifests and APK/raw-file hashes. Raw files, prototype sources and APKs
remain in ignored `.artifacts/performance/render-strategies/`; their hashes alone
cannot reconstruct those artifacts. No experimental renderer remains in the
package or demo.

## Scope and protocol

Owners: `AGENTS.md`, [verification policy](../../../docs/engineering/verification.md),
[native benchmark](../benchmark.md), and the existing
`packages/flutter/example/integration_test/panel_text_performance_test.dart`.
Baseline is commit `7a543aa4`; all candidates use its production code with the
specified rendering changes. The final source only changes readable-orientation
invalidation, independently of the rejected performance candidates.

The shared service fixture `conformance/scenes/panel-groups.json` supplies 100
grids of 5×20 cells, with a fixed 360×640 map. Each workload has five warmups and
twenty measured updates, seeded text values, and a fresh controller. Input
generation is outside the timed section. First-update cost remains separate.
Fit and zoom workloads are not pooled. The eight workloads are:

- All text replacement in fit and zoom views.
- All icon aliases alternating `object`/`loading`, in fit and zoom views.
- Text replacement for 1% of cells in zoom view.
- Camera movement over already prepared text.
- Camera reentry after an offscreen text update has settled. This measures the
  subsequent camera movement, not the preceding update cost.
- Immediate bar-height replacement in fit view. This is a regression guard with
  a common changing height; it is not the random animated-bar benchmark.

Publication requires matching interaction/view revisions and asset readiness.
Build/raster timings are matched by native frame number. Publication is an
accepted-frame milestone, not proof of GPU completion or sustained FPS. The
final harness refuses completion if any measured frame lacks a timing record;
the earlier atlas run predates that assertion and its three missing records are
explicitly preserved. Report medians use the upper middle sample and p95 uses
nearest rank. Twenty samples do not establish stable extreme-tail estimates.

All APKs were prebuilt outside timed runs; there was one benchmark at a time,
without concurrent builds or test suites. Older core APKs share the same extended
suite harness. Single-action selection and the strict frame-coverage assertion
were added later; their source identities are recorded separately. Prepared
`compiled-text`, `baseline-camera`, and `candidate-camera` APKs were not used for
performance qualification. The final 5,000-panel camera run validates the final harness
functionally and is excluded from performance comparisons.

## What the JavaScript implementation already does

Review used the alpha implementation in this branch, not `main`.

| Technique | JavaScript owner | Dart assessment |
| --- | --- | --- |
| Dirty mesh chunks, retained vertex buffers, viewport culling | `mesh-layer.ts`, `mesh/viewport-culling.ts` | Dirty mesh retention exists; viewport clipping does not skip all Dart command traversal |
| Text visibility chunks, deferred native preparation | `aggregate-text-leaf-lane.ts` | Semantic layout and native paragraph caches exist; offscreen paragraph preparation is not deferred |
| Projection-only camera updates | `leaf-layer.ts` | Camera movement already preserves geometry; repeated paint command work remains |
| Stable bar-frame culling reuse | `pixi-renderer.ts` | Dirty bar slots/meshes exist; not an equivalent viewport-culling implementation |
| Shared image bindings | `aggregate-image-leaf-lane.ts` | Shared assets and bounded SVG raster reuse already exist |
| Bitmap text | Guarded capability route | No default atlas provider is wired in the JS composition; it is not a current production baseline technique |

The [Pixi performance guide](https://pixijs.com/8.x/guides/concepts/performance-tips)
also warns that culling has CPU cost and paint order affects batching. Therefore
neither arbitrary global reordering nor blanket culling is automatically a win.

## Hypotheses tested and disposition

| Candidate | Implementation tried | Result / final disposition |
| --- | --- | --- |
| C: compiled paint state | Retain text matrices/offsets/clipping and border Paint/RRect/matrices | Some lower build costs; final milestone gains did not repeat reliably. Removed |
| C+D: retained display lists | Ordered 64-command `ui.Picture` chunks with dirty invalidation and disposal | Camera improved in screening, but all-text rebuild/raster costs increased. Removed |
| C+E: packed atlas commands | `drawRawAtlas` for representable, already rasterized icons; fallback for other transforms | Icon-fit publication exceeded one second and three frame timings were missing. Removed |
| C+G: shared shape raster images | Bounded repeated background fill/border images, preserving mesh shape and paint order | Lower fit raster time but slower camera/bar workloads. Removed |
| C+F: native style flyweights | Weak immutable style identities, exact size/spacing/color key, capped at 512 entries | Mixed repeats and adverse native results. Removed; no isolated F qualification claimed |

These are conclusions about the tested implementations, not claims that Pictures,
atlases or raster caches are generally slow. In particular, panel paint order
interleaves icons with other commands: one atlas call per icon did not create a
single global batch. Corrected shape-cache experiments preserved the original
triangle fill, opacity and asymmetric corner construction; the extra finite-size
guard was tested afterward, not included in the measured shape APK.

The APIs and mechanisms were checked against
[Flutter performance guidance](https://docs.flutter.dev/perf/best-practices),
[Picture](https://api.flutter.dev/flutter/dart-ui/Picture-class.html),
[drawRawAtlas](https://api.flutter.dev/flutter/dart-ui/Canvas/drawRawAtlas.html),
and [separate UI/raster profiling](https://docs.flutter.dev/perf/ui-performance).
Installed Flutter engine `e4b8dca3f1b4ede4c30371002441c88c12187ed6` constructs an
R-tree for Picture display lists and uses transformed clip coverage in Impeller
dispatch. That can cull drawing; it does not remove initial/all-dirty paragraph
preparation in the tested eager recording implementation.

General [Canvas optimization recipes](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
and [Android retained drawing guidance](https://developer.android.com/develop/ui/views/graphics/hardware-accel)
informed hypotheses. They are not evidence that browser Canvas, Android Views
and Flutter have interchangeable rendering behavior.

## Measurements and adverse results

All table values are p95 milliseconds. Whole-process RSS is recorded in JSON,
not presented as isolated Dart heap/cache memory or as a leak diagnosis.

### 2 GiB emulator screening

Pixel 6a API 34 ARM64, host GPU, 1080×2400, DPR 2.625, profile mode. Later guest
swap reached roughly 668 MiB and untouched workloads also varied. These are
diagnostic comparisons, not qualified target-device gains.

| Comparison | Workload | Before → candidate publication | Other observation |
| --- | --- | ---: | --- |
| C → C+D | warm camera | 67.7 → 33.9 | Build 33.5 → 0.9 |
| C → C+D | all text, fit | 341.7 → 486.8 | Raster 244.1 → 322.2 |
| C → C+D | all text, zoom | 296.3 → 478.8 | Build 67.7 → 141.6 |
| C → C+G | all text, fit | 341.7 → 307.3 | Raster 244.1 → 155.4 |
| C → C+G | warm camera | 67.7 → 107.1 | Build 33.5 → 60.8 |
| C → C+G | bars, fit | 166.0 → 201.4 | Build 17.1 → 30.8 |
| C+E | icons, fit | 1431 | Raster 1626 among 17 matched frames; three missing |

### Fresh 4 GiB emulator repeats

A temporary isolated Pixel 6a AVD used 4 GiB RAM, four vCPUs and host GPU. Play
Store and guest network were disabled. This reduced one known source of pressure
but did not establish repeatable results. Guest swap remained around 330–380 MiB.
Large spikes are preserved; their cause was not proven to be environment alone.

| Run | Workload | Commit | Publication | Build | Raster |
| --- | --- | ---: | ---: | ---: | ---: |
| baseline 1 | all text, fit | 178.8 | 365.2 | 103.7 | 237.1 |
| C | all text, fit | 448.2 | 662.6 | 116.2 | 458.3 |
| C+F 1 | all text, fit | 399.7 | 790.1 | 182.4 | 1031.3 |
| C+F 2 | all text, fit | 227.4 | 399.7 | 77.2 | 318.6 |
| baseline 2 | all text, fit | 253.0 | 428.7 | 121.4 | 302.0 |
| baseline 1 | icons, fit | 102.2 | 324.8 | 67.3 | 248.6 |
| C+F 1 | icons, fit | 78.4 | 264.6 | 44.0 | 238.1 |
| C+F 2 | icons, fit | 74.1 | 248.5 | 35.7 | 225.5 |
| baseline 2 | icons, fit | 130.9 | 401.1 | 94.9 | 321.8 |

Favorable icon rows do not cancel regressions elsewhere. C+F text-fit maximum
publication reached 2329 ms in its first run. Its sparse-update p95 changed from
68.3 to 470.6 ms, and camera p95 from 82.5 to 188.0 ms between repeats. All eight
workloads, including bar/reentry costs and first samples, remain in JSON.

### Physical Android

Samsung SM-S936N, Android 16, 1440×3120, DPR 3.75, Flutter 3.41.4/Dart 3.11.1,
profile ARM64, Impeller Vulkan. Manual brightness 90 during measurement, no
refresh-rate override. Full-suite baseline reached 39.6°C SKIN and failed the
original below-38°C envelope despite Android thermal status remaining zero.
It is retained as invalid thermal evidence.

| Text-fit run | Start/max SKIN °C | Commit | Publication | Build | Raster |
| --- | --- | ---: | ---: | ---: | ---: |
| baseline 1 | 31.4 / 33.3 | 169.4 | 321.2 | 85.1 | 82.4 |
| C+F 1 | 34.4 / 37.4 | 262.6 | 515.6 | 90.8 | 144.3 |
| C+F cold | 32.1 / 35.8 | 169.3 | 323.7 | 57.2 | 85.5 |
| baseline cold | 32.1 / 35.0 | 252.2 | 477.6 | 119.4 | 141.7 |

The first pair met the original broad thermal envelope. Its adverse candidate
result is not retrospectively excluded; different starting temperatures limit
attribution. Before the cold pair, a tighter prospective gate was recorded:
fan cooling, start ≤32.5°C, max ≤35.5°C, status zero, candidate-first order.
The cold candidate exceeded that maximum. The baseline also varied substantially
between runs. No reliable text improvement is established by choosing the most
favorable pair. Thermal samples are five seconds apart and do not prove absence
of all CPU/GPU frequency or background-work differences.

The unstarted physical icon/camera qualifier and isolated C-only text run were
stopped after these inconsistent repetitions; they are not completed validation.
There is no iOS qualification, npm-versus-Dart speed claim, or sustained-60-FPS
claim from this experiment.

## Final retained work and verification

- Extend the existing benchmark with the eight workload selectors, viewport
  revision matching and strict measured-frame coverage. Keep adverse evidence.
- Add visual equivalence witnesses for incremental/full text, longer and RTL
  values, presentation alpha, reentry/scale changes, and reflected upright items.
- Fix an independent readable-orientation invalidation error. On baseline,
  0→89.999999° camera rotation flips the semantic readable transform but leaves
  a retained bottom bar in the prior bucket. The new pixel witness fails on
  baseline and passes when bucket boundaries use the semantic epsilon.
- Remove C/D/E/F/G production candidates. Preserve existing caches, asset
  readiness, semantic updates, paint order and public package behavior.

Focused Canvas/icon raster, asset-refresh and geometry checks cover the retained
change. Shared conformance and installed-consumer checks passed during the
investigation; final analysis/docs checks and the physical harness smoke are
recorded with the final work. The 5,000-panel smoke proves the default-size camera target and timing coverage,
not speed. Camera endpoints are derived from the last grid rather than a
10,000-panel-only coordinate.
An independent reviewer agreed that the performance candidates were unqualified
and that the epsilon correction is independent of them.

## Remaining engineering and product choices

This investigation does not exhaust every possible renderer design. Conservative
offscreen native preparation remains a plausible follow-up, but the semantic
quad is not a guaranteed glyph-ink bound for unclipped text/custom fonts. It
needs safe clipping/ink bounds, same-frame reentry and capture/order witnesses.
An atlas of individual characters can break shaping, ligatures, RTL and fallback;
a shaped-line image cache preserves more semantics but adds miss cost and memory
for rapidly changing strings. Neither is claimed as a completed optimization.

If 10,000 fully readable values must change atomically in the overview, the
measured existing path still misses the interaction budget. Product options to
discuss, not silently apply, are:

1. **Zoom-dependent labels:** overview shows group summaries/status; individual
   values appear at a readable scale. This reduces work only if native text
   preparation is also deferred, not merely hidden after layout.
2. **Coalesce streaming updates:** keep the latest pending values and commit at
   a chosen cadence. This reduces redundant transactions, but does not shorten
   a single 10,000-value commit by itself.
3. **Asynchronous preparation with atomic publication:** keep the old frame
   interactive while preparing a new revision, then publish consistently. This
   needs an explicit readiness/query contract and does not guarantee lower total
   latency. Slicing visible updates without agreement would change semantics.

Any new shared option must be specified once and implemented/tested in both npm
and Dart. The present change introduces none of these behavior changes.

## Cleanup

The temporary `PatchMap_Render_Strategies` AVD was deleted. The physical device's
brightness 184, manual mode 0 and stay-awake 0 were restored; its screen timeout
was unchanged. The profile interactive feature lab was restored with the service
panel scene. The existing `Pixel_6a_API_34` AVD's temporary stay-awake setting was
reset from 3 to the normal default 0, then the emulator was stopped. Its original
stay-awake value was not recorded, so this is a default reset, not a verified
restoration of that preference.
