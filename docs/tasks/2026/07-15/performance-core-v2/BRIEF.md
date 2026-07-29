# Goal

- Connect all 38 approved decisions and 173 capabilities/journeys to PixiJS
  product behavior, independent actual automation, the same focused Lab,
  packed integration, performance, and release evidence without changing
  approved expected observations.

# Scope

- Preserve the PATCH MAP v0.10 array boundary, caller immutability, stable
  logical/component identity, atomic failure, aggregate PixiJS rendering, and
  explicit lifecycle/resource ownership.
- Work only on `performance/core-v2`; immutable fixtures/expected/review
  evidence, frozen implementations, dependency internals, and other
  refs/worktrees remain outside the boundary.
- WebGL2 is production; WebGPU and Chromium 4x remain experimental/development
  proxies. Under the 2026-07-29 user-approved
  completion boundary, external-only native/AT/host/review qualification stays
  pending without blocking the locally verified production candidate.

# Current Facts

- Contract revision `core-v2-functional-contract/2026-07-16.2` contains 38
  approved decisions, 135 capabilities, 38 journeys, 646 actions, and 1,388
  assertions. Canonical verification and 32 negative drift probes pass.
- Core v2 uses a dense store, aggregate Mesh/asset/text/interaction layers,
  root-only event authority, one manual scheduler, exact incremental
  publication, and explicit scene-versus-frame state.
- All 173 routes are executable; 172 produce terminal actuals and `DAT-008`
  truthfully stops at its malformed approved action. Twenty-six immutable
  conflicts are observed and two `UPD-007` conflicts remain latent. The five
  new conflicts disclose the user-approved readable-orientation behavior
  against the frozen screen-lock expected evidence.
- External pending does not mean `release-verified`: the strict manifest and
  approved expected evidence remain unchanged and must still pass before a
  native production release is promoted.

# Current State

- Readable content orientation is implemented at `90d1212`: content follows
  authored/item/world rotation, removes reflection, and adds 180 degrees only
  in the upside-down half-plane. Bars and text retain their authored center,
  extent, and partial-bar leading edge inside the owner frame.
- Current gates pass 148 Core v2 files/1,427 tests, lint, typecheck, Core v2
  Lab build, and canonical contract verification. LAY-004, REN-006, and
  REN-011 pass headless first/repeat/fresh sessions with deterministic actuals,
  complete canvas cleanup, and zero console/page/network errors. The
  representative Korean manual Lab passes all checks. Port 4176 stays live for
  dogfood.
- The optimized 5,000-entity matrix covers every pointer, selection,
  transformer, viewport, history, authoring, animation, text, asset,
  accessibility, extraction, resize, and lifecycle interaction. Its 1x
  pan/zoom/animation-pan p95 is 1.6/1.5/8.4 ms; Chromium 4x records
  7.6/3.9/31.3 ms and remains only a development proxy.
- A post-change 5,000-entity headless 1x smoke passes every interaction:
  pan frame p95 2.3 ms, animation-pan p95 9.0 ms, world rotation 29.5 ms,
  and X/Y flips 18.8/18.4 ms.
- Package exports/dependencies/assets and lifecycle ownership did not change,
  so packed-consumer and 2+7 memory gates were not rerun or misrepresented as
  current code-bound evidence. Experimental WebGPU remains non-production.
- `release-readiness.json` truthfully remains
  `pending-external-evidence`; native Windows is pending.

# Next Step

- No local readable-orientation step remains. If the approved contract is ever
  revised, reconcile its screen-lock rows separately; do not mutate the
  current expected evidence. When external environments become available, run
  the exact Windows/N100/NVDA/input cells and bind actual-host, security,
  migration/rollback, and independent review evidence before strict promotion.

# Working Boundary

- `src/core-v2/`
- `tests/core-v2/`
- `lab/performance-v2/`
- `scripts/verification/`
- `docs/tasks/2026/07-15/performance-core-v2/`
