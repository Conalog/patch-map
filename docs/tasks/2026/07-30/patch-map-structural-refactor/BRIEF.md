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
- `engine.ts` is 6,616 LOC, `core.ts` is 3,140 LOC, `parser.ts` is 2,358 LOC,
  `semantic/transaction.ts` is 1,965 LOC, and `semantic/dataset.ts` is 1,170
  LOC after the current authority extractions. `leaf-layer.ts` is 1,685
  LOC, `pixi-renderer.ts` is 2,474 LOC, and contract `main.ts` is 1,820 LOC.
  The facades still combine enough stateful responsibilities to require
  further ownership work.
- Renderer ownership is sound: one manual Application loop, aggregate layers,
  one root interaction authority, and explicit asset/destroy coordination.
- The shipping identity is only `@conalog/patch-map`, `PatchMap`, and
  `/lab/patch-map/`; historical `core-v2` identifiers remain only inside
  immutable contract/evidence compatibility boundaries.

# Current State

- The task is reopened for a file-by-file refactor. Every allowed file will
  receive an explicit keep, move, split, consolidate, or delete judgment;
  mechanical edits to already cohesive files are not required.
- The working plan owns the 420-file disposition and T0–T10 migration map;
  initial clone analysis found 379 groups / 4.4% duplication, concentrated in
  contract automation/tests and several product helper families.
- Core publication/load/spatial-hit/root-interaction/bar-presentation and
  Engine viewport/publication/scene/transformer/surface-lifecycle/reconcile
  decisions now have explicit owners while atomic publication and live runtime
  installation remain in their facades.
- Parser direct-text indexes and transform projection, Dataset contracts/value/
  style normalization, transaction request normalization, renderer text and
  DevTools decisions, and Lab runtime/view/run observation have focused owners.
- Immutable Engine operation outcomes and Core renderer leases now have single
  owners without changing event order or shared GPU resource ownership.
- Leaf publication signatures, Pixi dirty-range/relation planning, and owned
  transaction fast paths now have pure owners while resource and state writers
  remain in their facades.
- Parser state/diagnostics/freeze, semantic-to-dense planning, and text probe
  publication policy now have focused owners without changing facade writers.
- The current checkpoint passes 178 unit files / 1,584 tests, full lint and
  typecheck, product/Lab builds, canonical 173 contract, and a representative
  headless WebGL Lab run from the preceding renderer checkpoint. Unchanged-path
  package, memory, and performance gates were intentionally not repeated.

# Next Step

- Split the next cohesive Core/parser reconcile and value-normalization
  responsibilities, then move into Lab composition and remaining test,
  verification, and performance file dispositions without moving writers.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
