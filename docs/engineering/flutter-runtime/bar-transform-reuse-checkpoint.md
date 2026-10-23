# Reusing bar orientation and component transforms

October 23, 2026. Baseline `df949893`; public input, appearance, clipping,
item-atomic publication, animation/retargeting and revision-submission completion
are unchanged. Only the first and third candidates from the source/profile
review are implemented. Paragraph fallback preparation is outside this change.

## Ownership and work removed

- Geometry prepares the normalized, reflected/readable orientation basis once.
  Each draw component keeps one basis, validated against four world linear
  coefficients and camera rotation. Animated bounds/translation reuse it;
  rotation, reflection, scale or shear changes replace it.
- Placement-only changes reuse the parsed rotation/scale. Authored x/y are read
  directly rather than subtracting rounded previous translations.
- Component-local 4×4 matrices are lazy immutable projections. Unchanged
  projections share a holder without retaining earlier components/publications.
  Upright world-space bar batches never materialize this local matrix.

The basis has a bounded per-component retained cost; nonmemoized geometry calls
create a temporary basis. This change does not claim query/selection speedups.
The two optimizations are measured together, not attributed separate percentages.

## Focused verification

CI SDK3.41.4 analysis and50 changed-boundary tests pass: readable transforms,
layout/projection reuse, bar slicing, transitions/retargeting and retained-update
atomicity/failure/discard. New witnesses compare repeated placement changes with
fresh compilation, including huge offsets, reflection and zero scale, and compare
animated cached placement against a fresh draw projection. Independent source
review found no confirmed correctness, invalidation or lifetime defect.

SM-S936N/Android16, Flutter3.47.6 profile AOT/Impeller Vulkan. The exact previous
production APK is reused as baseline after verifying every library hash against
`df949893`. Host, dependency locks, SDK and build flags are identical; only three
production library files differ. The fixture is the existing nonoverlapping
10,000-panel grid, full-width randomized bars without numbers, public Map input.

Two views × two arms × two fresh processes, balanced before/after then
after/before. Each process runs one cold request, three warmups and five measured
requests. All40 measured requests apply, all final values match, and all four
final screenshot pairs are pixel-identical below the120px Android status region.
CPU/GPU clock traces and thermal gates pass for all eight conditions. No broad
number/mixed/consumer matrix or new package API was introduced.

## Results and limits

Milliseconds; median of the two process medians. Response includes Map input
construction through matching-revision submission, not physical presentation.
Process CPU includes animation/pan and raster drain; it is CPU time, not percent
utilization. Frame p95 is each request's `FrameTiming.totalSpan` percentile.

| Condition | Response before → after | CPU before → after | Frame p95 before → after |
| --- | ---: | ---: | ---: |
| overview | 200.4 → 190.2 | 588.0 → 575.5 | 42.45 → 37.51 |
| zoom and pan | 185.5 → 166.1 | 429.0 → 398.0 | 1.78 → 1.81 |

Response improves10.2ms/19.5ms. Overview frame p95 improves4.94ms in aggregate,
and decreases in both repetitions. Overview CPU is not a consistent improvement:
600→570ms in the first process pair,576→581ms in the second. Zoom-pan CPU
improves38/24ms in the two pairs. Post-GC Dart heap decreases about1.67MiB in
both views; this is not a GPU-memory or long-duration retention qualification.

Overview animation still has about25ms median vsync gaps and9–10 submitted
frames per request; this is not smooth60fps qualification. Zoom-pan median gaps
remain8.34ms with roughly50 frames/request, but two candidate requests lose one
120Hz interval each (16.68ms gaps; prior frame build11.34/9.16ms). Baseline has
no equivalent gap in the measured windows. Thus nearly equal p95 must not be
presented as proof that every candidate frame is unchanged. A bounded GC timeline
diagnostic is recorded separately and is not pooled with the main measurements.

That diagnostic runs one fresh process per arm with GC/Dart/Embedder tracing,
CPU sampling off, and the same nine requests. Candidate frames with16.66/16.68ms
vsync gaps spend9.85/7.88ms of their10.42/8.38ms build durations in
`CollectNewGeneration`. Baseline has no corresponding gap in that diagnostic.
Median request GC drops from50.03ms to39.34ms, while some collection moves into
pan frames. This supports a GC-timing explanation for the observed tradeoff;
the original uninstrumented gaps themselves were not GC-traced. It does not
establish uniform smoothness improvement or justify forcing GC in the library.

Keep the scoped changes for the repeatable response and overview-frame gains,
with this120Hz tail limitation explicit. Number/mixed, query/selection, iOS and
long-duration native memory remain outside this comparison. The original device
APK/foreground were restored, test process/ADB forwarding removed, and fixed
performance mode disabled after every measurement condition.

Raw identities, per-request timings, clock/thermal audits, pixel comparisons and
cleanup evidence are under
`.artifacts/performance/flutter/bar-transform-reuse3476-device-20261023/`.
