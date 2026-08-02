# Worklog

## 2026-07-30 — Cleanup started

- Confirmed clean `performance/core-v2` worktree and active cleanup goal.
- Inventoried the legacy root, Core v1, completed PixiJS runtime, package
  exports, Labs, examples, and verification scripts.
- Identified the retained Core v1 dependency as dense-store substrate rather
  than a shippable product.

## 2026-07-30 — PatchMap product promotion completed

- Promoted the completed PixiJS implementation to `src/patch-map` and the root
  `@conalog/patch-map` export with primary class `PatchMap`.
- Moved the reusable dense store into `src/patch-map/dense`; removed the Core
  v1 Canvas2D product, legacy root implementation, old Labs/tests/builds, and
  unreferenced legacy verification harnesses.
- Consolidated the current Lab, examples, docs, package consumer, browser,
  memory, performance, and main-parity tooling on PatchMap names. Historical
  contract IDs and frozen evidence paths were preserved.
- Verification: typecheck PASS; lint PASS; build and Lab build PASS; unit
  149/149 files and 1,456/1,456 tests PASS; canonical contract 38 decisions and
  173 cases PASS; headless manual Lab 173 routes and 192/192 checks PASS with
  zero console/page/network errors; packed ESM/CJS/types, four examples, and
  38 journeys PASS; 2+7 memory over 5,099 entities PASS with 88,367-byte
  retained-heap median and DOM/scheduler/renderer released.
- The external npm vulnerability audit, WebGPU adapter qualification, and
  Windows-native qualification remain explicitly pending. No renderer hot
  path changed, so no new full performance matrix was run.

## 2026-07-30 — PR review checkpoint

- Reviewed the complete cleanup diff for package/API boundaries, stale
  product names, immutable-evidence isolation, lifecycle/asset ownership,
  deleted-surface references, secret/debug residue, and distribution config.
- Fixed the contract CI path filter so changes under
  `scripts/verification/core-v2-contract/**` trigger verification.
- Changed current operational browser checks to exercise `/lab/patch-map`
  directly instead of relying on the immutable contract's historical
  `/lab/core-v2` compatibility route.
- Regression verification after review fixes: 62/62 targeted tests, scoped
  lint, typecheck, and headless 173-route Lab 192/192 PASS with zero
  console/page/network errors. Browser and Vite test processes exited cleanly.
- Product cleanup commit: `68888cc` (`refactor: promote PatchMap as the root
  product`).

## 2026-07-30 — Single PatchMap Lab

- Removed the duplicate low-level performance Playground, its public bridge,
  renderer/backend selectors, styles, and dedicated WebGL/WebGPU browser
  verifiers. `/lab/patch-map/` now builds and serves only the Korean 173-case
  manual Lab.
- Removed `PatchMapRuntime`, `createPatchMapRuntime()`, and low-level-only
  types from the root package export. The Lab and packed consumer now use
  `PatchMap`; the internal performance harness imports the non-published core
  module explicitly.
- Changed packed verification to write transient results by default. A first
  verification run updated the frozen package evidence before this guard was
  added; that generated change was discarded, the original evidence restored
  exactly, and the package gate rerun without frozen-file drift.
- Verification: targeted 48/48 and release-regression 10/10 tests PASS;
  typecheck and full lint PASS; Lab and package builds PASS; full unit
  149/149 files and 1,456/1,456 tests PASS; canonical 38 decisions and 173
  cases PASS; packed ESM/CJS/types, four examples, and 38 journeys PASS;
  headless 173-route Lab 192/192 PASS with zero browser errors; headless
  10,000-record fit/zoom/animation-during-pan/destroy PASS with canvas and
  bridge cleanup at zero.
- Renderer, scheduler, resource ownership, and destroy paths did not change,
  so the full performance matrix and 2+7 memory gate were not repeated.
  Windows-native and qualified WebGPU measurements remain pending.

## 2026-07-30 — Repository residue cleanup

- Removed the obsolete clean-room handoff/export, root `artifacts` and
  `fixtures`, Core v1 performance control, completed main-parity harness and
  captures, obsolete implementation/task working documents, and unreferenced
  timestamped performance outputs with explicit user approval.
- Preserved the canonical 173-case functional-contract corpus, its immutable
  normalized expected observations/reviews, five digest-bound extraction and
  interaction artifacts, and eleven performance/release results with live
  source references.
