# Decisions

**2026-07-30**

- **Background:** PatchMap has a sound aggregate runtime but its largest files mix public contracts, orchestration, adapters, and pure calculations.
- **Decision:** Refactor by ownership boundary and readable primary flow, not by LOC alone; retain parser, atomic transaction, central runtime, aggregate Application ownership, and asset lifecycle writers until an independently measured tranche justifies moving them.
- **Why:** Mechanical splitting would increase state passing and create equivalent write paths, while explicit surface, geometry, semantic-index, mesh-planning, and Lab-view boundaries reduce coupling without changing product semantics.
- **Impact:** Each tranche keeps public re-export compatibility, uses targeted tests first, and runs browser/package/memory/performance gates only when its actual ownership or hot path changes.

**2026-07-30**

- **Background:** Exact-clone analysis found broad repetition, especially in contract folds and tests, but many similarly named helpers have different failure, freezing, or browser-isolation semantics.
- **Decision:** Consolidate only exact or contract-proven helper families; preserve intentionally standalone contract handlers/folds and avoid a permissive all-capability test fake.
- **Why:** The approved expected-blind comparison firewall and unsupported capability tests depend on those explicit boundaries.
- **Impact:** Shared product utilities, narrow Lab journals/value helpers, and minimal test harness atoms are eligible; generated or immutable contract evidence is not.
