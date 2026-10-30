# Keyed presentation alpha layers

Status: implemented, unreleased. Public entry points and usage belong to the
[Flutter README](../../../packages/flutter/README.md). This is F31 of the
[accepted contracts](contracts.md); JS release/1.0 supplies the behavior model.

## Contract

`setPresentation(key, layer)` replaces one captured logical scope and matched
address set. `clearPresentation(key)` removes only that key. At least one of
`matchedAlpha` / `unmatchedAlpha` is required; omitted factors mean 1. All factors
must be finite in [0,1]. A nonblank key and every scope address are validated
before acceptance; malformed inputs reject atomically. Well-formed requested
addresses outside the exact logical scope are ignored and counted.

A group/grid expands to descendants; an item expands to its components.
Components use concrete item addresses, not grid template component addresses.
Expansion is a union within each key: parent/child overlap never multiplies a
layer twice, and matched membership wins. Across keys, factors multiply in
stable key order. Existing inherited/schema alpha still multiplies the result.

Layers change drawing only. They do not modify authored/live records, text
layout, bounds, selection, hit eligibility or the host's event filter. Alpha 0
is not a visibility/hit filter. Overlapping contents retain per-content alpha
and existing order; an entire item is never flattened into a single layer.

Results report synchronous admission and unique logical-address counts, not
frame completion. Existing draw/update Futures retain their submission contract.
Unlike JS TargetSet, Flutter uses detached `PatchMapTarget` lists; it exposes no
query predicate or scene token. Captured targets do not track host business rules.

Accepted replacement clears all keys before new-generation commands are admitted.
Invalid replacement preserves them. A layer set immediately after accepted draw
belongs to the new diagram and survives asynchronous preparation/hide. Inactive
maps preserve admitted layers and paint them on resume. Filters cannot mutate
layers; result callbacks can. Removing the widget drops all layer state.

## Ownership and rendering

`MapSession` owns a lazy `PresentationLayers`. The pure layer owner validates,
expands membership and composes one immutable sparse `PresentationOpacity`.
Its adjacency index is created on first valid use and released on last clear or
replacement. Unchanged effective factors retain snapshot identity. No per-frame
layer composition, dataset traversal or resource acquisition is introduced.

The existing backend port transfers that snapshot to the current render plan;
the existing frame coordinator invalidates/submits it. It does not increment a
value revision or create a second request/publication queue. Resource preparation
continues to consume effective data, never layer-adjusted copies.

Rectangles, relations and bar vertices multiply their existing color alpha.
Atlas text modulates the draw Paint; Paragraph and asset contents use their
content-level compositing seam. Shared Paint state is restored; shared text
keys, Paragraphs, glyph colors and SVG/raster leases are unchanged.
Outlined Paragraphs at effective opacity below 1 establish their padded ink
coverage inside that layer before drawing, preventing native glyph-edge clipping.
This also covers authored translucent outlines; opaque and stroke-free Paragraphs
and atlas text do not add that draw.

Static chunks retain their background geometry independently of whether their
current overlap proof permits batching. A visible affected chunk lazily checks
that proof again with components at presentation alpha 0 excluded. This temporary
envelope always includes the item bounds and all remaining visible overflow;
it does not replace published bounds or hit/query geometry. Actual overlap,
partial-alpha overflow and incompatible component order retain per-item drawing.
The narrowed proof is cached for the current chunk and opacity snapshot, and is
invalidated by relevant component geometry changes even when the full envelope
stays equal. Retained updates carry that invalidation before mutating live layouts.

Unchanged backgrounds reuse their vertices across text hiding/reveal and envelope
changes. A chunk owns at most one current unmodified background geometry; it may
keep that geometry while overlap temporarily prevents its use. Background shape,
transform or paint changes replace it. Alpha-adjusted backgrounds lazily build a
variant with the same shapes/order and multiplied colors. Plans share variants
only for identical static chunks and opacity snapshots, and cache no prior
keys/versions. Detached variants enter the existing safe retirement queue; the
last chunk/variant reference releases its geometry. Active effect updates can
recheck proofs or rebuild variants; this is not constant-cost bulk layer changing.

With no effective factors, rendering follows the ordinary loop without per-item
layer lookup, membership traversal or variant allocation. Clearing the last key
restores that path. Public command validation and normal value preparation remain
unchanged. The small low-level default-factor branches require a matched profile
checkpoint before claiming no observable regression.

## Focused verification

- Pure owner: validation/dedup, ignored targets, group/grid/component expansion,
  overlap union, deterministic composition, no-op identity and last-clear reset.
- Paint: rectangle/relation/bar/native text/atlas alpha and shared-state recovery;
  per-content overlap and asset overflow preserve the prior compositing boundary.
- Render plan: 100-item static chunk, one changed member, component-only effect,
  overlapping items, hidden overflow, retained/general proof invalidation,
  background mesh reuse/release and exact baseline recovery after clear.
- Widget/public API: multiple keys, latest live values after clear, invalid/valid
  replacement, draw-then-set, alpha 0 hit/selection, filters, detach/reattach.

Executed results are in the [implementation checkpoint](presentation-checkpoint.md).
The [hidden-overflow batching checkpoint](hidden-presentation-batching-checkpoint.md)
covers the later Android overview-pan improvement and its visual/memory limits.
The [mobile mode-switch profile](mobile-overview-mode-switch-checkpoint.md) separates
consumer input/projection and package preparation costs from overview painting.
Platform and performance qualification is scoped to those checkpoints;
this feature does not qualify the full Flutter/mobile/WebView integration.
