# Goal

- Promote the completed PixiJS implementation to the sole
  `@conalog/patch-map` product as `PatchMap`, remove unfinished Core v1 and
  user-facing Core v2 experiment surfaces, and finish a clean PR-ready branch
  without changing approved contract evidence.

# Scope

- Preserve the PATCH MAP v0.10 input boundary, immutable caller data, stable
  IDs/component identity, atomic failure, aggregate rendering, and explicit
  lifecycle ownership.
- Preserve immutable functional-contract fixtures, normalized expected
  observations, review evidence, and retained digest-bound performance
  evidence.
- Remove Core v1 product code, Lab, build/package surface, and tests. Move only
  the dense-store substrate still used by the product into neutral internal
  paths.
- Replace the legacy root export with the completed PixiJS product. Do not
  preserve the old `Patchmap` public API.
- Remove `core-v2` from current package exports, source paths, Lab URLs,
  examples, builds, and public symbols. Digest-bound historical identifiers
  remain internal.

# Current Facts

- The completed candidate already passes the 173-case contract, packed
  consumer, headless browser, lifecycle memory, and 10,000-record Lab gates.
- The final renderer owns its scheduler and aggregate PixiJS lifecycle.
- Core v1 was an incomplete performance control. Its reusable dense substrate
  now lives under `src/patch-map/dense`; the Core v1 tree is no longer a
  product or verification dependency.
- Package version remains `0.10.0`; the user will bump it after merge.

# Current State

- `src/patch-map` is the only product implementation and the root package
  exports `PatchMap` without versioned subpaths.
- The unfinished Core v1 Canvas2D product, legacy root implementation, old
  Labs/tests/builds, and unused v0.10 harnesses are removed. The retained dense
  substrate lives under `src/patch-map/dense`.
- Current docs, examples, Lab routes, build configuration, DevTools labels,
  browser bridges, and operational verification scripts use PatchMap naming.
- `/lab/patch-map/` is now the only user-facing Lab. It exposes the 173-case
  Korean manual workbench through `PatchMap`; the duplicate low-level
  performance Playground and its public runtime factory are removed.
- The canonical 173-case contract/evidence corpus remains unchanged.
- With explicit user approval, obsolete clean-room handoff files, the Core v1
  performance control, completed main-parity harness/captures, old task
  working logs, and unreferenced timestamped performance outputs are removed.
- Active benchmark and release tooling lives under `performance/patch-map`
  and `patch-map-*` script paths. Eleven directly referenced result artifacts
  remain, including the digest-bound named/raw-latest pair required by the
  contract performance verifier.
- GitHub CI now runs install, full typecheck/lint/unit, canonical contract,
  package build, and Lab build for every pull request and push.
- Current single-Lab gates pass: targeted tests, typecheck, full lint, package
  and Lab builds, canonical 38/173 contract verification, 173-route headless
  Lab (192/192), a 10,000-record animation/pan/destroy check, and packed
  ESM/CJS/types plus 38 journeys.
- Final full-unit verification passes 148/148 files and 1,451/1,451 tests
  after removal of the completed main-parity harness test.
- Repeated 5,000-bar retargeting now defers exact semantic digest
  materialization until observation, avoids redundant direct-batch target
  filtering, and reuses the active spatial hit envelope. The Lab does not
  force full snapshots while animations are active and reads live selection,
  viewport, and frame state through lightweight product seams.
- The new repeated-retarget checkpoint preserves 2+7 raw 1x/4x samples. At
  1x the repeated-action trial median is 90.0ms and pan-overlap rAF-gap trial
  median is 115.9ms. A 544.3ms 1x outlier and 1,036.9ms 4x p95 exceed the
  predeclared budgets, so the performance checkpoint honestly remains FAIL;
  Windows native remains pending.
- Packed ESM/CJS/types, four examples, and all 38 consumer journeys pass with
  lifecycle cleanup after the lightweight state getters were added.
- Package verification writes transient output unless a release artifact
  directory is explicitly requested, so frozen evidence remains unchanged.
- Repository residue cleanup is fixed in `1f2f3ef`; it removes 431 tracked
  files and more than 742,000 generated/evidence lines while preserving every
  live source reference and canonical contract input.

# Next Step

- Commit the repeated-bar performance tranche, complete final review, and
  create the PR from the clean `performance/core-v2` branch. Version bumping
  remains post-merge work.

# Verification Cadence

- After mechanical source migration: targeted product unit tests, typecheck,
  and scoped lint.
- After package/Lab integration: full product unit, lint/typecheck, both
  builds, canonical contract verifier.
- Final candidate: packed consumer, headless 173-case Lab, lifecycle memory,
  and changed-path browser checks.
- No full performance matrix unless the renderer/scheduler hot path changes.
