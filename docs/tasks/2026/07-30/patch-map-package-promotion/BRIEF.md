# Goal

- Promote the completed PixiJS implementation to the sole
  `@conalog/patch-map` product as `PatchMap`, remove unfinished Core v1 and
  user-facing Core v2 experiment surfaces, and finish a clean PR-ready branch
  without changing approved contract evidence.

# Scope

- Preserve the PATCH MAP v0.10 input boundary, immutable caller data, stable
  IDs/component identity, atomic failure, aggregate rendering, and explicit
  lifecycle ownership.
- Preserve immutable functional-contract fixtures, normalized expected
  observations, review evidence, and frozen comparison results.
- Remove Core v1 product code, Lab, build/package surface, and tests. Move only
  the dense-store substrate still used by the product into neutral internal
  paths.
- Replace the legacy root export with the completed PixiJS product. Do not
  preserve the old `Patchmap` public API.
- Remove `core-v2` from current package exports, source paths, Lab URLs,
  examples, builds, and public symbols. Digest-bound historical identifiers
  remain internal.

# Current Facts

- The completed candidate already passes the 173-case contract, packed
  consumer, headless browser, lifecycle memory, and 10,000-record Lab gates.
- The final renderer owns its scheduler and aggregate PixiJS lifecycle.
- Core v1 is an incomplete performance control. Its dense store is a current
  internal dependency, while its Canvas2D renderer and public surface are not
  part of the final product.
- Package version remains `0.10.0`; the user will bump it after merge.

# Current State

- `src/patch-map` is the only product implementation and the root package
  exports `PatchMap` without versioned subpaths.
- The unfinished Core v1 Canvas2D product, legacy root implementation, old
  Labs/tests/builds, and unused v0.10 harnesses are removed. The retained dense
  substrate lives under `src/patch-map/dense`.
- Current docs, examples, Lab routes, build configuration, DevTools labels,
  browser bridges, and operational verification scripts use PatchMap naming.
- Immutable contract/evidence and frozen performance results remain unchanged.
- Final gates pass: 149 files/1,456 unit tests, typecheck, full lint, package
  build, Lab build, canonical 38/173 contract verification, 173-route headless
  Lab (192/192), packed ESM/CJS/types plus 38 journeys, and lifecycle memory.
- Final current-diff review is clean. The product cleanup is fixed in
  `68888cc`; reviewer-found CI path coverage and public Lab-route issues were
  corrected before that commit.

# Next Step

- Create and review the PR from the clean `performance/core-v2` branch.
  Version bumping remains post-merge work.

# Verification Cadence

- After mechanical source migration: targeted product unit tests, typecheck,
  and scoped lint.
- After package/Lab integration: full product unit, lint/typecheck, both
  builds, canonical contract verifier.
- Final candidate: packed consumer, headless 173-case Lab, lifecycle memory,
  and changed-path browser checks.
- No full performance matrix unless the renderer/scheduler hot path changes.
