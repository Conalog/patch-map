# Field-dependent update preparation

October 20, 2026. Refactor against production `a16f169e` / `14b1554b`.
The public API, raw values, visual policy and update contracts remain unchanged.
The scope is incremental preparation; full input admission remains required.

## Implementation

The resolver carries changed dependency groups with the effective raw record;
its authored/prior identity memo reuses both. Validation reads affected inputs.
Item layouts retain authored/sorted indices and address changed IDs directly.
Owner layout changes expand work to dependent children. Geometry, content,
static-plan proofs and animations reuse this metadata through one publication path.

Unchanged siblings, local geometry and text/SVG content are reused. Compact
component changes avoid singleton maps, append additional entries directly and
create a lookup index lazily. Publication releases this metadata; reorder/rebase
invalidates address hints. Zero masks preserve raw representation changes/retries.
`ItemDataView` defers raw component-list projection without a revision chain.
Integer animation microseconds preserve rounding, curve and start policy.
Short immutable arrays and resource reference bookkeeping remain necessary.

## Method

SM-S936N, Android16, Flutter3.47.6 profile AOT, Impeller Vulkan. Baseline65 and
candidate67 production hashes identify the APKs. Host/input/measurement/lock are
identical. Both final arms omit unused legacy-input allocation; earlier host
results remain separate, and their GC cannot be attributed solely to the package.
Regular/varied non-overlapping10,000-panel fixtures include100 SVGs, full-width
animated bars, number/bar/mixed updates, overview/zoom+pan. Fresh process,
2 warmups and5 measurements per condition; first-arm order balanced per view.
Pre-launch cooldown: thermal status0, skin≤37°C (36°C for the first4 pairs).
Actual temperatures, frame counts and CPU-window lengths accompany the samples.

Response is API entry through matching-revision paint submission. CPU is process
CPU milliseconds through animation/raster settlement and the same400ms pan,
not utilization percent or main-isolate time. FrameTiming excludes some preparation.
Thermal status0 does not ensure equal frequencies. Diagnostics run separately.

## Response and CPU results

Median response/process CPU milliseconds,5 measured requests per condition.

| Layout / update | Overview response | Overview CPU | Zoom+pan response | Zoom+pan CPU |
| --- | ---: | ---: | ---: | ---: |
| grid / bar | 255.8→221.3 | 628→576 | 241.2→191.0 | 568→481 |
| grid / number | 223.4→249.0 | 351→424 | 202.1→187.2 | 549→548 |
| grid / mixed | 376.0→312.0 | 862→804 | 337.7→292.9 | 742→720 |
| random / bar | 265.9→214.7 | 645→574 | 207.1→184.9 | 557→475 |
| random / number | 256.9→285.3 | 455→401 | 202.9→178.8 | 565→516 |
| random / mixed | 405.1→334.2 | 919→858 | 349.9→304.6 | 726→696 |

All168 requests (48 warmup/120 measured) completed without failure or incomplete
timing collection. All24 final-value checks passed. All12 final-state screenshot
pairs were pixel-identical below the120px system status-bar region.

The two adverse number-overview response cases received a separate reverse-order
repeat with7 measured requests. Grid response223.9→225.1ms was neutral, but CPU
373→410ms still increased. Random response254.6→215.0ms and CPU444→396ms
improved. Do not pool these repeats with the original series or claim consistent
number-overview or universal CPU gains. A separate diagnostic CPU profile showed
fewer main-isolate samples, but it does not negate the whole-process CPU result.

Removing extra TextContent sharing while preserving TextPool Paragraph/atlas
sharing worsened response/CPU in grid (225.4/393→263.6/469ms) and random
(220.3/398→263.8/429ms). This artifact-only candidate was discarded; it does not
establish the cause of the remaining grid CPU increase. Production is compact2.

## Work actually skipped

Separate instrumented builds count layout/draw compiler component visits
independently on a warmed varied fixture, not all expensive recalculations.

| Changed panels / mode | Before | After |
| --- | ---: | ---: |
| 10,000 / bar | 20,000 | 10,000 |
| 10,000 / number | 30,000 | 10,000 |
| 10,000 / mixed | 30,000 | 20,000 |
| 100 / bar, number, mixed | 200 / 300 / 300 | 100 / 100 / 200 |
| 0 / every mode | 0 | 0 |

Bar-only requests perform no text preparation in either implementation.
Raw item component-list projections fall10,000→0 for100% updates and100→0
for1% updates; external raw-data queries still materialize the list on demand.
All18 counter cases pass value checks. Number/mixed still measure10,000 texts;
TextPool acquisitions including measurement fall20,000→18,666 through sharing.
Changed bar scalar layout remains10,000 calculations in validation, reused by
preparation. An initial counter sequence's first0% input reset the prior100%
values; it is excluded from no-op claims. Corrected no-op witnesses first apply
that reset and count only the repeated identical full input.

## Memory follow-up

The ordinary grid/mixed/zoom-pan sample had higher PSS (529.8→666.5MiB) and
graphics (228.2→266.0MiB), so the same final APKs received a separate two-cycle
prepare/five updates/remove/2s wait/forced-GC diagnostic. Updated Dart heap was
74.41→72.50MiB and74.44→72.54MiB; after removal it was16.26→16.30MiB and
16.29→16.34MiB. ItemLayout, TargetGeometry, DrawNode, TextContent and
RectangleContent counts were0 after removal in both arms; candidate RecordDelta,
ComponentChange, ComponentChanges and ItemDataView were also0. This witness found
no retained revision chain. PSS/native/graphics remained allocated and increased
on the second cycle in both versions. It does not certify native/GPU retirement,
a universal memory ceiling or general memory non-regression.

## Verification

Focused tests cover reset/rebase, raw equivalence, parent/child changes, z-order,
opacity, retry/failure atomicity, publication changes and animation. Guarded sibling
maps reject unrelated reads; compiler tests compare reused/fresh pixels while
preserving the old publication. Independent review covers architecture/lifetime
and measurement. The final focused set passes74 tests; unchanged earlier contract
witnesses remain valid. Flutter3.47.6 analysis passes. Final-state screenshots
alone do not validate animation or intermediate-publication contracts.

Source/APK identities, scripts, raw samples, images and diagnostic evidence:
`.artifacts/performance/flutter/field-dependencies3476-device-20261020/`.
This checkpoint does not qualify iOS, deployed WebView superiority, universal
frame budgets or native/GPU retirement from the previous device review.
