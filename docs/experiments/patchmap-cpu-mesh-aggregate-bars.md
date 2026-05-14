# Patchmap CPU Mesh Aggregate Bars Experiment

Rejected experiment record.

## Change

- Replaced aggregate panel bar particles with a CPU-updated custom Pixi Mesh.
- Kept rounded/nine-slice rendering in the mesh path.
- Updated mesh vertex buffers from JavaScript on bar state changes and animation ticks.

## Benchmark

Report:

- `.gstack/benchmark-reports/2026-05-13T09-19-39-148Z-patchmap-frame-benchmark.json`

Baseline:

- `.gstack/benchmark-reports/2026-05-13T08-29-31-964Z-patchmap-frame-benchmark.json`

## Result

| Scenario | Baseline FPS | Experiment FPS | Delta |
|---|---:|---:|---:|
| draw+update animated bars | 52.43 | 58.14 | +10.9% |
| all bars every 1s x10 | 38.42 | 59.01 | +53.6% |
| wheel pan | 26.69 | 49.30 | +84.7% |
| ctrl wheel zoom | 36.00 | 46.63 | +29.5% |
| transformer select | 52.91 | 59.97 | +13.3% |
| shift drag multi select | 46.54 | 58.22 | +25.1% |
| panel mixed state burst | 26.57 | 28.53 | +7.4% |
| panel chart stream | 12.46 | 10.39 | -16.6% |
| highlight alpha burst | 25.75 | 17.32 | -32.7% |
| report backgrounds burst | 28.96 | 30.62 | +5.7% |

## Decision

Rejected as a full replacement. It improved bulk animation and interaction scenarios, but regressed patch-service chart streaming and highlight alpha enough to make the behavior unsuitable as the default renderer.
