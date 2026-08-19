# Migrating the existing host to PatchMap

This release replaces the existing map engine boundary. It accepts existing
PATCH MAP v0.10 array JSON directly, but it is not an API-compatible wrapper
for the previous runtime. Plan this as a breaking host-adapter migration: keep
the dataset contract, replace the engine integration.

The exact names used by an older host can differ. Inventory responsibilities,
not class-name aliases. The target integration imports only the root
`@conalog/patch-map` package and delegates rendering, interaction, history,
assets, and cleanup to one `PatchMap` instance.

## Before changing code

- Use Node.js 20 or newer. Repository CI uses Node.js 22.
- Install the package and its PixiJS v8 peer together:

  ```sh
  npm install @conalog/patch-map pixi.js
  ```

- Treat WebGL2 as the production backend. WebGPU remains experimental and
  needs separate evidence before a service enables it.
- Find every old map import, canvas mount, animation/ticker, pointer listener,
  selector/live-node lookup, command/history path, asset loader, capture path,
  persistence write, and unmount hook. Each must have one explicit owner after
  migration.
- Do not publish this redesign under a semver that implies API compatibility.
  The exact release version is chosen after merge, but the breaking public API
  must follow the major-version rule in [compatibility.md](./compatibility.md).

## Responsibility mapping

| Existing host responsibility | PatchMap replacement | Important cutover rule |
| --- | --- | --- |
| create and mount a map | `await PatchMap.mount({ container, data })` | one live `PatchMap` and one canvas per host slot; host sizing and frame ownership default to the package |
| apply a service color palette | `PatchMap.mount({ ..., theme })` | pass partial nested or dot-path overrides once per instance; omitted keys use canonical defaults |
| replace PATCH MAP JSON | `data.replace()` or `data.replaceAsync()` | pass the existing v0.10 array directly; use the compatibility materializer only for the one documented legacy object |
| drive visible frames | automatic after `mount()` | remove the previous host RAF/ticker; explicit publication remains an advanced deterministic seam |
| find logical objects | `targets.get()` or `targets.query()` | use `{ id, componentId? }`; target sets are detached and revision-bound |
| update one logical owner | `update()` | change element fields and its bar/text/icon/background components in one atomic commit; omit `componentId` only when the component type is unique |
| update many objects with equal-shaped values | columnar `updateBatch()` | column lengths must match target count; authored bar/text fast paths retain their compact planners |
| compose heterogeneous or structural work | `transaction()` | one ordered validation, scene publication, selection companion, and history entry; one failure rejects the whole operation |
| external selection | `selection.set/add/remove/toggle/clear` and `selection.onChange()` | use stable IDs or target sets; this all-source observer preserves the existing programmatic API |
| pointer selection plugin | mount `selection: { box, allowMultiple, isSelectable }` and subscribe with `selection.onPointerChange()` | remove host drag rectangles, coordinate conversion, hit tests, pointer capture, and RAF ownership |
| hover tooltip plugin | `pointer.onHover()` | consume stable `{ id, componentId? }`, CSS `anchor`, package-converted `world`, and `hover/move/leave`; do not inspect Pixi objects |
| move, resize, or rotate | `transform.moveBy/resizeBy/rotateBy` | use stable IDs or target sets; all three methods apply relative deltas |
| pan, zoom, reset, or fit | `viewport.panBy/zoomBy/reset/fit` | remove duplicate host coordinate transforms and viewport inertia |
| undo and redo | `history.undo/redo` | the host may map shortcuts to these same public methods; do not create a second history owner |
| load images or fonts | `assets.register()` | do not borrow Pixi global-cache state as proof of validation |
| validate a save | `preparePatchMapPersistenceExport()` and semantic-hash roundtrip | write only after every guard passes |
| inspect state | `debug.snapshot()` | snapshots are diagnostics, not mutable renderer handles |
| capture a report | `await capture.png()` | the package publishes and protects the exact capture tuple |
| unmount | dispose host subscriptions, stop retained handles, then await `destroy()` | teardown is asynchronous and must finish before remounting the slot |

## Target lifecycle

The smallest complete replacement looks like this:

