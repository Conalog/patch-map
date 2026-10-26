# Deferred offscreen output preparation experiment

October 26, 2026. **Measured output-projection/matrix deferral adopted.**
Comparison baseline is `e6b605ac`. The initial comparison deferred adoption over
first-fit frames. The [follow-up diagnosis](fit-raster-diagnosis.md) identifies shared
engine buffer-allocation sensitivity; the original observations below are preserved.
The user subsequently approved only this scope; [architecture](architecture.md) records it.

## Scope

The measured candidate changes only `rendering/draw_objects.dart`. Retained updates
invalidate component-world projection slots and local matrix holders. Paint computes
these from latest published geometry; repeated offscreen updates collapse into one
computation. General replacement nodes copy the nullable slot array to avoid mutable
cache sharing. No visibility traversal, scheduler or resource owner is added.
This combines lazy projection with array ownership/allocation changes; their effects
are not isolated. It is **not a complete value-only offscreen path**. Validation,
local geometry, text metrics/bounds, content acquisition, publication, failures,
animation clocks and active-transition scans remain unchanged. Paragraph bodies,
numeric placement and visible-demand SVG rasterization were already deferred.

## Method

SM-S936N, Android 16, Flutter 3.47.6 profile AOT/Impeller Vulkan. Baseline source matches
production; hosts, locks, SDK and build settings match. Exact source/APK manifests
are preserved. Regular nonoverlapping 10,000 panels use random full-width bars,
1–6-digit numbers, or both. Bar-only has no text; number-only bars stay 100%; mixed
input has 20,000 component records. All use public Map input. Random-template layout
is covered by appearance/contract preflight, not the performance matrix.

Four journeys: overview, concurrent 400 ms zoom-pan, immediate 400 ms fast pan after
update completion, and immediate fit. Zoom 0.75, pan world (+1600, +1120). Each sample
restores its camera outside measurement. Fresh processes use cold 1/warmup 2/measured 3,
ordered before/after then after/before. All 48 conditions completed: 288 successful
requests, 144 measured requests, 3,945 measured frames. After user-requested disconnection,
only the remaining five conditions resumed. No tests/builds overlap measurement.

Response includes input construction through revision submission, not animation/display.
CPU is process CPU **time** through camera, animation and raster drain, not utilization.
Sampling is off. Request-window CPU 1996800/1958400 kHz and GPU 443 MHz, trace coverage/error
and thermal gates pass. Initial diagram preparation is outside this comparison.

Metrics are medians of two process medians. The frame column aggregates request p95s,
**not pooled frame p95**. Number overview has one frame per request; missing adjacent
gaps do not mean no stall. Pan's first post-frame may be a zero-progress tick, so
whole-motion maxima/gaps also assess exposure.

## Results

Milliseconds, baseline → candidate. CPU includes subsequent visibility work.

| Input | Journey | Response | CPU time | Request frame p95 aggregate |
| --- | --- | ---: | ---: | ---: |
| Bar | Overview | 200.05 → 183.58 | 589.50 → 560.50 | 41.39 → 39.35 |
| Bar | Concurrent zoom-pan | 163.34 → 155.86 | 413.50 → 391.00 | 2.93 → 2.64 |
| Bar | Immediate fast pan | 164.16 → 155.34 | 416.00 → 390.00 | 3.08 → 2.47 |
| Bar | Immediate fit | 165.02 → 160.97 | 667.50 → 652.00 | 101.55 → 102.60 |
| Number | Overview | 213.31 → 204.68 | 350.50 → 333.50 | 157.74 → 152.08 |
| Number | Concurrent zoom-pan | 91.14 → 87.02 | 306.00 → 262.00 | 3.50 → 3.34 |
| Number | Immediate fast pan | 95.32 → 84.96 | 275.50 → 267.50 | 3.39 → 3.70 |
| Number | Immediate fit | 103.16 → 95.41 | 563.00 → 489.00 | 201.78 → 154.22 |
| Mixed | Overview | 419.17 → 400.89 | 915.00 → 887.00 | 183.60 → 169.61 |
| Mixed | Concurrent zoom-pan | 270.48 → 262.83 | 588.50 → 571.50 | 3.63 → 3.44 |
| Mixed | Immediate fast pan | 274.88 → 266.98 | 601.50 → 587.00 | 3.59 → 3.13 |
| Mixed | Immediate fit | 297.32 → 284.95 | 1206.00 → 1096.00 | 200.33 → 208.05 |

