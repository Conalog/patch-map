# PATCH MAP v0.10 Clean-room Oracle Handoff

This directory is safe for the implementation owner. It contains independently authored inputs, normalized observable reference outputs, public scene/geometry snapshots, ordered event traces, settled pixel evidence, environment metadata, analyzed provisional performance evidence, and the approved public contract documents.

All 14 requested fixtures have status `oracle-generated/review-pending`. The conformance matrix has not been changed to `captured`; the analysis owner must review the evidence first.

The export intentionally excludes the opaque reference archive, installed packages, bundles, source maps, the reference import entrypoint, reference browser runner, browser caches, error stacks, internal paths, and private assertions. No replacement implementation is included.

The source-clean fixture code is under `fixtures/**`. Normalized results are under `artifacts/expected/**`. Read `docs/implementation/comparison-contract.md` before comparing them. The current `UPD-005` macOS headless SwiftShader pixels are explicitly `provisional-non-windows` and `normative:false`: the initial/pre-update `UPD-005-before.png` contains large black areas, while the after/next-frame `UPD-005-after.png` has a white background. Its return-time and next-frame public state/event/timing remain normative.

The implementation-safe performance bootstrap and commands are in `docs/implementation/performance-runbook.md`. Its package scripts are backed by files included in this export. Oracle-only Windows reference execution instructions are intentionally excluded. Performance reports remain provenance metadata, and the native Windows gate remains `pending`.
