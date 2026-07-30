# Host integration and ownership

The host owns layout, persistence, application commands, accessibility DOM,
and when a state revision becomes a visible frame. Core v2 owns normalized
scene state, aggregate Pixi rendering, hit testing, selection, transformation,
history, renderer resources, per-instance subscriptions, and reusable frame
cadence.

Use one `CoreV2Engine` per mounted map. A host slot must contain exactly one
active Core v2 canvas. Multiple engines may share one `CoreV2AssetRuntime`;
each engine keeps its own asset session and releases only its leases at
destroy. Do not call PixiJS global cache destruction from an instance.

Use `engine.createFrameLoop()` when the host wants visible animation and
gesture frames without implementing its own requestAnimationFrame scheduler.
The Engine owns that loop, schedules it from product changes, pauses it across
document visibility transitions, and destroys it before the Pixi surface.
Deterministic evidence runners may omit it and continue to call
`publishFrame(timeMs)` explicitly. Never run both a host RAF publisher and the
package loop for the same Engine.

The packaged `examples/core-v2/host-adapter.ts` demonstrates the intended
adapter boundary:

- `load()` first uses the explicit canonical/legacy compatibility
  materializer, then delegates the detached array to `loadDataset()`;
- `prepareSave()` validates a detached array, strict references by default,
  and returns serialized data only after the guard succeeds;
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

Canary and rollback selection also stays in the host. Core v2 exports an
instance-local migration authority for one engine choice per session,
read-only shadow-effect suppression, fixed promotion cohorts, and
next-remount rollback; it deliberately does not package a prior engine.

For extraction, publish the desired state, capture the exact
`publishedTuple`, and request `image/png` at the current CSS size. Core v2
keeps the authoritative canvas mounted and rejects stale tuples.
