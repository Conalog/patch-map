# Goal

Create a clean-room replacement for PATCH MAP v0.10 that preserves the documented public API and observable behavior for ordinary consumers while prioritizing predictable performance on low-end Windows hardware and large scenes. The replacement must be newly designed: compatibility is measured at the public boundary, not by recreating hidden source structure. Completion requires complete API coverage, fixture and independent contract coverage, reproducible package use, safety checks, and performance evidence rather than a narrow demonstration that a subset of examples runs.

# Scope

- Work only from the approved v3 handoff, its normalized evidence, and public dependency documentation.
- Preserve the clean-room separation while implementing and verifying a replacement library in this isolated branch.
- Treat observable compatibility, package-consumer usability, and large-scene performance as one product contract.

# Current Facts

The branch is an orphan-root clean-room workspace containing the approved v3 export. Its manifest has already been validated against its required SHA-256 and all 50 payload entries have matching sizes and hashes. The handoff supplies public contracts, fixtures, expected normalized outputs, safety evidence, and performance context; those inputs are immutable reference material. The policy fixes non-negotiable source boundaries, observable compatibility, evidence, and completion results while allowing the primary agent to choose and adapt internal architecture, sequencing, experiments, and delegation. It distinguishes normative state and behavior requirements from the UPD-005 macOS/SwiftShader black-pixel evidence, which remains non-normative until headed Windows evidence exists. Official public APIs and official documentation are the only permitted source for dependency behavior.

# Current State

The implementation Goal is active. The initial public API inventory covers all package exports, Patchmap surfaces, seven element kinds, four component kinds, 36 conformance areas, and cross-cutting release gates. The TypeScript/Vite package scaffold now exposes the documented package symbols, and the browser conformance runner compares fresh sessions directly with immutable expected artifacts. The lifecycle vertical slice implements asynchronous idempotent initialization, ready-state publication and event timing, safe pre-init destroy, complete initialized teardown, listener cleanup, history-manager recreation, and same-instance reinitialization. LIF-001 and LIF-002 match exactly across repeated fresh Chromium sessions; build, typecheck, lint, seven independent core unit tests, package dry-run, and audit also pass. Draw, update, rendering, and most independent public contracts remain unimplemented. Observable details absent from the approved handoff remain oracle questions rather than inferred.

# Next Step

Implement the draw materialization and live scene-handle vertical slice, first fixing replacement, immutability, validation, and asynchronous event semantics, then expanding geometry and all seven element/four component kinds against DRW-001 through DRW-006.

# Working Boundary

- `src/`
- `tests/`
- `scripts/conformance/`
- `docs/tasks/2026/07-13/patch-map-v0-10-rewrite/PUBLIC-API-COVERAGE.md`
- `docs/tasks/2026/07-13/patch-map-v0-10-rewrite/ORACLE-QUESTIONS.md`
