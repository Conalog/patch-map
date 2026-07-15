# Performance Core v2 Policy

## Product intent

- Build a PixiJS v8 GPU-backed PATCH MAP core for large scenes and low-end Windows-class hardware while keeping the Core v1 dense/flat data model as the comparison control.
- Accept the existing PATCH MAP v0.10 external JSON directly. Preserve input object immutability, stable element IDs, component identity, relation endpoints, and deterministic interpretation.
- Public API and per-entity Pixi identity compatibility are not required. Unsupported input must be surfaced explicitly rather than silently discarded.
- Preserve deterministic state transitions, atomic failure, lifecycle safety, visible animation, and explicit state-versus-frame boundaries.

## Workspace and evidence boundary

- Work only on the `performance/core-v2` branch and its dedicated worktree.
- Allowed inputs are files already present in this worktree, the inherited self-authored Core v1 source, the production fixture, official public PixiJS v8 documentation/API, installed PixiJS skills, and self-authored tests and measurements.
- Do not open or search other worktrees, branches, refs, Git history, original/reference internals, dependency source, `node_modules`, `dist`, bundles, or source maps.
- `performance/core-v1`, `cleanroom/implementation-v0.10`, `lab/engine-comparison`, existing v0.10 evidence, and approved artifacts are immutable. New Core v2 work lives in separate paths.

## Input contract

- Inventory and support the actually used item, grid, relations, and component records, including top-level element/component/attrs/metadata variants in the production fixture and current public schema.
- Parse caller-owned JSON without mutating, annotating, reordering, or retaining mutable aliases into authoritative state.
- Preserve stable IDs, component IDs/types, source/target identity, and deterministic slot assignment. Duplicate, dangling, invalid, or unsupported data produces structured diagnostics or an atomic error according to the documented support table.
- Keep normalization, store load, GPU upload, and first visible frame separately measurable.

## Architecture contract

- Use `schema parser -> dense store plus ID/component/relation indexes -> aggregate Pixi render layers`.
- Retain only a few meaningful Pixi containers/render groups: world/static/dynamic/relation/interaction overlay. Expose stable debug labels and aggregate counts for PixiJS DevTools.
- Rect/background/bar and relations use aggregate geometry. Images/icons use atlas-backed Sprite or Particle candidates. Dynamic Latin/numeric text uses BitmapText/MSDF where valid; CJK and advanced styles use a guarded Text fallback.
- Attach federated interaction at the root only and resolve entities through the core spatial index under the current viewport transform. Do not add entity listeners.
- Own one central invalidation/animation scheduler. Default to manual rendering; run frames only during animation or gestures. Do not add entity tickers, callbacks, or closures.
- Commit bar changes atomically and update only dirty GPU buffer ranges where the chosen public Pixi API permits it. Animation must be visibly interpolated, not committed only at the end.
- WebGL is the production baseline. Any WebGPU path and shader must be separately compatible, measured, and labeled experimental.

## Spike and selection contract

- Compare at least two renderer spikes over the same parser/store and data: A) aggregate Mesh/custom batch-oriented geometry; B) Particle/Sprite/GraphicsContext-oriented rendering.
- Choose on measured end-to-end behavior, not a microbenchmark alone. Report draw-object count, upload behavior, first-frame cost, update cost, visual/functional coverage, lifecycle risk, and backend portability.
- A custom RenderPipe or Batcher is permitted only when public PixiJS contracts are sufficient, browser/package tests cover it, and measured benefit outweighs backend and maintenance risk.

## Measurement contract

- Measure 100, 500, 1,000, 2,000, 5,000 records and the production dataset using identical JSON inputs and seeded random changes.
- Separate normalization, store load, GPU upload/prepare, first visible frame, pan/zoom frame p95, full and partial bar animation, initial and random text changes, hit-test/selection, resize, destroy/re-init, and retained heap.
- Use two warmups and seven measured samples. Preserve raw samples plus median, p95, min, max and environment metadata.
- Compare against the frozen Core v1 results only where workload semantics and expanded entity counts are comparable; state mismatches and every favorable or unfavorable interval.
- Chromium 4x CPU throttling is a development proxy. Native Windows results remain pending until run on actual target hardware.

## Functional and lifecycle gates

- Prove direct existing-JSON load, seeded random bar/text data, animated bar height changes, text render/change, pan, cursor-centered zoom, reset/fit, transformed hit-test, selection/empty/non-target handling, asset load/unload, resize, destroy/re-init, and extract/capture.
- Prove input immutability, deterministic normalization/slot identity, package subpath consumption, and lifecycle memory release.
- Run the final interactive lab in a headed browser with zero console and network errors.
- Use PixiJS `Application.init()`/manual render lifecycle, explicit asset ownership, prepare/upload where measured, safe destroy ordering, and global resource release only when ownership permits.

## Completion and verification

- Keep architecture research, support matrix, rejected spike, results, limitations, and reproducible commands in Core v2-specific docs and evidence paths.
- Run build, typecheck, lint, unit, browser, package, memory, and performance gates in proportion to affected risk. Run expensive matrices only at spike selection and final-candidate checkpoints.
- Split implementation, verification/evidence, and documentation into intent-scoped commits. Finish with a clean worktree and report selected architecture, rejected spike, schema support, functional results, scale results, Core v1 comparison, memory/package proof, Windows pending status, and commit SHAs.
