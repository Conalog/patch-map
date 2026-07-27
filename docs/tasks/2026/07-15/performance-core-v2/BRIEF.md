# Goal

Connect all 38 approved decisions and 173 cases to PixiJS product behavior, independent actual automation, the same focused Lab route, packed integration, and production-readiness evidence without changing approved expected observations.

# Scope

- Implement approved records in 5–10 case dependency tranches with shared product and expected-blind automation substrate.
- Work only on `performance/core-v2`; keep immutable fixtures/expected/review evidence, Core v1, clean-room/comparison paths, dependency internals, and other refs/worktrees frozen.
- Preserve PATCH MAP input immutability, stable identity, atomic failure, aggregate Pixi WebGL rendering, and explicit lifecycle/resource ownership.

# Current Facts

- Contract revision `core-v2-functional-contract/2026-07-16.2` contains 38 approved decisions, 135 capabilities, 38 journeys, 646 actions, and 1,388 assertions. Canonical verification and all 32 negative drift probes pass unchanged.
- Core v2 uses a dense store, aggregate Mesh/asset/text/interaction layers, root-only event authority, one manual scheduler, and explicit scene-versus-frame publication. WebGL2 is mandatory; WebGPU and native Windows remain pending.
- `DAT-008` truthfully stops at its malformed approved action. Twenty-one immutable conflicts are observed and two `UPD-007` conflicts remain declared latent; none are hidden or aliased.
- Default PATCH MAP loading remains compatibility-permissive for dangling relations, while explicit strict loading validates duplicates and references before atomic publication.

# Current State

- Coverage is 145 executable routes, 144 actual-producing routes, 28 explicit stubs, 573 executable actions, and 317 action types.
- `DET-001/002/003`, `ANI-003`, and `LIF-006` are closed in product commit `bfd3b92` and shared expected-blind automation/Lab commit `6953b08`. One engine-local lifecycle authority cancels obsolete asset/extraction work, settles animation without a giant wall-clock delta, releases gesture ownership, and admits one coherent resume frame; seeded scene generation is shared with the existing transaction control.
- The five changed headless WebGL routes pass first/repeat/fresh/destroy at 49/49 assertions per session with deterministic actuals, one transient canvas returning to zero, real WebGL2 draws, and zero console/page/network/external-fixture errors. The browser registry contains 130 routes and 1,800 assertions: 1,779 matches, twenty-one observed immutable conflicts, and two latent conflicts.
- Full lint, typecheck, Core v2/Lab builds, canonical verification, packed ESM/CJS consumption, and scoped post-review regressions pass. A full unit run reached 1,471/1,472 before finding one stale verification-script pin; that assertion-only pin was corrected and its file passes 3/3 without repeating unrelated gates.
- The refreshed 2+7 lifecycle checkpoint covers 5,099 entities with retained-heap median/p95 76,659/399,531 bytes and zero lifecycle, DOM, renderer, scheduler, console, page, or network failures. Renderer hot paths were unchanged, so the full 130-route browser and performance matrices were not repeated; headed final release verification, WebGPU, native Windows, and final independent release review remain pending.

# Next Step

Work is intentionally paused at a clean determinism/lifecycle checkpoint. After restart, re-read the mandatory policy and this brief, confirm branch/status, then close `CSM-014` first and connect `PIX-001/002/003/005` plus `PKG-001/002/003/004/005` through shared Pixi/backend/package probes and focused routes; `CSM-014` is required before `PKG-004` can truthfully run all 38 consumer journeys. Do not reopen the closed tranche unless a regression demonstrates a product defect.

# Working Boundary

- `src/core-v2/`
- `tests/core-v2/`
- `lab/performance-v2/`
- `scripts/verification/`
- `docs/tasks/2026/07-15/performance-core-v2/`
