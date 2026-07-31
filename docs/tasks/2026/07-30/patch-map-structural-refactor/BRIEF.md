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
- Exact clone analysis reports 7.3% across product, Lab, tests, performance,
  and verification. Only semantically equivalent helper families will move.
- Repeated retargeting has two measured costs: rounded-bar chunk rebuilds and
  presentation/reconcile allocation and lookup work.

# Current State

- The worktree started clean on `performance/core-v2`.
- Three independent analyses completed: structure/dependency, duplication/test
  structure, and PixiJS lifecycle/hot-path performance.
- T1 moved exact hash, grid, and relation endpoint atoms to shared owners and
  removed the accessibility-to-engine type back-edge without changing the
  package surface.
- T2 moved surface/world geometry and relation hit indexing into a pure engine
  module while keeping `PatchMap` and `PixiEngineSurface` as the only runtime
  owners in the facade.
- T3 moved component/text semantic indexing and its incremental fast paths
  behind typed maps, leaving atomic load/patch/history decisions in `PatchMap`.
- T4 moved the Pixi/Core surface adapter and its port contracts below the
  facade; headless 173-route, actual-production, and 2+7 ownership gates pass.
- T5 split aggregate Mesh geometry and store-to-CPU lane planning into pure
  modules; `mesh-layer.ts` remains the sole Pixi resource, upload, culling,
  and destroy owner.
- T6 retains rounded-bar Mesh/Geometry identity for value-only updates and
  uploads only changed position buffers; structural style, radius, visibility,
  and fill-presence transitions still rebuild atomically.
- T7 routes Core bar reconciliation through one controller-owned scalar
  scratch while keeping public presentation results frozen; the isolated
  5,000-bar controller stage improved by more than 50%.
- T8 separates the manual Lab's pure markup/copy/panel renderer from its live
  session and shares only exact browser-safe value helpers across seven
  contract runtimes. Import-free contract files remain standalone.
- T9 moves Core and Engine public DTO contracts to type-only owners and moves
  the actual-only contract Lab surface double into a test support boundary.
  Root exports, runtime authority, and the expected/comparator firewall remain
  unchanged; full unit/build/contract and packed-consumer gates pass.

# Next Step

- Run the final release checkpoint: headless Lab, lifecycle memory, quiet-host
  performance confirmation, task-local context validation, and independent PR
  review; then commit the durable checkpoint and leave a clean worktree.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
