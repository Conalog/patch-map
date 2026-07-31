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
- `engine.ts` is 6,193 LOC and `core.ts` is 2,495 LOC. Parser, transaction,
  text-layout, incremental-parser, authoring, and editor-workflow facades have
  focused downward owners while their atomic writers remain singular.
- Mesh and Pixi renderer coordinators are 1,256 and 2,002 LOC after CPU value
  planning moved below unchanged GPU/Application/resource owners.
- Operations are a 425-line callback/diagnostic writer above contract,
  redaction, and extraction-security owners. Scene images are a 978-line
  lifecycle writer above contract and pure reconcile-value owners.
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
- Expected-blind verification shares only proven import-free value atoms and
  recursively fail-closes expected, external, dynamic-global, constructor, and
  static-string access across all committed handlers and folds.
- Operations retain one callback queue and diagnostic writer; scene images
  retain prepared-plan, async freshness, renderer binding, release,
  invalidation, and destroy ownership. Review also fixed nonnegative nested
  queue counts and teardown continuation after synchronous unbind failures.
- The checkpoint passes 190 unit files / 1,681 tests, full lint/typecheck,
  product/Lab builds, canonical 38/173, and 2+7 memory with 5,099 entities and
  nine ownership cycles. Browser, packed consumer, and performance were not
  repeated because route, export, and hot algorithms did not change.

# Next Step

- Classify and split the semantic reconcile and dense-store boundaries without
  changing O(dirty) caches, atomic writers, operation order, or allocations.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
