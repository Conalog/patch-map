# Text preparation parameter and key reuse

October 23, 2026. This isolates the approved preparation/key reuse from the
[shared Paragraph baseline](numeric-paragraph-shared-checkpoint.md).
No numeric-proof shortcut, input metadata sharing, atlas batching or geometry
change is included.

## Ownership and safety

For retained component updates, `DrawCompiler` uses the existing changed-field
mask to prove that all non-text preparation inputs remain unchanged. Only then
does `TextPool.acquireText` reuse the prior handle's immutable `TextParameters`
and style/paint key strings. The new string still uses the ordinary handle
creation, numeric proof, measurement and atlas-eligibility checks. A cache hit
also avoids creating a redundant `TextSpec`; no new cache is introduced.

The compiler's existing content cache uses the pool's canonical text handle
instead of a second raw-data tuple. Shared content owns one pool lease;
temporary acquisitions are released on cache hits. Preparation does not mutate
the previous handle or publish partial changes. Resource retirement is unchanged.

Style, tint, split, overflow, margin and component opacity changes use normal
preparation. Owner bounds/opacity changes use the existing general projection
path. Retained eligibility guarantees a stable owner; the shortcut does not
infer unchanged inputs from text length or from a numeric-only format.
Public schema, visual semantics, validation and revision submission are unchanged.

## Focused verification

CI Flutter 3.41.4 analysis and 63 focused tests passed: preparation, text pool,
compatibility, pool regressions, retained updates, dependency reuse, geometry
reuse and widget text validation. New witnesses establish parameter identity
reuse, unchanged parameter creation counts, cache hits without another spec,
independent metrics for new strings including general text, shared content
leases, and invalidation after margin, owner bounds and opacity changes.
The fresh-projection pixel oracle includes text-only, alpha and split changes;
the existing 48-case native Paragraph oracle also passes.

## Bounded physical-device comparison

SM-S936N, Android 16, Flutter 3.47.6 profile AOT/Impeller Vulkan. Baseline
`c83c18b5` uses the exact prior candidate APK. The 77-input source audit finds
only `draw_compiler.dart` and `text_pool.dart` changed; SDK, host, locks and build
flags match. Candidate source hashes match the actual package.

10,000 regular nonoverlapping panels; random number changes with full-width
bars fixed at 100%. Overview and zoom-pan each run baseline/candidate then
candidate/baseline, two fresh processes per arm/view, eight conditions total.
Each process has one cold request, three warmups and five measured requests.
CPU/GPU clock and thermal gates pass all eight conditions. CPU sampling is off;
no builds or tests overlap measurement. No additional factor matrix is run.

Values below are medians of the two process medians, in milliseconds. Response
spans input Map creation through matching revision submission. CPU means process
CPU time across update, movement and drain, not utilization percentage.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Overview response | 237.10 | 244.76 | +7.66 |
| Overview CPU | 370 | 358 | -12 |
| Overview first build | 117.364 | 123.011 | +5.646 |
| Overview frame p95 | 156.950 | 165.274 | +8.324 |
| Zoom-pan response | 122.24 | 90.30 | -31.94 |
| Zoom-pan CPU | 303.5 | 252.5 | -51 |
| Zoom-pan first build | 1.701 | 1.718 | +0.017 |
| Zoom-pan frame p95 | 2.293 | 2.408 | +0.115 |

Overview submits one frame per request; its p95 is not sustained FPS. Both
orders have longer overview response/frame medians: response +10.85/+4.47 ms,
frame +10.015/+6.633 ms. Raw response ranges overlap (218.92–271.62 versus
235.34–250.77 ms), but that is not proof of equivalence. Overview CPU deltas are
+3/-27 ms, so a consistent overview CPU improvement is not established.

Both orders improve zoom response (-34.42/-29.45 ms) and CPU (-59/-43 ms).
Zoom-pan has about 50 frames per request, median vsync gap 8.341 ms in both arms.
Maximum gap is 16.682 ms before and 25.024 ms after; the latter occurs once
among 485 candidate gaps, versus none above 20 ms among 486 baseline gaps.
This single event cannot establish its cause or prove unchanged worst-case
smoothness. The small frame p95 increase is retained, not rounded away.

Cold response medians are 414.16→380.15 ms overview and 288.88→258.75 ms zoom.
Post-GC Dart heap is 56.080→54.494 MiB and 52.304→50.718 MiB respectively.
No GPU-memory improvement is claimed. Final values have zero mismatches;
retained draw/geometry/layout identities pass. All four screenshot pairs are
pixel-identical below the excluded 120-pixel status area.

## Outcome and limits

Keep the approved reuse with its bounded, repeatable zoom benefit. This is
not an improvement in every view, nor a blanket smoothness/nonregression pass.
The overview response/frame increases remain a performance concern; their
cause was not isolated. Do not attribute them to GC or drawing from these data.
The existing long overview update frame remains unresolved. Further work must
address that specific concern separately, without mixing another optimization
into this unit or changing the measured scope after seeing the results.
The subsequent [frame diagnosis](text-key-frame-diagnosis.md) locates most of the
frame increase in GC timing; it does not reproduce a stable total-response loss.

Original APK/foreground restored, fixed performance mode disabled, test process,
forwards and remote traces removed. Artifacts and reproduction scripts:
`.artifacts/performance/flutter/text-parameter-key-reuse3476-device-20261023/`.
`PLAN.ko.md`, `summary.json`, source identities, raw rows, clock/thermal audits,
test logs and cleanup records preserve all observations.
Baseline APK SHA-256: `b62c88ec0d5670eff63202daf57446e28f50aa6d769981832ba23ac49d42df71`.
Candidate APK SHA-256: `edb085ff805efcf673e2767888b7eb7c660a6d39dcca37c445f367b761887a10`.
