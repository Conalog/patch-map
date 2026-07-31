# Goal

- Ship the completed aggregate PixiJS implementation as the sole
  `@conalog/patch-map` product and finish a clean PR-ready branch without
  changing approved contract evidence.

# Scope

- Preserve PATCH MAP v0.10 JSON compatibility, caller immutability, stable
  IDs/component identity, atomic failure, aggregate rendering, and explicit
  lifecycle/resource ownership.
- Keep the canonical 38-decision/173-case corpus and retained digest-bound
  evidence immutable. Windows-native and qualified WebGPU results remain
  pending until measured on those targets.

# Current Facts

- `src/patch-map` is the only shipping implementation; `PatchMap` is the root
  package class and `/lab/patch-map/` is the single Korean manual Lab.
- The Lab exposes all 173 manually operable routes, seeded scenes through
  10,000 records, and the user-supplied 605-root actual-production JSON.
- The structural refactor keeps atomic mutation in the facade while assigning
  geometry, semantic indexing, Pixi adaptation, Mesh planning, public
  contracts, Lab presentation, and actual-only test harnesses explicit owners.

# Current State

- Actual-production alpha, image pivot/underlay, remote allowlist, async
  invalidation, content orientation, and aggregate lane behavior remain
  verified without per-entity display objects or listeners.
- Final gates pass 151 files / 1,471 tests, full lint/typecheck, package and Lab
  builds, canonical 38/173 contract, packed ESM/CJS/types plus 38 journeys,
  headless 173 routes / 192 checks, actual-production load/pan/destroy, and
  2+7 lifecycle memory with DOM/scheduler/renderer release.
- Public `core-v2` Lab aliases and canvas probe identity are removed; retained
  historical identifiers exist only in immutable contract/evidence tooling.
- The final 5,000-bar 2+7 Chromium proxy remains FAIL because one 4x
  repeated-action sample reached 2,924.9ms over the 900ms limit. The 1x
  repeated-action median/p95 is 50.9/109.1ms. Windows-native and qualified
  WebGPU results remain pending.

# Next Step

- Open and review the cleanup PR. Increase the version only after merge.
