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

- The allowed inventory is 671 files / 486,968 LOC after excluding
  generated and forbidden content; 224,708 LOC is retained result JSON rather
  than refactorable code.
- `engine.ts`, `core.ts`, and `pixi-renderer.ts` are 5,542, 1,969, and 1,813
  LOC. Transaction commit, frame publication, and nonvisual accessibility
  overlay ownership now live in focused downward authorities while their
  atomic writers remain singular.
- Parser, transaction, text-layout, incremental-parser, authoring, editor,
  Mesh, and Pixi CPU planning facades have focused owners below unchanged
  public, GPU/Application, and resource boundaries.
- Renderer ownership stays one manual loop, aggregate layers, one root
  interaction authority, and explicit asset/destroy coordination; Engine asset
  sessions and its managed loop now have singular child authorities.
- The shipping identity is only `@conalog/patch-map`, `PatchMap`, and
  `/lab/patch-map/`; historical `core-v2` identifiers remain only inside
  immutable contract/evidence compatibility boundaries.

# Current State

- Every allowed file receives a keep, move, split, consolidate, or delete
  judgment; cohesive files do not require mechanical edits.
- The working plan owns the current 671-file disposition and completed T0–T10
  migration map. Product facades retain atomic publication, scheduler,
  renderer, listener, lifecycle, asset, and ownership-registry writes above
  acyclic value/planning modules.
- Parser, Dataset, transaction, reconcile, text, authoring, editor, host,
  renderer planning, Lab presentation, and contract-test execution support now
  have explicit domain owners without a parallel public or write path.
- The final checkpoint passes 194 unit files / 1,729 tests, full lint/typecheck,
  product/Lab builds, canonical 38/173, headless 173 routes / 192 checks, and
  2+7 memory with 5,099 entities, nine cycles, and 98,215-byte retained median.
- Expected-blind automation, browser/package cleanup, Lab sessions, and
  performance tooling now compose focused owners while preserving registries,
  action IDs, sample order, result shape, and final destroy enforcement.
- WebGL proxies pass at 5,000 records for 2+7 animation/pan and repeated
  retarget workloads. The 10,000-record load/interaction and animation/pan
  smoke pass; repeated retarget remains honestly unfavorable under active pan.
- Packed consumer was not repeated because package exports, dependencies,
  assets, and consumer boundaries did not change. Qualified WebGPU and Windows
  native remain pending.

# Next Step

- Open the cleanup PR from the clean structural-refactor branch; perform the
  version increase only after merge.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
