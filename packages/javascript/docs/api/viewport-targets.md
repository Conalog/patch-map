# Viewport targets

- Status: current
- Audience: consumers selecting or filtering camera targets
- Source: `src/public/contracts/viewport-transform.ts`, `src/viewport/index.ts`, `src/viewport/bounds-index.ts`

## Contract

- `focus()` and `fit()` use the same target traversal. Omitted `targets` selects
  top-level managed elements, including images and excluding only top-level
  `relations`. Explicit targets retain the existing `{ id }`, address array,
  or scene-bound `targets.query()` result shape. Component addresses resolve
  to their owning element or grid instance.
- Groups with children contribute their managed descendants; an empty group
  contributes its own world origin. A grid contributes one combined
  bound and is filtered once; its cells are not individually filtered unless
  explicitly targeted. Explicit relation IDs resolve to their linked endpoint
  elements before traversal; if no endpoints resolve, the relation's own bound
  is used. Relations encountered inside a group use their own bounds. A relation
  with no rendered paths contributes its own world origin.
- Item and expanded-instance bounds include actual component extents, including
  overflow outside the authored item size. Container bounds are measured in
  that item's or grid's local frame before transforming the rectangle's four
  corners to world coordinates; rotated sparse grids retain their full local
  frame. Empty item containers contribute a zero-size bound at their origin.
  Grids without visual components combine the world origins of retained cells.
  If no cells remain, the grid contributes a zero-size bound at its own world origin.
- Ordinary bounds use visual rectangles rather than authored item-size markers.
  Rect and background borders, and relation strokes, include their outsets,
  including miter corners on self-links.
  Rects with a zero width or height have no drawn rectangle and use their origin.
  When every child is empty, their world-origin bounds are combined directly;
  empty children do not enlarge a container with a nonempty visual rectangle.
  Collapsed transforms keep finite remaining extents.
- Image geometry stays live before texture readiness and updates when intrinsic
  dimensions resolve, following [Assets and capture](assets-and-capture.md).
  Text continues to use its authoritative semantic layout rectangle, including
  empty lines, following [Text](text.md); bounds do not depend on glyph or texture
  materialization timing.
- `filter(target)` receives a frozen semantic match (`id`, `kind`, `type`,
  `label`, `value`), without renderer objects. `value` contains the read-only
  normalized element data; expanded instances have type `grid-cell` and expose
  their grid ID, row, column and cell value. Truthy includes the target; falsy
  excludes it. Rejecting a group prunes its whole subtree. Filters run during
  traversal, including after explicit relation endpoint resolution, and are
  evaluated again on each call. They must be synchronous.
- Hidden managed elements retain their bounds; `show: false` does
  not implicitly filter a target. To omit them, use `filter: ({ value }) => value.show`.
  Duplicate leaf contributors are deduplicated. Empty/fully filtered targets return `status: 'empty'` without
  moving the camera. Unknown IDs are reported in `missing`; rejected targets
  are reported in `excluded`. Results include `contributors`, `worldBounds`,
  the accepted viewport, and `changed`.
- Fit padding remains a number or `[x, y]` in CSS pixels, with a default of 16
  per side. Mount-time automatic fit defaults to 24; explicit mount fit options
  use the normal 16 default. Fit retains rotation and respects zoom limits.

```ts
patchmap.viewport.focus({ targets: { id: 'rack' } });
patchmap.viewport.fit({
  padding: [24, 16],
  filter: ({ id }) => id !== 'background-image',
});
```

## Failure semantics

A non-function filter or a throwing filter rejects before any camera change.
Unknown viewport IDs are reported in `missing`; surviving targets still apply.

## Verification

Target traversal is covered by `tests/semantic/viewport.test.ts`; public camera behavior and filter failures by `tests/engine/engine-viewport.test.ts`. The all-type matrix in `tests/engine/viewport-bounds-matrix.test.ts` covers empty and stroked containers, zero-size visuals, nested reflection/rotation, screen/world cache order, target forms, filters and deduplication. Parser-to-geometry and incremental regressions are covered by `tests/engine/viewport-logical-bounds.test.ts`. Installed package consumers exercise focus and fit in a real browser. General camera state is owned by [Viewport and transform](viewport-and-transform.md).
