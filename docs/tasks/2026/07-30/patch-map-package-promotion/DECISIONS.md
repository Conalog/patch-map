# Decisions

## 2026-07-30 — One shipping product

- Public package: `@conalog/patch-map`
- Primary class: `PatchMap`
- Public subpaths: none
- Version: keep `0.10.0` until the post-merge release bump

## 2026-07-30 — Remove controls, retain substrate

- Delete the unfinished Core v1 Canvas2D product, Lab, tests, build, and
  consumer surface.
- Retain its dense store, transactions, validation, animation table, and
  renderer-view contracts only as neutral PatchMap internals because the
  completed product uses them.
- Delete the old root `Patchmap` implementation and helpers after the new root
  entry is connected.

## 2026-07-30 — Historical identifiers

- Current product code, docs, examples, build names, package exports, and Lab
  routes use PatchMap naming.
- Immutable contract/evidence and frozen performance result paths may retain
  `core-v2`; changing them would invalidate approved digests and is outside
  this cleanup.
