# Performance Contracts

The clean-room rewrite is performance-driven. It must preserve behavior and
improve frame smoothness on lower-end machines.

## Benchmark Harness

Use:

```sh
PATCHMAP_BENCH_CPU_THROTTLE=4 node .gstack/benchmark-harness/run-patchmap-frame-benchmark.mjs
```

Reports are local `.gstack` artifacts and remain ignored by git.

## Required Scenarios

The rewrite must be measured against:

- idle baseline after draw
- redraw same data with fit
- draw + update all panel animated bar heights
- update all panel animated bar heights every 1s x10
- wheel canvas pan
- ctrl + wheel zoom
- transformer single object select
- shift drag multi select
- panel mixed state burst
- panel chart stream
- highlight bulk alpha burst
- relations visibility by path
- report panel backgrounds burst

## Target

Primary target:

- Reduce p95 frame time and long frames under 4x CPU throttle.
- Keep interaction and animation visually smooth near 60Hz where the dataset and
  browser allow.
- Avoid improving one bulk scenario by regressing chart stream or alpha burst.

## Lessons From Rejected Experiments

Rejected experiments are preserved in git history as record/revert commit pairs.

Observed constraints:

- CPU mesh can improve bulk animation, pan, and zoom, but naive full replacement
  regresses chart stream and alpha burst.
- GPU-side animation alone regresses most scenarios due to shader/attribute
  overhead.
- Packed color CPU mesh did not offset mesh update cost.
- Removing radius/slice helps some bulk and pan cases but regresses chart stream
  and highlight alpha.
- Rebuilding `particleChildren` for naive viewport culling costs more than it
  saves.

Implication:

- The final design must separate model diffing, renderer policy, update
  scheduling, sparse updates, bulk updates, alpha groups, and culling data
  structures.
- A single renderer strategy for every workload is not sufficient.

