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

- The 420-file allowed inventory excludes frozen and generated content.
- `engine.ts` is 6,162 LOC and `core.ts` is 2,495 LOC. Parser, transaction,
  text-layout, incremental-parser, authoring, and editor-workflow facades have
  focused downward owners while their atomic writers remain singular.
- Mesh and Pixi renderer coordinators are 1,256 and 2,002 LOC after CPU value
  planning moved below unchanged GPU/Application/resource owners.
- History is a 483-line atomic writer above contract and immutable record-value
  leaves; its weak pending registry releases terminal and abandoned snapshots.
- Accessibility is a 304-line state writer above contract and semantic-tree
  leaves. Presentation keeps its allocation-free hot controller intact above
  an import-free contract leaf.
- Migration, semantic probe, and scheduling now expose compact compatibility
  facades above contracts, pure observation/compatibility values, frame-driver,
  and adaptive-budget leaves while keeping their state writers singular.
- Renderer ownership stays one manual loop, aggregate layers, one root
  interaction authority, and explicit asset/destroy coordination.
- The shipping identity is only `@conalog/patch-map`, `PatchMap`, and
  `/lab/patch-map/`; historical `core-v2` identifiers remain only inside
  immutable contract/evidence compatibility boundaries.

# Current State

- Every allowed file receives a keep, move, split, consolidate, or delete
  judgment; cohesive files do not require mechanical edits.
- The working plan owns the 420-file disposition and T0–T10 migration map.
  Product facades retain atomic publication, scheduler, renderer, listener,
  lifecycle, asset, and ownership-registry writes above acyclic value/planning
  modules.
- Parser, Dataset, transaction, reconcile, text, authoring, editor, host,
  renderer planning, Lab presentation, and large contract-test composition now
  have explicit domain owners without a parallel public or write path.
- The checkpoint passes 190 unit files / 1,687 tests, full lint/typecheck,
  product/Lab builds, and canonical 38/173. The latest applicable 2+7 memory
  result remains 5,099 entities, nine ownership cycles, and a 97,195-byte
  retained-heap median; route, export, resource, and hot algorithms did not
  change in the latest structural tranche.
- Engine now delegates the repeated full/structural/flat component and text
  semantic branches to one existing planner owner without new collections,
  passes, closures, or atomic write paths.
- History preserves prepare/commit and undo/redo atomicity while rejecting
  accessor, sparse, symbol, extra-property, and non-finite snapshot inputs.
- Accessibility reconciliation validates and freezes its complete candidate
  before publication; presentation runtime algorithms and pass counts remain
  unchanged.
- Invalid migration remounts and frame-loop resumes now validate before
  changing live lifecycle state, preserving atomic failure.

# Next Step

- Extract Core reconcile candidate preparation below the atomic publication
  coordinator without adding a second writer or changing parser-path priority.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
