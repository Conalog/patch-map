# Performance Core v1 API

Core v1 is a new, deliberately incompatible product. Its public contract is a
flat scene database with explicit state and frame boundaries; it does not expose
PixiJS display objects or emulate the PATCH MAP v0.10 facade.

## Scene document

`SceneDocument` is immutable caller input with a version, optional viewport, and
an array of flat entities. Each entity has a stable string `id`, a render `kind`,
geometry, visibility, z-order, and kind-specific paint data. Positions and
dimensions use world units; all public rotation values use degrees. Core v1 supports
rectangles, text, images, progress bars, and relations. Relations reference
entity IDs; nested production data is flattened by an adapter outside the core.

Input objects and arrays are never retained or mutated. `load()` validates and
copies the complete document into the authoritative store atomically. Duplicate
IDs, invalid numbers, invalid references, and unsupported kinds reject the whole
load without changing the current scene.

## Construction and lifecycle

```ts
const renderer = new Canvas2DRenderer(canvas, renderOptions);
const scene = createCoreScene({ renderer, initialCapacity });

scene.load(document);        // synchronous authoritative state
scene.commit(batch);         // synchronous authoritative state
scene.advance(timeMs);       // deterministic animation state
const frame = scene.flush(); // publishes one render frame
scene.destroy();
```

Construction does not start a ticker or attach an object-level listener. The
host owns scheduling and calls `advance()` and `flush()` explicitly. A scene
owns the renderer passed to it. `destroy()` is idempotent, destroys and releases
that renderer plus store/index references, and makes every other operation fail
with `CoreDestroyedError`.

## Atomic batch updates

`commit()` accepts an immutable `TransactionBatch` containing ordered add,
patch, remove, visibility, animation, view, and selection operations. It first
validates and resolves every target, then applies all operations or none. A
failed batch changes no entity, generation, index, dirty range, selection,
event, history record, or render state.

The successful result contains a monotonically increasing revision, affected
entity counts, changed slot ranges, and one immutable batch event. Repeated
targets are applied in input order. An optional batch ID groups undo history;
`undo()` and `redo()` are themselves atomic commits. History is bounded and may
be disabled at construction. Animation scheduling is intentionally non-history:
mixed batches record their state operations, while animated properties continue
on their explicit timeline and are not replayed by undo or redo.

`commit()` never renders. `flush()` consumes the accumulated dirty state,
publishes exactly one frame, and returns its revision, frame sequence, command
count, upload/change ranges, and CPU timing. Calling `flush()` with no changes is
valid and reports a no-op frame without rebuilding scene data.

## Read and input APIs

- `ref(id)` returns an `EntityRef` containing a dense slot and generation.
- `get(refOrId)` returns an immutable `EntitySnapshot`, never a live render node.
- `query(filter)` supports explicit kind, visibility, tag, bounds, and ID-set
  filters and returns refs in deterministic z-order/slot order.
- `hitTest(point, options)` returns the topmost matching ref using the current
  authoritative geometry and index. Geometry commits mark spatial membership
  dirty; the next hit test refreshes only affected slots and adjacent relations
  synchronously before resolving the target.
- `selection()` returns an immutable selection snapshot; selection changes are
  batch operations.
- `snapshot(options)` returns a revisioned, deterministic scene snapshot for
  diagnostics and persistence.

Stale generation refs never resolve to a reused slot. IDs remain unique among
live entities. Query, hit-test, and selection do not allocate per-entity
listeners, closures, or PixiJS containers.

## Animation and events

Animations are data records keyed by entity and property. `advance(timeMs)` uses
the supplied monotonic time, never wall-clock time, and marks only changed
ranges. The same scene, batches, and time sequence produce the same state and
frame commands.

Core v1 exposes a bounded batch-event queue through `drainEvents()` rather than
entity emitters. Records are immutable and emitted only after successful
`load()`, `commit()`, `advance()`, or `flush()` boundaries. Pointer input is
provided as explicit `dispatchPointer(record)` calls; hit-testing and selection
results are returned synchronously and any state change is represented by a
normal atomic batch.

## Renderer boundary

The renderer consumes dense store views and dirty ranges. It may batch commands,
reuse paint/geometry/text resources, and upload only changed ranges, but it must
not change authoritative state or public ordering. The production backend is
selected by measured spike results. Backend-specific handles are private and
are absent from package exports.

`Canvas2DRenderer.registerImage(source, image)` and `unregisterImage(source)`
manage caller-decoded `CanvasImageSource` values without putting network or
decode work in the render path. Registered image pixels are drawn unchanged;
the entity `tint` is the diagnostic placeholder color used only while no image
is registered. A fully transparent placeholder tint falls back to the renderer's
visible missing-image color so absent assets remain observable in QA.
