# Dataset Contract

`dataset-schema-reference.md` is the field-level authority for allowed keys, required
and optional fields, `null`/absence behavior, defaults, strict nested objects, update
fragments, and canonical export. This document explains their semantic meaning. Neither
file may be used to widen the other implicitly.

## Root and Common Fields

Canonical input is an ordered array of map elements. Historically runtime-accepted
legacy object roots enter through the compatibility ingestion boundary and normalize to
that array. Array order and nested child order are observable through hierarchy,
stacking, and deterministic selection.

Every element supports:

| Field | Contract |
| --- | --- |
| `type` | Required discriminator. |
| `id` | Optional string identity. Missing identities are materialized without mutating caller input. |
| `label` | Optional application label used for filtering and diagnostics. |
| `show` | Optional visibility, defaulting to visible. |
| `locked` | Optional interaction lock, defaulting to unlocked. |
| `attrs` | Optional public transform and presentation attributes accepted by the dataset contract. |

Core v2 must not mutate the caller's objects, arrays, nested styles, components, or
asset descriptors while validating, materializing, drawing, or updating a scene.

### `attrs` contract

`attrs` is an arbitrary string-keyed record and is preserved losslessly in current
state, updates, queries, snapshots, and export. This allows host metadata such as
`display` and nested `metadata` to coexist with visual fields. Core v2 interprets the
following production/render fields and preserves all others without assigning them to
private renderer objects:

| Field | Observable meaning |
| --- | --- |
| `x`, `y` | finite local position in world units |
| `angle` | finite local rotation in degrees |
| `rotation` | finite local rotation in radians; when authored, updates retain this unit |
| `scale`, `skew`, `pivot` | finite scalar or `{x,y}` local transform values supported by the dataset |
| `alpha` | finite opacity intent; normal authored range is `0–1` |
| `zIndex` | finite stacking value; equal values preserve sibling order |

`show` remains the semantic visibility field and `locked` remains the semantic editing
lock. Host metadata must not change rendering unless a host update deliberately maps it
to a visual field. A record or transaction containing both `angle` and `rotation`
fails atomically; neither field silently wins.

## Elements

### Group

A group owns an ordered `children` array and applies its transform, visibility, and
interaction lock to the descendant hierarchy. Empty groups remain valid hierarchy
nodes but contribute no visible geometry.

### Grid

A grid materializes an item template over a two-dimensional `cells` matrix.

- `0` is inactive.
- `1` creates an active cell with generated identity.
- a string creates an active cell at structural ID `<grid-id>.<row>.<column>` and uses
  the string as its public label.
- `inactiveCellStrategy` chooses whether a newly inactive cell is removed or retained
  as hidden state.
- `gap` accepts one number or `{ x, y }`.
- `item.size` is required.
- `item.components`, `item.padding`, and `item.contentOrientation` apply to every cell.

### Item

An item is a sized visual container with ordered components. `size` is required.
`padding` reduces the content box used by percentage-sized and placed components.
`contentOrientation` controls whether inner content follows the item or stays readable
relative to the screen.

### Relations

A relations element renders ordered source/target links between addressable elements.
Each link contains `source` and `target` string identities. `style` accepts the exact
stroke fields in the shared style table below. An omitted relation
style resolves to a black stroke with PixiJS v8 public defaults: width `1`, cap `butt`,
join `miter`, miter limit `10`, alignment `0.5`, and `pixelLine=false`. Link geometry
follows endpoint movement, hierarchy transforms, viewport orientation, redraw, and
history.

### Image

A standalone image accepts an asset alias, URL, data URI, or inline asset descriptor.
Optional size controls the rendered dimensions while transform attributes control its
world pose.

### Text

A standalone text element accepts text content, text style, optional size, and world
transform attributes. Its supported layout includes wrapping, line height, letter
spacing, rotation, visibility, and deterministic bounds.

### Rect

A standalone rectangle requires size and accepts fill, stroke, uniform or per-corner
radius, visibility, and world transform attributes.

## Item Components

Components preserve their array order inside the item content box.

### Background

A background accepts a rectangular texture style or image-like asset source. It may be
tinted and fills the parent item visual background.

### Bar

A bar requires a rectangular texture source and size. Width and height accept pixels,
percentages, or mixed units. Placement, margin, tint, animation enablement, and animation
duration control its visible state. Size changes interpolate when animation is enabled
and apply immediately when disabled or duration is zero.

### Icon

An icon requires an asset source and size. It supports placement, margin, tint,
visibility, percentage sizing, and readable orientation.

### Text label

A text label supports content, placement, margin, tint, styling, split layout, automatic
font sizing, wrapping width, and visible/hidden/ellipsis overflow behavior.

## Observable Defaults

Defaults are part of semantic visual compatibility:

