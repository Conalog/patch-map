# PATCH MAP v0.10 Comparison Contract

Status: implementation handoff; analysis-owner review pending

## Normative observations

Compare the replacement with the captured public observations: returned values, public props and scene state, ordered public event traces, and documented return/frame timing boundaries. These observations describe behavior, not an inferred matching algorithm or renderer architecture.

Every fixture remains `oracle-generated/review-pending`. Do not promote the conformance matrix to `captured` until the analysis owner reviews each observable result.

The v4 priority contracts are `API-101` (legacy conversion/draw), `REL-101` (relations), `TXT-101` (text), `CTX-101` (`animationContext`), `STA-101` (state/selection lifecycle), and `VIE-101` (`syncViewTransform` and view controls). Their normalized expected files are implementation inputs; do not rewrite them to fit an implementation.

### UPD-002 component identity

For component-array replacement, an input component that omits `id` can materialize a new generated ID in `item.props.components`, while the matched public live scene handle can retain its prior explicit ID. Exact generated ID strings are volatile and non-normative; the public cross-surface relationship between the generated props ID and retained explicit live-handle ID is Level 1 normative observable behavior.

The same rule applies to the v4 identity fixtures: compare normalized cross-phase/cross-surface relationships, not raw generated strings. `UPX-101` makes no-ID child reuse, moved-child duplication, and grid template/live-component identity observable without prescribing an internal matching algorithm.

### Publicly unavailable and partial surfaces

`INT-101` normatively covers the callback arguments and ordering it reached: `(target-or-elements, event)` for down/up/click/double-click/right-click plus filter/select-unit/deep-select behavior. Its authored headless drag/paint sequence did not reach the drag callbacks; absence outside the recorded sequence must not be generalized into an implementation rule.

`S2-101` defines a normative recursive public scene-node count through `world.children`. It does not define a renderer-backend primitive or draw-call count. Obtaining that count would require forbidden renderer internals, so it remains unavailable rather than normative.

## Metadata

Environment, fixture status, Windows-gate status, and performance provenance describe where and how evidence was produced. They are not behavior the replacement must reproduce. Performance comparisons use the same workload and approved environment; host-specific absolute values are not cross-machine behavior requirements.

## Pixel evidence

Pixels are normative only when compared in the same approved environment or after native Windows headed evidence has been reviewed and approved. Raster tolerance covers browser/GPU antialiasing variance only and must not normalize semantic geometry, visibility, content, background, or color differences.

`UPD-005` is a specific exception in the current export: its macOS headless Chromium SwiftShader pixel evidence is `provisional-non-windows` and `normative:false`. The initial/pre-update preserved file (`UPD-005-before.png`) contains large black areas, while the after/next-frame file (`UPD-005-after.png`) has a white background. Preserve both files as provenance; do not color-correct them or require the replacement to reproduce either environment-specific raster result. The fixture's synchronous return, return-time public scene/state, ordered event trace, and next-frame public scene/state and timing boundary remain normative. The native Windows gate is pending.

`S2-101` pixels have the same `provisional-non-windows`, `normative:false` status. Its public state, geometry, text, and counting observations remain normative; its screenshot is environment provenance until native/headed Windows review.
