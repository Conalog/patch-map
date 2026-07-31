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

- `src/patch-map` contains 76 files and 65,664 LOC. `engine.ts` is 7,871 LOC;
  public Engine contracts, Pixi surface adaptation, geometry, semantic
  indexing, and Mesh planning now have explicit owners below the facade.
- Renderer ownership is sound: one manual Application loop, aggregate layers,
  one root interaction authority, and explicit asset/destroy coordination.
- The shipping identity is only `@conalog/patch-map`, `PatchMap`, and
  `/lab/patch-map/`; historical `core-v2` identifiers remain only inside
  immutable contract/evidence compatibility boundaries.

# Current State

- T1-T4 established shared utility, geometry, semantic-index, and Pixi surface
  boundaries while leaving atomic mutation and runtime ownership in the
  `PatchMap` facade.
- T5-T7 separated Mesh planning and retained rounded-bar geometry, then removed
  reconcile allocations; Pixi resource/upload/destroy ownership remains in
  `mesh-layer.ts` and the central scheduler remains singular.
- T8-T9 separated the pure Lab view, shared exact runtime values, Core/Engine
  public contracts, and the actual-only test harness without weakening the
  expected/comparator firewall or root API.
- Final gates pass 151 files / 1,471 tests, package and Lab builds, canonical
  38 decisions / 173 cases, packed ESM/CJS/types plus 38 journeys, headless
  173 routes / 192 checks, actual-production rendering, and 2+7 lifecycle
  memory with complete resource release.
- The final 5,000-bar 2+7 proxy remains honestly FAIL: 1x repeated-action
  median/p95 is 50.9/109.1ms, while one 4x sample reached 2,924.9ms over the
  900ms limit. Windows-native and qualified WebGPU measurements remain pending.

# Next Step

- Open and review the cleanup PR. Version bumping and native target
  qualification remain post-merge work.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
