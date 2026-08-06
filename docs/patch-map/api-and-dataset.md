# API and dataset boundary

Import the intentional public surface from:

```ts
import { PatchMap } from '@conalog/patch-map';
```

The normal lifecycle is intentionally short:

1. await `PatchMap.mount({ container, data })`;
2. use `update()`, `transaction()`, the columnar `updateBatch()`, and the
   `data`, `targets`, `pointer`, `selection`, `viewport`, `history`, `assets`, and `debug`
   domains;
3. await `destroy()` when the host unmounts.

```ts
const patchMap = await PatchMap.mount({
  container: '#map',
  data,
  theme: {
    primary: { default: '#0c73bf', dark: '#063559' },
    gray: { light: '#9eb3c3' },
  },
  fit: { padding: 24 },
});

patchMap.update({
  id: 'rack-01',
  bar: { height: 72 },
});

await patchMap.destroy();
```

`theme` is a partial, instance-local override. It accepts nested keys as shown
above or equivalent dot-path keys such as `'primary.default'`. Every supplied
value is validated, detached, and normalized before renderer allocation; an
invalid entry rejects the mount atomically at its `$.theme...` path. Missing
keys fall back to the canonical palette, including `primary.default` =
`#0C73BFFF`, `primary.dark` = `#083967FF`, and `gray.light` = `#9EB3C3FF`.
The same active palette resolves authored rect fills, bar/icon/text tints, and
concrete bar/icon overlay tints after replacement or replay.

## Public naming map

The public names describe intent instead of the internal Engine operation that
implements it:

| Intent | Public API |
| --- | --- |
| Create and own a map | `PatchMap.mount({ container, data })` |
| Replace the whole dataset | `data.replace()` / `data.replaceAsync()` |
| Read a detached dataset copy | `data.snapshot()` |
| Address one known object/component | `targets.get({ id, componentId? })` |
| Reuse a semantic set | `targets.query(query)` |
| Observe package-owned hover | `pointer.onHover()` |
| Observe pointer-origin selection | `selection.onPointerChange()` |
| Apply a relative transform | `transform.moveBy()` / `resizeBy()` / `rotateBy()` |
| Apply a relative viewport change | `viewport.panBy()` / `zoomBy()` |
| Inspect loaded asset ownership | `assets.status()` |
| Capture the visible result | `capture.png()` |

`await capture.png()` is also the readiness barrier for image assets visible
in that exact publication. It waits currently active direct-image and component
image bindings, publishes their resolved textures through the owned frame loop,
and then reads the canvas. Hosts do not need an asset-status polling loop or a
sleep before capturing a just-replaced image or newly shown icon.

`PatchMap.mount()` registers the package-owned `object`, `inverter`, `combiner`,
`device`, `edge`, `loading`, `warning`, and `wifi` image aliases. The glyphs
have transparent backgrounds and white monochrome artwork so authored icon
tints and concrete `icon.changes.tint` overlays use the same texture. Registration
does not eagerly load all eight resources: the active authored or overlay
source owns the lease, and replacement or `destroy()` releases it.

`update()` remains the default mutation for one logical owner,
`updateBatch()` is the columnar high-volume form, and `transaction()` is the
ordered heterogeneous/structural atomic form. There are no parallel `load`,
`export`, `compile`, or low-level renderer strategy APIs on the shipping
surface.

`mount()` selects WebGL2 + Mesh by default, derives the host size, owns one
frame loop, observes later host resizes, publishes the first visible frame,
and cleans those resources in `destroy()`. Pass `resizeMode: 'manual'` only when
the surrounding layout system calls `patchMap.viewport.resize(width, height)`
itself.

The package-owned frame loop keeps cadence, logical animation time, large-scene
viewport-first publication, pause/resume, and RAF cancellation inside the
package-owned `PatchMap.mount()` lifecycle. Engine mutations and product-owned
pointer/view events invalidate that loop automatically. The host does not
create a second loop, duplicate bar thresholds, or mirror pointer bookkeeping.
`destroy()` cancels the owned loop before releasing the Pixi surface.

