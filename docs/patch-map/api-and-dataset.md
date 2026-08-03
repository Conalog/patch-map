# API and dataset boundary

Import the intentional public surface from:

```ts
import { PatchMap } from '@conalog/patch-map';
```

The normal lifecycle is:

1. construct `PatchMap`, optionally injecting a shared
   `PatchMapAssetRuntime`;
2. await `initialize()` with a host, dimensions, and WebGL preference;
3. pass PATCH MAP v0.10 JSON to `loadDataset()`;
4. create one package-owned `PatchMapFrameLoop` with
   `patchMap.createFrameLoop()` when the host wants managed visible animation,
   or call `publishFrame()` at an explicit deterministic boundary;
5. use public query, transaction, selection, transformer, viewport, event,
   history, snapshot, and extraction methods;
6. await `destroy()` and dispose host subscriptions.

`createFrameLoop()` keeps cadence, logical animation time, large-scene
viewport-first publication, pause/resume, and RAF cancellation inside the
package. Engine mutations and product-owned pointer/view events invalidate
that loop automatically. The host does not duplicate bar thresholds or
pointer bookkeeping. `destroy()` cancels the owned loop before releasing the
Pixi surface; creating a second live loop for the same runtime is rejected.

The aggregate renderer and dense runtime are package internals. Consumers use
`PatchMap` and `patchMap.createFrameLoop()` so the same lifecycle, scheduling,
animation, viewport, and cleanup policy is shared by every service and the
single PatchMap Lab.

For a grid template bar, use `updateBarHeights()` to change authored semantic
state for every expanded cell. Use `updateInstanceBarHeights()` when concrete
cells need independent runtime values. A concrete cell target keeps the
template component ID and uses `<grid-id>.<row>.<column>` as `id`.
Instance batches are atomic, leave the caller dataset/history/semantic hash
unchanged, reuse the central animation scheduler, and update aggregate Mesh
dirty ranges without creating per-cell display objects. Passing `null` restores
the current authored template height; loading another dataset or destroying
the engine clears the overlay. See the
[migration guide](./migration.md#grid-template-values-versus-concrete-cell-values)
for the persistence and unsupported-state boundary.

`loadDataset()` detaches caller data. It preserves stable element IDs,
component owner/ID identity, relation endpoints, and deterministic ordering
without retaining mutable aliases. Use `{ strict: true }` when dangling
relations must reject atomically. Compatibility mode omits a dangling
relation from rendering and reports it instead of silently changing its
endpoint.

The supported records are the PATCH MAP v0.10 `item`, `grid`, `relations`,
`group`, `rect`, `text`, `image`, `icon`, and component forms documented by
the package types. Unsupported records or values produce structured
diagnostics or an atomic error. PatchMap never claims successful loading after
dropping unsupported required data.

Display objects, Pixi renderer internals, dense slots, mutable live nodes, and
command classes are not public identities. Use `queryScene()`,
`semanticProbe()`, `geometryProbe()`, `aggregateRenderOwnerProbe()`, and
`snapshot()` for detached diagnostics.
