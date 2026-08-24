# PatchMap performance workflow

Performance work uses the repository's existing workloads, budgets, sampling,
and artifact provenance. This document routes maintainers to those owners; it
does not restate their numeric thresholds.

## No-regression rule

Architecture refactors begin as no-regression changes. Run the cheapest
representative gate for the affected ownership boundary. Do not claim an
improvement unless baseline and candidate artifacts were measured with the same
workload, environment, cache state, sampling, and concurrency.

If a change does not touch a measured hot path, record that fact and omit a new
performance claim. Correctness, lifecycle, visual, and public-contract gates
remain mandatory even when a candidate is faster.

## Gate routing

| Changed boundary | Project-native owner |
| --- | --- |
| general runtime throughput or contract workload | `node performance/patch-map/run.mjs` / `node performance/patch-map/contract-run.mjs` |
| bar animation, retargeting, or public animation | `patch-map-bar-animation-pan-performance.mjs`, `patch-map-bar-retarget-performance.mjs`, `patch-map-public-animation-performance.mjs` |
| concrete grid or instance presentation | `patch-map-instance-bar-performance.mjs`, `patch-map-grid-instance-presentation-performance.mjs`, `patch-map-production-presentation-performance.mjs` |
| keyed presentation composition | `patch-map-presentation-performance.mjs` |
| asset acquisition, settlement, or publication | `patch-map-packed-asset-readiness-performance.mjs` |
| package artifact comparison | `patch-map-packed-instance-performance.mjs` and `npm run verify:package` |
| renderer/resource/destroy ownership | `npm run verify:memory` before any performance conclusion |
| retained report evidence | `node performance/patch-map/report/verify.mjs` and `node performance/patch-map/report/verify-contract.mjs` |

Bare filenames in the table live under `scripts/verification/` and run with
`node`. Exposed npm commands are owned by `package.json`; workload and report
composition are owned by the referenced harnesses under
`performance/patch-map/` and `scripts/verification/`.

## Evidence discipline

- Lock the baseline and candidate artifact identities before measurement.
- Preserve unfavorable samples and results; never relax a budget after seeing
  the outcome.
- Treat Chromium as a development proxy. Do not report it as Windows-native or
  qualified WebGPU evidence.
- Keep exploratory output under ignored `.perf-results/` unless the repository
  release process explicitly promotes it to retained evidence.
- Do not edit immutable functional fixtures, normalized observations, review
  evidence, or digest-bound retained results to make a gate pass.
- Separate product regressions from verifier, browser, operating-system, and
  external-environment failures.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the overall verification cadence
and [architecture ownership](architecture.md) for fixed runtime boundaries.
