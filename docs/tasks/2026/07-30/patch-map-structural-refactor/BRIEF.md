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
- `engine.ts` is 6,834 LOC, `core.ts` is 3,356 LOC, `parser.ts` is 2,746 LOC,
  `semantic/transaction.ts` is 2,485 LOC, and `semantic/dataset.ts` is 1,170
  LOC after the current authority extractions. `leaf-layer.ts` is now 1,804
  LOC, `pixi-renderer.ts` is 2,717 LOC, and contract `main.ts` is 1,820 LOC.
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
- Core publication, spatial hit, product probes, root interaction, and bar
  presentation; Engine viewport, frame publication, transformer edit, scene
  state, and surface lifecycle; and Dataset contracts, value, and authored
  style normalization now have explicit single owners.
- Reconcile ordering/dirty-root/bar fast-path planning and private Core load
  candidates/freshness/rollback checkpoints now have explicit owners while
  atomic publication and live runtime installation remain in their facades.
- Parser direct-text cache/index decisions and transaction request/operation/
  target/path normalization now have single downward owners without new scans.
- Leaf text-style decisions, nested Pixi DevTools registration, and contract
  Lab run-performance observation now have focused owners while Pixi resource
  creation, Application lifecycle, and Lab orchestration remain in their
  existing coordinators.
- The current checkpoint passes 171 unit files / 1,560 tests, full lint and
  typecheck, product/Lab builds, canonical 173 contract, and a representative
  headless WebGL Lab run with zero console/page/network errors. Unchanged-path
  package, memory, and performance gates were intentionally not repeated.
- The last verified product baseline remains 151 files / 1,471 tests,
  canonical 38/173, packed consumers, headless 173 routes, actual-production,
  10,000 records, and 2+7 memory cleanup. It is a baseline, not evidence for
  subsequent changed paths.

# Next Step

- Extract the next cohesive pure decision owners from the remaining Core and
  Engine facades while retaining atomic publication, renderer lifecycle, and
  stateful writer ownership in those facades.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
