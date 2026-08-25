# Dataset Schema Reference

## Authority and Compatibility

This document closes the field-level language accepted by PatchMap. It is normative
alongside `dataset.md`; prose examples cannot widen it. The persisted root remains the
existing ordered element array. PatchMap adds no dataset version field, envelope, or
negotiation requirement. Contract/evidence revisions are recorded in fixture manifests,
not in customer data. A future approved schema change must first introduce its own
version and migration contract.

Unknown keys are rejected in elements, components, links, asset descriptors, texture
styles, and the enumerated stroke/text-style objects. The only extension point is
`attrs`, whose unknown keys are preserved as caller data. Absence selects the declared
default. JSON `null` is not absence and is rejected unless a field explicitly lists it.
JavaScript `undefined` is accepted only by omission before validation; it is never a
materialized or exported value.

## Common Records

### Element base

| Field | Required | Accepted value | Default / normalized result |
| --- | --- | --- | --- |
| `type` | yes | one element discriminator | unchanged |
| `id` | no | string, including empty | scene-local generated string only when absent; caller input unchanged |
| `label` | no | string | absent |
| `show` | no | boolean | `true` |
| `locked` | no | boolean | `false` |
| `attrs` | no | string-keyed record | absent; unknown nested cloneable values preserved |

### Component base

| Field | Required | Accepted value | Default / normalized result |
| --- | --- | --- | --- |
| `type` | yes | one component discriminator | unchanged |
| `id` | no | string, including empty | scene-local generated string only when absent |
| `label` | no | string | absent |
| `show` | no | boolean | `true` |
| `attrs` | no | string-keyed record | absent |

Components do not accept `locked`; editing lock is inherited from the owning element
hierarchy. Element IDs are scene-global. Component IDs are unique within their owning
item and are addressed with that owner. Generated grid-cell IDs are deterministic
`<grid-id>.<row>.<column>` composites.

## Element Field Matrix

Every row includes the element-base fields and only the additional keys below.

| `type` | Required additional keys | Optional additional keys | Defaults / constraints |
| --- | --- | --- | --- |
| `group` | `children: Element[]` | none | ordered; empty allowed |
| `grid` | `cells: (0\|1\|string)[][]`, `item` | `inactiveCellStrategy`, `gap` | strategy `destroy`; gap `{x:0,y:0}`; `item` is strict |
| `item` | `size` | `components`, `padding`, `contentOrientation` | `[]`, four zero edges, `upright` |
| `relations` | `links` | `style` | ordered link list; style is only `color`, `width`, `alpha` |
| `image` | `source` | `size` | natural asset size when size is absent; failure follows asset policy |
| `text` | none | `text`, `style`, `size` | empty string and standalone text defaults |
| `rect` | `size` | `fill`, `stroke`, `radius` | no authored fill/stroke; radius `0` |

The strict nested grid `item` accepts only `components`, `size`, `padding`, and
`contentOrientation`. It does not accept an ID, label, show, lock, or attrs because it
is a template rather than a materialized element. Each relation link accepts exactly
`source` and `target`, both strings. Self-links are valid. Identical ordered endpoint
pairs are deduplicated by first authored order; a reversed pair is distinct.

## Component Field Matrix

Every row includes the component-base fields and only the additional keys below.

| `type` | Required additional keys | Optional additional keys | Defaults / constraints |
| --- | --- | --- | --- |
| `background` | `source` | `tint` | semantic size is 100% of full item; white tint |
| `bar` | `source`, `size` | `placement`, `margin`, `tint`, `animation`, `animationDuration` | bottom, four zero edges, white, `true`, `200ms` |
| `icon` | `source`, `size` | `placement`, `margin`, `tint` | center, four zero edges, white |
| `text` | none | `text`, `placement`, `margin`, `tint`, `style`, `split` | empty, center, four zero edges, white, text defaults, `0` |

`background.source` accepts a rectangular texture style, reusable source string, or
inline asset descriptor. `bar.source` accepts only a rectangular texture style.
`icon.source` accepts a reusable source string or inline asset descriptor.

## Primitive Closure

- `size` is a nonnegative finite scalar or a complete nonnegative finite
  `{width,height}` record. Partial records and extra keys fail.
- Pixel/percentage size uses the grammar in `dataset.md#executable-value-grammar`; a
  two-axis record must contain both `width` and `height` and no extra keys.
- `gap`, margin/padding, radius, asset descriptor, texture style, relation style,
  rectangle/text stroke style, text style, placement, and orientation accept only the
  documented keys/enums.
- `inactiveCellStrategy` is exactly `destroy` or `hide`; `contentOrientation` is exactly
  `follow-item` or `upright`.
- A texture style requires `type: rect` and accepts optional `fill`, `borderWidth`,
  `borderColor`, and `radius`. Omitted style values normalize to transparent, `0`,
  black, and `0`.
- Numeric render fields must be finite. Alpha and rectangle/text stroke alignment are
  closed to `0..1`. Component-dimension plain numeric strings and `px` scalar strings are
  rejected; documented percentage/`calc()` dimensions and text-style CSS size branches
  remain valid. Spacing, durations, and border widths are nonnegative.

## `attrs` Visual Sub-language

The full record is copied and preserved, while these keys additionally affect visuals:

| Key | Accepted value | Conflict and normalization rule |
| --- | --- | --- |
| `x`, `y` | finite number | default `0` for rendering; absence remains absent in export |
| `angle` | finite degrees | mutually exclusive with authored `rotation` in one accepted record/update |
| `rotation` | finite radians | mutually exclusive with authored `angle`; unit is preserved in export |
| `scaleX`, `scaleY` | finite number | independent signed axes; default render value `1` |
| `alpha` | finite `0..1` | default render value `1` |
| `zIndex` | finite number | default render value `0`; equal values keep sibling order |

An invalid recognized visual key rejects the enclosing operation with its `attrs`
path; it is not preserved as inert metadata. The reserved transform spellings `scale`,
`skew`, `pivot`, `skewX`, `skewY`, `pivotX`, and `pivotY` always reject at their exact
path. `null` and non-finite canonical transform values fail. Other attrs keys are inert
to PatchMap rendering unless the host maps them to a visual update.

## Update and Export Treatment

The same field grammar is used by load, add, replace, and exported dataset validation.
Partial merge input is a distinct operation language defined in
`mutation-operation-schema.md` and governed by `engine-boundary.md`;
it must not be passed through the full-record validator as if omitted required fields
were defaults.

Canonical export preserves authored array order, element/component order, authored
IDs, labels, attrs metadata, and authored angle/rotation units. A record or transaction
containing both `angle` and `rotation` fails atomically. Generated IDs are
materialized into export so the saved snapshot is addressable and reload-stable.
Defaults are materialized in the normalized observation but may be elided from persisted
export only when reloading yields the same meaning. PixiJS public `ColorSource` values
in declared color-bearing fields are accepted in memory and exported as lowercase
`#rrggbbaa`; arbitrary attrs are never reinterpreted as colors. Non-color runtime
PixiJS objects and unknown attrs values that cannot be cloned fail export with a
path-aware `NON_SERIALIZABLE_VALUE` result.

## Mechanical Deliverables

The implementation repository must derive or cross-check all of the following against
one source of truth:

1. runtime validation for full records and partial-operation fragments;
2. public TypeScript declarations;
3. contract-revisioned valid/invalid fixture manifests;
4. generated field/default documentation;
5. canonical export validation.

CI fails if these artifacts disagree, if an accepted branch lacks a fixture, or if an
unknown key is accepted outside an explicit extension point.
