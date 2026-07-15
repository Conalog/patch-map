# Spike A: dense typed store + aggregate Canvas2D

This deliberately incompatible spike owns one dense slot per entity. Geometry, color, flags, generation, and animation state live in typed columns; only IDs remain as strings in one array and one ID-to-slot map. It has no entity objects after `load()`, display-object tree, entity listener, closure, or ticker.

Contract boundaries:

- `load(entities)` validates into temporary columns and swaps authoritative state atomically.
- `updateBatch(columns)` is the validated ID path; `resolve(ids)` plus `updateResolved(refs, columns)` is the generation-checked trusted path.
- State changes are synchronous; `flush()` alone publishes a canvas frame and reports the slot dirty range.
- `animateBatch()` schedules columnar animation and `stepAnimation(time)` advances all active slots in one loop.
- `snapshot()`, `query()`, and `hitTest()` return immutable copies/light references, never live render nodes.
- `destroy()` releases maps, strings, typed arrays, animation state, and canvas/context references and is idempotent.

Rendering rebuilds a typed draw-order buffer only after color changes, then submits one Canvas path per shared color. Geometry-only animation reuses the order and cached CSS colors.

Run the 4× Chromium proxy checkpoint with:

```sh
node performance/core-v1/spikes/typed-canvas/run.mjs --quick
```
