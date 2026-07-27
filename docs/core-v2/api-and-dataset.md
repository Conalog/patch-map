# API and dataset boundary

Import the intentional public surface from:

```ts
import { CoreV2Engine } from '@conalog/patch-map/core-v2';
```

The normal lifecycle is:

1. construct `CoreV2Engine`, optionally injecting a shared
   `CoreV2AssetRuntime`;
2. await `initialize()` with a host, dimensions, and WebGL preference;
3. pass PATCH MAP v0.10 JSON to `loadDataset()`;
4. use public query, transaction, selection, transformer, viewport, event,
   history, snapshot, and extraction methods;
5. call `publishFrame()` at the host's explicit state-to-frame boundary;
6. await `destroy()` and dispose host subscriptions.

`loadDataset()` detaches caller data. It preserves stable element IDs,
component owner/ID identity, relation endpoints, and deterministic ordering
without retaining mutable aliases. Use `{ strict: true }` when dangling
relations must reject atomically. Compatibility mode omits a dangling
relation from rendering and reports it instead of silently changing its
endpoint.

The supported records are the PATCH MAP v0.10 `item`, `grid`, `relations`,
`group`, `rect`, `text`, `image`, `icon`, and component forms documented by
the package types. Unsupported records or values produce structured
diagnostics or an atomic error. Core v2 never claims successful loading after
dropping unsupported required data.

Display objects, Pixi renderer internals, dense slots, mutable live nodes, and
command classes are not public identities. Use `queryScene()`,
`semanticProbe()`, `geometryProbe()`, `aggregateRenderOwnerProbe()`, and
`snapshot()` for detached diagnostics.
