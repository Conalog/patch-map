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
   `engine.createFrameLoop()` when the host wants managed visible animation,
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

For low-level aggregate-only consumers, `createPatchMapRuntime()` remains automatic by
default. Passing `{ autoRender: false }` and then calling
`core.createFrameLoop()` selects the same reusable manual-loop policy used by
the Engine and both PatchMap Labs.

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
