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

- `src/patch-map` contains 64 files and 64,704 LOC. `engine.ts` is 11,270 LOC
  and combines public contracts, the product facade, the Pixi surface adapter,
  semantic indexing, geometry snapshots, and relation hit indexing.
- Renderer ownership is sound: one manual Application loop, aggregate layers,
  one root interaction authority, and explicit asset/destroy coordination.
- Exact clone analysis reports 7.3% across product, Lab, tests, performance,
  and verification. Only semantically equivalent helper families will move.
- The known 5,000-bar repeated-retarget outliers are dominated by
  presentation/reconcile allocation and lookup work, not canvas draw time.

# Current State

- The worktree started clean on `performance/core-v2`.
- Three independent analyses completed: structure/dependency, duplication/test
  structure, and PixiJS lifecycle/hot-path performance.
- T1 moved exact hash, grid, and relation endpoint atoms to shared owners and
  removed the accessibility-to-engine type back-edge without changing the
  package surface.

# Next Step

- Extract pure surface geometry and relation hit indexing from `engine.ts`,
  keeping `PatchMap` as the sole lifecycle/publication coordinator. Move the
  Pixi surface adapter only after its destroy and late-initialization ownership
  can be verified as one cohesive checkpoint.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
