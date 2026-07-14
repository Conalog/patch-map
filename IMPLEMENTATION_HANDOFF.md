# PATCH MAP v0.10 Clean-room Oracle Handoff

This directory is safe for the implementation owner. It contains independently authored inputs, normalized observable reference outputs, public scene/geometry snapshots, ordered event traces, settled pixel evidence, environment metadata, analyzed provisional performance evidence, and the approved public contract documents.

All 31 fixtures have status `oracle-generated/review-pending`: the approved v3 set of 14 is byte-preserved and v4 adds 17 source-clean fixtures for Q1–Q23. The conformance matrix has not been changed to `captured`; the analysis owner must review the evidence first.

The export intentionally excludes the opaque reference archive, installed packages, bundles, source maps, the reference import entrypoint, reference browser runner, browser caches, error stacks, internal paths, and private assertions. No replacement implementation is included.

The source-clean fixture code is under `fixtures/**`. Normalized results are under `artifacts/expected/**`. Read `docs/implementation/comparison-contract.md` before comparing them. The current `UPD-005` macOS headless SwiftShader pixels are explicitly `provisional-non-windows` and `normative:false`: the initial/pre-update `UPD-005-before.png` contains large black areas, while the after/next-frame `UPD-005-after.png` has a white background. Its return-time and next-frame public state/event/timing remain normative.

Start with the implementation-unblocking contracts `API-101`, `REL-101`, `TXT-101`, `CTX-101`, `STA-101`, and `VIE-101`, then apply the remaining Q coverage in `docs/implementation/q1-q23-coverage.md`. Q4, Q7, Q12, Q18, and Q21 are explicitly partial only at the boundaries stated there; do not infer missing drag/paint timing, exhaustive unprobed schema combinations, backend renderer primitives, or Windows pixels.

`S2-101` provides the clean-room-safe maintained-product fixture and a normative public scene-node counting definition. Its macOS headless screenshot is non-normative. Renderer-backend primitive counting is not exposed by the public API and native/headed Windows S1/S3/S4 evidence remains pending.

The implementation-safe performance bootstrap and commands are in `docs/implementation/performance-runbook.md`. Its package scripts are backed by files included in this export. Oracle-only Windows reference execution instructions are intentionally excluded. Performance reports remain provenance metadata, and the native Windows gate remains `pending`.