```ts
import {
  PatchMap,
} from '@conalog/patch-map';

export async function mountMap(
  host: HTMLElement,
  input: unknown,
) {
  return PatchMap.mount({
    instanceId: 'service-map',
    container: host,
    data: input,
    theme: {
      primary: { default: '#0c73bf', dark: '#063559' },
      gray: { light: '#9eb3c3' },
    },
    fit: { padding: 24 },
  });
}
```

The returned object owns its frame loop and ResizeObserver. The host unmount
path only needs `await patchMap.destroy()`. For the pinned legacy generic-item
profile, materialize it before passing `data`; canonical PATCH MAP v0.10 arrays
are passed directly.

Do not register the default `FiraCode` family in the host. PatchMap ships and
settles distinct 300/400/500/600/700 Fira Code faces during mount, maps both
accepted spellings to the quote-stable `FiraCode` browser family, and releases
its font leases on destroy.
Host font registration is reserved for genuinely custom families.

Do not translate theme tokens into direct colors in the host adapter. The
mount-level `theme` is detached and remains local to that instance, while
`data.replace()` / `replaceAsync()` and concrete presentation replay continue
to resolve through the same palette. Invalid theme values reject before a
canvas or scene is published.

The packaged `minimal`, `dashboard`, `editor`, `report`, and
[`host-adapter.ts`](../../examples/patch-map/host-adapter.ts) examples all use
the same public `PatchMap.mount()` lifecycle and domain APIs.

### Frame ownership

Interactive services use `PatchMap.mount()`, which creates and owns exactly one
loop. PatchMap invalidates it for product-owned mutations, animation, and
interaction, pauses it for document visibility, and cancels it during
destruction. Package-internal deterministic evidence may drive publication
explicitly, but that seam is not a consumer API.

Do not keep the old ticker, requestAnimationFrame callback, entity-level
animation closures, or mirrored pointer bookkeeping. Running two publishers
can double work, advance animation inconsistently, and retain callbacks after
unmount.

## Dataset cutover

`data.replace()` and `data.replaceAsync()` accept the strict unversioned PATCH
MAP array schema. Existing v0.10 `item`, `grid`, `relations`, `group`, `rect`,
`text`, `image`, `icon`, and component records remain the input boundary.
PatchMap detaches that input, preserves stable element IDs and component
owner/ID identity, and never writes into the caller's objects.

Only use `materializePatchMapCompatibilityDataset()` when an admission point
can receive either canonical v0.10 data or the pinned legacy object below.
Do not use it as a permissive unknown-schema converter.

| Input | Status and interpretation |
| --- | --- |
| PATCH MAP array | supported; detached, validated, and materialized without mutating the caller |
| one `{ kind: "generic-item" }` object | supported only by the compatibility materializer; `id`, `width`, and `height` are required, `x` and `y` default to zero, and `label` is optional |
| any other object root or unknown legacy field | rejected as `INVALID_LEGACY_ROOT` at the exact input path |
| persistence array | supported through `preparePatchMapPersistenceExport()`; strict duplicate/reference validation is on by default |
| non-array persistence root | rejected as `INVALID_EXPORT_ROOT` before any host write |
| cyclic, sparse, accessor-backed, non-plain, symbol-keyed, non-finite, or non-JSON value | rejected as `NON_SERIALIZABLE_VALUE` at the exact input path |

Use synchronous `data.replace()` for an already available scene and
`data.replaceAsync()` when replacement work must yield. A superseded async replacement
rejects with a structured `SUPERSEDED` diagnostic, so it must not update host
persistence or analytics as though the new scene committed. Hosts that need an
explicit supersession queue should coordinate `data.replaceAsync()` calls and
treat only the latest fulfilled request as committed application state.

With `{ strict: true }`, a dangling relation or invalid required value rejects
before publication. Compatibility mode may omit a dangling relation from
rendering and reports the omission; it does not silently retarget it.

## Queries, identity, and selection

Old live-node references cannot cross the new engine boundary. Query by
stable logical identity and keep snapshots short-lived:

```ts
const target = patchMap.targets.get({ id: 'rack-01' });
if (target) patchMap.selection.set(target.id);
```