- Moved active performance tooling from `performance/core-v2` to
  `performance/patch-map`, renamed current native/release scripts to
  `patch-map-*`, and removed the completed `verify:main-parity` surface.
- Replaced contract-only path-filtered CI with full PR/push validation:
  install, typecheck/lint/unit, canonical contract, product build, and Lab
  build.
- The packed 38-journey run exposed CSM-036 near its generic 45-second
  timeout. Its production-sized editor remount/cleanup journey now has a
  dedicated 120-second verifier ceiling; the rerun completed all 38 journeys
  with lifecycle cleanup.
- Verification: targeted 9 files/281 tests PASS; typecheck PASS; full lint
  PASS; product and Lab builds PASS; full unit 148 files/1,451 tests PASS;
  canonical 38 decisions/173 cases PASS; performance evidence verifiers PASS;
  native release positive proof plus 15 negative probes PASS; packed
  ESM/CJS/types, four examples, and 38 journeys PASS; headless 173-route Lab
  192/192 PASS with zero console/page/network errors.
- Retained local evidence for commit `8d285db` remains internally valid and
  native Windows/NVDA/device/actual-host qualification remains pending.
  Cleanup commit `1f2f3ef` does not reuse that evidence as a new performance
  claim. Renderer, scheduler, resource ownership, and destroy paths did not
  change, so the full performance matrix and 2+7 memory gate were not rerun.
- Cleanup commit: `1f2f3ef` (`refactor: consolidate PatchMap repository
  tooling`).

## 2026-07-30 — Repeated 5,000-bar retarget performance

- Reproduced rapid full-bar updates before prior animation settlement. Active
  presentation count stayed bounded at 5,000 and the central frame loop kept
  one pending RAF; the primary synchronous cost was exact full-dataset digest
  materialization followed by direct projection reconciliation, not animation
  or ticker accumulation.
- Deferred exact semantic hashing until observation, made committed result
  digests lazy and memoized, stopped the Lab from forcing full snapshots during
  active animations, removed redundant direct-batch animation-target Set
  construction, and reused the animated spatial hit envelope across exact
  direct retargets.
- Rejected two measured alternatives: holding normalized batch inputs
  increased allocation pressure, and copying broad stable records instead of
  overlaying them raised reconcile time to 178–227ms. Neither remains in the
  product.
- Headless 5,000-bar smoke with six updates and active pan PASS: repeated
  action median 92.8ms/p95 108.5ms, rAF-gap p95 116.1ms, two long tasks,
  exact digest observable after settlement, and bridge/canvas cleanup zero.
- The final 2+7 checkpoint preserved all raw 1x/4x samples. 1x repeated-action
  trial median was 90.0ms and rAF-gap trial median was 115.9ms versus the
  original diagnostic's 127–198ms action range and 184.3ms rAF p95. One
  system-wide slow trial reached 544.3ms; 4x reached 1,036.9ms, so the
  predeclared 250ms/900ms action budgets remain FAIL rather than being relaxed.
- Verification: targeted 71/71 then 58/58 tests PASS; typecheck and scoped/full
  lint PASS; full unit 148/148 files and 1,453/1,453 tests PASS; Lab build PASS;
  canonical 38 decisions and 173 cases PASS; 2+7 memory over 5,099 entities
  PASS with 90,715-byte retained-heap median and DOM/scheduler/renderer
  released; packed ESM/CJS/types, four examples, and all 38 consumer journeys
  PASS with lifecycle cleanup. Windows-native performance remains pending.

## 2026-07-30 — Actual production data in the single Lab

- Added the user-supplied 1,071,991-byte PATCH MAP JSON as the separate
  `실제 운영 데이터 · 605개 원본` manual-Lab option without replacing the
  seeded production-shaped workload or changing the canonical contract sizes.
- Preserved all 605 roots, stable IDs, 643 components, 170 relation records,
  authored visibility, content orientation, and the original remote image
  source. The frozen source is loaded without seed transformation or caller
  mutation.
- Split the fixture into an on-demand Lab chunk: the normal Lab chunk remains
  3,777.98KB and the production fixture adds 588.09KB/52.28KB gzip only after
  selection.
- Verification: focused 10/10 unit tests PASS; typecheck and scoped lint PASS;
  Lab build PASS; headless Playwright Chromium loaded WebGL, 605 roots and 643
  components, fit at the 2.5% floor, pan, and destroy PASS with input
  immutability and zero console/page/network errors. Renderer, scheduler,
  package exports, and resource ownership did not change, so performance,
  memory, packed-consumer, and full contract gates were not repeated.