| Scope | Default |
| --- | --- |
| element visibility / lock | `show=true`, `locked=false` |
| group | authored child order; empty children allowed |
| grid | `gap=0`, inactive cells removed, item padding `0`, `contentOrientation=upright` |
| item | components `[]`, padding `0`, `contentOrientation=upright` |
| relation | black stroke; width `1`, cap `butt`, join `miter`, miter limit `10`, alignment `0.5`, `pixelLine=false` |
| standalone text | empty text, Fira Code, weight `400`, size `16`, black fill |
| rect | radius `0`; fill/stroke only when authored |
| background | fills 100% of the item, white tint, ignores item content padding |
| bar | bottom placement, margin `0`, white tint, animation enabled, duration `200ms` |
| icon | center placement, margin `0`, white tint |
| item text | empty text, center placement, margin `0`, visible overflow, split `0` |

The default application background is `#FAFAFA`. Default theme paths resolve exactly:

| Theme path | RGBA intent |
| --- | --- |
| `primary.default` | `#0C73BFFF` |
| `primary.dark` | `#083967FF` |
| `primary.accent` | `#EF4444FF` |
| `gray.light` | `#9EB3C3FF` |
| `gray.default` | `#D9D9D9FF` |
| `gray.dark` | `#71717AFF` |
| `white` | `#FFFFFFFF` |
| `black` | `#1A1A1AFF` |

A partial custom theme overrides only supplied keys and remains instance-local.

Theme references and direct supported color inputs normalize to the same RGBA color
intent before semantic comparison. A string matching a theme dot-path resolves through
the active instance theme; another valid color string is interpreted directly. An
unknown theme path that is not itself a valid color is rejected with its dataset path.

## Shared Value Shapes

- Fixed size: one number or `{ width, height }` numbers.
- Pixel/percentage size: one number, a percentage string, `{ value, unit }`, a strict
  supported `calc()` expression, or `{ width, height }` using those values. Percentage
  and `calc()` resolve against the current item content box.
- Placement: `left`, `left-top`, `left-bottom`, `top`, `right`, `right-top`,
  `right-bottom`, `bottom`, `center`, or historically accepted `none`. `none` is
  preserved and its exact normalized geometry is fixture-owned; it is not remapped to
  another named anchor.
- Margin/padding: one number, `{ x, y }`, or `{ top, right, bottom, left }`; explicit
  edge values override values expanded from an axis. Finite negative values are valid
  and produce intentional inset/outset layout.
- Radius: one number or per-corner values.
- Color: theme key or a PixiJS-compatible color source.
- Asset descriptor: required `src` plus optional loader `data`, `format`, and parser hint.

### Executable value grammar

| Value | Accepted shape and validation |
| --- | --- |
| fixed `size` | nonnegative finite number, or complete `{width,height}` with both nonnegative finite numbers |
| component pixel/percent | nonnegative finite number; nonnegative decimal percentage such as `75%`; strict `{value, unit: 'px' | '%'}` with nonnegative value |
| component `calc()` | `calc(<term> ( <operator> <term>)*)`; term is a signed decimal plus `px` or `%`; binary `+`/`-` operators are surrounded by whitespace, e.g. `calc(100% - 20px)` |
| grid `gap` | finite nonnegative scalar or optional nonnegative `x`/`y`, missing axes default `0` |
| margin/padding | any finite scalar/axis/edge values, including negatives; missing entries default `0` |
| radius | nonnegative scalar or nonnegative `topLeft`, `topRight`, `bottomRight`, `bottomLeft` |
| animation | boolean, plus finite nonnegative duration in milliseconds; default `true` and `200` |
| text split | integer; `0` means no split, positive `n` inserts a line break after each `n` Unicode grapheme clusters, and historically accepted negative values use canonical fixture output without looping |

### Source and style shapes

- A reusable image source is an alias/URL/data URI string.
- An inline asset descriptor is strict: `{src: string, data?: object, format?: string,
  parser?: string, loadParser?: string}`. It does not accept a caller alias field.
- A rectangular texture source is `{type?: 'rect', fill?, borderWidth?, borderColor?,
  radius?}`. An omitted type means `rect`. Fill defaults transparent, border width `0`,
  border color black, and radius `0`; border width and radius are nonnegative.
- A background may carry `size` for compatibility. It is preserved in state/export but
  remains inert: the visible background still fills the full item frame.
- A stroke style accepts exactly the keys in the table below. Color defaults to theme
  `black`; the remaining omitted values use the relation defaults above.
- Base text style accepts exactly the shared keys in the text table below. Item text
  additionally accepts `fontSize` as number/`auto`/string, positive
  `autoFont.min/max`, numeric/`auto` wrap width, and `visible`/`hidden`/`ellipsis`
  overflow. Standalone text keeps numeric `fontSize` and accepts the shared word-wrap,
  line-height, and letter-spacing keys.

### Accepted stroke style keys

