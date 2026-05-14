# Draw, Update, Selector

## `draw(data)`

Required behavior:

- Accepts current map data schema.
- Converts legacy data when needed.
- Validates schema unless reusing already processed data.
- Clears previous managed scene when new data differs.
- Reuses the current scene when drawing identical data and all existing world
  children are managed patch-map children.
- Clears undo/redo history.
- Reverts animation context for the previous scene.
- Removes registered canvas events.
- Creates scene indexes used by selector fast paths.
- Schedules a relations refresh after initial draw.
- Warms find/hit-test bounds cache.
- Emits `patchmap:draw` asynchronously after the scene is visible.
- Returns validated/processed data.

## `update(options)`

Supported options:

- `path?: string`
- `elements?: object | object[]`
- `changes?: object`
- `history?: boolean | string`
- `relativeTransform?: boolean`
- `rotateOrigin?: 'center'`
- `mergeStrategy?: 'merge' | 'replace'`
- `refresh?: boolean`
- `validateSchema?: boolean`
- `normalize?: boolean`
- `emit?: boolean`

Required behavior:

- Updates direct `elements`, selector `path` results, or both.
- Returns the updated element list.
- Emits `patchmap:updated` unless `emit === false`.
- `history: true` records undo/redo history with a generated id.
- `history: string` merges updates with the same history id.
- `relativeTransform` adds numeric `attrs.x`, `attrs.y`, `attrs.rotation`, and
  `attrs.angle` to current values.
- `rotateOrigin: 'center'` preserves the visible center when applying angle or
  rotation changes.
- `mergeStrategy: 'merge'` deep-merges objects.
- `mergeStrategy: 'replace'` replaces top-level changed properties.
- `refresh: true` reruns property handlers even if values are unchanged.
- `validateSchema: false` supports fast patch-service update paths.

## Patch-service Panel Update Fast Path

The rewrite must preserve behavior for item component updates shaped like:

```js
{
  components: [
    { type: 'bar', ... },
    { type: 'icon', show: false },
    { type: 'text', show: false },
  ]
}
```

and for bar-only final states where icon/text are absent or hidden.

Required behavior:

- Bar state updates may be rendered by an aggregate renderer.
- The logical component object must keep updated `props`.
- `bar.renderable` may be false while an aggregate renderer draws it.
- Showing icon or text must restore normal component rendering.
- Background + bar updates must keep aggregate bars when final state only shows
  the bar.
- Alpha changes on items must propagate to aggregate bars.

## `selector(path, options)`

Required behavior:

- Root `$` points to patch-map `world`.
- JSONPath-style traversal works for `children`.
- Exact id paths return stable results.
- Exact type/display paths use scene indexes where possible.
- Selector result objects expose stable official fields:
  - `type`
  - `id`
  - `label`
  - `props`
  - `children`
  - transform/display fields used by public callbacks

Official selector compatibility includes existing patch-service paths:

- `$..children[?(@.display=="panelGroup")].children`
- `$..children[?(@.display=="inverter")]`
- `$..children[?(@.type==="relations")]`
- `$..[?(@.id=="...")]`