**2026-07-30**

- **Actual production rendering compatibility.** Fixed the v0.10 visual-property family instead of special-casing sample IDs: `attrs.alpha` now multiplies through group/grid/item/component/direct and relation ownership, including local image/text opacity. The producer's `attrs.display: "image"` profile aligns authored image and overlay top-left rotation while the approved default image-center contract remains unchanged.
- Split standalone root images from component assets inside the aggregate Pixi hierarchy, kept root imagery in the underlay, and preserved background, bar/relation, icon, text, and interaction overlay lanes without per-entity scene nodes.
- Added the Lab's explicit `images.conalog.com` ingestion profile and connected asynchronous Core invalidation to the `PatchMap` frame owner. The default package policy remains deny-by-default and resolved asset leases still release on destroy.
- Verification: targeted 77/77 and 29/29 tests PASS; typecheck/full lint PASS; full unit 148 files/1,457 tests PASS; package and Lab builds PASS; canonical 38/173 contract PASS; 173-route headless Lab 192/192 PASS; actual-production headless background `resolved/current` at 1730×1488, image/overlay center distance 11.02px, overlay alpha 0.6, pan/destroy and console/page/network error zero PASS; packed ESM/CJS/types, four examples and 38 journeys PASS; 2+7 memory over 5,099 entities PASS with 94,087-byte retained-heap median and DOM/scheduler/renderer released.
- The memory command's transient update to the retained result path was discarded so digest-bound historical evidence stayed unchanged. No hot animation path changed, so no new full performance matrix was run; Windows-native and qualified WebGPU remain pending.

**2026-07-31**
- Batch: Structural refactor promotion checkpoint. Work: Integrated the completed PatchMap ownership refactor and removed the remaining public Core v2 route/probe identity without changing the root API or immutable contract corpus. Evidence: Final unit/build/contract/package/headless Lab gates PASS and independent review reports no blocker; lifecycle ownership remains proven by the unchanged-path 2+7 checkpoint. The fresh Chromium performance proxy is preserved as FAIL because a 4x outlier exceeded its declared limit, while Windows-native and qualified WebGPU remain pending. Result: The branch is ready for a cleanup PR after the final documentation commit and clean-worktree check; version bump remains post-merge.
- Batch: Promotion paused for full structural refactor. Work: Reopened the cleanup because Core and Engine still combine excessive stateful responsibilities and began a complete allowed-file inventory. Evidence: Previous release results remain baseline-only for unchanged paths. Result: PR creation and versioning remain deferred until the new structural goal and release checkpoint complete.

## 2026-08-02 — Branch readiness fixed point

- Reviewed the full branch for correctness, runtime ownership, workflow scope,
  removable complexity, validation, and documentation drift. Fixed reentrant
  atomicity, replacement supersession, external asset admission, scheduler
  continuation after observer errors, presentation O(N²) lookups, dirty-range
  expansion, package metadata/publish guards, CI packed-consumer coverage,
  JavaScript/public-example lint coverage, and tracked-evidence pollution.
- Consolidated repeated slot-range, strict plain-record, ordered string-array,
  component visual-target, Mesh graphics, and hidden-image probe policy. Kept
  transaction, history, parser diagnostic, and bar hot-path loops separate
  where extraction would blur atomic boundaries or add per-entity calls.
  `jscpd` reports 0.6% duplication at the 8-line/80-token threshold.
- Fresh verification passed full lint/typecheck, 194 unit files / 1,735 tests,
  product and Lab builds, canonical 38 decisions / 173 cases, headless 173
  routes / 192 checks with zero console/page/network errors, packed ESM/CJS/
  types + 38 journeys + four examples, and 2+7 memory over 5,099 entities plus
  nine ownership cycles at 98,319-byte retained-heap median.
- The 5,000-bar repeated-retarget 2+7 checkpoint passed: 1x repeated-action
  p95 78.5ms and 4x p95 401.3ms. The 10,000-bar 1x smoke passed at 159.2ms
  repeated-action p95, while 233.3ms rAF p95 and 20 long tasks remain honestly
  unfavorable. Results are transient readiness artifacts; Windows-native and
  qualified WebGPU stay pending. No version, commit, push, or PR metadata was
  changed by the branch-readiness run.