## Pointer projection and box selection

Keep hit testing, screen/world conversion, pointer capture, and gesture timing
inside PatchMap. A host selection or tooltip plugin receives detached stable
targets and coordinates through two disposer-based subscriptions:

```ts
const patchMap = await PatchMap.mount({
  container,
  data,
  selection: {
    box: { partialIntersection: true },
    allowMultiple: selectionPlugin.allowMultiple,
    isSelectable: ({ id, componentId }) =>
      selectionPlugin.isSelectable({ id, componentId }),
  },
});

const stopHover = patchMap.pointer.onHover((event) => {
  tooltipPlugin.project({
    type: event.type,
    target: event.target,
    anchor: event.anchor,
    world: event.world,
  });
});

const stopPointerSelection = patchMap.selection.onPointerChange((change) => {
  selectionPlugin.onSelectionChange(change.selected);
});
```

For a concrete grid component, the target is
`{ id: '<grid>.<row>.<column>', componentId: '<template-component-id>' }`.
Element hits omit `componentId`. Hover publications include the current CSS
pixel `anchor`, package-converted `world` point, `previousTarget`, pointer
identity, and modifiers. Same-target motion publishes `move`; exiting the
target publishes `leave` with `target: null`.

Box selection is disabled unless `selection.box` is enabled. Once a primary
drag passes the package threshold, it owns pointer capture and cancels the
competing primary pan before any viewport delta is applied. Middle-button pan
and wheel zoom remain viewport gestures. `allowMultiple: false` keeps the first
eligible target in deterministic paint/scene order; `true` keeps every
eligible target and permits shift-add/toggle behavior. A thrown `isSelectable`
callback aborts the entire pointer selection commit without changing selection
and reports a host-callback diagnostic.

`selection.onChange()` continues to observe every selection source as ID
strings. `selection.onPointerChange()` is the non-echo host-plugin surface: it
publishes only package pointer changes as stable `selected/added/removed`
targets. Call each disposer when a host plugin detaches; `destroy()` also
removes undisposed subscriptions and root listeners.

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
dirty ranges without creating per-cell display objects. Concrete bar
presentation supports `height` plus `changes.tint/source/show`; concrete icon
presentation supports `changes.show/source/tint`. Passing `null` for any one
of those fields restores only that field from the current authored template.
Loading another dataset or destroying the engine clears the overlay. See the
[migration guide](./migration.md#grid-template-values-versus-concrete-cell-values)
for the persistence and unsupported-state boundary.

Repeated semantic target sets can be queried once and reused without exposing
JSONPath or dense slots:

```ts
const cells = patchMap.targets.query({
  within: 'rack-grid',
  scope: 'instances',
});

patchMap.updateBatch({
  targets: cells,
  bar: {
    componentId: 'usage',
    height: heights,
    changes: {
      tint: barTints,
      source: barSources,
      show: barShows,
    },
  },
  icon: {
    componentId: 'status',
    changes: {
      show: iconShows,
      source: iconSources,
      tint: iconTints,
    },
  },
}, { animate: true });
```

Every column must have `cells.count` entries. Validation covers the complete
bar/icon request before publication, so a missing target, invalid source/color,
or unequal column rejects without applying the other component. Presentation
changes advance only the interaction revision and are not undoable authored
data.

Concrete text `show/text/style`, background presentation, and arbitrary
component fields remain structured unsupported. They throw a `TypeError` whose
`code` is `PATCH_MAP_GRID_INSTANCE_PRESENTATION_UNSUPPORTED`; adapters should
retain those host values instead of silently dropping them.

Target sets are revision-bound. Loading a replacement dataset makes an old
set fail with a direct instruction to query it again, preventing a
stale batch from reaching unrelated IDs.

`data.replace()` detaches caller data. It preserves stable element IDs,
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
command classes are not public identities. Use `targets.get()/query()` for
application addressing and `debug.snapshot()` for detached diagnostics.
Low-level lifecycle and publication probes are package-internal verification
seams and are not exported from `@conalog/patch-map`.
