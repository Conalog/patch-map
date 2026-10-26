# Immediate-fit raster diagnosis

October 26, 2026. Follow-up to the [offscreen experiment](offscreen-preparation-checkpoint.md).
Diagnosis only: no production optimization or policy change. The observed slow
first-fit raster is associated with **Impeller transient-buffer expansion**, not
additional Dart projection calculations or a different bar/text fallback path.
Changing prior full-map submissions reproduces the fast/slow distinction in the
same candidate. Exact arena selection in each historical frame was not recorded.

## Existing evidence and focused captures

The original four mixed-after-fit processes are preserved. Clock snapshots map
Flutter monotonic raster intervals into Perfetto BOOTTIME. Fast and slow frames
both run on CPU6/7; the slow intervals spend almost their entire 96–100 ms running,
with under 0.2 ms off-CPU. Scheduler/GPU waiting does not explain the gap.

Exact original APKs were then run only on mixed-after-fit, with Embedder/Dart/GC
timeline enabled, sampling off. Baseline also reproduced approximately 96 ms.
About 95 ms was inside `SurfaceFrame::Encode`; acquisition was about 0.1 ms and
`CreateGlyphAtlas` about 0.9 ms. Candidate trace GPU frequency changed, failing its
clock gate: preserve it as diagnostic evidence, not a comparable speed result.
An initial invalid timeline-RPC parameter failed before sampling and was corrected;
its failure log is retained. No completed unfavorable sample was discarded.

Identical artifact-only counters were next added to both source snapshots, keeping
their only inter-arm library difference in `draw_objects.dart`. Counters do not
choose rendering branches. Both use the same host and 10,000-panel grid, full
mixed Map input, Flutter3.47.6 profile AOT, SM-S936N/Android16, Impeller Vulkan.
Each process uses cold1/warmup2/diagnostic3, with timeline/sampling disabled.
Both first-fit raster medians are about 96.5 ms. Their first-fit command counts match:

| Counter | Baseline and candidate |
| --- | ---: |
| Visible items plus SVG devices | 10,100 |
| Sliced bars / Canvas bars | 10,000 / 0 |
| Bar batches / static chunks | 100 / 100 |
| Atlas text / Paragraph text | 8,334 / 1,666 |
| Paragraph creations in this paint | 1,649 |

Normal first-fit transition age is about 16.6–16.9 ms in both arms. No increased
fallback, glyph resource preparation or bar submission count explains the slow path.
These diagnostic medians do not replace the original sampler-off performance matrix.

## Native CPU attribution

Simpleperf samples the same candidate at 1 kHz, filtered afterward to `1.raster`
and the three first-fit raster intervals. `clockid=1` and the filter both use
MONOTONIC; 291 samples cover those intervals. Matching unstripped engine symbols
have build ID `d94dad8aea45dc708a89502f3a758bc5816f9751`.

`DlVerticesGeometry::GetPositionUVColorBuffer` accounts for 61.17% inclusive;
within it, `HostBuffer::MaybeCreateNewBuffer` accounts for 37.46% inclusive.
The call chain reaches `AllocatorVK::OnCreateBuffer`, VMA block allocation,
`vkAllocateMemory`, `kgsl_sharedmem_alloc` and `ioctl`. These overlapping percentages
must not be added. They identify buffer preparation/allocation CPU, not GPU execution
time or Dart GC. Kernel symbols are restricted; vendor-internal names are partly
obfuscated, but the matched engine/Vulkan allocation chain is resolved.

The SDK engine source provides the mechanism: `impeller/core/host_buffer.h` defines
four arenas; `host_buffer.cc` extends the selected arena in `MaybeCreateNewBuffer`,
then `Reset` discards its unused trailing buffers and advances to the next arena.
Thus small-view submissions and full-map submissions can leave different available
capacity. Retaining Dart geometry does not preserve these engine-native buffers.
Source hashes and SDK revision are preserved alongside the symbol build ID.

## History intervention

Use the **same instrumented candidate APK**, same sequence4–6 mixed inputs and same
public update→fit action. Before each request, invoke the existing full-fit inspect
command four times to submit the whole map, then let the normal sample restore zoom
and update. This changes native rendering history; it is a causal diagnostic, not
a proposed warmup feature or a fair before/after optimization benchmark.
Both ordinary and warmed-history native captures use 1 kHz sampling. Results are
medians of three requests, with valid request-window CPU/GPU clock and thermal gates:

| First-fit metric | Ordinary history | Full-map history |
| --- | ---: | ---: |
| Dart frame build | 126.519 ms | 126.460 ms |
| Raster | 96.552 ms | 39.255 ms |
| Individual raster durations | 96.55 / 96.41 / 98.87 ms | 38.68 / 40.42 / 39.26 ms |
| Filtered native CPU samples | 291 | 118 |
| Additional-buffer allocation samples | Present, 37.46% inclusive | None observed |

Bar batch/fallback counts and text paths remain identical. Transition age changes
to about 40–44 ms, so intermediate vertices are not claimed bit-identical. The
allocation-stack disappearance, unchanged build time and reproduced fast raster
support native buffer availability as the mechanism. No observed allocation sample
does not prove literally zero allocation. The initial four historical runs lacked
allocation stacks/arena IDs; their exact frame-by-frame arena history is inferred,
not retrospectively proven. There is no evidence of a new mandatory raster penalty
caused by the candidate's deferred projection calculation.
The candidate can still indirectly change submission timing/frame count and thereby
buffer availability. Other caches and elapsed time also change during the intervention;
it isolates a major mechanism, not every cause of the entire 57 ms difference.

## Disposition and cleanup

Revise the earlier concern from a candidate-specific first-fit regression to a
shared engine buffer-allocation sensitivity. Keep all adverse original results;
this diagnosis does not establish universal smoothness or automatically adopt the
candidate. Do not add artificial full-map frames as a fix: their CPU/memory and
latency costs were deliberately outside the timed intervention.
Counters/native/history runs pass frequency and thermal gates and final 10,000-item
value checks. No broader workload, new optimization or release qualification ran.
Original manual APK/foreground were restored and hash-verified; fixed mode disabled,
forwards, task remote trace and native-profile data removed. Library remains unchanged.
Raw evidence, scripts, instrumented source/APK manifests and cleanup are under
`.artifacts/performance/flutter/offscreen-preparation3476-device-20261026/fit-raster-diagnosis/`.
