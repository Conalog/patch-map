# Goal

- Ship the completed aggregate PixiJS implementation as the sole
  `@conalog/patch-map` product and finish a clean PR-ready branch without
  changing approved contract evidence.

# Scope

- Preserve PATCH MAP v0.10 JSON compatibility, caller immutability, stable
  IDs/component identity, atomic failure, aggregate rendering, and explicit
  lifecycle/resource ownership.
- Keep the canonical 38-decision/173-case corpus and retained digest-bound
  evidence immutable. Windows-native and qualified WebGPU results remain
  pending until measured on those targets.

# Current Facts

- `src/patch-map` is the only shipping implementation; `PatchMap` is the root
  package class and `/lab/patch-map/` is the single Korean manual Lab.
- The Lab exposes all 173 manually operable routes, seeded scenes through
  10,000 records, and the user-supplied 605-root actual-production JSON.
- Grid item-template bar state and concrete cell presentation state now have
  separate public operations: `updateBarHeights()` changes authored semantic
  state, while `updateInstanceBarHeights()` addresses stable
  `<grid>.<row>.<column>` IDs without rewriting the dataset or history.
- The default package entry now guides application developers through
  `PatchMap.mount()` and cohesive `data/targets/bars/texts/selection/transform/
  viewport/history/assets/capture` domains. `PatchMapAdvanced` retains the
  deterministic low-level seams without creating a second runtime or renderer.
- The structural refactor keeps atomic mutation in the facade while assigning
  geometry, semantic indexing, Pixi adaptation, Mesh planning, public
  contracts, Lab presentation, and actual-only test harnesses explicit owners.

# Current State

- Actual-production alpha, image pivot/underlay, remote allowlist, async
  invalidation, content orientation, and aggregate lane behavior remain
  verified without per-entity display objects or listeners.
- The current 762-file allowed-tree inventory has been reviewed across runtime,
  renderers, Lab/examples, tests/verification/performance, documentation,
  configuration, and binary assets. The structural migration keeps singular
  transaction, frame, accessibility, asset, interaction, and resource
  authorities while eliminating newly identified reentrant, supersession,
  cleanup-retry, descriptor-safety, culling-bound, and Lab lifecycle defects.
- The fresh branch-readiness checkpoint passes 195 unit files / 1,759 tests,
  full lint/typecheck, product/Lab builds, canonical 38/173, headless 173
  routes / 192 checks, actual-production WebGL over 605 roots / 643
  components, 2+7 memory over 5,099 entities plus nine ownership cycles, and
  the strict packed ESM/CJS/types consumer with 38 journeys, four examples,
  aggregate-object ownership, lifecycle cleanup, and the required audit.
- Public `core-v2` Lab aliases and canvas probe identity are removed; retained
  historical identifiers exist only in immutable contract/evidence tooling.
- The branch-readiness patch is fixed in separate runtime/rendering, Lab
  lifecycle, release-verification, and documentation commits. No version,
  push, PR metadata, or merge action is part of this checkpoint.
- The current 5,000-bar repeated-retarget 2+7 Chromium proxy passes its fixed
  budgets: repeated-action p95 is 62.4ms at 1x and 234.9ms at 4x. The 4x rAF
  p95 remains unfavorable at 251.9ms with long-task-count p95 11. The fresh
  10,000-bar 1x smoke passes at 104.3ms repeated-action p95 and 166.6ms rAF
  p95, with 21 long tasks still reported rather than hidden. Windows-native
  and qualified WebGPU results remain pending.
- The concrete grid-instance checkpoint uses one aggregate Mesh path and one
  central presentation controller while retargeting during pan. Its fresh 2+7
  WebGL proxy records repeated-update p95 medians of 25.5ms for 5,000 cells and
  58.9ms for 10,000 cells. The 10,000-cell rAF-gap p95 median is 99.1ms and
  long-task-count median is 2; those unfavorable residual gaps remain visible
  in `.perf-results/patch-map/instance-bar-latest.json`.
- The DX promotion checkpoint passes full lint, 196 unit files / 1,772 tests,
  typecheck, product and Lab builds, canonical 38/173 verification, and the
  required-audit packed ESM/CJS/types consumer with 38 journeys, four
  high-level examples, aggregate ownership, capture serialization, and clean
  lifecycle teardown. The renderer and bar hot path did not change, so this
  checkpoint makes no new performance claim.

# Next Step

- Update the cleanup PR when explicitly requested. Integrating services should
  start with `PatchMap.mount()` and the domain API, use compiled semantic
  targets for repeated batches, migrate materialized per-cell bar writes to
  the documented runtime overlay API, and retain non-bar per-cell live state
  until a separately approved package contract exists. The external
  project-context shape checker must learn that the retained
  `performance-core-v2/evidence` directory is evidence-only instead of asking
  this branch to restore explicitly removed legacy BRIEF/WORKLOG/DECISIONS.
  Increase the package version only after merge.