Each target match is detached. A queried target set is also bound to its scene
revision and rejects after dataset replacement; query it again instead of
mutating its detached `value` object.

Keep `selection.onChange()` when the host intentionally observes every source,
and change external selection with `selection.set/add/remove/toggle/clear`.
For an existing selection plugin, configure and subscribe at the pointer-owned
boundary instead:

```ts
const patchMap = await PatchMap.mount({
  container,
  data,
  pointer: { hoverDuringPress: true },
  viewport: { wheel: { activationModifier: 'control' } },
  selection: {
    box: {
      activationModifier: 'shift',
      visual: { color: '#1099ff', strokeWidth: 1, fillAlpha: 0.08 },
    },
    allowMultiple: plugin.allowMultiple,
    clearOnBlankClick: 'double',
    deselectOnTargetDoubleClick: true,
    isSelectable: (target) => plugin.isSelectable(target),
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

const releasePointerSelection = patchMap.selection.onPointerChange(
  ({ selected }) => plugin.onSelectionChange(selected),
);
const releaseHover = patchMap.pointer.onHover(
  ({ type, target, anchor, world }) =>
    tooltip.resolveView({ type, target, anchor, world }),
);
```

With `activationModifier: 'shift'`, ordinary primary drag remains package-owned
pan and Shift+primary drag becomes box selection. The modifier is latched at
pointer-down; middle-pointer pan and wheel zoom remain package-owned viewport
gestures. Pointer capture keeps drag completion outside the canvas
deterministic. Concrete hover targets use the cell ID plus the stable template
`componentId`; pointer selection resolves the same hit to its stable cell ID,
matching programmatic and box selection. Both subscription methods
return a disposer and `destroy()` clears any disposer the route did not call.

Remove any host-side click-distance workaround. PatchMap keeps point selection
eligible through 4 CSS px on each axis and starts primary pan or the
Shift-latched box only after a strict `> 4px` excursion. Crossing is sticky
even if the pointer returns to its start, and zoom/DPR do not rescale the
boundary.

Replace a host wheel plugin that starts only while Ctrl/Command is pressed with
`viewport: { wheel: { activationModifier: 'control' } }`. Do not migrate its
keydown/keyup or wheel listeners: PatchMap checks `ctrlKey || metaKey` on the
owned wheel event. Plain wheel then remains available to the page/container;
accepted wheel keeps the existing cursor anchor and zoom limits. Omit the
option for the compatible modifier-free wheel zoom, and continue using public
`viewport.zoomBy()` for zoom buttons.
Set `pointer.hoverDuringPress` only when the existing tooltip contract keeps
the current hover target through a selectable-target click. Omitted/false
retains the compatible pointer-down leave, while actual leave and cancel clear
hover in either mode.
Do not retain the old host pointer listeners, hit-test mirror, coordinate
transform, tooltip RAF, transformer wireframe, or DOM drag rectangle. The
package draws the configured selection frame and transient Shift-drag marquee
in its canvas and clears both with the mounted lifecycle. Transformer
`boundsDisplayMode` maps as `all` → `all`, `groupOnly` → `group-only`,
`elementOnly` → `element-only`, and `none` → `hidden`; these modes compose
individual and aggregate bounds rather than filter target types.
The prior Transformer wireframe occupies the outside of the selected bound;
map that paint placement explicitly with `strokeAlignment: 'outside'`.
When the prior wireframe also thinned with viewport zoom, map that behavior to
`strokeScale: 'viewport'` plus `minStrokeWidth: 1`. The configured
`strokeWidth` is its 1x width and high-zoom cap. Omit `strokeScale` to retain
PatchMap's existing fixed-screen-width behavior. This mapping applies only to
persistent selected bounds; keep marquee width under `selection.box.visual`.
Omitting alignment intentionally retains PatchMap's centered compatibility
default, while `inside` places the full persistent stroke within the bound.
The migration bound is the visual/client-style paint-layout bound, not only the
semantic item rectangle: PatchMap unions the visible projected component boxes
and expands centered rect borders by half their authored width before applying
outside/center/inside. This covers authored items and concrete grid cells under
rotation/scale without host padding constants. Image alpha is not trimmed,
text uses its deterministic layout box, and animated bars retain their stable
full-track box so selection paint does not retessellate every frame.
The persistent Transformer wireframe stays under `selection.visual`; the
marquee-only color, CSS-pixel width, and fill alpha belong to
`selection.box.visual`. Omit the latter to preserve the previous shared
color/width behavior and `0.08` fill.

