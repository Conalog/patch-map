# Fixed glyph placement slots: physical checkpoint

October 26, 2026. Physical follow-up to the host-contended
[emulator comparison](placement-slots-checkpoint.md). No package code changed.

## Outcome

Retain the already implemented 3/6/12 placement slots. Response and process CPU
improve in both measurement orders, with unchanged output. This supports a small
benefit, not the large emulator deltas. GC collection count also decreases in
both diagnostic pairs, but paint-local pause reduction varies across processes.
The 10,000-number update still produces a long frame; GC jank is not eliminated.

## Comparable evidence

SM-S936N, Android 16, Flutter 3.47.6 profile AOT/Impeller Vulkan. Exact existing
APKs: baseline `8e2bf89d`, candidate `ed56d69a`. Both retain the prior origin
Offset improvement. No rebuild or new optimization is mixed into this check.
All 68 library source hashes at capture matched the candidate manifest. Between the
APKs, only `text_pool.dart` differs; SDK, flags, host and locks match.

The existing parity host owns the same regular grid of 10,000 panels, complete
random 1–6-digit number changes, overview, full-width bars fixed at 100%, seed
and sequence. Public Map input and submitted-revision completion are unchanged.
Four fresh processes run before/after then after/before, each with cold1,
warmup3, measured5 and diagnostic5. Initial host GC is unchanged; no forced GC
occurs between updates. No tests/builds run alongside the experiment.

Measured rows have CPU sampling disabled. Separate diagnostic rows enable 1 ms
CPU sampling and Dart/Embedder/GC timeline. Perfetto CPU/GPU clock gates cover
all update windows; GPU remains 443 MHz and both CPU clusters remain fixed.
Thermal status is zero throughout the gates; end skin temperatures are
35.5–36.8°C. No trace error/data-loss statistics are reported. Initial diagram
preparation is not a performance claim and is outside the update comparison.

## Response, CPU and frames

Milliseconds below are the median of two process medians, with five sampler-off
measured updates per process. CPU is process CPU time through the existing
raster-drain window, not percentage utilization of one core.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Input to submitted revision | 241.866 | 236.052 | -5.814 |
| Process CPU | 349.5 | 339.5 | -10.0 |
| Matched frame build | 119.422 | 116.378 | -3.044 |
| Raster | 39.478 | 39.033 | -0.445 |
| Matched total frame span | 163.317 | 158.067 | -5.250 |

Response improves by 7.426 and 4.202 ms in the two orders; CPU improves by
8 and 12 ms. Build decreases by 5.082 and 1.006 ms, so its magnitude is less
stable than the response/CPU direction. Raster is effectively unchanged.
Observed maximum total frame span is 175.740→162.342 ms; ten frames per arm do
not establish a stable tail improvement. All ten measured frames in each arm
exceed 16.67 ms. Do not describe this update as continuously smooth or 60fps.

## GC evidence and limits

Ten equally instrumented diagnostic requests per arm; times are arithmetic
means. Only outer main-isolate collection spans are counted, with their exact
request/paint overlap. Nested collector events are not double-counted.

| Diagnostic metric | Before | After |
| --- | ---: | ---: |
| Young collections across ten requests | 38 | 30 |
| Old collections across ten requests | 5 | 0 |
| Mean response collection time | 29.959 ms | 28.038 ms |
| Young collections overlapping paint | 10 | 5 |
| Old collections overlapping paint | 5 | 0 |
| Mean paint collection time | 8.031 ms | 3.884 ms |

Per-process collection counts are 22→15 and 21→15. Mean response collection
time decreases by 3.181 and 0.660 ms. Paint-local time is 8.592→0 ms in the
first pair, but 7.470→7.768 ms in the second. The second candidate still has
one young collection during every diagnostic paint. Therefore lower aggregate
paint GC does not establish a consistently GC-free drawing phase.

Diagnostic paint wall time is 124.772→117.355 ms, while diagnostic response is
241.193→241.577 ms. Keep instrumented and sampler-off observations separate;
the latter owns the response/CPU claim. This run did not count total allocation
bytes or isolate Map lookup time from allocation savings. Other text/native
Paragraph work remains. No additional hypotheses or repetitions were added.

## Correctness and cleanup

Final-value mismatches are zero in all four processes. Both before/after screen
pairs are pixel-identical below the existing 120-pixel system-status exclusion.
The prior 19 focused tests and exact tested candidate remain valid; they were
not rerun because source, fixture and APK are unchanged. The documentation gate
is the only new repository check for this report.

Original installed APK and foreground were restored and the APK hash verified.
Fixed mode was disabled; test process, forwards and remote traces were removed.
No production files changed. Raw results, timelines, clock/thermal audits,
source identities, screenshots and cleanup:
`.artifacts/performance/flutter/placement-slots3476-device-20261026/`.
Baseline APK SHA-256:
`129d7950fcc0d4b4c921379e9179208e4d4b23ac6acfbcfd9063a43938b2ae95`.
Candidate APK SHA-256:
`d6861378ed293030b5c261c3338950f32afbacdf7f1bcaf276cc69df6b7e9db0`.
