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
- WebGL2 is production. WebGPU and Chromium 4x are experimental/development
  proxies; external native and assistive-technology qualification stays
  pending without blocking the locally verified candidate.

# Current Facts

- Contract revision `core-v2-functional-contract/2026-07-16.2` contains 38
  approved decisions, 135 capabilities, 38 journeys, 646 actions, and 1,388
  assertions. Canonical verification and 32 negative drift probes pass.
- Core v2 uses a dense store, aggregate Mesh/asset/text/interaction layers,
  root-only event authority, one manual scheduler, exact incremental
  publication, and explicit scene-versus-frame state.
- Readable content follows authored/item/world rotation, removes reflection,
  and adds 180 degrees only in the upside-down half-plane. Text keeps its
  authored center; bars apply the same readable correction to their
  owner-relative placement so a bottom bar stays on the visible bottom.
  Extent, containment, animation bottom edge, and partial-bar leading edge
  remain stable.
- Frozen screen-lock expected remains unchanged. Twenty-six immutable
  conflicts are observed, two `UPD-007` conflicts remain latent, and fourteen
  measured performance deficits remain visible.

# Current State

- Product/evidence candidate `2b995ab054d441f48c964b995713fb2388dea04b`
  passes 148 Core v2 files/1,430 tests, lint, typecheck, both builds, canonical
  verification, 31 product-browser checks, and 189 manual-Lab checks over all
  173 routes.
- Exploratory Lab extension `8db2f0cd080da1d33c928c19f7378bf5690f3bb1`
  adds a 10,000-record option without expanding the approved exact size
  matrix. Headless Mesh WebGL loads 50,999 Playground entities and a
  10,005-root/30,000-component manual scene, overlaps animation with pan, and
  destroys to zero canvas with no browser errors.
- Lab viewport fix `2f184689a3d46c34155232081ac41e0b7ec2c820`
  preserves product and exact-contract defaults while lowering only the two
  human Lab zoom floors to 2.5%. At 10,000 records, whole-scene fit now reaches
  6.03% in the Playground and 4.33% in the manual Lab; wheel and the visible
  축소 button reach 2.5% with transformed interaction intact.
- Manual Lab control `edd726ca465749a7b5b6ed09d4b5714e42ee9551`
  exposes `10,000개 객체 · 탐색용` in the always-visible route controls.
  Manual and exact dataset selectors remain separate, so exploratory loading
  cannot alter the approved exact size corpus.
- Readable-bar correction `c6bf55425c564b717e136cb1890ef407e1958e0b`
  moves bar placement through the same reflection/half-turn transform as its
  aggregate quad. Headless WebGL proves vertical flip, in-flight height
  animation, and 180-degree correction keep the visible bottom padding fixed;
  LAY-004 first/repeat/fresh retains only its two declared immutable conflicts.
  The 5,000-bar 2+7 pan matrix passes at 61.0/50.6 median FPS for Chromium
  headless 1x/4x.
- Full headless first/repeat/fresh execution covers 158 routes and 2,028
  assertions per session: 1,988 pass, 26 declared immutable conflicts and 14
  measured deficits, with deterministic cleanup and zero console, page,
  network, or external-fixture errors.
- Packed ESM/CJS/types consumption covers 38 journeys; 2+7 memory covers 5,099
  entities and nine ownership cycles with terminal owner/canvas release.
  Eighteen renderer runs preserve 162 raw trials; Mesh is selected and the
  Particle spike remains rejected. WebGPU passes its separate 18-check
  experimental run.
- Local release verification and fifteen native drift probes pass.
  `release-readiness.json` remains `pending-external-evidence` and
  `releaseVerified` remains false. Port 4176 intentionally stays live for
  user dogfood; all test-owned browsers and temporary servers are closed.

# Next Step

- No local product step remains. When the external environments are available,
  run the exact Windows/N100/NVDA/input cells and bind actual-host, security,
  migration/rollback, and independent-review evidence before strict promotion.

# Working Boundary

- `src/core-v2/`
- `tests/core-v2/`
- `lab/performance-v2/`
- `scripts/verification/`
- `docs/tasks/2026/07-15/performance-core-v2/`
