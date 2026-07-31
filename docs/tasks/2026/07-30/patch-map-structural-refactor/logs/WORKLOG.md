# Worklog

**2026-07-30**

- **Batch:** Structural and performance inventory.
- **Work:** Confirmed the clean dedicated branch; inventoried product, Lab, tests, performance, and verification code; measured LOC/import direction; classified large files by responsibility; and ran an exact-clone scan.
- **Evidence:** `src/patch-map` is 64,704 LOC; the largest files are `engine.ts` 11,270, `core.ts` 4,738, `semantic/transaction.ts` 3,564, `parser.ts` 3,038, and `renderers/mesh-layer.ts` 2,813; exact-clone scan found 805 clones / 7.3% across the scoped corpus.
- **Result:** Established a staged target structure and rollback criteria; no product code or immutable evidence changed in this batch.

**2026-07-30**

- **Batch:** T1 exact utilities and surface contract direction.
- **Work:** Consolidated the identical FNV-1a identity hash, bounded spatial
  grid coverage, and relation endpoint geometry; moved surface geometry types
  below the engine facade; redirected accessibility to that narrow contract.
- **Evidence:** Targeted 100 tests, scoped lint, and typecheck passed. The
  tranche gate passed 148 files / 1,457 tests, full lint/typecheck, package and
  Lab builds, and the canonical 135 capability + 38 journey verifier. An
  independent review returned a clean verdict.
- **Result:** Replaced 185 duplicated or facade-owned source lines with 174
  shared/contract lines (11 net lines removed) and eliminated the
  `accessibility -> engine` back-edge without changing runtime ownership or the
  root public API; browser, memory, packed-consumer, and performance gates were
  intentionally not run because their code paths did not change.

**2026-07-30**

- **Batch:** T2 surface geometry ownership.
- **Work:** Moved surface/world geometry snapshots, readable content
  orientation, relation hit testing/indexing, and private geometry helpers from
  `engine.ts` into `engine/surface-geometry.ts`; moved their narrow value
  contracts into `engine/surface-contract.ts` and retained facade re-exports.
- **Evidence:** Targeted 56 tests, scoped lint, and typecheck passed. The
  tranche gate passed 148 files / 1,457 tests, full lint/typecheck, package and
  Lab builds, and the canonical 173-record verifier. Independent normalized
  review found all 30 moved functions behavior-equivalent.
- **Result:** Reduced `engine.ts` from 11,200 to 10,408 lines and established a
  one-way pure geometry boundary. No Pixi, scheduler, asset, publication, or
  lifecycle owner changed, so browser, packed-consumer, memory, and performance
  gates were intentionally deferred.

**2026-07-30**

- **Batch:** T3 semantic index ownership.
- **Work:** Moved component/text semantic probe contracts, full indexing,
  structural and flat incremental reconciliation, detached probe cloning, and
  direct/planned bar-height semantic fast paths into `engine/semantic-index.ts`.
- **Evidence:** Targeted 108 tests, scoped lint, and typecheck passed. The
  tranche gate passed 148 files / 1,457 tests, full lint/typecheck, package and
  Lab builds, and the canonical 173-record verifier. Independent review found
  item/grid/group traversal, visibility/lock inheritance, identity keys, and
  fast paths behavior-equivalent.
- **Result:** Reduced `engine.ts` from 10,408 to 9,887 lines while preserving
  its sole authority over atomic load/patch/history map replacement. No
  renderer, asset, scheduler, or lifecycle owner changed, so browser,
  packed-consumer, memory, and performance gates remained deferred.

**2026-07-30**

- **Batch:** T4 Pixi surface adapter ownership.
- **Work:** Moved the `PixiEngineSurface` class, default Core factory, surface
  port contracts, pointer bridge, and image probe projection into
  `engine/pixi-surface.ts` and `engine/contracts.ts`; retained all compatibility
  re-exports and the default factory selection in `PatchMap`.
- **Evidence:** Targeted 57 tests, scoped lint, and typecheck passed. The
  tranche gate passed 148 files / 1,457 tests, full lint/typecheck, package and
  Lab builds, and the canonical verifier. Headless Lab passed 173 routes /
  192 checks with zero console/page/network errors; actual-production passed
  605 roots / 643 components and destroy cleanup; 2+7 memory passed 5,099
  entities plus 9 ownership cycles with 92,939-byte retained-heap median.
  Independent review returned a clean verdict.
- **Result:** Reduced `engine.ts` from 9,887 to 8,866 lines and made the
  facade-to-surface port explicit without adding a scheduler, listener, ticker,
  asset owner, or per-entity object. Packed-consumer was not repeated because
  package exports/dependencies did not change; performance was deferred until
  the fresh pre-hot-path baseline. Windows native remains pending.

**2026-07-31**
- **Batch:** T5 aggregate Mesh planning boundary. **Work:** Moved typed-array geometry atoms into `renderers/mesh/geometry.ts` and store/projection-to-CPU lane planning into `renderers/mesh/chunk-geometry.ts`; retained Pixi creation, culling, GPU upload, incremental binding validation, and destroy ownership in `mesh-layer.ts` with facade re-exports. **Evidence:** Typecheck, full lint, targeted 59 renderer tests, package/Lab builds, canonical 173 contract, and two independent reviews passed; the full unit run passed 1,454/1,457 before three CPU-contention timeouts, and isolated reruns passed UPD-007/CSM-018 at normal limits plus both CSM-010 assertions at a diagnostic 180-second limit (95.7 seconds). **Result:** Reduced `mesh-layer.ts` from 2,789 to 1,625 lines without changing algorithms, public imports, resource ownership, or hot-path allocations; browser, package-consumer, memory, and performance gates were intentionally not repeated because those paths did not change.
- **Batch:** T6 rounded-bar retained geometry hot path. **Work:** Reused fixed 21-vertex rounded Mesh geometry for value-only bar retargets, retained Mesh/Geometry/UV/index identity, uploaded only dirty position buffers, and added selectable 1x/4x benchmark profiles; structural radius/style/visibility/fill-presence transitions keep the rebuild path. **Evidence:** Targeted 18 renderer tests, typecheck, full lint, 148 files / 1,458 unit tests, package/Lab builds, canonical 173 contract, headless 173 routes / 192 checks, 10,000-bar load/animate-pan/destroy, and independent renderer review passed with zero browser errors. The fresh 5,000 checkpoint reduced repeated-action p95 by about 89% at 1x and 71% at 4x versus the prior rebuild baseline; a same-session 10,000 4x cross-check reduced repeated-action p95 614.8 to 538.3 ms and rAF p95 782.4 to 666.4 ms, while first-action p95 was unfavorable at 806.5 to 935.2 ms. **Result:** Kept the retained path because repeated retarget and animation scheduling improved without observable or ownership changes; package-consumer and memory gates were deferred because exports and destroy ownership did not change, and Windows native remains pending.
