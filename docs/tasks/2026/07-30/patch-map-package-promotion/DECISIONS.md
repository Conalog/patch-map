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
- Immutable contract/evidence and retained digest-bound performance results
  may retain `core-v2`; changing their contents would invalidate approved
  observations.
- Active performance and release tooling uses `performance/patch-map` and
  `patch-map-*` paths.

## 2026-07-30 — One consumer API and one Lab

- `/lab/patch-map/` is the sole user-facing Lab and maps all 173 approved
  cases to persistent manual controls.
- The separate aggregate-renderer performance Playground and its WebGPU
  selector, bridge, browser verifier, styles, and entry point are removed.
- `PatchMapRuntime` and `createPatchMapRuntime()` remain implementation
  internals. The root package, packed consumer, examples, and Lab use
  `PatchMap`.
- Internal performance harnesses may import the core module explicitly, but
  that path is not a published package export.

## 2026-07-30 — Prune completed experiments and handoff residue

- User approval permits deleting the obsolete clean-room export, root handoff
  manifests, Core v1 performance control, completed main-parity harness and
  captures, old task working logs, and unreferenced timestamped performance
  outputs.
- Preserve the canonical 173-case functional-contract corpus and the five
  digest-bound performance/extraction artifacts still exercised by tests.
- Keep only current or directly referenced runtime evidence in
  `performance/patch-map/results`.
- Repository CI covers product source, tests, the canonical contract, the
  production package build, and the PatchMap Lab build.

## 2026-07-30 — Keep exact digests off the animation hot path

- Structurally shared semantic candidates retain the canonical exact FNV
  digest, but materialize and memoize it only when a consumer observes
  `semanticHash`. Transaction results expose the same enumerable immutable
  value through a lazy getter.
- The manual Lab must not force a full semantic snapshot while bar
  presentations are active. Live selection, frame, animation, and viewport
  status use lightweight `PatchMap` state seams; a full snapshot is refreshed
  after animation settlement.
- A direct mid-animation bar retarget preserves the existing animated-bar
  broad-phase envelope. Exact hit testing remains the union of the retained
  current-path envelope and the newly committed dense destination, so
  correctness is retained without rebuilding 5,000 spatial entries per
  retarget.
- Performance budgets are not relaxed after measurement. Median improvement
  and unfavorable 1x/4x outliers are both retained in the raw checkpoint;
  external Windows-native qualification remains pending.
