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
  pointer: { hoverDuringPress: true },
  selection: {
    box: {
      activationModifier: 'shift',
      partialIntersection: true,
      visual: {
        color: '#1099ff',
        strokeWidth: 1,
        fillAlpha: 0.08,
      },
    },
    allowMultiple: selectionPlugin.allowMultiple,
    clearOnBlankClick: 'double',
    deselectOnTargetDoubleClick: true,
    isSelectable: ({ id, componentId }) =>
      selectionPlugin.isSelectable({ id, componentId }),
    visual: {
      color: '#ef4444',
      strokeWidth: 3,
      strokeScale: 'viewport',
      minStrokeWidth: 1,
      strokeAlignment: 'outside',
      displayMode: 'element-only',
    },
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

`pointer.hoverDuringPress` defaults to `false`. Opt into `true` when clicking
the hovered selectable target must not publish a transient `leave` between
pointer down and up. Actual pointer leave and cancel still publish `leave` and
clear the package-owned hover projection.

For a concrete grid component hover, the target is
`{ id: '<grid>.<row>.<column>', componentId: '<template-component-id>' }`.
Point and box selection resolve that hit to the stable grid-cell owner
`{ id: '<grid>.<row>.<column>' }`, so programmatic, point, and box selection
share one persistent-bound identity. Authored component hits retain their
component identity. Hover publications include the current CSS
pixel `anchor`, package-converted `world` point, `previousTarget`, pointer
identity, and modifiers. Same-target motion publishes `move`; exiting the
target publishes `leave` with `target: null`.

Box selection is disabled unless `selection.box` is enabled. Set
`activationModifier: 'shift'` to retain ordinary primary-drag viewport pan and
activate box selection only when Shift is held at pointer-down. That decision
is latched for the gesture: releasing Shift after the drag starts still
completes the box, while pressing Shift after an ordinary pan starts does not
switch owners. `box: true` and `activationModifier: 'none'` retain the explicit
all-primary-drag box behavior. Middle-button pan and wheel zoom remain viewport
gestures. `allowMultiple: false` keeps the first
eligible target in deterministic paint/scene order; `true` keeps every
eligible target and permits shift-add/toggle behavior. A thrown `isSelectable`
callback aborts the entire pointer selection commit without changing selection
and reports a host-callback diagnostic.

Pointer deselection is an explicit mount policy. `clearOnBlankClick` accepts
`single`, `double`, or `never` and defaults to the compatible `single`.
`deselectOnTargetDoubleClick` defaults to `false`; when enabled, the first
modifier-free click on an unselected target still selects/replaces
immediately. A target already selected before the gesture keeps the current
selection on its first click and only that target is removed by the paired
second click. In a multi-selection the first click never collapses the other
targets. Shift click retains its immediate add/toggle meaning and cancels any
armed target. Blank and target double-click policies are independent, publish
at most one selection callback for the deselection, and their instance timer
is cleared by drag, another target, policy replacement, or `destroy()`.

`selection.visual` is an instance-local package-owned paint policy. `color`
accepts a `0xRRGGBB` number or PATCH MAP CSS color. `strokeWidth` is the CSS
pixel width at 1x viewport scale. The compatible `strokeScale: 'fixed'`
default keeps that screen width at every zoom and renderer DPR/resolution.
Opt-in `strokeScale: 'viewport'` uses
`clamp(strokeWidth * viewportScale, minStrokeWidth, strokeWidth)` for the
effective screen width; `minStrokeWidth` defaults to 1 CSS px (or the smaller
configured width). Thus a 3px/1px policy produces 3px at 1x, 1.5px at 0.5x,
1px at 0.1x, and remains capped at 3px above 1x. PatchMap converts only that
effective width to world units and reprojects the fixed aggregate outline
only when its geometry, policy, or effective viewport scale changes.
`strokeAlignment` accepts `outside`,
`center`, or `inside` and defaults to the compatible `center`. `outside`
places the full persistent stroke beyond the target's package-computed visual
paint bound so the selected target's own fill and stroke remain unobscured.
The paint bound starts with the semantic owner quad, unions visible projected
background/image, bar, icon, and text layout quads (including authored
negative margins), and expands centered rect strokes by their exact outward
half-width. Direct rect selection applies the same centered-stroke rule.
Rotation and scale remain in the selected owner's oriented affine frame;
multi-selection aggregate bounds union those visual frames. The policy applies
to every individual and aggregate path. `displayMode` accepts `all`,
`group-only`, `element-only`, or `hidden`. These values compose bounds rather
than filter selected target types: `all` draws every selected object's bound
plus their aggregate bound, `group-only` draws only the aggregate bound,
`element-only` draws only each selected object's bound, and `hidden` draws no
selection bound. `all` does not duplicate the same path for a single target.
A selected component projects its bound to its stable owner item or concrete
grid cell without changing the selected component identity. Programmatic,
click, and box changes all use the same persistent outline.

Paint bounds are deterministic geometry, not a raster-alpha scan. Transparent
pixels inside an image/icon/background texture do not trim its projected quad;
text uses its parser-owned layout quad, and an animated bar uses its full track
layout rather than changing the selection frame every animation tick. PATCH MAP
bar rect sources currently render fill/radius but no border stroke, so they add
no stroke outset. This keeps bounds cached by immutable projection identity and
repaints the two fixed aggregate Graphics objects only when geometry, policy, or
effective viewport scale changes—never by walking Pixi display-object bounds
per frame.

Optional `selection.box.visual` independently configures only the transient
marquee. Its `color` accepts the same CSS/`0xRRGGBB` inputs, `strokeWidth` is
also a zoom/DPR/resolution-independent CSS-pixel width, and `fillAlpha` is between
0 and 1. Omit `box.visual` to inherit `selection.visual.color` and
the configured `selection.visual.strokeWidth`; it does not inherit persistent
`strokeScale` or `minStrokeWidth`. The compatible fill alpha remains `0.08`.
Persistent `strokeAlignment` never changes the marquee's centered drag-bound
stroke.
Invalid visual input rejects the whole policy before the current gesture or
paint policy changes. Once a Shift drag crosses the package threshold,
PatchMap draws
the start-to-current marquee above selection and transformer paint and removes
it on up, up-outside, cancel, leave, policy replacement, or destroy. The
marquee is capture-visible but never enters dataset, history, semantic hash,
or debug snapshots.

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