For the prior service deselection policy, `clearOnBlankClick: 'double'` keeps
blank single clicks and clears on the second blank click, while
`deselectOnTargetDoubleClick: true` removes only the selected target that was
double-clicked. The first click on an unselected target still selects
immediately; the first click on an already-selected target neither collapses a
multi-selection nor emits a change. Shift click continues to toggle
immediately. Both options are omitted by default to preserve existing package
behavior.

## Mutations, animation, and history

Replace direct object edits and per-node commands with one of three mutation
operations. Use `update()` for one owner, `updateBatch()` for equal-length
columnar values over many owners, and `transaction()` when different update or
structural operations must succeed or fail together.

```ts
patchMap.update({
  id: 'rack-01',
  bar: {
    height: 72,
    changes: { source: { fill: '#22c55e' } },
  },
  text: { text: '정상', style: { fill: '#ffffff' } },
});

patchMap.transaction([
  {
    type: 'update',
    id: 'rack-01',
    bar: { changes: { source: { fill: '#f97316' } } },
  },
  { type: 'move', id: 'rack-02', parentId: 'group-b', index: 2 },
], {
  actionId: 'move-racks',
  selectedIds: ['rack-01', 'rack-02'],
});
```

`update()` deliberately rejects a top-level array. Use `transaction([...])`
for heterogeneous changes or `updateBatch({ targets, ... })` for homogeneous
columns. This keeps the choice based on intent instead of object count.
`update().changes` also rejects stable identity and structural collections
such as `id`, `type`, `components`, `children`, grid `item`/`cells`, and
relations. Use an explicit structural transaction instead of hiding a whole
subtree replacement inside a merge.

```ts
const result = patchMap.transform.moveBy(
  { id: 'rack-01' },
  [120, 0],
  {
    actionId: 'move-rack-01',
  },
);

if (result.status !== 'committed') {
  // Keep host state unchanged and surface result.diagnostic.
}
```

Single bar-height and text-content updates and matching columnar batches retain
the compact planners. General component fields lower to one strict transaction.
All three public operations share the same commit, animation, history, and
publication authorities. Repeated bar updates retarget the active animation;
the host must not create one ticker or closure per bar.

### Grid template values versus concrete cell values

A v0.10 `grid` stores one reusable `item` template. Updating the template bar
with `update()` intentionally changes every expanded cell that uses
that component. An older host may instead have addressed materialized cell
objects independently. Preserve that observable behavior with the runtime
instance overlay API rather than cloning the grid template into thousands of
dataset records:

```ts
const cells = patchMap.targets.query({
  within: 'rack-grid',
  scope: 'instances',
});

const result = patchMap.updateBatch({
  targets: cells,
  bar: {
    componentId: 'usage',
    height: Float64Array.from(
      { length: cells.count },
      (_, index) => 20 + (index * 17) % 70,
    ),
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
  background: {
    componentId: 'surface',
    changes: { source: cellBackgrounds, show: cellBackgroundVisibility },
  },
  text: {
    componentId: 'value',
    text: cellLabels,
    style: cellTextStyles,
    changes: {
      show: cellTextVisibility,
      placement: cellTextPlacements,
      margin: cellTextMargins,
      tint: cellTextTints,
    },
  },
}, { animate: true });

if (result.status === 'rejected') {
  // No target was applied. Keep the host's corresponding live values intact.
  console.error(result.diagnostic, result.missing);
}
```

The concrete target `id` is the stable expanded grid identity
`<grid-id>.<row>.<column>`; `componentId` remains the ID declared by the item
template. The batch resolves those IDs through the load-time dense component
index, updates aggregate projection slots, and uploads only the resulting
dirty Mesh ranges. It does not create a DisplayObject, listener, ticker, or
closure per cell. One central presentation controller retargets animations,
including repeated updates before the previous animation settles.
Height-only `bar.height` batches retain their dedicated projection fast path;
adding bar paint/visibility, icon, background, or text columns selects the
atomic general presentation path. Callers do not need a separate API or
batching strategy.

