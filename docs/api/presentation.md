# Presentation

- Status: current
- Audience: package consumers and agents changing non-authoritative visual state
- Source: [`presentation-layers.ts`](../../src/patch-map/presentation-layers.ts), [`instance-presentation-overlay.ts`](../../src/patch-map/core/instance-presentation-overlay.ts)

## Scope

This page owns keyed alpha layers and concrete grid-instance presentation
overlays. These states affect visible pixels but do not rewrite authored dataset
identity. Mutation call selection is owned by
[`mutations-and-history.md`](mutations-and-history.md).

## Contract

### Keyed alpha layers

- `presentation.set(key, layer)` atomically replaces one host-owned key;
  `presentation.clear(key)` removes only that key.
- A layer captures a revision-bound logical `scope`, intersects its `targets`, and
  applies finite `alphaMultiplier` values from 0 through 1 to matched and/or
  unmatched branches.
- Multiple keys compose as `base alpha × each layer multiplier`. Key order does
  not change the product.
- Targets outside the scope are ignored and counted. Alpha zero changes pixels,
  not visibility or hit identity.
- Keyed layers are capture-visible and excluded from dataset snapshots,
  serialization, semantic hashes, and history. Successful dataset replacement
  and destroy clear every key; failed replacement preserves them.
- A structural commit reprojects identities already captured by the layer. IDs
  created after `set()` do not enter its saved scope automatically.

### Concrete grid-instance overlays

Address one expanded cell with `<grid-id>.<row>.<column>` and the template's
component ID. `update()` and `updateBatch()` support these renderer-visible
fields:

| Component | Fields |
| --- | --- |
| background | `show`, `source`, `tint`, `attrs` |
| bar | `height`, `show`, `source`, `tint` |
| icon | `show`, `source`, `tint` |
| text | `text`, `style`, `show`, `placement`, `margin`, `tint`, `split`, `attrs` |

- `null` restores only that field from the current authored template.
- Concrete overlays are excluded from the caller dataset, semantic hash, and
  authored history. They use the interaction revision and central renderer and
  animation scheduler; no overlay-owned display object or frame loop is created.
- Updating the authored grid template instead changes every expanded cell.
- A dataset replacement or destroy clears concrete overlays.

## Failure semantics

- A stale or foreign scope, invalid key, multiplier outside 0..1, or unsupported
  layer field leaves all keyed layers unchanged.
- Grid overlay requests reject atomically for missing or duplicate targets,
  unequal columns, ambiguous components, accessor-backed input, invalid values,
  and fields outside the table above.
- Keyed targets outside their scope are ignored by design; the result reports
  `ignoredTargetCount`.

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| keyed composition and lifecycle | [`presentation-layers.ts`](../../src/patch-map/presentation-layers.ts) | [`presentation.test.ts`](../../tests/semantic/presentation.test.ts) |
| sparse-to-dense projection | [`presentation-projection.ts`](../../src/patch-map/presentation-projection.ts) | [`presentation-projection.test.ts`](../../tests/rendering/presentation-projection.test.ts) |
| concrete field overlay | [`instance-presentation-overlay.ts`](../../src/patch-map/core/instance-presentation-overlay.ts) | [`core-presentation-integration.test.ts`](../../tests/core/core-presentation-integration.test.ts) |
| column validation and mixed animation | [`developer-api/presentation.ts`](../../src/patch-map/developer-api/presentation.ts) | [`engine-update-transactions.test.ts`](../../tests/engine/engine-update-transactions.test.ts) |
