# Goal

Deliver a newly designed clean-room replacement for PATCH MAP v0.10 that preserves the documented public API and observable behavior for ordinary consumers while prioritizing predictable large-scene performance on low-end Windows hardware. Compatibility is judged at the public boundary, not by reconstructing hidden implementation structure. Completion includes public API coverage, deterministic conformance, package-consumer usability, lifecycle safety, dependency audit, and reproducible native and 4× proxy performance evidence.

# Scope

- Work only in this orphan implementation branch from the cumulative approved v3/v4 handoff, normalized public evidence, and official public dependency APIs.
- Keep approved expected output and reference evidence immutable while testing every documented public surface, including behavior outside the fixture set.
- Preserve the non-negotiable clean-room boundary while adapting internal architecture, sequencing, experiments, and delegation as needed.

# Current Facts

The active v4 manifest SHA-256 is `91315bb3449f6650ec89033386fb2c167bceca3a02a31591b23119dcc0a04a5f` and declares 72 safe payloads; the prior v3 evidence remains byte-preserved. `package.json` is the only manifest payload intentionally mutable for the implementation environment. All 31 fixture outputs remain Oracle-generated and review-pending even when local comparisons pass. UPD-005, TXT-101, and S2-101 headless macOS pixels are non-normative, and headed Windows native raster/performance approval is pending. The approved source-map and pixi-viewport UMD stack incidents were non-contaminating because no PATCH MAP/reference material was exposed and the dependency text was unused. This approval does not widen allowed inputs. Content searches exclude `node_modules`, `dist`, dependency bundles, and source maps; dependency verification uses only public package imports.

# Current State

The replacement implements all twelve documented exports and the approved lifecycle, schema, legacy conversion, scene identity, relation, text, update, state, selection, view, event, transformer, history, asset, and animation-context contracts. Public live handles are separated from an aggregate render layer so identity and scene traversal remain observable while one backend primitive serves scenes through 5,000 objects. The implementation commit is `d2a67e01c5c7b207b47c13d052c90373c1c983f0`. Unit, type, lint, browser, memory, packed ESM/CommonJS/NodeNext/UMD consumer, safety, audit, and 31-fixture fresh-session checks pass. Canonical 4× and provisional macOS-native S1/S3/S4 reports are preserved under `.perf-results/`; compatibility assertions pass and Windows native remains pending. Q4, Q7, Q12, Q18, and Q21 retain their explicitly limited Oracle status; the implementation does not infer the unavailable observations.

# Next Step

Hand off the committed implementation, coverage record, and preserved reports for analysis-owner review; resume only at the nearest affected contract if that review or future headed Windows evidence requires a change.

# Working Boundary

- `src/`
- `tests/`
- `scripts/`
- `docs/implementation/`
- `docs/tasks/2026/07-13/patch-map-v0-10-rewrite/`
