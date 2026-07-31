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
- Assets are a 667-line coordinator above policy/backend value owners. The
  browser verifier is a 1,950-line I/O owner above catalog and assertion
  modules; expected loading, report mutation, browser, server, and cleanup stay
  in that root.
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
- Verification now shares only proven value atoms: 55 strict clones, eight
  optional clones, 50 freezes, eight ordered-key assertions, and 56 exact
  type-suffix validators moved with their call counts unchanged. Policy
  variants remain local.
- A committed-source firewall recursively covers all 35 handlers and 34 folds,
  permits only the import-free value leaf, and fail-closes expected, external,
  Node/dynamic, computed-global, constructor, and static-string path access.
  Independent P0–P2 review passes after closing two concrete bypass classes.
- The checkpoint passes 190 unit files / 1,679 tests, full lint/typecheck,
  product/Lab builds, and canonical 38/173. Browser, packed consumer, memory,
  and performance were not repeated because product, rendering, export,
  resource/destroy ownership, and hot algorithms did not change.

# Next Step

- Split `operations.ts` contracts and pure redaction/extraction-security values
  while keeping callback queues, subscriptions, diagnostics, and dispatch in
  the facade.

# Working Boundary

- `src/patch-map/`
- `lab/patch-map/`
- `tests/patch-map/`
- `scripts/verification/`
- `docs/tasks/2026/07-30/patch-map-structural-refactor/`
