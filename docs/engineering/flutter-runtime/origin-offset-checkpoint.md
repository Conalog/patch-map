# Origin Offset reuse checkpoint

October 23, 2026. Applies only proposal 1 from the
[allocation diagnosis](overview-allocation-diagnosis.md).

## Change and decision

Keep the existing parameter/key reuse. `TextContent` uses `Offset.zero` only
when both destination coordinates are zero; nonzero destinations keep their
actual position. `NativeTextLayout` shares the zero inset. `OwnedTextLayout`
reuses either operand when the other is zero, and uses the same resolved origin
for stroke and fill. Nonzero inset addition, layer bounds, opacity, text shaping,
atlas policy, update publication and resource lifetime are unchanged.
No density Map, Paragraph style or placement-buffer optimization is included.

Retain this bounded change: the targeted allocations disappear, and response
and process CPU improve in both measurement orders. GC reduction is **not**
established. This is a small improvement, not a solution to the long 10,000-value
update frame or a native release-qualification result.

## Comparable physical evidence

SM-S936N, Android 16, Flutter 3.47.6 profile AOT/Impeller Vulkan. The existing
parity host submits a complete Map update of 10,000 numbers, 1–6 random digits,
on the regular grid in overview; full-width bars remain at 100%.
Baseline is the exact `c45eb46f` APK, unchanged through `9e36046d`.
Candidate source differs only in `draw_objects.dart` and `text_layout.dart`;
all other library files, host files, locks, SDK and build flags match.

Four fresh processes run before/after then after/before. Each has one cold,
three warmup, five measured and five diagnostic requests. CPU sampling is off
for measured rows; diagnostics enable 1 ms CPU sampling and Dart/Embedder/GC
timeline. Initial host GC is unchanged; no forced GC occurs between updates.
CPU/GPU clock and thermal gates pass all four processes. No tests/builds run
alongside measurement. Perfetto records no error/data-loss statistics.

Milliseconds below are the median of two process medians, five measured updates
per process. CPU is process CPU time through the existing raster-drain window,
not a percentage of one core. Submitted revision is the response milestone.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Input to submitted revision | 241.530 | 235.028 | -6.503 |
| Process CPU | 357.5 | 339.5 | -18.0 |
| Matched frame build | 120.708 | 118.351 | -2.357 |
| Raster | 39.428 | 39.219 | -0.209 |
| Matched total frame span | 162.262 | 160.076 | -2.186 |

Response decreases by 7.989 and 5.016 ms in the two orders; CPU decreases by
18 ms in each. Build decreases by 2.595 and 2.118 ms. Raster is effectively
unchanged. Observed maximum total frame span is 186.855→171.623 ms, but ten
measured frames per arm do not establish a stable tail improvement. All ten
frames in both arms exceed 16.67 ms: the large update still visibly stalls.

## Allocation and GC findings

Two candidate Offset-only diagnostic captures find eight paint allocations,
all from camera bounds. The three targeted text creation sites have no recorded
allocations. The preceding exact-baseline captures had 13,340 paint Offsets,
including 13,332 at those text sites. This confirms elimination of the selected
work, not a byte census of the whole update. Allocation tracing runs separately
after timing samples and is excluded from speed and GC comparisons.

GC below uses ten separate, equally instrumented diagnostic requests per arm.
Only outer main-isolate collection spans are counted; nested collector events
are not double-counted. Their overlap with the matched request/paint gives time.

| Diagnostic GC metric | Before | After |
| --- | ---: | ---: |
| Mean response collection time | 28.813 ms | 29.777 ms |
| Mean paint collection time | 8.700 ms | 8.359 ms |
| Young collections across ten requests | 34 | 38 |
| Old collections across ten requests | 3 | 6 |
| Young collections overlapping paint | 10 | 10 |
| Old collections overlapping paint | 3 | 6 |

Neither collection count nor total pause time decreased. The small paint-time
reduction is not evidence of solved GC jank. Diagnostic paint wall time itself
is 123.974→125.557 ms, unlike sampler-off build; do not pool instrumented and
uninstrumented times. GC timing depends on the whole allocation/lifetime history;
removing these small objects does not remove native Paragraph work or all other
allocations. Exact allocation bytes and a causal explanation of changed GC
counts were not established, and no additional optimization is mixed in.

## Correctness, scope and cleanup

Twenty focused tests pass: origin and nonzero destination pixels under rotation,
zero/nonzero stroke inset and alpha composition, native layout, and existing
text-update atomic validation. Changed-file analysis and formatting pass.
An initial test invocation mixed the checkout's older SDK resolution with the
3.47.6 engine and failed to compile; tests were rerun successfully in the exact
candidate copy resolved to 3.47.6. Source and lock audits exclude dependency drift
from the comparison. No repository lock or SDK configuration was changed.

Device final-value mismatches are zero. Two before/after screenshot pairs are
pixel-identical below the existing 120-pixel system-status exclusion. The
original APK and foreground were restored; fixed mode was disabled and test
processes, forwards and remote traces were removed. No wider matrix was needed.
Raw evidence, exact source copies, tests, clock/thermal gates and cleanup:
`.artifacts/performance/flutter/origin-offset3476-device-20261023/`.

Baseline APK SHA-256:
`edb085ff805efcf673e2767888b7eb7c660a6d39dcca37c445f367b761887a10`.
Candidate APK SHA-256:
`129d7950fcc0d4b4c921379e9179208e4d4b23ac6acfbcfd9063a43938b2ae95`.
