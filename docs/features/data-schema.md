# Data Schema

The clean-room rewrite must accept the same public map data shape and update
shape.

## Top-level Data

`draw(data)` accepts an array of elements.

Supported top-level element types:

- `group`
- `grid`
- `item`
- `relations`
- `image`
- `text`
- `rect`

Every element supports:

- `type`
- `id`, default generated id
- `label`
- `show`, default `true`
- `locked`, default `false`
- `attrs`, arbitrary object applied to transform and custom searchable fields

Duplicate ids are invalid after schema validation.

## Element Types

### `group`

Fields:

- `children: Element[]`

Behavior:

- Groups child elements and applies group transform/visibility.
- Selector paths traverse through `children`.

### `grid`

Fields:

- `cells: (0 | 1 | string)[][]`
- `inactiveCellStrategy: 'destroy' | 'hide'`, default `destroy`
- `gap: number | { x?: number, y?: number }`
- `item.size`
- `item.padding`
- `item.components`
- `item.contentOrientation: 'follow-item' | 'upright'`, default `upright`

Behavior:

- Creates addressable item cells for active cells.
- Generated cell ids follow the existing `<grid-id>.<row>.<column>` pattern.
- String cell values are accepted by the schema and must remain searchable.

### `item`

Fields:

- `size`
- `padding`
- `components`
- `contentOrientation: 'follow-item' | 'upright'`, default `upright`

Behavior:

- Renders a component stack inside the item bounds.
- Item components are addressable by type/id/label where supported.

### `relations`

Fields:

- `links: { source: string, target: string }[]`
- `style`

Behavior:

- Draws links between elements by id.
- Refreshing relations recalculates link endpoints.
- Relations are excluded from default `focus()` and `fit()` target sets.

### `image`

Fields:

- `source: string`
- `size?`

### `text`

Fields:

- `text`, default empty string
- `style`
- `size?`

### `rect`

Fields:

- `size`
- `fill`
- `stroke`
- `radius`

## Components

Supported item component types:

- `background`
- `bar`
- `icon`
- `text`

All components support:

- `type`
- `id`
- `label`
- `show`, default `true`
- `attrs`

### `background`

Fields:

- `source: TextureStyle | string`
- `size`, normalized to 100% item size
- `tint`

### `bar`

Fields:

- `source: TextureStyle`
- `size`
- `placement`, default `bottom`
- `margin`, default `0`
- `tint`
- `animation`, default `true`
- `animationDuration`, default `200`

### `icon`

Fields:

- `source: string`
- `size`
- `placement`, default `center`
- `margin`, default `0`
- `tint`

### `text`

Fields:

- `text`, default empty string
- `placement`, default `center`
- `margin`, default `0`
- `tint`
- `style`
- `split`, default `0`

## Primitive Normalization

The rewrite must preserve:

- `Size`: number or `{ width, height }`
- `PxOrPercent`: number, percentage string, or `{ value, unit }`
- `PxOrPercentSize`: number/string or `{ width, height }`
- `Margin`: number, `{ x, y }`, `{ top, right, bottom, left }`, or mixed axis
  and edge keys
- `Gap`: number or `{ x, y }`
- `Placement`: `left`, `left-top`, `left-bottom`, `top`, `right`,
  `right-top`, `right-bottom`, `bottom`, `center`, `none`
- Rect texture style: `{ type: 'rect', fill, borderWidth, borderColor, radius }`
- Theme token colors such as `primary.default` and direct CSS/hex colors

Spacing normalization applies in both `draw(data)` and `update({ changes })`.