| Key | Accepted value |
| --- | --- |
| `color` | supported color source or theme path |
| `alpha` | finite number from `0` through `1` |
| `width` | finite nonnegative number |
| `cap` | `butt`, `round`, or `square` |
| `join` | `miter`, `round`, or `bevel` |
| `miterLimit` | finite nonnegative number |
| `alignment` | finite number from `0` through `1` |
| `pixelLine` | boolean |
| `textureSpace` | `local` or `global` |
| `fill` | public PixiJS fill gradient or pattern value |
| `texture` | public PixiJS texture value |
| `matrix` | public PixiJS matrix value |

`fill`, `texture`, and `matrix` are in-memory dataset values distinct from ColorSource.
Only their documented JSON descriptor forms export directly; runtime PixiJS texture,
matrix, gradient, pattern, and filter objects that lack an approved descriptor fail
with `NON_SERIALIZABLE_VALUE`. Declared nested color fields still canonicalize to
`#rrggbbaa`. Unknown stroke keys are rejected so accepted geometry cannot vary silently
with a dependency upgrade.

### Accepted text style keys

| Key | Accepted value |
| --- | --- |
| `fontFamily` | font-family string or ordered string fallback array |
| `fontSize` | standalone: finite nonnegative number; item label: finite nonnegative number, `auto`, or supported CSS size string |
| `fontWeight` | `normal`, `bold`, `bolder`, `lighter`, or weight `100`–`900` as number/string |
| `fontStyle` | `normal`, `italic`, or `oblique` |
| `fontVariant` | `normal` or `small-caps` |
| `fill` | supported color/fill source or theme path |
| `stroke` | accepted stroke style or supported stroke color input |
| `dropShadow` | boolean or `{color?, alpha?, angle?, blur?, distance?}` with supported color and finite numeric fields |
| `align` | `left`, `center`, `right`, or `justify` |
| `textBaseline` | `alphabetic`, `top`, `hanging`, `middle`, `ideographic`, or `bottom` |
| `wordWrap`, `breakWords`, `trim` | boolean |
| `wordWrapWidth` | standalone: finite nonnegative number; item label: finite nonnegative number or `auto` |
| `whiteSpace` | `normal`, `pre`, or `pre-line` |
| `lineHeight`, `leading`, `letterSpacing`, `padding` | finite number; padding is nonnegative |
| `tagStyles` | string-keyed recursive record of accepted text style keys |
| `filters` | array of public PixiJS filter values used while baking the text texture |

Item-label-only `autoFont` accepts a strict `{min?, max?}` object with positive finite
values and `min <= max`; `overflow` accepts only `visible`, `hidden`, or `ellipsis`.
Unknown text style keys are rejected. Platform font rasterization may differ, but these
inputs, line layout, bounds, overflow result, and color intent remain normative.

### Color and theme resolution

Color accepts a PixiJS v8 public `ColorSource`: CSS/color string, number, numeric
array/typed array, RGB/RGBA, HSL/HSLA, HSV/HSVA, or PixiJS color object while in
memory. A string that matches an instance theme dot-path resolves through that theme;
another valid color string is used directly. Semantic comparison uses normalized
8-bit RGBA. Each channel clamps through the PixiJS public conversion; alpha becomes
`round(clamp(alpha, 0, 1) * 255)`. Non-finite/invalid input rejects atomically.
Canonical JSON export always uses lowercase `#rrggbbaa` without mutating the caller's
value or preserving its spelling. Conversion applies only to declared color-bearing
fields (theme, fill, stroke, tint, border, shadow, and nested approved text/tag style),
never arbitrary `attrs`. Texture, filter, gradient, pattern, and matrix objects remain
separate runtime values and must satisfy their own serialization policy.

## Validation Outcome

Invalid input is rejected before a partial scene becomes authoritative. Diagnostics must
identify the failing dataset path and violated requirement. Unknown keys, missing
required fields, unsupported discriminators, invalid partial sizes, and invalid asset
descriptors are independently testable failures. A relation whose endpoint cannot be
resolved omits only that segment while the rest of the scene remains usable; the host
may apply stricter domain validation before submission.

The exact error class and wording may differ from Original, but a host application must
be able to distinguish invalid input from asset failure, missing runtime target, and a
destroyed lifecycle.

## Closed Compatibility Decisions

Element IDs are scene-global; component IDs are owner-local; grid-cell identities are
deterministic composites. Hidden components remain logical/queryable without a render
object. Hidden grid cells keep endpoint geometry/identity while relations using them
are hidden and later restored. Self-relations are allowed; duplicate ordered endpoint
pairs are deduplicated by first authored order while reverse direction remains distinct.
All historically runtime-accepted legacy roots are normalized by the compatibility
ingestion boundary. The decision registry records the corresponding evidence still
required before implementation promotion.

Generated identity is guaranteed for the current materialized scene and is made
explicit by canonical export. Persisted cross-redraw addressing otherwise requires an
authored stable ID.
