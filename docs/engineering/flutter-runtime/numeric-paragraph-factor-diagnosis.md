# Numeric Paragraph factor diagnosis

October 23, 2026. This follows the [combined candidate trial](numeric-paragraph-metrics-checkpoint.md).
Production remains at the `62ce45ca` runtime. **No individual skipped operation was
identified as the cause of a stable regression.** Large process-CPU jumps in the
new traces include an additional old-generation GC cycle, not additional text
layout work. This diagnoses observed execution costs; it does not qualify a new
production optimization or retroactively explain every earlier sample.

## Controls and evidence

Same SM-S936N, Android 16, Flutter 3.47.6 profile AOT/Impeller Vulkan, 10,000-panel
number updates with full-width bars fixed at 100%, zoom-pan workload and fixed
CPU/GPU frequencies. All ten process conditions passed clock/thermal audits and
final-value verification. Original APKs were reused exactly; the probe's modes
share one binary. Initial preparation used mode 0 for every probe process, with
identical text counters (99 Paragraph creations, six metric misses) and layout
counts. Runtime switches change only the subsequent numeric fallback path.

| Mode | Numeric fallback change |
| --- | --- |
| 0 | Original operations: two layouts, native metric reads, general path |
| 1 | Use known width; omit the infinity-width measurement |
| 2 | Reuse size/longest-line/line-count; retain both layouts and general path |
| 4 | Numeric-only dispatch; retain both layouts and native metric reads |
| 7 | All three changes |

Each fresh process had one cold request, three warmups, five uninstrumented
measurements and five separate CPU/GC diagnostics. Run the exact original pair,
then modes 0/1/2/4/7, then reverse 7/0. The additional crossover held the process
constant: four baseline startup requests, then 0/7/7/0 repeated four times, with
CPU sampling disabled and phase/GC timelines enabled. It is diagnostic evidence,
not another uninstrumented production benchmark. Native scheduler traces account
for worker CPU; GC wall time is never substituted for process CPU time.

## Results and adverse observations

Fresh-process warm medians, milliseconds. Original and probe results must not be
pooled: the probe adds common dispatch/observation code and has a different AOT binary.

| Comparison | Response | Process CPU |
| --- | ---: | ---: |
| Exact original baseline / combined candidate | 126.84 / 128.39 | 310 / 313 |
| Probe 0 / 1 / 2 / 4 / 7 | 137.46 / 144.39 / 137.48 / 145.70 / 145.39 | 401 / 405 / 400 / 411 / 415 |
| Reverse probe 7 / 0 | 146.34 / 139.46 | 417 / 401 |

The original +18 ms / +94 CPU ms penalty did not recur at that size in the exact
APK repeat. The common-binary candidate still had a roughly 7–8 ms response
penalty in both fresh-process orders, so it was not accepted based on this repeat.
In the same-process crossover (eight requests per mode), the direction reversed:
response 140.23→135.25 ms, CPU 404.5→396.5 ms, first paint 1.658→1.553 ms.
Request GC wall time also fell 39.07→34.03 ms; most of the response difference
therefore does not establish an intrinsic text-preparation speedup. Frame p95
increased 2.383→2.767 ms; this is not a universal smoothness improvement.

## Where the time goes

Every measured probe update created only 17 new Paragraphs in this zoomed view,
with 4,997 metric-proof hits and zero metric misses. Initial sharing is unchanged;
10,000 value updates do not imply 10,000 visible Paragraph creations. Final
screenshots matched for all seven comparisons, excluding the Android status area.
Counts include the host's camera-reset frame and are not paint-only counts.

In the first diagnostic sweep, first paint stayed 1.538–1.615 ms across all five
modes. The larger differences occurred before the changed Paragraph-body path:
mode 0→1 synchronous admission 55.64→59.66 ms (GC 21.36→24.30), resource
preparation 49.82→52.83 ms (GC 11.43→14.14). Other modes also varied in admission,
preparation and commit, although their switches are consumed later during draw.
This rules out attributing the entire response difference to extra work inside
the omitted Paragraph operations; it does not rule out effects of preceding
requests on the heap or isolate-specific execution variation.

The CPU discontinuity is directly visible in the original APK diagnostics:

| Same baseline APK request | Process CPU | DartWorker CPU | Old-generation starts |
| --- | ---: | ---: | ---: |
| 13 | 293 ms | 93.92 ms | 1, idle |
| 14 | 372 ms | 164.33 ms | 2, both idle |

The extra cycle accounts for about 70 ms of the 79 ms difference on workers.
Main-thread CPU changes by about 7 ms; raster CPU is nearly unchanged. The
candidate also alternates between one and two cycles: requests 13/14 use
301–302 CPU ms, while 10–12 use 380–392 CPU ms. Trace events explicitly identify
idle or promotion triggers and concurrent marking/sweeping. Some collection runs
after update completion while the measured window still includes pan/raster drain.
It is real CPU consumption and must not be discarded, but per-request medians can
change when an extra cycle lands inside their windows. Two workers' CPU time is
additive even when their work overlaps in elapsed time.

## Decision and remaining uncertainty

The earlier combined-candidate rejection remains a record of that checkpoint;
its results do not prove dimension reuse is inherently slower. No unintended
layout-sharing or input-contract change was found. GC/state sensitivity is now
observed, rather than merely hypothesized. The exact mechanism by which a given
process/request reaches a different GC state is not isolated, and no AOT/compiler
regression was established. Preserve adverse results and stop this bounded audit.

Do not change production, add forced GC, or add zoom-dependent behavior from this
experiment. Reconsider the known-dimensions optimization separately from the
unsupported claim that it adds 94 CPU ms. Future acceptance must measure the
intended visible preparation cost plus whole-workload CPU/GC accounting, keeping
common-binary diagnostics distinct from final production qualification.

## Artifacts and cleanup

`.artifacts/performance/flutter/numeric-paragraph-factors3476-device-20261023/`
contains the protocol, source, runners, per-request phase/CPU/GC traces, native
scheduler/clock audits, screenshots, summaries and cleanup record. Probe SHA-256:
`e0e3674fa70fb16bb9dd2fc7643e9016345bc061cfe3d69876ea47dfe6f0730d`.
All five modes pass the 48-case pixel oracle (35 focused tests); profile build
passes. Original APK and foreground were restored, fixed mode disabled and test
process/forwards removed. No Android/iOS release qualification is claimed.
