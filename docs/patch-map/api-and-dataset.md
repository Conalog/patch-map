# API and dataset boundary

Import the intentional public surface from:

```ts
import { PatchMap } from '@conalog/patch-map';
```

The normal lifecycle is intentionally short:

1. await `PatchMap.mount({ target, data })`;
2. use `update()`, `transaction()`, the columnar `updateBatch()`, and the
   `data`, `targets`, `selection`, `viewport`, `history`, `assets`, and `debug`
   domains;
3. await `destroy()` when the host unmounts.

```ts
const patchMap = await PatchMap.mount({
  target: '#map',
  data,
  fit: { padding: 24 },
});

patchMap.update({
  id: 'rack-01',
  bar: { height: 72 },
});

await patchMap.destroy();
```

`mount()` selects WebGL2 + Mesh by default, derives the host size, owns one
frame loop, observes later host resizes, publishes the first visible frame,
and cleans those resources in `destroy()`. Pass `resize: 'manual'` only when
the surrounding layout system calls `patchMap.viewport.resize(width, height)`
itself.

The package-owned frame loop keeps cadence, logical animation time, large-scene
viewport-first publication, pause/resume, and RAF cancellation inside the
package-owned `PatchMap.mount()` lifecycle. Engine mutations and product-owned
pointer/view events invalidate that loop automatically. The host does not
create a second loop, duplicate bar thresholds, or mirror pointer bookkeeping.
`destroy()` cancels the owned loop before releasing the Pixi surface.

The aggregate renderer and dense runtime are package internals. Consumers use
the same `PatchMap.mount()` lifecycle, scheduling, animation, viewport, and
cleanup policy as the single PatchMap Lab.

For one owner, use `update()`. It may change element fields and its bar, text,
icon, or background components in one atomic commit. A component ID is optional
when the owner has exactly one component of that type; an ambiguous owner is
rejected with an instruction to set `componentId`.

Only mutation fields with a distinct optimized commit path receive a named
shortcut. `bar.height` selects the aggregate bar-height path; other bar fields
remain under `bar.changes`, for example
`{ size: { width: 80 }, source: { fill: '#22c55e' } }`. This keeps the public
surface from implying a performance distinction that does not exist.

`changes` is for non-structural fields such as `attrs`, `size`, visibility, and
component source/style data. Stable identity and identity-bearing collections
(`id`, `type`, `components`, `children`, grid `item`/`cells`, and relation
collections) cannot be rewritten through `update()`. Express those changes as
an explicit `transaction()` add/replace/remove/move/group/ungroup operation.

Use `transaction()` for ordered heterogeneous or structural work such as
updating one object, moving another, and publishing the resulting selection as
one history entry. Use `updateBatch()` only for equal-length columnar values on
many targets. Both are atomic; transaction expresses workflow semantics while
the batch expresses a high-volume data layout.

Updating an authored grid template bar changes every expanded cell. When
concrete cells need independent runtime values, pass concrete instance targets
to `update()` or `updateBatch()`. A concrete cell keeps the template component
ID and uses `<grid-id>.<row>.<column>` as `id`.
Instance batches are atomic, leave the caller dataset/history/semantic hash
unchanged, reuse the central animation scheduler, and update aggregate Mesh
dirty ranges without creating per-cell display objects. Passing `null` restores
the current authored template height; loading another dataset or destroying
the engine clears the overlay. See the
[migration guide](./migration.md#grid-template-values-versus-concrete-cell-values)
for the persistence and unsupported-state boundary.

Repeated semantic target sets can be queried once and reused without exposing
JSONPath or dense slots:

```ts
const usageBars = patchMap.targets.query({
  within: 'rack-grid',
  componentId: 'usage',
  type: 'bar',
  scope: 'instances',
});

patchMap.updateBatch({
  targets: usageBars,
  bar: { height: heights },
}, { animate: true });
```

Target sets are revision-bound. Loading a replacement dataset makes an old
set fail with a direct instruction to query it again, preventing a
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
Low-level lifecycle and publication probes are package-internal verification
seams and are not exported from `@conalog/patch-map`.
