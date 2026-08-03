# API and dataset boundary

Import the intentional public surface from:

```ts
import { PatchMap } from '@conalog/patch-map';
```

The normal lifecycle is intentionally short:

1. await `PatchMap.mount({ target, data })`;
2. use the `data`, `targets`, `bars`, `texts`, `selection`, `viewport`,
   `history`, `assets`, and `debug` domains;
3. await `destroy()` when the host unmounts.

```ts
const patchMap = await PatchMap.mount({
  target: '#map',
  data,
  fit: { padding: 24 },
});

patchMap.bars.set({
  id: 'rack-01',
  componentId: 'usage',
  height: 72,
});

await patchMap.destroy();
```

`mount()` selects WebGL2 + Mesh by default, derives the host size, owns one
frame loop, observes later host resizes, publishes the first visible frame,
and cleans those resources in `destroy()`. Pass `resize: 'manual'` only when
the surrounding layout system calls `patchMap.viewport.resize(width, height)`
itself.

`PatchMapAdvanced` exposes the lower-level constructor, `initialize()`,
`createFrameLoop()`, and explicit publication methods for deterministic
verification and specialized hosts. They are advanced lifecycle seams, not
the default setup.

`createFrameLoop()` keeps cadence, logical animation time, large-scene
viewport-first publication, pause/resume, and RAF cancellation inside the
package. Engine mutations and product-owned pointer/view events invalidate
that loop automatically. The host does not duplicate bar thresholds or
pointer bookkeeping. `destroy()` cancels the owned loop before releasing the
Pixi surface; creating a second live loop for the same runtime is rejected.

The aggregate renderer and dense runtime are package internals. Consumers use
the same `PatchMap.mount()` lifecycle, scheduling, animation, viewport, and
cleanup policy as the single PatchMap Lab.

For a grid template bar, use `bars.set()` to change authored semantic state for
every expanded cell. Use `bars.setInstances()` or `bars.setInstanceBatch()`
when concrete cells need independent runtime values. A concrete cell target keeps the
template component ID and uses `<grid-id>.<row>.<column>` as `id`.
Instance batches are atomic, leave the caller dataset/history/semantic hash
unchanged, reuse the central animation scheduler, and update aggregate Mesh
dirty ranges without creating per-cell display objects. Passing `null` restores
the current authored template height; loading another dataset or destroying
the engine clears the overlay. See the
[migration guide](./migration.md#grid-template-values-versus-concrete-cell-values)
for the persistence and unsupported-state boundary.

Repeated semantic target sets can be compiled once without exposing JSONPath
or dense slots:

```ts
const usageBars = patchMap.targets.compile({
  within: 'rack-grid',
  componentId: 'usage',
  type: 'bar',
  scope: 'instances',
});

patchMap.bars.setInstanceBatch(usageBars, heights, { animate: true });
```

Compiled targets are revision-bound. Loading a replacement dataset makes an
old handle fail with a direct instruction to compile it again, preventing a
stale batch from reaching unrelated IDs.

`data.load()` detaches caller data. It preserves stable element IDs,
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
command classes are not public identities. Use `targets.get/compile()` for
application addressing and `debug.snapshot()` for detached diagnostics.
Specialized verification may import `PatchMapAdvanced` for deeper probes.
