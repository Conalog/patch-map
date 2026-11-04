# Validation and resource reuse checkpoint

October20,2026; Flutter3.47.6 profile AOT on SM-S936N, Impeller Vulkan.
This follows the [preparation regression diagnosis](experiment-parity-checkpoint.md).
The change preserves public input, output and completion policies; it does not
restore the historical specialized experiment's sub100ms response.

## Reuse boundaries

- A presentation patch may remember one resolved record. Reuse requires identical
  authored and current records. Composition preserves untouched patches and
  replaces merged patches. Execution uses a matching proof, otherwise resolves
  against its current base without retaining a one-use memo. Reset barriers,
  failed-item rebase and complete input validation remain in place.
- The backend retains only its latest admission batch's scalar layout memo.
  Preparation consumes it; matching requires component identity, owner size,
  content box and orientation. Text validation's zero-size placeholder is never
  reused as measured text. A miss follows the existing geometry calculation.
- Draw nodes share immutable asset-reference/target lists when unchanged. Empty
  nodes share empty metadata. This skips asset waiting, target mapping and logical
  creation-count derivation for unchanged references; it does not cache mutable
  readiness, failure or intrinsic dimensions, nor bypass resource leases.
  Metadata retains no previous DrawNode/publication chain.

These are bounded derived values, not a second authoritative presentation state.
Lifecycle ownership is defined in [lifecycle](lifecycle.md).

## Physical comparison

The baseline is `e5003c18`, including only the independently verified native crash
mitigation over the previous diagnosis. The candidate adds the three reuse changes.
Both APKs use the same public-API host, 10,000 ordered regular/varied panels,
100 managed SVGs, full-width bars and seeded input. Number-only scenes keep bars
at full height; bar-only scenes contain no numbers. Overview and zoom/pan are
separate conditions. Each condition starts a fresh process, with two warmups and
three measured requests. Input generation and verification are outside the clock.

Response ends at the matching Flutter paint submission. CPU is accumulated
Android process CPU time through animation/raster settlement and, in zoom/pan,
the same400ms camera activity; it is neither response latency nor average CPU%.
FrameTiming p95 omits some synchronous preparation and cannot replace response.

The initial candidate's paired12-condition matrix completed120 requests with
24 successful final-value checks. All12 paired application screenshots are
pixel-identical after excluding the top120px system status bar. An earlier
unpaired matrix had thermal/phone-overlay confounds and is not causal evidence.
One paired varied-bar zoom/pan comparison crossed thermal status0→1; its adverse
result is retained but excluded from performance ranking and was repeated.

The initial candidate improved several response/CPU pairs, but regular number
updates in overview repeatedly increased CPU. The final refinement avoids
execution-only memo allocation and empty layout memo retention. Only affected
number cases plus bar/mixed witnesses are rerun; the previous full matrix is
identified as an earlier candidate, not silently attributed to the final APK.

## Final candidate results

Medians in milliseconds; before→final. All final pairs start at thermal status1.
The first regular-number overview pair has a1.7°C skin-temperature difference;
its reverse-order repeat, not that favorable first pair, limits the conclusion.

| Condition | Response ms | Process CPU ms |
| --- | ---: | ---: |
| Regular bar, zoom/pan |559.7→471.4|1007→880|
| Regular mixed, overview |983.0→902.3|1841→1586|
| Regular number, overview, reverse repeat |502.4→502.1|789→793|
| Regular number, zoom/pan |284.2→293.2|602→603|
| Varied number, overview |475.1→392.1|763→665|
| Varied number, zoom/pan |377.0→351.7|727→737|

The final70 requests have complete timing and no failures. All14 final-value
checks match10,000 items; all six main paired application images are pixel-equal.
Bar/mixed improvement is supported by both candidate rounds. Regular-number
speedup is inconclusive: the repeat is neutral and zoom/pan ranges overlap.
Removing execution-only memo allocation is not isolated proof of the earlier
CPU regression's cause. No universal CPU/smoothness improvement is asserted.

Number zoom/pan PSS rises532→648MiB (regular),597→654MiB (varied); graphics
accounting rises228→266MiB and255→274MiB. These end-window observations do not
identify retention versus allocator/resource-preparation timing. Memory
nonregression remains unqualified; no memory-saving claim accompanies this change.

## Verification and remaining work

Focused presentation/session, scalar layout, resource lifecycle, text validation,
item atomicity, paint generation, geometry and animation tests pass. Static
analysis is clean. Independent review checked reset/rebase, placeholder exclusion,
asset metadata lifetime and unchanged mutable resource state. No new public API,
policy, animation delay, progressive publication or renderer path is introduced.

Separate diagnostic traces locate removed work: pending composition is roughly
0.04ms, execution resolution1.9–2.4ms and asset metadata approximately1ms in the
sampled bar requests. Admission, color validation, general geometry construction
and draw-node compilation still dominate. Diagnostic traces use another APK and
are not pooled with ordinary timings or assigned a causal percentage.

The [native crash checkpoint](native-crash-checkpoint.md) records the exact
premature null-field read, guarded AOT branches and12 scene preparations/36
updates without recurrence under profiling. The final AOT Build ID
`ec22f0f82b9703c0be4b5edc5c31bc67` also retains safe guarded reads. This is bounded evidence,
not universal engine stability, iOS qualification or proof of leak freedom.
Process PSS/graphics accounting is preserved; it is not exclusive GPU allocation.

Exact APK/source hashes, baseline/candidate snapshots, every raw sample, thermal
state, screenshots, diagnostic traces and the Korean report are under
`.artifacts/performance/flutter/update-reuse3476-device-20261020/`.
