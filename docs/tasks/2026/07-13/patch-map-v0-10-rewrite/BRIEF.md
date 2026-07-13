# Goal

Create a clean-room replacement for PATCH MAP v0.10 that preserves the documented public API and observable behavior for ordinary consumers while prioritizing predictable performance on low-end Windows hardware and large scenes. The replacement must be newly designed: compatibility is measured at the public boundary, not by recreating hidden source structure. Completion requires complete API coverage, fixture and independent contract coverage, reproducible package use, safety checks, and performance evidence rather than a narrow demonstration that a subset of examples runs.

# Scope

- Work only from the approved v3 handoff, its normalized evidence, and public dependency documentation.
- Preserve the clean-room separation while implementing and verifying a replacement library in this isolated branch.
- Treat observable compatibility, package-consumer usability, and large-scene performance as one product contract.

# Current Facts

The branch is an orphan-root clean-room workspace containing the approved v3 export. Its manifest has already been validated against its required SHA-256 and all 50 payload entries have matching sizes and hashes. The handoff supplies public contracts, fixtures, expected normalized outputs, safety evidence, and performance context; those inputs are immutable reference material. The policy fixes non-negotiable source boundaries, observable compatibility, evidence, and completion results while allowing the primary agent to choose and adapt internal architecture, sequencing, experiments, and delegation. It distinguishes normative state and behavior requirements from the UPD-005 macOS/SwiftShader black-pixel evidence, which remains non-normative until headed Windows evidence exists. Official public APIs and official documentation are the only permitted source for dependency behavior.

# Current State

No Goal has been set and no library, conformance runner, test, or performance implementation has started. Only the durable clean-room policy and resume context are fixed. The workspace is ready for the next authorized work phase; implementation choices remain intentionally deferred until the Goal is set.

# Next Step

After setting the Goal, identify an initial public API coverage inventory and major risks from the approved contracts, then begin implementation and verification using the architecture and execution order selected by the primary agent while refining coverage iteratively.

# Working Boundary

- `AGENTS.md`
- `docs/reference/cleanroom-implementation-policy.md`
- `docs/tasks/2026/07-13/patch-map-v0-10-rewrite/BRIEF.md`
- `docs/tasks/2026/07-13/patch-map-v0-10-rewrite/logs/DECISIONS.md`
- `docs/tasks/2026/07-13/patch-map-v0-10-rewrite/logs/WORKLOG.md`
