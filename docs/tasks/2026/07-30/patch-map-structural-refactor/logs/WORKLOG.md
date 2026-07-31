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
