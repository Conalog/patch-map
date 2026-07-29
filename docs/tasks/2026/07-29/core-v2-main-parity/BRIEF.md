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
- No `main` implementation source has been inspected or copied.
- The first tranche is comparison substrate: disposable runtime launch,
  canonical input/action catalog, independent observations, classification,
  and deterministic artifact output.

# Next Step

- Launch a disposable detached `main` runtime without reading implementation
  source, inventory its public controls and accepted dataset entry points, and
  pair them with Core v2's 173-case action/probe descriptors.

# Working Boundary

- `src/core-v2/`
- `tests/core-v2/`
- `lab/performance-v2/`
- `scripts/verification/`
- `docs/tasks/2026/07-29/core-v2-main-parity/`