Bar overview/zoom-pan, number overview and mixed zoom-pan reduce response/CPU in both
orders. Immediate fast-pan response decreases in both orders for every input.
However, number zoom-pan response changes -8.76/+0.51 ms; mixed overview CPU -61/+5 ms.
Number fit frame deltas -0.68/-94.44 ms show its 47.56 ms aggregate benefit depends on
one baseline process. Uniform benefit or that magnitude of stable gain is unproven.

## Visibility-transition risk

Fast pan shows no repeated large new stall, but mixed maximum frame increases
14.74→17.09 ms; number aggregate frame duration rises 0.30 ms. Short zoom-pan frames
exclude much initial synchronous admission delay: responses remain 156/87/263 ms.
Mixed first-fit build is 121.67→121.86 ms and command-to-first-submit 123.45→124.67 ms.
Yet candidate first-fit raster is 95.58–99.80 ms in **3/6 requests**, across both processes;
baseline is 39.76–40.85 ms in all six. First-fit total aggregate grows 161.86→190.30 ms,
with paired deltas +1.16/+55.72 ms. Request p95 deltas are -7.06/+22.49 ms.

The longer first-fit span is in raster execution, not evidence of 55 ms more deferred
Dart geometry. Cause is not isolated. Later animation is costly in both arms:
raster>90 ms in 16/28 baseline frames and 17/26 candidate frames. Two fewer candidate
frames also mean its 110 ms CPU reduction is not solely skipped preparation.

Bar overview paired p95 deltas are -9.17/+5.08 ms; adjacent gaps>20 ms change 40/49→48/48.
Lower aggregate durations do not establish uniform smoothness. Neither arm qualifies
as globally smooth at 60/120 Hz. No additional experiment sought a favorable result.

## Correctness, limits and disposition

Candidate analysis and 38 focused rendering/retained/geometry/transition tests pass.
Expanded pending-cache→general-fallback→retained-update→first-paint witness passes
in the 14-test retained rerun (overlaps 38). Independent source review found no defect.
Each native arm passes 24 assertions: atomic rejection, immutable getters, mixed
publication, current query/bounds, animation/camera, inactive/reset composition,
owner changes, replacement/generation, removal/reattachment. All requests succeed;
each run's final 10,000-item getter check has zero mismatches; captured logs show no
native fatal errors. Four clean grid/random preflight pairs are pixel-identical
below the status bar. Of 24 final pairs, 22 match there; two contain system notifications
at y 126–314 and match below y 320 outside that overlay. Timing interference is unknown;
settled-pixel checks do not prove all intermediate animation pixels identical.

Only two processes per arm and sequential updates are measured. Pending-request
bursts, iOS/WebView and new GC/allocation or causal CPU profiles are unqualified.

The initial disposition was **defer default adoption** pending first-exposure diagnosis.
After that diagnosis, the user approved adoption without widening deferred work.
All 69 library files match the measured candidate byte-for-byte; the existing
offscreen→fallback→retained→first-paint regression test is transferred with it.
Adoption passes 38 focused tests and analysis; the native comparisons, pixel checks
and independent reviews above are reused. No new performance claim or device run.

Original manual APK/foreground were restored and hash-verified. Fixed mode disabled;
task forwards/remote traces removed. Adoption requires no further device changes.
Raw manifests, sources/APKs, results, frames, clock audits, screenshots, checks, review and cleanup are under
`.artifacts/performance/flutter/offscreen-preparation3476-device-20261026/`.
