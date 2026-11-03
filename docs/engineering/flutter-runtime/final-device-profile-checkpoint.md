# Final physical-device performance review

October 20, 2026. Review of the completed
[preparation sweep](preparation-sweep-checkpoint.md), production `14b1554b`,
documentation baseline `ac00df71`. Production was unchanged by this review.
Both additional candidates are isolated, ignored experiment copies.

## Method and coverage

SM-S936N, Android16, Flutter3.47.6 profile AOT, Impeller Vulkan. The baseline
APK matches all65 production Dart source hashes. Candidate host, input generator,
measurement code and example dependency lock match the baseline. Only the named
production source differs in each candidate. No physical/emulator ratios are
combined.

Existing public-API fixture:10,000 ordered regular/varied panels,100 SVGs,
full-width animated bars, number-only/bar-only/mixed scenes. Each ordinary
condition uses a fresh process, two warmups and three measured requests.
Response ends at matching-revision paint submission. Process CPU covers
animation/raster settlement and the same400ms pan where applicable. FrameTiming
p95 excludes some synchronous preparation and is not the complete input latency.
CPU samples are separate diagnostic runs, not pooled with ordinary measurements.

Baseline matrix:60requests/12final-value checks. Axis candidate:40/8.
Text candidate:50/10 plus reversed20/4. All170 ordinary requests complete their
timing windows without update failures; all34 final-value checks match.
Thermal status is0 throughout ordinary samples, but skin temperature varies
30.8–38.8°C across the session. Status0 does not establish fixed clock speeds.

## Measured baseline at `14b1554b`

Medians, milliseconds; these describe the October 20 snapshot, not before/after
claims. PSS/graphics are Android process accounting, not exclusive package GPU
allocations.

| Layout / update / view | Response | Process CPU | Frame p95 |
| --- | ---: | ---: | ---: |
| grid / bar / overview | 233.3 | 581 | 30.5 |
| grid / bar / zoom-pan | 199.5 | 544 | 4.2 |
| grid / number / overview | 252.6 | 439 | 88.0 |
| grid / number / zoom-pan | 213.8 | 600 | 5.0 |
| grid / mixed / overview | 342.6 | 874 | 87.0 |
| grid / mixed / zoom-pan | 328.1 | 698 | 5.1 |
| random / bar / overview | 241.5 | 599 | 27.2 |
| random / bar / zoom-pan | 190.1 | 435 | 4.6 |
| random / number / overview | 261.3 | 519 | 95.2 |
| random / number / zoom-pan | 194.1 | 574 | 5.6 |
| random / mixed / overview | 345.0 | 858 | 99.7 |
| random / mixed / zoom-pan | 325.4 | 783 | 5.4 |

Six separate main-isolate profiles show `prepareUpdate` at29–41% inclusive
samples during zoom/pan. Overview paint is41–46%. Number overview
`TextPool.draw` has159/626 inclusive samples; `_resolve` has103/626.
Nested inclusive counts overlap and cannot be summed or treated as wall time.
`_readableWorld` has128/885 bar-overview samples, but the basis function
`readableRectTransform` itself has only10inclusive/8exclusive samples.

## Candidate decisions

**Axis-aligned readable basis shortcut: defer.** It preserves the original
center/anchor arithmetic; a prior direct-transform-return variant was discarded
because extreme coordinates changed cancellation/overflow behavior. Three
focused tests pass and four paired application images are pixel-identical.
Overview bar CPU594→595ms and mixed991→1013ms do not improve; zoom CPU differences
are small/mixed, and number response181.0→204.3ms is adverse. No repeatable overall
benefit is established.

**Proven numeric width overflow: not adopted by this review.**
Live VM inspection found6-digit text at minimum font size8 with measured width30
inside width26. The measured baseline uses Paragraph for overflow.
Four atlas styles are ready, with zero failures and15.3MiB resident pixels:
atlas creation failure does not explain this fallback.
Separate counters after warmup show1665→0new Paragraphs per update in all three
varied-number observations; Paragraph draw calls across two paint passes fall3330→0.

The candidate permits width overflow only for the existing1–12digit numeric
proof and a single line that still fits vertically. It preserves measured size,
font size, placement, paint bounds, overlap checks and native fallback on pending
or failed atlas preparation. This expands internal path selection, not the data
schema or visible-overflow meaning. Fifteen existing focused text tests and one
new width/metric/fallback test pass; independent review found no concrete defect.

Before→candidate medians; all adverse measurements are retained:

| Condition | Response ms | CPU ms | Frame p95 ms |
| --- | ---: | ---: | ---: |
| grid number overview | 323.6→269.7 | 540→487 | 116.4→64.4 |
| random number overview | 261.9→261.3 | 467→463 | 109.9→68.8 |
| random mixed overview | 513.9→413.5 | 1175→1035 | 162.1→91.0 |
| random number zoom-pan | 205.7→223.1 | 552→646 | 5.2→4.9 |
| random mixed zoom-pan | 344.3→345.9 | 732→733 | 3.9→4.4 |
| grid number overview, reversed | 261.0→279.3 | 526→450 | 99.5→64.0 |
| random mixed overview, reversed | 644.8→433.8 | 1276→1056 | 201.2→89.7 |

Overview frame improvement repeats, but response/CPU do not improve universally.
Five image pairs preserve inputs and show expected atlas glyph differences.
The enlarged6-digit view shows no observed clipping or placement change;
7–12digit rendered overflow, rotation and neighboring-overlap cases still need
qualification before adopting the expanded path. Pixel identity is not claimed.
Neither candidate establishes reduced graphics memory.

## Removal and priorities identified then

Two diagnostic removal cycles restore every package class live count/bytes to the
initial empty host. Retained fixture/verification data explain a remaining
15.9–16.2MiB Dart heap. Android PSS nevertheless rises from281MiB empty to850/1177MiB
after bar/mixed removal; graphics rises189→440/536MiB. After another number
diagnostic and several minutes empty, PSS is979MiB and graphics432MiB.
These bounded, different-scene cycles neither prove a leak nor establish native
or GPU retirement. Attribution remains open; the15.3MiB atlas cannot explain it.

This review prioritized numeric-fallback qualification and native/graphics allocation
attribution over another small arithmetic shortcut. Its full-input admission/layout
costs did not justify removing validation or
changing atomicity, animation, frame completion or pending-update contracts.
This review does not qualify universal60fps, all consumer inputs, iOS or WebView
superiority. Raw evidence, identities, patches and scripts:
`.artifacts/performance/flutter/final-profile3476-device-20261020/`.
Later changes and outstanding qualification are indexed in [delivery coverage](coverage.md).
