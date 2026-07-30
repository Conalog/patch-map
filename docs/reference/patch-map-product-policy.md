# PatchMap Product Policy

## Product identity

- The shipping package is `@conalog/patch-map`.
- The primary runtime class is `PatchMap`.
- The completed PixiJS implementation is the product. `core-v1` and
  user-facing `core-v2` package, route, build, and example identities do not
  ship.
- Historical contract revisions and digest-bound evidence may retain their
  original `core-v2` identifiers. They are verification inputs, not public
  product names.

## Product boundary

- Accept existing PATCH MAP v0.10 JSON directly.
- Preserve caller input immutability, stable element IDs, component identity,
  relation endpoints, deterministic interpretation, and atomic failure.
- Keep the dense store and aggregate PixiJS renderer architecture. Do not
  restore per-entity display objects, listeners, tickers, or closures to the
  hot path.
- WebGL is the production baseline. WebGPU remains experimental until the
  qualified adapter and target hardware are measured.

## Cleanup boundary

- Dense-store, transaction, validation, and renderer-view code inherited from
  the performance control may be retained only as neutral PatchMap internals.
- Remove the unfinished Core v1 Canvas2D product surface, package export,
  Lab, product tests, build configuration, and consumer verification.
- Remove legacy root product code once the root package exports the completed
  PixiJS implementation.
- Do not modify immutable fixtures, normalized expected observations, review
  evidence, frozen comparison results, or their digest-bound identifiers.
- Published files contain only the built package, current product
  documentation/examples, license, and readme files.

## Release gate

- The branch must pass typecheck, lint, product unit tests, production build,
  canonical contract verification, packed consumer verification, headless Lab
  verification, and lifecycle memory verification.
- Run performance checkpoints only when a hot path changes. Pure naming and
  packaging changes reuse no performance claim but do not require a new full
  matrix.
- Finish with intent-scoped commits and a clean worktree suitable for PR
  review. Version changes happen after merge, not during this cleanup.
