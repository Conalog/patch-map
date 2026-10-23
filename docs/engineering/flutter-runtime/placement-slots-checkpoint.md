# Fixed glyph placement slots checkpoint

October 23, 2026. Implements proposal 2 from the
[allocation diagnosis](overview-allocation-diagnosis.md), retaining the
[origin Offset improvement](origin-offset-checkpoint.md).

## Implementation and outcome

`TextHandle` now owns three nullable `_GlyphPlacement` fields for densities
3, 6 and 12 instead of a per-handle Map. `TextPool.draw` fills only the selected
empty slot; switching density reuses that density's retained placement.
`TextPool._retire` clears all three fields at the same lifetime boundary.
The atlas owner already provides exactly these three densities. Their selection,
images, placement arrays, string/paint identity, preparation timing, references,
Paragraph fallback and update publication are unchanged. No other optimization
is included; production changes are confined to `text_pool.dart`.

The requested structure is applied and functional checks pass. **Performance
is INCONCLUSIVE:** the emulator comparison suffered substantial, changing host
memory contention. Lower observed times cannot be attributed to this patch.
The implementation removes the general Map allocation/lookup, but this unit
does not claim measured allocation bytes, a speedup or reduced GC jank.

## Experiment and identity

Existing task-owned `PatchMap_Svg_Plant_20261014` ARM64 API34 emulator, 4 vCPUs,
4 GiB RAM, 1440×3120, density600, 60Hz, host GPU, snapshot loading/saving off.
Flutter 3.47.6 profile AOT; actual startup log confirms Impeller OpenGLES.
These are emulator observations, not physical-device qualification.

Baseline is the exact `8e2bf89d` APK from the preceding checkpoint. Candidate
uses the same host, dependency locks, SDK and build flags. Source hashes differ
only for `text_pool.dart`. The parity host sends full Map updates of 10,000
random 1–6-digit numbers on the regular overview grid, with full-width bars
fixed at 100%. Seed, sequence and submitted-revision completion are unchanged.

Four fresh processes run before/after then after/before. Each has cold1,
warmup3, measured5 and diagnostic5. Measured rows have CPU sampling disabled;
diagnostics enable 1 ms sampling and Dart/Embedder/GC timeline. Initial host GC
is unchanged; no forced GC occurs between updates. No builds/tests run during
measurement. Host VM/swap counters are captured around every request.

## Raw observations, not a speed claim

Each row is a process median across five sampler-off measured updates, in ms.
CPU is Android process CPU time through the existing raster-drain window.
Total frame span is matched by the same FrameTiming vsync identifier.

| Execution order | Response | CPU | Build | Raster | Total frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before 1 | 1974.628 | 2975 | 998.206 | 1449.382 | 2638.525 |
| After 1 | 633.822 | 1155 | 267.850 | 453.488 | 708.196 |
| After 2 | 806.014 | 1695 | 429.018 | 718.199 | 1152.683 |
| Before 2 | 1153.945 | 2008 | 576.316 | 784.111 | 1325.223 |

The baseline itself ranges from 1356.724–2489.941 ms within its first measured
block and 964.672–2073.815 ms in its second. All ten measured frames in both
arms exceed 16.67 ms. Do not present aggregate percentages or these large raw
deltas as improved responsiveness/smoothness from fixed slots.

Host counters across the five request/drain windows in each measured block:

| Execution order | Swap-in MiB | Swap-out MiB | Decompressed MiB |
| --- | ---: | ---: | ---: |
| Before 1 | 149.2 | 63.6 | 9792.3 |
| After 1 | 89.8 | 0 | 4908.4 |
| After 2 | 115.9 | 0 | 6754.4 |
| Before 2 | 166.2 | 417.6 | 10090.8 |

These are host-wide activity counters, not package memory or resident bytes.
They establish a changing environment; the fraction of latency caused by that
contention was not isolated. No samples are discarded. The planned two pairs
are preserved and no further repetitions or smaller workloads were substituted.

## GC and correctness

Across ten separately instrumented diagnostic requests per arm, young
collections are 30→30 and old collections 3→2. Young collections overlapping
paint remain 10→10; old collections overlapping paint are 2→0. Mean recorded
response collection time is 151.466→111.897 ms and paint collection time
34.779→18.038 ms. These wall times share the host-contended environment;
neither the one-event count difference nor the pause-time delta proves a GC
improvement. Nested collector events are excluded from double counting.

Nineteen focused tests pass: text pool and resource regression cases, existing
atomic update validation, and a new pixel comparison switching 6→3→12→6→12→3
against freshly prepared per-density placements. This also exercises eviction
and retained native-Paragraph counts. Changed-file analysis and formatting pass.
Device value mismatches are zero. Both screenshot pairs are pixel-identical
below the existing 120-pixel system-status exclusion. Current library/test
hashes match the exact measured and tested copy.

The original emulator APK/launcher were restored and the installed APK hash
verified; test process and forwards were removed. The emulator started by this
run was then stopped. No physical device was used. Performance qualification
remains pending an adequately controlled environment; the structural change
must not be advertised as a measured speedup based on this run.

Raw rows, host counters, GC timelines, test logs, source copies and cleanup:
`.artifacts/performance/flutter/placement-slots3476-emulator-20261023/`.
Baseline APK SHA-256:
`129d7950fcc0d4b4c921379e9179208e4d4b23ac6acfbcfd9063a43938b2ae95`.
Candidate APK SHA-256:
`d6861378ed293030b5c261c3338950f32afbacdf7f1bcaf276cc69df6b7e9db0`.
