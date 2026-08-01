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

- The allowed inventory is 606 files / 484,871 LOC after excluding
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
- The working plan owns the 606-file disposition and T0–T10 migration map.
  Product facades retain atomic publication, scheduler, renderer, listener,
  lifecycle, asset, and ownership-registry writes above acyclic value/planning
  modules.
- Parser, Dataset, transaction, reconcile, text, authoring, editor, host,
  renderer planning, Lab presentation, and large contract-test composition now
  have explicit domain owners without a parallel public or write path.
- The checkpoint passes 190 unit files / 1,692 tests, full lint/typecheck,
  product/Lab builds, canonical 38/173, headless 173 routes / 192 checks, and
  2+7 memory over 5,099 entities and nine ownership cycles with a 96,539-byte
  retained-heap median. Export and frame algorithms did not change.
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

- Remove the remaining Pixi renderer child-to-facade type cycle through narrow
  structural ports without changing runtime imports or GPU behavior.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
