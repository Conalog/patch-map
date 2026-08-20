# Goal

- Ship the completed aggregate PixiJS implementation as the sole
  `@conalog/patch-map` product and finish a clean PR-ready branch without
  changing approved contract evidence.

# Scope

- Preserve PATCH MAP v0.10 JSON compatibility, caller immutability, stable
  IDs/component identity, atomic failure, aggregate rendering, and explicit
  lifecycle/resource ownership.
- Keep the canonical 38-decision/173-case corpus and retained digest-bound
  evidence immutable. Windows-native and qualified WebGPU results remain
  pending until measured on those targets.

# Current Facts

- `src/patch-map` is the only shipping implementation; `PatchMap` is the root
  package class and `/lab/patch-map/` is the single Korean manual Lab.
- The Lab retains exact expected-blind execution for all 173 approved routes
  and separates it from 11 reusable manual workflows. Routes explicitly state
  whether they own dedicated guidance, share a workflow, or require automated
  evidence; seeded scenes through 10,000 records and the user-supplied
  605-root actual-production JSON remain available for direct exploration.
- Public mutation intent is expressed by three operations: `update()` changes
  one logical owner, columnar `updateBatch()` changes the same fields across
  many targets, and `transaction()` commits ordered heterogeneous/structural
  work atomically. Component IDs are optional only when their type is unique.
- Named mutation shortcuts are reserved for distinct optimized commit paths.
  `bar.height` remains public; bar width, fill, and other ordinary component
  fields use the single `bar.changes` merge shape.
- Authored bar/text fast planners and the concrete grid-cell
  background/bar/icon/text presentation overlay remain internal commit paths.
  `updateBatch()` selects them without exposing `ownerId`, dense slots, or
  separate mutation domains.
- Repeated semantic addressing uses `targets.query()` and an opaque
  revision-bound `PatchMapTargetSet`. The internal one-time scene scan and
  WeakMap authority remain, while compilation terminology and revision
  bookkeeping stay outside application code.
- The default package entry now guides application developers through
  `PatchMap.mount()`, `update()/updateBatch()/transaction()`, and cohesive
  `data/targets/selection/transform/viewport/history/assets/capture` domains.
  Low-level lifecycle and publication
  seams remain internal and are not exposed under a competing class name.
- Public lifecycle and relative-operation names now use one vocabulary:
  `container`, `resizeMode`, `data.replace()/snapshot()`,
  `transform.moveBy()/resizeBy()/rotateBy()`, `viewport.panBy()/zoomBy()`, and
  `assets.status()`. The root entry is an explicit allowlist rather than an
  internal barrel export.
- The structural refactor keeps atomic mutation in the facade while assigning
  geometry, semantic indexing, Pixi adaptation, Mesh planning, public
  contracts, Lab presentation, and actual-only test harnesses explicit owners.

# Current State

- Actual-production alpha, image pivot/underlay, remote allowlist, async
  invalidation, content orientation, and aggregate lane behavior remain
  verified without per-entity display objects or listeners.
- The current 762-file allowed-tree inventory has been reviewed across runtime,
  renderers, Lab/examples, tests/verification/performance, documentation,
  configuration, and binary assets. The structural migration keeps singular
  transaction, frame, accessibility, asset, interaction, and resource
  authorities while eliminating newly identified reentrant, supersession,
  cleanup-retry, descriptor-safety, culling-bound, and Lab lifecycle defects.
- The fresh branch-readiness checkpoint passes 195 unit files / 1,759 tests,
  full lint/typecheck, product/Lab builds, canonical 38/173, headless 173
  routes / 192 checks, actual-production WebGL over 605 roots / 643
  components, 2+7 memory over 5,099 entities plus nine ownership cycles, and
  the strict packed ESM/CJS/types consumer with 38 journeys, four examples,
  aggregate-object ownership, lifecycle cleanup, and the required audit.
- Public `core-v2` Lab aliases and canvas probe identity are removed; retained
  historical identifiers exist only in immutable contract/evidence tooling.
- The branch-readiness patch is fixed in separate runtime/rendering, Lab
  lifecycle, release-verification, and documentation commits. No version,
  push, PR metadata, or merge action is part of this checkpoint.
- The current 5,000-bar repeated-retarget 2+7 Chromium proxy passes its fixed
  budgets: repeated-action p95 is 62.4ms at 1x and 234.9ms at 4x. The 4x rAF
  p95 remains unfavorable at 251.9ms with long-task-count p95 11. The fresh
  10,000-bar 1x smoke passes at 104.3ms repeated-action p95 and 166.6ms rAF
  p95, with 21 long tasks still reported rather than hidden. Windows-native
  and qualified WebGPU results remain pending.
- The concrete grid-instance checkpoint uses one aggregate Mesh path and one
  central presentation controller while retargeting during pan. Its fresh 2+7
  WebGL proxy records repeated-update p95 medians of 25.5ms for 5,000 cells and
  58.9ms for 10,000 cells. The 10,000-cell rAF-gap p95 median is 99.1ms and
  long-task-count median is 2; those unfavorable residual gaps remain visible
  in `.perf-results/patch-map/instance-bar-latest.json`.
