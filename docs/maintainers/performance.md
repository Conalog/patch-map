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
| general runtime throughput or contract workload | `npm run perf` / `npm run perf:contract` |
| bar animation, retargeting, or public animation | `perf:bar-pan`, `perf:bar-retarget`, `perf:public-animation` |
| concrete grid or instance presentation | `perf:instance-bars`, `perf:grid-instance-presentation`, `perf:production-presentation` |
| keyed presentation composition | `perf:presentation` |
| asset acquisition, settlement, or publication | `perf:asset-readiness:packed-cross` |
| package artifact comparison | `perf:instance-bars:packed-cross` and `verify:package` |
| renderer/resource/destroy ownership | `verify:memory` before any performance conclusion |
| retained report and release evidence | `verify:performance-report`, `verify:performance-contract`, and release-readiness tooling |

Exact scripts and current command composition are owned by `package.json` and
the referenced harnesses under `performance/patch-map/` and
`scripts/verification/`.

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
and the [product policy](../reference/patch-map-product-policy.md) for fixed
runtime invariants.
