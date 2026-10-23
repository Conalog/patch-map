# Overview frame diagnosis after text preparation reuse

October 23, 2026. Diagnosis only, following the
[parameter/key reuse checkpoint](text-parameter-key-reuse-checkpoint.md).
No package code, optimization, input policy or APK was changed.

## Finding

The extra overview paint time is predominantly garbage collection inside the
frame, rather than more ordinary drawing work or waiting to receive CPU time.
Across ten diagnostic requests per arm, average paint time increased 4.629 ms;
4.159 ms (about 90%) is accounted for by additional overlapping main-isolate GC.
After subtracting those recorded GC spans, paint time differs by 0.469 ms.
This is a measured explanation of the frame interval, not evidence that reuse
made the underlying drawing algorithm slower.

Both arms have 33 young-generation collections across their ten response
windows. Collections inside paint increase from 4 to 10, with similar duration
per collection (8.515→8.237 ms). Total response GC time is 29.681→28.825 ms.
The cost moved into the paint interval without a corresponding increase in
overall GC count/time. Changed allocation/lifetime patterns are the supported
interpretation of this shift; which individual allocation or cache-key change
sets its precise timing was not isolated.

## Comparable evidence

Exact existing APKs: baseline `c83c18b5`, candidate `c45eb46f`. SHA-256 values
are the same as the preceding checkpoint. All 77 source identities, SDK, locks,
host and flags are preserved; candidate library hashes match the current package.
SM-S936N, Android 16, Flutter 3.47.6 profile AOT/Impeller Vulkan; same regular
10,000-panel overview, random 1–6-digit strings, full-width bars fixed at 100%.

Four fresh processes in before/after then after/before order. Each has cold 1,
warmup 3, measured 5, followed by diagnostic 5. Initial preparation includes the
same host GC as the previous runner; no forced GC occurs between updates.
CPU sampling is off for measured rows, then 1 ms sampling and Dart/Embedder/GC
timeline are enabled for diagnostic rows. Perfetto scheduling/frequency tracing
runs for both sections. Do not pool sampler-off and diagnostic timings.

CPU/GPU clock and thermal gates pass all four processes. No build/test runs
alongside measurement. All traces have no reported error/data-loss statistics.
The frame is matched by vsync timestamp to `VsyncProcessCallback`, then
`Animator::BeginFrame`; `PipelineProduce` duration agrees with FrameTiming build
within 0.1 ms. One `PAINT` span is selected, excluding the nested root wrapper.
Only outer `CollectNewGeneration`/`CollectOldGeneration` overlap is subtracted,
avoiding double counting nested collector events. Concurrent GC and barrier
work outside those spans is not removed.

## Sampler-off reproduction

Milliseconds, median of two process medians, five measured requests per process.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Input to submitted revision | 241.022 | 239.896 | -1.126 |
| Process CPU through raster drain | 392 | 354.5 | -37.5 |
| First frame build | 118.592 | 122.605 | +4.014 |
| Raster | 39.688 | 39.571 | -0.118 |

Build increases in both orders (+1.792/+6.235 ms). Total response decreases
slightly in both (-0.904/-1.347 ms); the earlier +7.66 ms response increase is
not a stable end-to-end regression established across runs. The frame increase
does reproduce. No zoom scenario or broader benchmark matrix was repeated.

## Diagnostic decomposition

Arithmetic means across ten requests per arm, so components add exactly.
These instrumented durations explain time distribution, not a new speed claim.

| Paint interval | Before ms | After ms | Delta ms |
| --- | ---: | ---: | ---: |
| Full interval | 119.695 | 124.323 | +4.629 |
| Overlapping GC | 4.288 | 8.447 | +4.159 |
| Interval excluding recorded GC | 115.407 | 115.876 | +0.469 |

Paint CPU samples total 1,078 in each arm. Dominant paths remain native
Paragraph layout/build and Canvas atlas submission; `TextPool._resolve`
inclusive samples are 623→593, native Paragraph layout self samples 394→377,
and native atlas submission self samples 119→114. These are samples, not call
counts. No additional dominant drawing function appears after the change.

Perfetto maps the dominant execution to the Android process main thread
(TID equals PID), rather than an OS thread named `1.ui`; Dart's timeline uses
a different thread identifier. For the same paint windows, runnable wait
(`R`/`R+`) averages 0.108→0.083 ms, excluding CPU-starvation as the main cause.
Running is 119.361→122.861 ms; sleeping is 0.224→1.369 ms. Scheduler states
overlap GC and must not be added as independent costs to the decomposition.

## Outcome and limits

Frame-local cause identified: GC placement explains about 90% of the observed
diagnostic increase. Exact allocation-level causality and a persistent total
response penalty remain unproven. Keep those distinctions; do not dismiss the
frame increase as thermal noise, claim all drawing became slower, or introduce
forced GC as a product fix. Diagnosis stops here without another optimization.
The follow-up [paint allocation diagnosis](overview-allocation-diagnosis.md)
identifies creation sites and proposes bounded changes without implementing them.

Zero final-value mismatches, two exact screenshot pairs below the 120-pixel
status exclusion, and unchanged source/APK identities. Original APK/foreground
restored, fixed mode disabled, test process/forwards/remote traces removed.
No code tests rerun because no runtime code changed; the documentation gate
is the changed-risk check. Raw rows, timelines, CPU profiles, Perfetto traces,
scripts, aggregation and cleanup records are preserved under
`.artifacts/performance/flutter/text-key-frame-diagnosis3476-device-20261023/`.
