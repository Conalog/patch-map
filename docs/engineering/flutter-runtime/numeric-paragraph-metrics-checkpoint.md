# Numeric Paragraph dimensions reuse trial

October 23, 2026; baseline `62ce45ca`. **Not adopted:** overview preparation
improved, but both comparison orders showed slower zoom-pan response and more
process CPU time. Production source and tests were restored to the baseline.
This is experiment evidence, not a change to the current rendering contract.

## Candidate and invariants

The text pool already shares numeric measurements by a narrow proven key:
1–12 ASCII digits, bundled FiraCode 500, auto font size 8–14, centered, unsplit
unbreakable token, visible overflow, matching wrap/content width, and no stroke,
insets or unsupported shaping fields. Only hits on that proof defer their native
Paragraph body. Existing profiling identified native Paragraph preparation as a
material cost when 10,000 numbers change.

The candidate passed those measurements into native Paragraph creation on visible
fallback. Actual-string shaping and one layout at the known rounded width remained.
It skipped the infinity-width measurement pass, intrinsic-width read, repeated
size/line metric extraction and general wrapping/fit dispatch. No cache, public
option, resource policy, font or atlas policy was added. General text, wrapping,
strokes, ordering, update atomicity and submitted-revision completion were unchanged.

## Verification and comparison

Candidate analysis and 63 focused tests passed with CI SDK 3.41.4: native text
layout, pool/preparation, compatibility, atlas fallback/lifetime, widget validation
and retained updates. A 48-case rendered comparison covered 1–12 digits across four
content bounds, including nonfitting bounds and changed color/alpha. Pixels matched
ordinary native Paragraphs exactly. A separate witness checked disposal when
numeric Paragraph creation throws. These candidate-only tests are preserved in
the experiment patch; they are not left in production after candidate withdrawal.

SM-S936N, Android 16, Flutter 3.47.6 profile AOT, Impeller Vulkan. Both APKs used the
same host, locks, SDK, build flags, viewport, DPR and seeds. Only `text_layout.dart`
and `text_pool.dart` differed. The fixture contained 10,000 nonoverlapping panels;
numbers changed while full-width bars remained at 100%.

Two fresh processes per arm/view, AB then BA order; each process performed one
cold request, three warmups and five measured requests. The main comparison had
CPU sampling disabled. Fixed CPU/GPU clock and thermal audits passed all eight
conditions. No build or test ran concurrently with measurement. Response covers
public Map input construction through matching-revision engine submission. CPU
time covers the update, pan and raster drain, not utilization percentage.

Figures below are medians of the two process medians, not ten independent process
samples. Overview requests generally produced one frame; their frame p95 is that
single frame duration, not sustained FPS. Zoom-pan had about 49–50 frames/request.

| Warm measurement | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| Overview response | 252.70 ms | 226.77 ms | −25.92 ms |
| Overview process CPU | 376.0 ms | 371.5 ms | −4.5 ms |
| Overview first-frame build | 122.86 ms | 109.15 ms | −13.70 ms |
| Overview frame p95 | 164.22 ms | 148.83 ms | −15.40 ms |
| Zoom-pan response | 114.08 ms | 132.18 ms | +18.09 ms |
| Zoom-pan process CPU | 288.0 ms | 382.0 ms | +94.0 ms |
| Zoom-pan frame p95 | 2.347 ms | 2.364 ms | +0.018 ms |

Zoom-pan response/CPU regressed in each independent comparison: 117.56→138.07 ms
and 288→396 CPU ms in AB; 110.61→126.29 ms and 288→368 CPU ms in BA. Overview
response improved in both. Overview CPU's small reduction is not a strong savings
claim. Cold response was 425.23→418.71 ms in overview and 273.48→284.89 ms in
zoom-pan; cold and warm evidence are kept separate.

Post-GC Dart heap was effectively unchanged: overview 56.137→56.023 MiB and
zoom-pan 52.304→52.304 MiB. This does not establish GPU-memory savings. Final values
had zero mismatches, retained-object checks passed, and all four device screenshot
pairs matched exactly below the excluded top 120-pixel Android status region.

## Decision and limits

Optimization acceptance is **FAIL** under the repository's repeated user-visible
regression criterion: the overview gain does not justify a repeatable zoom-pan
response/CPU penalty. The comparable measurements do not establish why that penalty
occurs. GC phase, compiler effects or other mechanisms remain hypotheses; earlier
bar-task GC evidence is not a diagnosis of this numeric candidate. Similar frame
p95 also does not negate the longer update response or higher CPU time.

Keep the existing production path. Do not add a zoom-dependent switch, forced GC
or compensating allocations without evidence. A further investigation would need
to isolate the zoom-pan regression before adopting a revised candidate; this
bounded trial stops without another broad matrix or bar/mixed measurements.

Original installed APK and foreground activity were restored, fixed performance
mode was disabled, and test process/ADB forwards were removed. No release or
cross-platform qualification claim is made.

## Reproduction evidence

Artifact root: `.artifacts/performance/flutter/numeric-paragraph-metrics3476-device-20261023/`.
`PLAN.ko.md`, `source-audit.json`, per-process raw results/clock/thermal checks,
`summary.json`, screenshots, focused test logs and `cleanup.json` preserve the run.
`candidate.patch` and `source-after/` preserve the withdrawn implementation.
The source audit describes the candidate at measurement time, before withdrawal.

- Baseline APK SHA-256: `3c5a0024d762d8ad8ad90013b255ade80aed6e50a8ee3a61c8ff3561a5516e5e`.
- Candidate APK SHA-256: `5cb870164fdc33e9aa83b53874b1cd962cdede2ea62b9fecc8a546a894c2c60c`.

Canonical owners are [verification policy](../verification.md), the text resource
owner in [runtime architecture](architecture.md), and the existing retained-update
device host. Production runtime source is unchanged from `62ce45ca` by this trial.