The concrete presentation fields are
`background.changes.source/tint/size/show/attrs`, `bar.height`,
`bar.changes.tint/source/show`, `icon.changes.show/source/tint`, and text
`text/style` plus `changes.text/style/show/placement/margin/tint/split/attrs`.
Passing `null` for one entry removes only that field's overlay and restores its
current authored template value; nested style/attrs fields use the same merge
and restore rule. The optional `animate: false` applies a bar destination
immediately. All component columns are validated as one request before
publication: a missing target rejects atomically, and duplicate targets,
unequal columns, unknown fields, or invalid v0.10 values throw without a
partial update.

Instance overlays deliberately do not change `data.snapshot()`, the semantic
hash or scene revision, or undo/redo history. They survive later semantic
updates while the same concrete owner/component identity exists and are
discarded when that identity disappears, a new dataset is loaded, or the
engine is destroyed. Persist per-cell live values in the host's state channel
and replay them after loading if they must survive a remount. Use
`update()` instead when the height is authored template state that
must export and participate in history.

Component `label`, identity fields, arbitrary fields outside the lists above,
and structural per-cell state remain unsupported. They throw a `TypeError`
with `code: "PATCH_MAP_GRID_INSTANCE_PRESENTATION_UNSUPPORTED"`. Supported
fields stay in renderer-only sparse/columnar overlays and reuse the authored
component entity, dense slot, aggregate geometry, text/image leaf, central
scheduler, and root interaction authority; they do not add overlay-owned
DisplayObjects, listeners, tickers, or closures.

Undo and redo operate on PatchMap history. Read `history.state` for button
availability and call `history.undo()` or `history.redo()` from buttons and
keyboard shortcuts. `transaction(..., { selectedIds })` publishes selection
with the same history entry instead of maintaining a second history owner.

## Assets and asynchronous work

Register required assets through the mount `assets` option or
`assets.register()`. Inspect owned resource state through `assets.status()`.
External URLs must pass the
configured ingestion policy, including origin, redirects, MIME type, encoded
size, decoded size, and SVG checks. An existing Pixi global-cache key is not a
validation shortcut.

`data.replaceAsync()` validates and publishes the dataset asynchronously but
does not turn host timing into an asset-readiness signal. Use the first
`await capture.png()` as the exact visible-publication barrier: it waits every
active image binding in that tuple, publishes resolved textures, and captures
without an adapter sleep or `assets.status()` poll. This includes a concrete
background that transitions from aggregate rect paint to an asset and back.

If several maps share a `PatchMapAssetRuntime`, each `PatchMap` still owns its
own session and leases. Destroying one engine releases only its leases; the
shared resource unloads after the final lease is released. Await `destroy()`
so pending acquisition, decode, upload, and cleanup work settles before the
host reuses the slot.

See [host integration](./host-integration.md) for ownership rules and
[troubleshooting](./troubleshooting.md) for cleanup probes.

## Persistence cutover

Never serialize a live query result or a renderer object. Export the canonical
dataset, validate the detached candidate, verify its semantic roundtrip, and
only then commit the write:

```ts
import {
  assertPatchMapSemanticRoundtrip,
  materializePatchMapCompatibilityDataset,
  preparePatchMapPersistenceExport,
} from '@conalog/patch-map';

const pending = preparePatchMapPersistenceExport(patchMap.data.snapshot(), {
  strictReferences: true,
});
const reloaded = materializePatchMapCompatibilityDataset(
  JSON.parse(pending.serialized),
);

assertPatchMapSemanticRoundtrip(pending, reloaded);
await storage.write(pending.serialized);
```

`preparePatchMapPersistenceExport()` performs no write. Its result owns a
deeply detached canonical array. A semantic mismatch is
`SEMANTIC_MISMATCH` and blocks save or promotion; no rejected branch may
perform a partial persistence write. Persisted output must also keep every
generated identity needed for future stable addressing explicit; do not derive
or discard those identities in the host serializer.

