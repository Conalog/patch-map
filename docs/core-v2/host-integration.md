# Host integration and ownership

The host owns layout, persistence, application commands, accessibility DOM,
and when a state revision becomes a visible frame. Core v2 owns normalized
scene state, aggregate Pixi rendering, hit testing, selection, transformation,
history, renderer resources, and per-instance subscriptions.

Use one `CoreV2Engine` per mounted map. A host slot must contain exactly one
active Core v2 canvas. Multiple engines may share one `CoreV2AssetRuntime`;
each engine keeps its own asset session and releases only its leases at
destroy. Do not call PixiJS global cache destruction from an instance.

The packaged `examples/core-v2/host-adapter.ts` demonstrates the intended
adapter boundary:

- `load()` delegates to `loadDataset()`;
- `lookup()` delegates to `queryScene()`;
- `bulkUpdate()` delegates to the atomic dense transaction path;
- `selection()` and `transform()` delegate to engine authorities;
- `history()` delegates to inspect/undo/redo;
- `observeSelection()` owns only the returned disposer;
- `snapshot()` and `extract()` use public detached probes;
- `destroy()` disposes host subscriptions before engine teardown.

The adapter must not import Original symbols, copy renderer behavior, rebuild
geometry, mutate normalized output, or retain Pixi display objects. Event
callbacks and canvas ownership remain instance-local.

For extraction, publish the desired state, capture the exact
`publishedTuple`, and request `image/png` at the current CSS size. Core v2
keeps the authoritative canvas mounted and rejects stale tuples.
