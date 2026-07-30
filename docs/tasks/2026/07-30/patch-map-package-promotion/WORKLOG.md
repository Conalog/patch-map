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
