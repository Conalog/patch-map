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
- The branch-readiness checkpoint passes 194 unit files / 1,735 tests, full
  lint/typecheck, product/Lab builds, canonical 38/173, packed ESM/CJS/types
  with 38 journeys and four examples, headless 173 routes / 192 checks, and
  2+7 memory over 5,099 entities plus nine ownership cycles.
- Public `core-v2` Lab aliases and canvas probe identity are removed; retained
  historical identifiers exist only in immutable contract/evidence tooling.
- The current 5,000-bar repeated-retarget 2+7 Chromium proxy passes its fixed
  budgets: repeated-action p95 is 78.5ms at 1x and 401.3ms at 4x. The
  10,000-bar 1x smoke passes at 159.2ms repeated-action p95, but its 233.3ms
  rAF p95 and 20 long tasks remain unfavorable and are reported as such.
  Windows-native and qualified WebGPU results remain pending.

# Next Step

- Review and commit the branch-readiness patch when explicitly requested, then
  update the cleanup PR. Increase the package version only after merge.
