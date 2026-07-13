# Goal

Create a clean-room replacement for PATCH MAP v0.10 that preserves the documented public API and observable behavior for ordinary consumers while prioritizing predictable performance on low-end Windows hardware and large scenes. The replacement must be newly designed: compatibility is measured at the public boundary, not by recreating hidden source structure. Completion requires complete API coverage, fixture and independent contract coverage, reproducible package use, safety checks, and performance evidence rather than a narrow demonstration that a subset of examples runs.

# Scope

- Work only from the approved v3 handoff, its normalized evidence, and public dependency documentation.
- Preserve the clean-room separation while implementing and verifying a replacement library in this isolated branch.
- Treat observable compatibility, package-consumer usability, and large-scene performance as one product contract.

# Current Facts

The branch is an orphan-root clean-room workspace containing the approved v3 export. Its manifest has already been validated against its required SHA-256 and all 50 payload entries have matching sizes and hashes. The handoff supplies public contracts, fixtures, expected normalized outputs, safety evidence, and performance context; those inputs are immutable reference material. The policy fixes non-negotiable source boundaries, observable compatibility, evidence, and completion results while allowing the primary agent to choose and adapt internal architecture, sequencing, experiments, and delegation. It distinguishes normative state and behavior requirements from the UPD-005 macOS/SwiftShader black-pixel evidence, which remains non-normative until headed Windows evidence exists. Official public APIs and official documentation are the only permitted source for dependency behavior.

# Current State

The implementation Goal is active. The replacement now covers lifecycle, draw and update fixtures, indexed live scene handles, aggregate rendering, selectors, helpers, view/controllers, canvas events, assets, state/selection, transformer gestures, and undo/redo behavior that can be established from approved contracts. Managed scene refreshes coalesce at an explicit render or next-frame boundary while synchronous public state and event bindings remain observable before return. All fourteen fixtures match immutable normalized output in two fresh sessions. Twenty unit files with 131 tests, ten fresh browser-contract sessions, twelve finite memory cycles, exact ESM/CommonJS/UMD/NodeNext packed-consumer checks, package safety, and zero-vulnerability audit pass. Canonical-size S1 and S3/S4 proxy reports pass local gates; developer-native evidence is provisional, implementation rendering uses one backend primitive through 5,000 objects, and headed Windows native remains pending. Legacy conversion, complete validation/default matrices, advanced text, non-empty relations, reference-relative primitive counts, and exact opaque callback/error ABIs remain blocked by observable questions Q1~Q23 or missing approved inputs. During an official dependency search, a dependency source-map result was accidentally emitted; no PATCH MAP, reference, or original implementation material was accessed, and the emitted map content was not used. Clean-room acceptability of that incident requires explicit owner direction.

# Next Step

Present the boundary incident and Q1~Q23 to the owner, request a clean-room acceptability decision plus public observable answers, a safe S2 fixture, reference primitive evidence, and headed Windows results, then resume only within that direction while preserving the completed local gates.

# Working Boundary

- `src/`
- `tests/`
- `scripts/verification/`
- `docs/tasks/2026/07-13/patch-map-v0-10-rewrite/PUBLIC-API-COVERAGE.md`
- `docs/tasks/2026/07-13/patch-map-v0-10-rewrite/ORACLE-QUESTIONS.md`
