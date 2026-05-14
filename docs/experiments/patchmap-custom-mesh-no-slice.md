# Patchmap Custom Mesh No-Slice Experiment

Rejected experiment record.

## Change

- Replaced aggregate panel bar rendering with a custom CPU-updated Pixi Mesh.
- Removed nine-slice/radius rendering for aggregate bars and rendered bars as flat, no-radius quads.
- Kept patch-service aggregate bar API shape compatible during the experiment.

## Benchmark

Report:

- `.gstack/benchmark-reports/2026-05-13T10-14-52-837Z-patchmap-frame-benchmark.json`

Baseline:

- `.gstack/benchmark-reports/2026-05-13T08-29-31-964Z-patchmap-frame-benchmark.json`

## Result

| Scenario | Baseline FPS | Experiment FPS | Delta |
|---|---:|---:|---:|
| draw+update animated bars | 52.43 | 49.22 | -6.1% |
| all bars every 1s x10 | 38.42 | 44.43 | +15.6% |
| wheel pan | 26.69 | 31.99 | +19.9% |
| ctrl wheel zoom | 36.00 | 38.88 | +8.0% |
| panel chart stream | 12.46 | 8.91 | -28.5% |
| highlight alpha burst | 25.75 | 13.57 | -47.3% |

## Decision

Rejected. The experiment improved some bulk update and interaction cases, but regressed patch-service chart stream and highlight alpha scenarios too much for production use.
