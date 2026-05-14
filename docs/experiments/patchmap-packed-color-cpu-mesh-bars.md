# Patchmap Packed-Color CPU Mesh Bars Experiment

Rejected experiment record.

## Change

- Replaced aggregate panel bar rendering with a CPU-updated Pixi Mesh.
- Used a 6-piece borderless layout for rounded bars.
- Packed color into an `unorm8x4` vertex attribute to reduce color buffer size.

## Benchmark

Report:

- `.gstack/benchmark-reports/2026-05-13T10-05-18-563Z-patchmap-frame-benchmark.json`

Baseline:

- `.gstack/benchmark-reports/2026-05-13T08-29-31-964Z-patchmap-frame-benchmark.json`

## Result

| Scenario | Baseline FPS | Experiment FPS | Delta |
|---|---:|---:|---:|
| draw+update animated bars | 52.43 | 38.43 | -26.7% |
| all bars every 1s x10 | 38.42 | 41.70 | +8.5% |
| wheel pan | 26.69 | 19.30 | -27.7% |
| ctrl wheel zoom | 36.00 | 17.80 | -50.6% |
| transformer select | 52.91 | 49.33 | -6.8% |
| shift drag multi select | 46.54 | 50.58 | +8.7% |
| panel mixed state burst | 26.57 | 18.42 | -30.7% |
| panel chart stream | 12.46 | 10.08 | -19.1% |
| highlight alpha burst | 25.75 | 19.14 | -25.7% |
| report backgrounds burst | 28.96 | 26.22 | -9.5% |

## Decision

Rejected. Packed color and the reduced piece count did not offset mesh update overhead. Most interaction and streaming scenarios regressed.
