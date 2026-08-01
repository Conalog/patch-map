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
- `engine.ts` is 6,170 LOC and `core.ts` is 2,358 LOC. Parser, transaction,
  text-layout, incremental-parser, authoring, and editor-workflow facades have
  focused downward owners while their atomic writers remain singular.
- Mesh and Pixi renderer coordinators are 1,256 and 2,002 LOC after CPU value
  planning moved below unchanged GPU/Application/resource owners.
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
- The checkpoint passes 190 unit files / 1,692 tests, full lint/typecheck,
  product/Lab builds, and canonical 38/173. The latest applicable 2+7 memory
  result remains 5,099 entities, nine ownership cycles, and a 97,195-byte
  retained-heap median; route, export, resource, and hot algorithms did not
  change in the latest structural tranche.
- Core reconcile candidate preparation and semantic mutation record values now
  live below their atomic facades without changing parser priority or adding
  entity-scale collections, passes, or closures.
- History preserves prepare/commit and undo/redo atomicity while rejecting
  accessor, sparse, symbol, extra-property, and non-finite snapshot inputs.
- Accessibility reconciliation validates and freezes its complete candidate
  before publication; presentation runtime algorithms and pass counts remain
  unchanged.
- Invalid migration remounts and frame-loop resumes now validate before
  changing live lifecycle state, preserving atomic failure.
- A trusted failure after dense mutation commit now seals Core publication,
  stops scheduling and interaction, blocks partial reads and Engine inputs,
  and propagates a terminal error instead of a recoverable refusal.

# Next Step

- Extract Engine asset-session ownership while preserving required acquisition,
  failed-initialization release, cleanup retry, and surface session identity.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