- The DX promotion checkpoint passes full lint, 196 unit files / 1,772 tests,
  typecheck, product and Lab builds, canonical 38/173 verification, and the
  required-audit packed ESM/CJS/types consumer with 38 journeys, four
  high-level examples, aggregate ownership, capture serialization, and clean
  lifecycle teardown. The renderer and bar hot path did not change, so this
  checkpoint makes no new performance claim.
- The unified mutation checkpoint passes targeted 28/28 facade/Lab tests,
  full lint/typecheck, 196 unit files / 1,780 tests, product and Lab builds,
  canonical 38/173, required-audit packed ESM/CJS/types + 38 journeys, and the
  representative headless WebGL Lab with console/page/network error zero.
  The final public-path 5,000/10,000 concrete-bar 2+7 proxy passed at 25.2ms
  and 52.1ms repeated-update p95 medians; a later final-code 10,000 smoke
  passed at 49.9ms. Windows-native and qualified WebGPU remain pending.
- The public lifecycle now has one name: `PatchMapAdvanced` is absent from the
  root runtime export and packed declarations. The packaged host adapter uses
  `PatchMap.mount()` and public domains, while optional shared asset runtime
  ownership is available directly on mount. The strict packed ESM/CJS/types
  consumer, all 38 journeys, four examples, aggregate ownership, audit, and
  teardown pass with a negative declaration check for the removed alias.
- The public bar mutation shape no longer exposes non-hot-path `width` or
  `fill` shortcuts. Runtime validation rejects both spellings, packed strict
  declarations enforce their absence, and callers use
  `bar.changes.size.width` / `bar.changes.source.fill`; the existing
  `bar.height` fast planner and renderer hot path are unchanged.
- `targets.compile()` and `PatchMapCompiledTargets` are absent from the public
  declaration. `targets.query()` returns `{ matches, count }`, retains cached
  repeated-batch resolution, and still rejects cross-instance or stale target
  sets after dataset replacement.
- The public-naming checkpoint passes 196 unit files / 1,783 tests,
  lint/typecheck, product and Lab builds, canonical 38/173 verification,
  and the required-audit packed ESM/CJS/types consumer with all 38 journeys,
  four examples, four aggregate objects, and clean headless lifecycle teardown.
  No renderer, scheduler, resource, or mutation hot path changed, so this
  checkpoint makes no new memory or performance claim.
- The pre-push public-boundary checkpoint seals the runtime package behind
  `PatchMap.mount()`: direct construction fails and mounted instances expose
  only the documented domains. Dataset replacement now preflights fit target
  authority and padding before committing, so an invalid fit cannot leave a
  successfully replaced scene behind a thrown call. The packed foundation
  runner uses only this public facade, and current verification passes 196
  unit files / 1,785 tests, lint/typecheck, canonical 38/173, and the
  required-audit packed ESM/CJS/types consumer with 38 journeys, four examples,
  aggregate ownership, and clean lifecycle teardown.
- The Lab coverage checkpoint removes the misleading 646-row action-to-tool
  bridge. All 173 exact routes remain expected-blind, while the reusable manual
  surface now declares 11 product workflows, 18 dedicated guides, 134 shared
  workflow routes, and 21 automated-only routes. Verification passes 196 unit
  files / 1,786 tests, scoped lint, full typecheck, the Lab build, canonical
  38/173, and all 173 headless WebGL routes / 192 checks with zero
  console/page/network errors. Package, resource ownership, renderer, and hot
  paths did not change, so packed consumer, memory, and performance gates were
  not repeated.
- The image-readiness checkpoint makes `await capture.png()` the active-image
  settlement barrier for direct URLs and newly shown concrete icon overlays.
  The packed consumer verifies direct-URL `replaceAsync()`, capture, destroy,
  and shared-runtime remount with resolved resources and no Pixi cache-miss
  warning; the overlay capture needs no host sleep or status polling.
- The concrete height-only performance checkpoint keeps the broader bar/icon
  overlay while routing exact `bar.height` batches through the dedicated bar
  projection planner. A same-Chromium, alternating-order packed 2+7 comparison
  records 5,000/10,000 repeated-action p95 at 27.1/53.0ms for exact `70ed57f`,
  30.4/65.4ms for regressed `60a0a62`, and 27.1/52.9ms for the fixed candidate.
  Mount medians remain within 2ms across artifacts, separating the mutation
  regression from environment variance. The candidate restores 10,000-cell
  long-task median from 7 to the old value of 4; its 116.6ms frame-gap p95 is
  still unfavorable against old 101.2ms and remains reported. The separate
  bar+tint+icon 2+7 proxy records 64.2/137.0ms repeated-update p95 medians for
  5,000/10,000 cells without changing the aggregate renderer or central loop.
