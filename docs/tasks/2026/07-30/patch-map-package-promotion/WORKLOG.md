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
