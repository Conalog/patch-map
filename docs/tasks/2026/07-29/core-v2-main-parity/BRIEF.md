# Goal

- Compare every user-visible feature and render outcome of the current
  `main` product with PixiJS Core v2, repair meaningful Core v2 differences,
  and retain only documented non-normative raster variance.

# Scope

- Use `main` only as the read-only black-box runtime oracle defined by
  `docs/reference/core-v2-main-parity-policy.md`.
- Keep PATCH MAP v0.10 input compatibility, approved expected evidence,
  aggregate PixiJS architecture, and frozen comparison implementations intact.
- Fix only `performance/core-v2`; native Windows qualification remains pending.

# Current Facts

- Core v2 currently maps all 173 approved cases and passes its local product,
  Lab, package, memory, and performance gates.
- The prior content-orientation miss proves contract coverage alone does not
  guarantee parity with visible `main` behavior.
- Comparison must independently observe both runtimes with identical datasets,
  seeds, clocks, viewports, actions, and asset readiness.
- Numeric semantic probes will judge geometry and state; browser captures will
  discover visible omissions while tolerating antialiasing and glyph raster
  noise that does not alter perceived content or interaction.

# Current State

- The user explicitly approved the narrow `main` comparison exception on
  2026-07-29.
- No `main` implementation source was inspected or copied.
- All 173 cases are cross-walked to direct overlap, partial overlap, Core
  extension, consumer seam, or external evidence.
- The final 28-scenario/121-checkpoint black-box matrix passes with zero
  blocking mismatch and zero runtime errors. Eight broad canonical scenarios
  retain classified diagnostic differences and two inputs are rejected by
  `main`; all sixteen isolated blocking `PAR-*` scenarios pass.
- Styled rectangle radius/stroke and rounded-bar geometry misses are repaired.
  Rounded bars remain on aggregate Mesh and retain non-zero GPU uploads.
- Full unit, static, build, browser, 173-route Lab, package, 2+7 memory,
  WebGPU, interaction, contract-performance, and 18-run renderer gates pass.
- Detailed classifications and results are in `RESULTS.md`; evidence is in
  `artifacts/first-tranche/`.

# Next Step

- Remove the disposable detached `main` worktree, leave the user dogfood Lab
  running, and keep native Windows/N100/NVDA/input/host/security/migration
  qualification pending until measured externally.

# Working Boundary

- `src/core-v2/`
- `tests/core-v2/`
- `lab/performance-v2/`
- `scripts/verification/`
- `docs/tasks/2026/07-29/core-v2-main-parity/`