- Concrete grid background/text presentation now restores the materialized-cell
  behavior required by percentage/number panels. The revision-bound overlay
  accepts v0.10 non-structural visual fields, reuses canonical projection and
  existing dense/text/aggregate ownership, and remains outside snapshots,
  semantic hashes, and history. Browser pixels verify distinct per-cell paint,
  content, style, placement, order, visibility, authored `null` restore, and
  rect-to-asset-to-rect background transitions with settled resource ownership.
  Column entries and nested values are descriptor-safe and deeply detached;
  culled text publishes new geometry immediately while deferring only Pixi text
  texture regeneration. The bar/icon and background/text WebGL verifiers now
  share the standard `verify:instance-presentation` gate.
  The final-code 5,000/10,000-cell 2+7 WebGL proxy records first-overlay
  update medians of 433.8/753.1ms, repeated-update p95 medians of
  468.9/846.9ms, rAF-gap p95 medians of 433.4/667.0ms, and long-task-count
  medians of 8/8. These all-cell background plus text content/style/layout
  costs remain unfavorable and are not substituted for the narrower bar-only
  checkpoint.
- The follow-up typecheck, scoped lint, targeted mutation/leaf/engine-probe
  tests, and combined bar/icon plus background/text WebGL gate pass. The branch-wide
  unit gate still reports 10 render-text fold failures because retained
  actual-only fixture rows publish a semantic `plannedRoute` that differs from
  their synthetic `attachedRoute`; the immutable contract fixtures and fold
  evidence were not changed by this checkpoint.
- The text viewport checkpoint keeps the existing zoom-aware quad/chunk culler
  and adds initial demand materialization: full rebuilds retain dense slot
  geometry for every visible semantic text while creating Pixi `Text` or
  `BitmapText` objects only for viewport-near chunks. Pan and zoom materialize
  newly visible chunks through the same central leaf lifecycle; offscreen
  content/style updates remain deferred while geometry updates publish before
  culling. No public API, dataset, semantic hash, history, accessibility,
  listener, ticker, or per-cell closure contract changed.
  The final 5,000/10,000-cell 2+7 WebGL proxy records mount medians of
  721.9/1,054.3ms versus the preceding 1,090.6/1,469.4ms checkpoint, and
  repeated-update p95 medians of 401.9/672.8ms versus 468.9/846.9ms. Initial
  public render-command counts are bounded at 605/634 and rise only to 670/699
  after the sampled pan sequence. First-overlay medians are 414.5/744.9ms,
  rAF-gap p95 medians remain unfavorable at 400.3/666.6ms, and long-task-count
  medians remain 8/8. The checkpoint therefore proves retained value without
  claiming that all-cell text/style publication or frame stalls are solved.
- The image-readiness publication checkpoint removes generic image placeholder
  pixels without adding a public API or eager-loading the eight-image catalog.
  Mount settles only active distinct initial bindings and publishes once;
  retargets retain the last resolved texture until one authoritative swap, and
  never-resolved pending/failed leaves remain pixel-transparent while geometry,
  hit behavior, and diagnostics continue. A packed alternating 2+7 matrix over
  3,000/10,000 entities, 300/3,000 image leaves, and 1/8 unique bindings records
  first-complete medians improving from `431.8/618.6/668.6/670.1ms` to
  `407.1/600.3/631.0/638.6ms`, publication count `2 -> 1`, exact unique-binding
  acquire/decode/upload scaling, steady rAF parity, and zero lifecycle residue.
  The full asset/browser/package/memory gates pass; the known 10 immutable
  render-text fold failures and one current transitive nanoid audit advisory
  remain reported rather than folded into this change.
- The initial-canvas publication checkpoint keeps the package-created WebGL
  canvas detached until frame revision 1 has rendered its complete geometry,
  bar, text, configured background, and settled active images, then attaches it
  once and activates surface bindings in the same task. Controlled Chromium
  delays changed pending visible canvas `1 -> 0` and median uninitialized
  exposure `110.4-303.8ms -> 0ms` across the 3,000/10,000 entity matrix without
  adding a render, publication, RAF, ticker, API, or steady-frame readiness
  lookup. Default/custom first pixels, rejection/loss/settlement abort, rapid
  remount, injected-canvas style/parent restoration, shared leases, memory, and
  packed functional cleanup pass. Final packed bar-animation medians remain at
  parity: 5,000/10,000 repeated p95 `29.9/64.2ms -> 27.3/61.0ms` and rAF p95
  `83.3/134.1ms -> 66.7/133.7ms`; the 10,000 long-task median `14 -> 16`, the 10
  known immutable render-text fold failures, and the current transitive
  `nanoid 3.3.16` audit advisory remain explicitly unfavorable.

# Next Step

- Review the completed initial-canvas checkpoint through runtime commits
  `cc6220c`, `5c326e1`, and `f5cabe9` plus verification commit `900d04e` before any push or
  Draft PR update.
  Integrating services should start
  with `PatchMap.mount()`, use `update()` for one owner, queried target sets
  plus columnar `updateBatch()` for repeated batches, and `transaction()` for
  heterogeneous or structural atomic work. Concrete background, bar, icon, and
  text presentation use the renderer-only overlay; retain labels,
  identity/structural changes, and other arbitrary component fields in the
  host. Increase the package version only after merge.
