# Validated retained update transfer

October 23, 2026. Production baseline `19129c81`; the public Map API, visual
policy, item atomicity, reset/composition and submission completion stay unchanged.
The experiment reference is factor110 with **baseline Map input**, not its
typed/fixed-input variants. Those variants' timings are not package baselines.

## Implementation and contracts

`rendering/retained_update.dart` is the single component staging/commit owner.
Idle validation forwards resolved records and checked scalar geometry, bound to
the exact document, publication, generation, revision, activity epoch and patches.
Composed/rebased records use that same owner; broad owner/source/order changes
retain the general projection path. There is no second publication coordinator.

Preparation acquires content leases and computes text/bounds without live writes.
Publication captures displayed bar state and old bounds, then synchronously
mutates retained draw/geometry handles. Initial layouts remain shared until each
item's first committed write. Replacement nodes own independent mutable handles;
immutable data, transforms and resource content can still be shared. Public
getters/events materialize immutable values before exposure. See [ownership](architecture.md)
and [lifetime](lifecycle.md).

Focused witnesses cover invalidation, discard, sibling isolation, immutable event
snapshots, resource failure/retirement, replacement-to-retained transitions and
bar retargeting. A fresh-projection pixel oracle covers text overflow, font,
margin, position, transform/tint, background visibility and bar geometry/alpha.
The native contract host passes24 assertions in each of the three arms.
Independent review found no confirmed functionality, atomicity or lifetime defect.

## Comparable device protocol

SM-S936N/Android16, Flutter3.47.6 profile AOT, Impeller Vulkan. Same public-input
host, APK configuration and non-overlapping10,000-panel grid/varied fixtures.
Map construction is inside the response window; precomputed domain values are
outside it in every arm. Mixed input contains20,000 component updates.
CPU policy0/6 are fixed at1996.8/1958.4MHz and GPU at443MHz; traces audit measured
windows. Thermal status0, arm start≤37.5°C and end≤40°C. Initial draw is reported
separately because some initial GPU-clock windows do not qualify.

Grid bar/number/mixed and varied mixed, overview/zoom-pan, three arms and two
fresh processes produce48 conditions. Each uses one cold request, three warmups
and five measured requests. Tables take the median of two process medians;
ten requests are not ten independent process repetitions. All240 measured
requests complete, final values match and32 screenshot pairs are pixel-identical
below the120px Android status region.

Response ends at matching-revision submission, not physical presentation.
Process CPU includes animation/pan/raster drain, not CPU utilization percentage.
Overview request p95 often means the maximum of only1–9 frames; zoom-pan has
48–50 frames per request. Neither establishes sustained frame-rate qualification. Diagnostics remain outside the main table.

## Measured results

Milliseconds; each cell is **before / experiment reference / package after**.

| Layout / change / view | Response | Process CPU | Request frame p95 |
| --- | ---: | ---: | ---: |
| grid / bar / overview | 255.6 / 207.7 / 200.4 | 664 / 586.5 / 588 | 37.4 / 38.7 / 42.5 |
| grid / bar / zoom-pan | 212.2 / 182.6 / 186.5 | 486 / 416 / 425.5 | 1.8 / 1.8 / 1.8 |
| grid / number / overview | 338.4 / 246.8 / 266.6 | 571.5 / 381.5 / 387.5 | 165.3 / 161.0 / 165.5 |
| grid / number / zoom-pan | 182.7 / 123.9 / 124.7 | 397.5 / 336.5 / 345 | 2.2 / 2.2 / 2.4 |
| grid / mixed / overview | 568.4 / 465.6 / 473.5 | 1098.5 / 974 / 984 | 175.6 / 189.9 / 179.7 |
| grid / mixed / zoom-pan | 379.5 / 323.3 / 316.7 | 769.5 / 664.5 / 664.5 | 3.1 / 2.4 / 3.0 |
| varied / mixed / overview | 598.7 / 488.1 / 487.8 | 1261.5 / 1054.5 / 1055 | 216.9 / 210.7 / 206.4 |
| varied / mixed / zoom-pan | 396.2 / 320.9 / 321.3 | 753 / 675.5 / 668 | 2.8 / 2.7 / 3.3 |

Response falls25.7–111.0ms and CPU52.5–206.5ms against production. Warm post-GC
Dart heap falls6.3–13.7MiB in the aggregate. Warm diagnostics retain all10,000
draw/geometry/item-layout objects and all component handles; static mesh rebuilds
and overlap comparisons are zero for these value-only changes. Initial grid
layout count is100, becoming10,000 only after all items receive a committed write.

This is not a universal frame or memory improvement. Grid bar overview frame p95
increases in both processes (before37.8/37.0ms, after40.6/44.4ms); mixed overview
also increases (before174.5/176.8ms, after180.2/179.2ms). Reference number zoom-pan
CPU crosses direction between processes (after319vs360ms, then371vs313ms).
Do not hide those observations behind the aggregate speedups.

A separate repeat gives bar frame p95 reference41.7/after41.9ms. Instrumented
first-paint time is25.6/29.3ms, including GC8.3/9.8ms; without GC18.0/18.4ms.
Number response again differs in the uninstrumented repeat (246.0/286.0ms),
but reverses with profiling (285.4/267.4ms). Perfetto finds1.2–41.3ms sleeps
inside `Frame Request Pending`; UI running-time medians are252.8/256.7ms.
Vsync waiting and GC contribute to dispersion; this does not attribute every
main-run difference or establish frame nonregression. Trace health checks pass.

One after number/zoom-pan process starts with higher PSS/Graphics before its
first update:760.3/361.3MiB versus reference623.8/322.7MiB. Warm PSS remains
626.1vs490.6MiB and close PSS557.3vs426.1MiB. The second after process starts at
622.3/322.7MiB. This is not evidence of accumulating retained-update leakage,
but its native/process origin remains unresolved. A separate repeat gives warm
PSS500.2/505.8MiB, equal Graphics226.9MiB, and close Dart8.25/8.24MiB for
reference/after. It does not erase the outlier or establish GPU-memory
nonregression. General owner/source/order fallback allocation is also outside
the measured hot-path claim.

## Qualification limits

Flutter3.47.6 analysis and changed-boundary tests pass. CI SDK3.41.4 analysis,
26 representative tests,12 retained-contract tests and extracted installed
consumer smoke pass. The installed artifact SHA256 is
`0297538e9748176e884727072309fff39bad8da061beac8aa6d143cb74e60ed8`.
The consumer loads bundled SVG/font and exercises public draw/update/getValue/
detach. SDK-specific dependency resolution is required when switching SDKs.

Exact source/APK identities, raw results, thermal/clock audits, pixel comparisons
and diagnostics live under
`.artifacts/performance/flutter/native-retained3476-device-20261023/`.
This evidence does not qualify iOS performance, deployed WebView equivalence,
long-duration native/GPU retention or every supported consumer schema.
