# Native Paragraph configuration reuse

October 26, 2026. Implements proposal 3 from the
[allocation diagnosis](overview-allocation-diagnosis.md), retaining the approved
[fixed placement slots](placement-slots-device-checkpoint.md).

## Implementation and outcome

Retain a small CPU-saving change. Response, frame smoothness and GC improvements
are **not established**. The update still produces a long frame.

`TextPool` owns one recent `ParagraphConfiguration` through
`ParagraphPreparation`. Matching immutable parameters reuse resolved family
names/fallback lists. Matching actual font size reuses native ParagraphStyle
and lazy fill/stroke TextStyles; matching layout width reuses its constraint.
Different settings replace this memo; there is no growing per-string/style Map.
Close clears it. Each new string still owns its builder, Paragraph and layout.
The general shaping/fitting path, numeric proof, atlas eligibility, submission
completion, resource leases and safe retirement are unchanged.

The comparison uses parameter identity or existing metric/paint keys plus exact
color, stroke color, shadow and object opacity. Quantized color keys alone cannot
authorize native style reuse. Font resolution stays with its TextPool owner.
Styles explicitly bind the existing proportional leading distribution because
Flutter's pushStyle updates its encoded bit. Size changes invalidate fill and
stroke styles together. Width reuse never substitutes content bounds for the
measured Paragraph width. Alternating styles/sizes may miss this one-entry memo;
no claim is made for arbitrary mixed-style workloads.

## Comparable evidence

SM-S936N, Android 16, Flutter 3.47.6 profile AOT/Impeller Vulkan. Baseline is
`fa45e6e9` library code (same as `ed56d69a`), using its existing exact APK.
Candidate changes only text_layout.dart, text_pool.dart and the new
paragraph_configuration.dart. All 69 candidate source hashes are checked;
host, SDK, dependency locks and build flags match the baseline manifest.
The ignored build snapshot keeps the repository's SDK/lock policy unchanged.

The existing parity host supplies regular 10,000 panels, full random 1–6-digit
number changes, full-width bars fixed at 100%, overview and identical seeds.
Public Map admission through submitted revision remains the response milestone.
Before/after then after/before use four fresh processes, each cold1, warmup3,
measured5 and diagnostic5. No builds/tests run during measurements. Only the
existing initial host GC is forced; collections between updates are natural.
Measured rows disable sampling. Diagnostic rows separately enable 1 ms CPU
sampling and Dart/Embedder/GC timeline. CPU/GPU clock gates pass throughout
update windows, with no trace errors/data loss. End thermal status is zero and
skin temperature is 37.0–38.0°C.

## User-visible measurements

Milliseconds are medians of the two process medians, five sampler-off requests
per process. CPU is process CPU time through raster drain, not utilization.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Input to submitted revision | 230.194 | 229.345 | -0.849 |
| Process CPU | 343.0 | 338.5 | -4.5 |
| Matched frame build | 110.649 | 113.787 | +3.138 |
| Raster | 39.533 | 38.950 | -0.583 |
| Matched total frame span | 152.875 | 154.250 | +1.375 |

CPU decreases by 6 and 3 ms in the paired orders, supporting only a small
benefit. Response changes by +6.544 and -8.242 ms; total frame by +4.115 and
-1.365 ms. Build increases by 5.138 and 1.139 ms. These mixed wall-time results
do not establish faster response or smoother frames. Observed maximum total
frame span increases from 156.409 to 160.022 ms. All ten measured frames in each
arm exceed 16.67 ms; the sample is too small for a stable tail claim.

## GC and evidence limits

Ten diagnostic requests per arm; pause values below are arithmetic means of
outer main-isolate collection overlap, without counting nested collector events.

| Diagnostic metric | Before | After |
| --- | ---: | ---: |
| Young collections | 30 | 30 |
| Old collections | 0 | 1 |
| Mean request collection time | 27.170 ms | 27.164 ms |
| Collections overlapping paint | 0 | 1 |
| Mean paint collection time | 0 ms | 0.340 ms |

The extra old collection occurs in the first candidate diagnostic process;
the second has the same collection count as baseline. GC reduction is not
confirmed. Removing a subset of temporary setup objects does not eliminate
native builder/layout work or guarantee fewer whole-isolate collections.
Diagnostic paint averages 112.929→111.458 ms; keep this separate from the
sampler-off frame measurements. No new allocation-byte/count census is claimed.

## Correctness, scope and cleanup

47 focused configuration/layout/pool/paint/update tests pass, including warm vs
fresh pixels for numeric/general text, fitting, wrap, stroke alpha, size/width
changes, owner separation, failure disposal and clear with live Paragraphs.
Targeted Dart analysis passes. Device final-value mismatches are zero in all
four processes. Both map viewport screenshot pairs are pixel-identical.
Candidate screenshots contain a system notification in the host header
(difference bounds y=126–314); the map begins below y=320. The header is not
claimed identical. Notification timing is not separately isolated, another
reason not to attribute small wall-time changes solely to the optimization.

The original APK and foreground are restored, fixed mode disabled, and task
processes, forwards and remote traces removed. Two pairs suffice for this narrow
change; no extra optimization, zoom matrix or repeat for a favorable result.
Raw results, exact APK/source manifests, traces, tests and cleanup are under
`.artifacts/performance/flutter/paragraph-config3476-device-20261026/`.