## Extraction cutover

The normal capture API protects the exact visible publication while the image
is being extracted. It first settles active direct-image and component-image
bindings for that tuple, including a source introduced by `replaceAsync()` or
a concrete icon overlay:

```ts
const capture = await patchMap.capture.png();
```

An unreadable asset, renderer loss, or destroyed instance rejects instead of
returning a capture for a different frame. Exact tuple extraction remains an
internal verification seam.

## Canary and rollback

Canary and rollback orchestration belongs to the integrating service, not the
PatchMap package. Mount exactly one authoritative `PatchMap` per host slot.
Any comparison session must be read-only, own no authoritative canvas, and
suppress selection, command, history, persistence, callback, and analytics
publication.

Promotion uses fixed `1% -> 10% -> 50% -> 100%` cohorts. Stop when any of the
following is observed:

- semantic mismatch;
- runtime error;
- performance-budget failure;
- cleanup-budget failure.

Rollback selects the host-provided previous engine only for the next remount.
It never hot-swaps an active canvas and never replays an in-flight gesture.
The package neither bundles nor emulates the previous implementation; the
production host owns that factory and rollback seam. The rollback engine must
read the same schema-guarded data written during canary, so rehearse the full
load/edit/export/load path before enabling the first cohort.

For every cohort, record the artifact digest, host revision, accountable
owner, dwell window, and blocker rates without retaining raw customer data.
Shadow output is comparison evidence only and cannot count as a user action.

## Rollout checklist

Complete this list for every integrating service, not only for the package
repository:

- [ ] All runtime imports come from the root `@conalog/patch-map` export.
- [ ] Existing PATCH MAP v0.10 fixtures load without pre-transforming their
      canonical array shape.
- [ ] One host slot owns one `PatchMap`, one canvas, and at most one frame
      publisher.
- [ ] Query and selection code uses stable IDs and detached snapshots; no
      caller retains Pixi display objects or mutable live nodes.
- [ ] Mutations check committed/unchanged/rejected/refused status and preserve
      host state on atomic failure.
- [ ] Canvas selection, transformer gestures, viewport input, history
      shortcuts, resize, and extraction work through public PatchMap methods.
- [ ] Asset admission is policy-checked and every host subscription or lease
      has a cleanup owner.
- [ ] Persistence writes occur only after strict export and semantic-roundtrip
      validation.
- [ ] Unmount awaits `destroy()`, remount produces one new canvas, and no old
      callbacks, RAF handles, observers, or assets remain.
- [ ] Packed ESM, CJS, and TypeScript consumers pass with the chosen artifact.
- [ ] The real host adapter executes its 38 consumer journeys against that
      exact packed artifact; a mock adapter is not treated as production proof.
- [ ] WebGL2 browser, memory, and relevant performance gates pass on the
      service's real dataset; WebGPU stays separate and experimental.
- [ ] Canary blockers and next-remount rollback are connected before the first
      production cohort.
- [ ] Cohort evidence records artifact digest, host revision, owner, dwell, and
      blocker rates without copying raw production data.

The package repository uses `npm run verify:package` for the packed consumer
boundary and `npm run verify:local` for its full local release proxy. A
consuming service should add its own mount/load/interact/save/destroy smoke
test rather than treating package tests as proof of host integration.

For selection-policy artifact provenance, run
`npm run verify:package:installed-selection -- /absolute/path/to/package.tgz`.
This focused gate creates a fresh temporary consumer, installs that exact
tarball offline, resolves the root package entry from the consumer's own
`node_modules`, and exercises `clearOnBlankClick: 'double'` through public
pointer down/up input. It intentionally uses no worktree-source alias.
The equivalent `verify:package:installed-pointer` command additionally names
the gate's true/false hover-policy coverage.

## Unsupported migration requests

There is no compatibility alias for a previous engine class, selector,
command object, mutable live node, renderer object, or per-entity rendering
hook. Do not recreate those semantics inside a large adapter.

If a required behavior has no public PatchMap equivalent, record it as a
migration gap with the old observable behavior, required dataset, expected
host effect, and cleanup owner. Resolve that gap in the package or report it
as structured unsupported behavior before promotion.
