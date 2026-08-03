# Host integration and ownership

The host owns layout, persistence, application commands, accessibility DOM,
and when a state revision becomes a visible frame. PatchMap owns normalized
scene state, aggregate Pixi rendering, hit testing, selection, transformation,
history, renderer resources, per-instance subscriptions, and reusable frame
cadence.

Use `PatchMap.mount({ target, data })` once per mounted map. A host slot must
contain exactly one active PatchMap canvas. Multiple engines may share one `PatchMapAssetRuntime`;
each engine keeps its own asset session and releases only its leases at
destroy. Do not call PixiJS global cache destruction from an instance.

An external URL must pass the package ingestion policy, including configured
origin, response, MIME, size, and byte validation, before the engine admits its
texture. An existing Pixi global-cache entry with the same URL is not evidence
that those checks ran and is never borrowed as a validation shortcut.

The `PatchMap.mount()` path creates the package frame loop for visible
animation and gesture frames, observes the host size, schedules product
changes, pauses across document visibility transitions, and destroys these
resources before the Pixi surface. Low-level deterministic publication is an
internal verification concern, not a second consumer lifecycle. Never add a
host RAF publisher alongside the package loop.

The packaged examples demonstrate the intended high-level boundary.
`examples/patch-map/host-adapter.ts` shows how a host can compose that same
boundary without acquiring a second engine API:

- `load()` first uses the explicit canonical/legacy compatibility
  materializer, then delegates the detached array to `data.load()`;
- `prepareSave()` validates a detached array, strict references by default,
  and returns serialized data only after the guard succeeds;
- `lookup()` delegates to `targets.get()`;
- `bulkUpdate()` delegates to `transaction()`;
- `selection()` and `transform()` delegate to their public domains;
- `history()` delegates to state/undo/redo;
- `observeSelection()` owns only the returned disposer;
- `snapshot()` and `extract()` use `debug.snapshot()` and `capture.png()`;
- `destroy()` disposes host subscriptions before engine teardown.

The adapter must not import previous-runtime symbols, copy renderer behavior, rebuild
geometry, mutate normalized output, or retain Pixi display objects. Event
callbacks and canvas ownership remain instance-local.

Canary and rollback selection also stays in the host. PatchMap exports an
instance-local migration authority for one engine choice per session,
read-only shadow-effect suppression, fixed promotion cohorts, and
next-remount rollback; it deliberately does not package a prior engine.

For extraction, publish the desired state, capture the exact
`publishedTuple`, and request `image/png` at the current CSS size. PatchMap
keeps the authoritative canvas mounted and rejects stale tuples.
