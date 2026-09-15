# Presentation

- Status: current
- Audience: package consumers and agents changing non-authoritative visual state
- Source: `packages/javascript/src/public/presentation.ts`, `packages/javascript/src/public/mutations.ts`,
  `packages/javascript/src/core/presentation-layers.ts`, `packages/javascript/src/core/instance-presentation-overlay.ts`,
  `packages/javascript/src/core/instance-presentation-request.ts`,
  `packages/javascript/src/core/bar-presentation-authority.ts`, and
  `packages/javascript/src/core/instance-component-presentation-projection.ts`

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
- A semantic update reapplies concrete overlays to surviving targets against
  the current authored template. Stored overlay fields remain in effect while
  fields outside the overlay follow the new authored values.
- An active bar animation continues when that replay preserves its effective
  destination. When the destination changes and the caller supplies an
  animation target set, only an included target transitions; a non-target bar
  lands on the new value immediately.
- Updating the authored grid template changes every expanded cell except fields
  still owned by a concrete overlay.
- A dataset replacement or destroy clears concrete overlays.

## Failure semantics

- A stale or foreign scope, invalid key, multiplier outside 0..1, or unsupported
  layer field leaves all keyed layers unchanged.
- Grid overlay requests reject atomically for missing or duplicate targets,
  unequal columns, ambiguous components, accessor-backed input, invalid values,
  and fields outside the table above.
- Keyed targets outside their scope are ignored by design; the result reports
  `ignoredTargetCount`.

Runnable keyed-layer reference:
[`packages/javascript/examples/presentation.ts`](https://github.com/Conalog/patch-map/tree/release/1.0/packages/javascript/examples/presentation.ts).

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| public keyed API validation | `packages/javascript/src/public/presentation.ts` | `packages/javascript/tests/integration/developer-api-targets-presentation.test.ts` |
| keyed composition and lifecycle | `packages/javascript/src/core/presentation-layers.ts` | `packages/javascript/tests/semantic/presentation.test.ts` |
| sparse-to-dense projection | `packages/javascript/src/presentation/projection.ts` | `packages/javascript/tests/rendering/presentation-projection.test.ts` |
| concrete request normalization | `packages/javascript/src/core/instance-presentation-request.ts` | `packages/javascript/tests/core/core-instance-component-presentation-integration.test.ts` |
| concrete overlay planning and projection | `packages/javascript/src/core/instance-presentation-overlay.ts`, `packages/javascript/src/core/instance-component-presentation-projection.ts` | `packages/javascript/tests/core/core-instance-component-presentation-integration.test.ts` |
| reconcile replay and bar animation continuity | `packages/javascript/src/core/instance-presentation-overlay.ts`, `packages/javascript/src/core/bar-presentation-authority.ts` | `packages/javascript/tests/core/core-instance-bar-presentation-integration.test.ts`, `packages/javascript/tests/core/core-bar-presentation-integration.test.ts` |
| public column validation and mixed animation | `packages/javascript/src/public/mutations.ts` | `packages/javascript/tests/integration/developer-api-updates.test.ts` |
