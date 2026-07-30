# Goal

- Connect all 38 approved decisions and 173 capabilities/journeys to PixiJS
  product behavior, independent actual automation, the focused Lab, packed
  integration, performance, and release evidence without changing approved
  expected observations.

# Scope

- Preserve the PATCH MAP v0.10 array boundary, caller immutability, stable
  logical/component identity, atomic failure, aggregate PixiJS rendering, and
  explicit lifecycle/resource ownership.
- Work only on `performance/core-v2`; immutable fixtures/expected/review
  evidence, frozen implementations, dependency internals, and other
  refs/worktrees remain outside the boundary.
- WebGL2 is production. WebGPU and Chromium 4x are experimental/development
  proxies; native Windows and assistive-technology qualification stay pending
  until measured on their actual targets.

# Current Facts

- Contract revision `core-v2-functional-contract/2026-07-16.2` contains 38
  approved decisions, 135 capabilities, 38 journeys, 646 actions, and 1,388
  assertions. Canonical verification and 32 negative drift probes pass.
- Core v2 uses a dense store, aggregate Mesh/asset/text/interaction layers,
  root-only event authority, stable indexes, exact incremental publication,
  and explicit scene-versus-frame state.
- `CoreV2FrameLoop` and `CoreV2AdaptiveFrameBudget` are published product
  owners for RAF cadence, monotonic animation time, viewport-first large-scene
  pacing, visibility pause/resume, invalidation, and destroy cancellation.
  Core and Engine expose allocation-free animation/workload/gesture facts;
  the performance Playground and 173-case workbench use the same defaults,
  while deterministic runners may still publish explicit clocks.
- Readable content follows authored/item/world rotation, removes reflection,
  and adds 180 degrees only in the upside-down half-plane. Text keeps its
  authored center; bars transform owner-relative placement so visible bottom
  anchoring, containment, and animation edges remain stable.

# Current State

- The package-owned frame-loop tranche covers 149 files/1,456 tests: 1,455
  pass in the full run and its sole `UPD-007` timeout passes alone in 2.62
  seconds. Changed-path regressions, lint, typecheck, both builds, and
  canonical verification pass; all 173 manual routes pass 192/192 checks with
  zero console/page/network errors.
- Headless 10,000-record Playground and manual scenes prove full-bar animation
  overlaps pan and destroys to zero canvas. Packed ESM/CJS/types and all 38
  journeys pass; 2+7 memory over 5,099 entities retains a 91,163-byte median
  and releases DOM/scheduler/renderer ownership.
- The final uncontended 5,000-bar 2+7 WebGL checkpoint passes at 60.3/40.8
  median canvas FPS for Chromium 1x/4x. The current WebGPU adapter is
  unavailable, so that rerun and Windows native remain pending without
  replacing prior evidence.
- Approved evidence/result JSON remains frozen. Test-owned browsers and
  temporary servers close; the user dogfood server on port 4176 is the only
  intentional survivor.

# Next Step

- Preserve the completed local candidate. Run strict external
  Windows/N100/NVDA/input/actual-host/security/migration/review cells only in
  their qualified environments; do not weaken `pending-external-evidence`.

# Working Boundary

- `src/core-v2/`
- `tests/core-v2/`
- `lab/performance-v2/`
- `scripts/verification/`
- `docs/tasks/2026/07-15/performance-core-v2/`
