# Goal

- Refactor PatchMap into explicit API, engine, renderer, semantic, dense-store,
  Lab, and verification ownership boundaries while preserving every approved
  observable contract and improving or maintaining WebGL performance.

# Scope

- Preserve the root `@conalog/patch-map` / `PatchMap` API, PATCH MAP v0.10
  compatibility, immutable input, stable identity, atomic failure, aggregate
  rendering, central scheduling, and explicit resource cleanup.
- Keep approved contract fixtures, normalized expected observations, review
  evidence, and historical digest-bound performance evidence immutable.
- Treat qualified WebGPU and Windows-native results as pending.

# Current Facts

- The allowed refactor corpus contains 76 product files, 41 Lab files, 152
  product tests, 23 performance files, 104 verification files, and five
  examples, excluding frozen evidence and prohibited generated/dependency
  content.
- `engine.ts` is 7,871 LOC and `core.ts` is 4,392 LOC. Their classes still
  combine lifecycle, mutation, presentation, viewport, interaction, assets,
  publication, and diagnostics, so the prior completed assessment was wrong.
- Renderer ownership is sound: one manual Application loop, aggregate layers,
  one root interaction authority, and explicit asset/destroy coordination.
- The shipping identity is only `@conalog/patch-map`, `PatchMap`, and
  `/lab/patch-map/`; historical `core-v2` identifiers remain only inside
  immutable contract/evidence compatibility boundaries.

# Current State

- The task is reopened for a file-by-file refactor. Every allowed file will
  receive an explicit keep, move, split, consolidate, or delete judgment;
  mechanical edits to already cohesive files are not required.
- Initial clone analysis over TypeScript/JavaScript finds 379 clone groups and
  4.4% duplication at the 15-line/100-token threshold, concentrated in
  contract folds/handlers/tests plus several product helper families.
- The last verified product baseline remains 151 files / 1,471 tests,
  canonical 38/173, packed consumers, headless 173 routes, actual-production,
  10,000 records, and 2+7 memory cleanup. It is a baseline, not evidence for
  subsequent changed paths.

# Next Step

- Complete the full file inventory and extract the first cohesive Core and
  Engine state authorities while retaining atomic facade composition.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
