# Goal

- Refactor PatchMap into explicit product ownership boundaries while preserving every approved
  observable contract and improving or maintaining WebGL performance.

# Scope

- Preserve the root `@conalog/patch-map` / `PatchMap` API, PATCH MAP v0.10
  compatibility, immutable input, stable identity, atomic failure, aggregate
  rendering, central scheduling, and explicit resource cleanup.
- Keep approved contract fixtures, normalized expected observations, review
  evidence, and historical digest-bound performance evidence immutable.
- Treat qualified WebGPU and Windows-native results as pending.

# Current Facts

- The allowed inventory is 637 files / 486,674 LOC after excluding
  generated and forbidden content; 224,708 LOC is retained result JSON rather
  than refactorable code.
- `engine.ts` is 6,108 LOC and `core.ts` is 2,358 LOC. Parser, transaction,
  text-layout, incremental-parser, authoring, and editor-workflow facades have
  focused downward owners while their atomic writers remain singular.
- Mesh and Pixi renderer coordinators are 1,256 and 2,002 LOC after CPU value
  planning moved below unchanged GPU/Application/resource owners.
- Migration, semantic probe, and scheduling now expose compact compatibility
  facades above contracts, pure observation/compatibility values, frame-driver,
  and adaptive-budget leaves while keeping their state writers singular.
- Renderer ownership stays one manual loop, aggregate layers, one root
  interaction authority, and explicit asset/destroy coordination; Engine asset
  sessions and its managed loop now have singular child authorities.
- The shipping identity is only `@conalog/patch-map`, `PatchMap`, and
  `/lab/patch-map/`; historical `core-v2` identifiers remain only inside
  immutable contract/evidence compatibility boundaries.

# Current State

- Every allowed file receives a keep, move, split, consolidate, or delete
  judgment; cohesive files do not require mechanical edits.
- The working plan owns the 614-file disposition and T0–T10 migration map.
  Product facades retain atomic publication, scheduler, renderer, listener,
  lifecycle, asset, and ownership-registry writes above acyclic value/planning
  modules.
- Parser, Dataset, transaction, reconcile, text, authoring, editor, host,
  renderer planning, Lab presentation, and contract-test execution support now
  have explicit domain owners without a parallel public or write path.
- The checkpoint passes 192 unit files / 1,716 tests, full lint/typecheck,
  product/Lab builds, canonical 38/173, headless 173 routes / 192 checks, and
  2+7 memory over 5,099 entities and nine ownership cycles with a 100,451-byte
  retained-heap median. Export and frame algorithms did not change.
- Lab pointer gestures and executable trusted-input sessions now have explicit
  retryable cleanup owners while preserving one visible workbench session.
- Update/pointer action handlers and update/pointer/layout observation folds
  now compose focused owned modules behind a recursive expected-blind import
  firewall; their registries, action IDs, case dispatch, and comparison
  boundary remain unchanged.

# Next Step

- Split the remaining browser and package verification orchestrators along
  process, source-template, evidence, and comparison boundaries while keeping
  each root as the sole I/O and cleanup owner.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
