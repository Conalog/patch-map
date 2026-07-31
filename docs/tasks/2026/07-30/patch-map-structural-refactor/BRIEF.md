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

- The initial allowed refactor inventory contained 84 product files, 48 Lab
  files, 156 product tests, 23 performance files, 104 verification files, and
  five examples: 420 files total, excluding frozen evidence and prohibited
  generated/dependency content. New cohesive modules and their contract tests
  remain in the same file-by-file review ledger.
- `engine.ts` is 7,244 LOC, `core.ts` is 3,900 LOC, and
  `semantic/dataset.ts` is 1,531 LOC after the current authority extractions.
  The two facades still
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
- Parser value policies, transaction contracts/diagnostics/JSON staging, the
  Lab executable runtime, renderer resource ports, and Engine viewport state
  now have explicit owners. A file-by-file disposition rule and T0–T10
  migration map are recorded in the working architecture plan.
- Core publication, spatial hit, product probes, and root interaction; Engine
  viewport, frame publication, transformer edit, and scene state; and Dataset
  contracts/value normalization now have explicit single owners.
- The current integrated checkpoint passes 162 unit files / 1,524 tests, full
  lint, and full typecheck. Renderer, package, memory, and hot-path ownership
  did not change in this checkpoint, so their expensive gates were not rerun.
- The last verified product baseline remains 151 files / 1,471 tests,
  canonical 38/173, packed consumers, headless 173 routes, actual-production,
  10,000 records, and 2+7 memory cleanup. It is a baseline, not evidence for
  subsequent changed paths.

# Next Step

- Extract Core bar presentation and load/reconcile candidates, Engine surface
  lifecycle and remaining root interaction, then continue Dataset style and
  ownership, transaction, parser, renderer, Lab, test, verification, and
  performance tranches while retaining atomic facade composition.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
