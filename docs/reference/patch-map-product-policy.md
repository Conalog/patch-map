# PatchMap Product Policy

## Product identity

- The shipping package is `@conalog/patch-map`.
- The primary runtime class is `PatchMap`.
- The completed PixiJS implementation is the product. `core-v1` and
  user-facing `core-v2` package, route, build, and example identities do not
  ship.
- Historical contract revisions and retained digest-bound evidence may retain
  their original `core-v2` identifiers. They are verification inputs, not
  public product names.

## Product boundary

- Accept existing PATCH MAP v0.10 JSON directly.
- Preserve caller input immutability, stable element IDs, component identity,
  relation endpoints, deterministic interpretation, and atomic failure.
- Keep the dense store and aggregate PixiJS renderer architecture. Do not
  restore per-entity display objects, listeners, tickers, or closures to the
  hot path.
- WebGL is the production baseline. WebGPU remains experimental until the
  qualified adapter and target hardware are measured.

## Architecture and publication boundary

- Dense-store, transaction, validation, and renderer-view owners remain neutral
  PatchMap internals rather than competing product surfaces.
- Ship one user-facing Lab at `/lab/patch-map/`. It uses `PatchMap` and the
  package-owned frame loop. The 173 approved contracts retain exact automated
  routes, while direct manipulation is organized into explicit reusable
  workflows with dedicated, shared-workflow, or automated-only coverage. A
  separate low-level performance Playground does not ship.
- Keep `PatchMapRuntime` and `createPatchMapRuntime()` internal. Product
  consumers, examples, Labs, and packed verification use `PatchMap`.
- Keep the low-level Engine constructor and deterministic publication/probe
  seams internal; do not expose a competing `PatchMapAdvanced` class alias.
- Do not modify immutable functional-contract fixtures, normalized expected
  observations, review evidence, or retained digest-bound performance
  evidence.
- Active performance and release tooling lives under PatchMap-neutral paths.
- Published files contain only the built package, current product
  documentation/examples, license, and readme files.

## Release gate

- The branch must pass typecheck, lint, product unit tests, production build,
  canonical contract verification, packed consumer verification, headless Lab
  verification, and lifecycle memory verification.
- Run performance checkpoints only when a hot path changes. Pure naming and
  packaging changes reuse no performance claim but do not require a new full
  matrix.
- Finish with intent-scoped commits and a clean worktree suitable for review.
- Version changes follow the release process and are not bundled into unrelated
  refactors.
