# Worklog

**2026-07-30**

- **Batch:** Structural and performance inventory.
- **Work:** Confirmed the clean dedicated branch; inventoried product, Lab, tests, performance, and verification code; measured LOC/import direction; classified large files by responsibility; and ran an exact-clone scan.
- **Evidence:** `src/patch-map` is 64,704 LOC; the largest files are `engine.ts` 11,270, `core.ts` 4,738, `semantic/transaction.ts` 3,564, `parser.ts` 3,038, and `renderers/mesh-layer.ts` 2,813; exact-clone scan found 805 clones / 7.3% across the scoped corpus.
- **Result:** Established a staged target structure and rollback criteria; no product code or immutable evidence changed in this batch.
