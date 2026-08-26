# Performance

Performance code measures the current source tree and writes transient results
under `.artifacts/performance/`. Runners depend only on current source and owned
fixtures.

| Owner | Purpose | Command |
| --- | --- | --- |
| `browser-options.mjs` | Shared headed/headless Chromium launch options for executable measurements | imported by benchmark and memory runners |
| `benchmark/` | Browser workload, visible milestones, and current-run summary | `node performance/runners/benchmark.mjs --smoke` or full without `--smoke` |
| `fixtures/` | Deterministic synthetic and production-shaped inputs | imported by benchmark and focused tests |
| `probes/memory/` | Mount/load/render/destroy heap and resource release | `node performance/runners/memory.mjs` |
| `probes/extraction/` | Exact-tuple PNG readback timing and cleanup | `node performance/runners/extraction.mjs` |
| `probes/update/` | Public transaction CPU-path input | `node performance/runners/update.mjs` |
| `runners/` | Thin executable entrypoints | invoke the matching owner above |

Benchmark smoke and probe success establish harness correctness and lifecycle
invariants. Timing results are measurements, not regression claims, until a
comparable baseline and predeclared budget exist for the same environment.
