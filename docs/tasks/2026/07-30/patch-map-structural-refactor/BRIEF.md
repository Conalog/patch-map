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

- The initial allowed refactor inventory contained 84 product files, 48 Lab
  files, 156 tests, 23 performance files, 104 verification files, and five
  examples: 420 files total. New cohesive modules remain in the same review
  ledger; frozen evidence and generated/dependency content stay excluded.
- `engine.ts` is 6,372 LOC and `core.ts` is 2,650 LOC. Parser, transaction,
  text-layout, incremental-parser, authoring, and editor-workflow facades are
  now 601, 969, 310, 614, 96, and 900 LOC with focused downward owners.
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
  projection planning plus Engine viewport/publication/scene/transformer/
  surface/reconcile/history planning now have explicit owners while atomic
  publication and live runtime installation remain in their facades.
- Parser transform/state/value normalization, Dataset normalization,
  transaction inputs/fast paths, Core reconcile/dense planning, and Engine
  input/publication policy now have focused owners; atomic writers remain in
  their facades.
- Renderer text/DevTools decisions, renderer leases, leaf signatures, and Pixi
  dirty-range/relation planning have pure owners without changing shared GPU
  resource ownership.
- Lab input/actions, component-asset inspector, run profile/results, and
  expected-blind recursive module firewall have focused owners while session,
  lifecycle, and DOM composition writers remain singular.
- Large update-handler and text-fold tests now expose case-domain suites and
  expected-blind fixture/runner owners; every module is under 1,000 LOC and
  comparison remains isolated.
- Text layout, incremental parsing, authoring planning, and editor workflow
  normalization now have downward owners; public facades, error channels,
  exact order, immutable plans, and the workflow single writer remain intact.
- Parser lowering and structural transaction planning are split into acyclic
  owners; relation cleanup now falls back before touching an external frozen
  relation root.
- The checkpoint passes 188 unit files / 1,612 tests, lint/typecheck, and
  independent P0–P2 review. Unchanged renderer/Lab/package/lifecycle/hot paths
  retain their preceding risk-specific checkpoints.

# Next Step

- Split renderer CPU planning and publication-policy atoms while retaining
  Pixi Application, aggregate GPU resources, frame ownership, and exact upload
  behavior in their current coordinators.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
