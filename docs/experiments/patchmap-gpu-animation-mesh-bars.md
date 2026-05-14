# Patchmap GPU Animation Mesh Bars Experiment

Rejected experiment record.

## Change

- Replaced aggregate panel bar rendering with a custom Pixi Mesh.
- Moved bar animation interpolation into shader attributes/uniform time.
- Used per-bar from/to/timing attributes to reduce JavaScript animation work.

## Benchmark

Report:

- `.gstack/benchmark-reports/2026-05-13T09-36-50-452Z-patchmap-frame-benchmark.json`

Baseline:

- `.gstack/benchmark-reports/2026-05-13T08-29-31-964Z-patchmap-frame-benchmark.json`

## Result

| Scenario | Baseline FPS | Experiment FPS | Delta |
|---|---:|---:|---:|
| draw+update animated bars | 52.43 | 42.67 | -18.6% |
| all bars every 1s x10 | 38.42 | 41.15 | +7.1% |
| wheel pan | 26.69 | 17.28 | -35.3% |
| ctrl wheel zoom | 36.00 | 29.77 | -17.3% |
| panel chart stream | 12.46 | 9.80 | -21.3% |
| highlight alpha burst | 25.75 | 6.84 | -73.4% |

## Decision

Rejected. GPU-side interpolation reduced some JavaScript animation work, but added enough shader and attribute overhead to regress most 4x CPU frame scenarios.
