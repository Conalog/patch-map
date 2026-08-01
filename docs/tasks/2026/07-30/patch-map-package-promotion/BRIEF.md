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
- The 671-file structural inventory and T0–T10 ownership migration are
  complete. `engine.ts`, `core.ts`, and `pixi-renderer.ts` are 5,542, 1,969,
  and 1,813 lines above singular transaction, frame, accessibility, asset,
  interaction, and resource authorities.
- The final checkpoint passes 194 unit files / 1,729 tests, full
  lint/typecheck, product/Lab builds, canonical 38/173, headless 173 routes /
  192 checks, and 2+7 memory over 5,099 entities and nine ownership cycles.
- Public `core-v2` Lab aliases and canvas probe identity are removed; retained
  historical identifiers exist only in immutable contract/evidence tooling.
- The current 5,000-bar Chromium proxy passes animation/pan and repeated
  retarget 2+7 checkpoints; the prior 2,924.9ms 4x outlier fell to a 203.4ms
  repeated-action p95 aggregate. The 10,000-bar load/interaction and
  animation/pan smoke pass, while repeated retarget during active pan remains
  unfavorable and is reported as such. Packed consumer was not repeated
  because its boundary did not change. Windows-native and qualified WebGPU
  results remain pending.

# Next Step

- Open the cleanup PR from the clean branch; increase the package version only
  after merge.
