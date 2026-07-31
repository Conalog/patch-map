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
