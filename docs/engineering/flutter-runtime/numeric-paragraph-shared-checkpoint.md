# Proven metrics in the existing Paragraph path

October 23, 2026. This follows the [factor diagnosis](numeric-paragraph-factor-diagnosis.md).
The approved intent is to remove duplicate measurement without introducing a
numeric-only resolver. The earlier combined candidate is historical evidence,
not the implementation adopted here.

## Ownership and invariants

`TextPool` retains the existing numeric proof and metric cache. Only proof hits
defer their Paragraph body; all other formats already have a native layout.
When that deferred body is needed, the pool passes its existing `TextMetrics`
to `NativeTextLayout.resolve`. The shared immutable metric type now belongs to
the layout module, avoiding an import from layout back into the pool.

The same resolver, candidate preparation and Paragraph builder still run.
The measured font size skips repeated fitting, as before. The rounded Paragraph
width now skips the infinity-width measurement and intrinsic-width read; size,
longest line and line count reuse their proven values. Actual-string shaping
and the final constrained layout remain necessary. Content bounds or unrounded
advances must never substitute for the cached Paragraph width.

Proof scope remains 1–12 ASCII digits in bundled FiraCode 500, auto size 8–14,
centered, unbreakable, visible overflow, with matching wrap/content width and
no inset, stroke, shadow or unsupported shaping fields. General text, wrapping,
overflow fitting, colors/opacity, atlas eligibility, native resource retirement
and update/submission contracts are unchanged. No new cache, public option,
resource policy, forced GC or benchmark switch enters production.

## Verification

CI SDK 3.41.4 analysis and 63 focused tests passed: native layout, text pool and
preparation, compatibility, pool regressions, widget text validation and retained
updates. The 48-case pixel oracle covers 1–12 digits across four content bounds,
including nonfitting bounds and changed tint/alpha. Output exactly matches the
ordinary native Paragraph path. A creation-observer failure still disposes its
Paragraph. Existing witnesses cover proof exclusions, atlas fallback and lifetime.

## Bounded device checkpoint

SM-S936N, Android 16, Flutter 3.47.6 profile AOT/Impeller Vulkan. Baseline runtime
is `62ce45ca` (unchanged through `958f6915`). The original baseline APK was reused
exactly. The 77-input audit found only `text_layout.dart` and `text_pool.dart`
different; host, locks, SDK and build flags match. Candidate library hashes match
the actual package sources. This APK contains no factor switches or numeric-only
resolver.

10,000 regular nonoverlapping panels, random number updates with full-width bars
fixed at 100%; overview and zoom-pan. Each arm/view had one fresh process,
baseline then candidate, with one cold request, three warmups and five measured
requests. Clock/thermal gates passed all four conditions. CPU sampling was off;
no build or test overlapped measurement. This is a targeted nonregression check,
not a repeat of the factor matrix or a statistically stable speedup estimate.

Warm medians in milliseconds; CPU is process CPU time across update, movement
and drain, not utilization. Response spans Map creation through revision submission.

| Metric | Baseline | Shared path | Delta |
| --- | ---: | ---: | ---: |
| Overview response | 243.67 | 239.79 | −3.88 |
| Overview CPU | 370 | 387 | +17 |
| Overview first build | 124.263 | 119.006 | −5.257 |
| Overview frame p95 | 163.852 | 159.239 | −4.613 |
| Zoom-pan response | 137.98 | 126.36 | −11.62 |
| Zoom-pan CPU | 394 | 337 | −57 |
| Zoom-pan first build | 1.899 | 1.674 | −0.225 |
| Zoom-pan frame p95 | 2.331 | 2.382 | +0.051 |

Overview has one frame/request; its p95 is not sustained FPS. Zoom-pan has a
median 49 frames/request; median vsync gap was 8.341 ms for both arms, maximum
16.682→16.694 ms. Cold response was 451.12→416.21 ms and 290.55→278.71 ms,
respectively. Post-GC Dart heap was 56.137→56.080 MiB in overview and
52.304→52.304 MiB in zoom-pan. No GPU-memory improvement is claimed.

Final values had zero mismatches; retained object/layout identities passed.
Both screenshot pairs match exactly below the excluded 120-pixel status area.
The original APK and foreground were restored; fixed mode was disabled and
test processes, forwards and remote traces were removed.

## Decision and limits

Adopt the shared-path simplification: correctness and this bounded nonregression
checkpoint pass. There is no repeated user-visible regression established here.
Do not claim a stable response or CPU improvement from one process per arm/view.
The +17 ms overview CPU observation is retained: raw CPU ranges overlap
(351–414 versus 351–404 ms). Earlier diagnostics established GC-related execution
variation, but this run did not trace GC and cannot assign its deltas to GC.
The approved rationale remains eliminating redundant measurement, not promising
universal CPU savings. The overview update's long frame remains an existing limit.

## Evidence ownership

Canonical owners: [verification policy](../verification.md), [runtime architecture](architecture.md),
and the existing 10,000-panel retained-update device host. Artifact directory:
`.artifacts/performance/flutter/numeric-paragraph-shared3476-device-20261023/`.
`PLAN.ko.md`, source/APK identities, focused test and analysis logs, device raw
results and cleanup records preserve the checkpoint. Platform qualification and
publication remain separate gates.

- Baseline APK SHA-256: `3c5a0024d762d8ad8ad90013b255ade80aed6e50a8ee3a61c8ff3561a5516e5e`.
- Shared-path APK SHA-256: `b62c88ec0d5670eff63202daf57446e28f50aa6d769981832ba23ac49d42df71`.
