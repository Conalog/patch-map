# Viewport targets

- Status: current
- Audience: consumers selecting or filtering camera targets
- Source: `src/public/contracts/viewport-transform.ts`, `src/viewport/index.ts`

## Contract

- `focus()` and `fit()` use the same target traversal. Omitted `targets` selects
  top-level managed elements, including images and excluding only top-level
  `relations`. Explicit targets retain the existing `{ id }`, address array,
  or scene-bound `targets.query()` result shape. Component addresses resolve
  to their owning element or grid instance.
- Groups contribute their managed descendants. A grid contributes one combined
  bound and is filtered once; its cells are not individually filtered unless
  explicitly targeted. Explicit relation IDs resolve to their linked endpoint
  elements before traversal; if no endpoints resolve, the relation's own bound
  is used. Relations encountered inside a group use their own bounds.
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

Target traversal is covered by `tests/semantic/viewport.test.ts`; public camera behavior and filter failures by `tests/engine/engine-viewport.test.ts`. Installed package consumers exercise focus and fit in a real browser. General camera state is owned by [Viewport and transform](viewport-and-transform.md).
