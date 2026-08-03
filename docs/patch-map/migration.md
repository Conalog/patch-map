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
| create and mount a map | `new PatchMap()` then await `initialize()` | one live `PatchMap` and one canvas per host slot |
| set PATCH MAP JSON | `loadDataset()` or `loadDatasetAsync()` | pass the existing v0.10 array directly; use the compatibility materializer only for the one documented legacy object |
| drive visible frames | `createFrameLoop()` or explicit `publishFrame()` | never run both a host RAF/ticker and the package loop for one instance |
| find logical objects | `queryScene()` or `resolveTarget()` | results are detached and revision-bound, not mutable live nodes |
| update many objects | `updateBarHeights()`, `updateInstanceBarHeights()`, `updateTexts()`, `bulkPatch()`, or `transact()` | choose template/semantic updates or concrete-instance presentation updates deliberately; inspect the returned status |
| selection | `applySelection()`, hit-test methods, and `bindSelectionHost()` | the binding publishes canvas-originated selection to the host; external state enters through `applySelection()` or `setExternalSelection()` |
| move, resize, or rotate | transformer edit methods | use stable selection IDs; do not mutate geometry snapshots |
| pan, zoom, reset, or fit | viewport methods | remove duplicate host coordinate transforms and viewport inertia |
| undo and redo | history methods | route keyboard ownership through `handleHistoryShortcut()` |
| load images or fonts | asset registration/session methods | do not borrow Pixi global-cache state as proof of validation |
| validate a save | `preparePatchMapPersistenceExport()` and semantic-hash roundtrip | write only after every guard passes |
| inspect state | `snapshot()` and semantic/product probes | probes are diagnostics, not mutable renderer handles |
| capture a report | `extractPublishedScene()` | publish first and pass the exact current tuple and CSS size |
| unmount | dispose host subscriptions, stop retained handles, then await `destroy()` | teardown is asynchronous and must finish before remounting the slot |

## Target lifecycle

The smallest complete replacement looks like this:

```ts
import {
  PatchMap,
  materializePatchMapCompatibilityDataset,
  type PatchMapSelectionHostPublication,
} from '@conalog/patch-map';

export async function mountMap(
  host: HTMLElement,
  input: unknown,
  onCanvasSelection: (value: PatchMapSelectionHostPublication) => void,
) {
  const patchMap = new PatchMap();

  try {
    await patchMap.initialize({
      instanceId: 'service-map',
      target: host,
      width: host.clientWidth,
      height: host.clientHeight,
      preference: 'webgl',
      strategy: 'mesh',
    });

    // Canonical PATCH MAP v0.10 arrays remain unchanged. The materializer also
    // admits the single legacy generic-item profile documented below.
    const compatible = materializePatchMapCompatibilityDataset(input);
    patchMap.loadDataset(compatible.canonicalDataset, {
      datasetRef: 'service:current',
      strict: true,
    });

    patchMap.fitViewport({ paddingCssPx: 24 });
    const frameLoop = patchMap.createFrameLoop();
    const releaseSelection = patchMap.bindSelectionHost(onCanvasSelection);
    frameLoop.publishNow();

    return {
      patchMap,
      async destroy() {
        releaseSelection();
        frameLoop.destroy();
        await patchMap.destroy();
      },
    };
  } catch (error) {
    await patchMap.destroy().catch(() => undefined);
    throw error;
  }
}
```

The packaged [`host-adapter.ts`](../../examples/patch-map/host-adapter.ts)
shows the complete consumer-owned adapter boundary. Copy or adapt that source
inside the consuming service; it is an example, not a package subpath export.
The minimal, Dashboard, Editor, and Report examples are compiled and executed
against the packed artifact during release verification.

### Frame ownership

Choose one publication model per instance:

1. Normal interactive services create exactly one loop with
   `patchMap.createFrameLoop()`. PatchMap invalidates it for product-owned
   mutations, animation, and interaction, pauses it for document visibility,
   and cancels it during engine destruction.
2. Deterministic evidence or a deliberately manual host omits the loop and
   calls `publishFrame(timeMs)` only at explicit boundaries.

Do not keep the old ticker, requestAnimationFrame callback, entity-level
animation closures, or mirrored pointer bookkeeping. Running two publishers
can double work, advance animation inconsistently, and retain callbacks after
unmount.

## Dataset cutover

`loadDataset()` and `loadDatasetAsync()` accept the strict unversioned PATCH
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

Use synchronous `loadDataset()` for an already available scene. Use
`loadDatasetAsync()` or `submitDataset()` when replacement work must yield or
when requests can supersede one another. A superseded `loadDatasetAsync()`
rejects with a structured `SUPERSEDED` diagnostic; `submitDataset()` resolves
with `status: 'superseded'` and invokes its optional release callback exactly
once. Neither outcome is success, so it must not update host persistence or
analytics as though the new scene committed.

With `{ strict: true }`, a dangling relation or invalid required value rejects
before publication. Compatibility mode may omit a dangling relation from
rendering and reports the omission; it does not silently retarget it.

## Queries, identity, and selection

Old live-node references cannot cross the new engine boundary. Query by
stable logical identity and keep snapshots short-lived:

```ts
const result = patchMap.queryScene({
  recursive: true,
  where: { id: 'rack-01' },
});

const target = result.targets[0];
if (target) {
  patchMap.applySelection({
    op: 'replace',
    ids: [target.selectionId],
    source: 'programmatic',
  });
}
```

Each query result records its lifecycle and scene revision. Re-query after a
dataset replacement. If a flow intentionally retains a resolved snapshot,
use `patchResolved()` and handle `STALE_TARGET`; never recover by mutating its
detached `value` object.

Canvas-originated selection can be published out through
`bindSelectionHost()`. Host-originated selection travels in through
`setExternalSelection()` or `applySelection()`. This directionality prevents
the host and canvas from echoing the same change forever. Dispose every
binding returned to the host before destroying the engine.

## Mutations, animation, and history

Replace direct object edits and per-node commands with one atomic engine
operation. Prefer the specialized batch paths for high-volume bar or text
changes; use `bulkPatch()` or `transact()` for general changes.

```ts
const result = patchMap.bulkPatch({
  targets: [{ kind: 'element', id: 'rack-01' }],
  changes: [{ path: ['attrs', 'x'], value: 120 }],
  strict: true,
  actionId: 'move-rack-01',
});

if (result.status === 'rejected' || result.status === 'refused') {
  // Keep host state unchanged and surface result.diagnostic.
}
```

`updateBarHeights()` and `updateTexts()` share the same commit, animation,
history, and publication authorities without constructing a generic
per-target command graph. Repeated bar updates retarget the active animation;
the host must not create one ticker or closure per bar.

### Grid template values versus concrete cell values

A v0.10 `grid` stores one reusable `item` template. Updating the template bar
with `updateBarHeights()` intentionally changes every expanded cell that uses
that component. An older host may instead have addressed materialized cell
objects independently. Preserve that observable behavior with the runtime
instance overlay API rather than cloning the grid template into thousands of
dataset records:

```ts
const result = patchMap.updateInstanceBarHeights({
  targets: [
    { id: 'rack-grid.12.3', componentId: 'usage' },
    { id: 'rack-grid.12.4', componentId: 'usage' },
  ],
  heights: new Float64Array([37, 81]),
});

if (result.status === 'rejected') {
  // No target was applied. Keep the host's corresponding live values intact.
  console.error(result.diagnostic, result.missingTargets);
}
```

The concrete target `id` is the stable expanded grid identity
`<grid-id>.<row>.<column>`; `componentId` remains the ID declared by the item
template. The batch resolves those IDs through the load-time dense component
index, updates aggregate projection slots, and uploads only the resulting
dirty Mesh ranges. It does not create a DisplayObject, listener, ticker, or
closure per cell. One central presentation controller retargets animations,
including repeated updates before the previous animation settles.

Numeric values are runtime presentation state. Passing `null` for one entry
removes that cell's overlay and restores its current authored template height.
The optional `animate: false` applies the destination immediately. The entire
batch validates before publication: a missing target rejects atomically, and
duplicate targets or invalid heights throw without a partial update.

Instance overlays deliberately do not change `exportDataset()`, the semantic
hash or scene revision, or undo/redo history. They survive later semantic
updates while the same concrete owner/component identity exists and are
discarded when that identity disappears, a new dataset is loaded, or the
engine is destroyed. Persist per-cell live values in the host's state channel
and replay them after loading if they must survive a remount. Use
`updateBarHeights()` instead when the height is authored template state that
must export and participate in history.

Only bar height has this dedicated concrete-instance overlay in the current
shipping API. Text, icon, color, visibility, or structural per-cell state must
not be disguised as a bar update: keep it in the host until an explicit
package API exists, or materialize canonical item records when that is the
approved dataset model. This boundary prevents an unbounded per-entity runtime
from entering the aggregate renderer unnoticed.

Undo and redo operate on engine history. Use `historyInspection()` for UI
state, `undo()` and `redo()` for explicit commands, and
`handleHistoryShortcut()` when routing keyboard input. If the host keeps
editor companion state, stage it with `setHistoryCompanion()` so it travels
through the same reversible boundary instead of maintaining a second history.

## Assets and asynchronous work

Register required assets during `initialize()` or with `registerAssets()` and
acquire them through the engine/session APIs. External URLs must pass the
configured ingestion policy, including origin, redirects, MIME type, encoded
size, decoded size, and SVG checks. An existing Pixi global-cache key is not a
validation shortcut.

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

const pending = preparePatchMapPersistenceExport(patchMap.exportDataset(), {
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

Extraction is tied to an exact visible publication, not merely the latest
logical state:

```ts
frameLoop.publishNow();
const snapshot = patchMap.snapshot();
const capture = await patchMap.extractPublishedScene({
  targetTuple: snapshot.publishedTuple,
  cssSize: snapshot.resources.canvas.cssSize,
  mime: 'image/png',
});
```

A stale tuple, changed CSS size, unreadable asset, renderer loss, or destroyed
instance rejects instead of returning a capture for a different frame.

## Canary and rollback

`PatchMapMigrationAuthority` is optional instance-local host orchestration,
not a second renderer. It pins exactly one authoritative engine for a mounted
session. Any comparison or previous-engine shadow must be explicitly
read-only, own no canvas, and suppress selection, command, history,
persistence, callback, and analytics publication.

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

## Unsupported migration requests

There is no compatibility alias for a previous engine class, selector,
command object, mutable live node, renderer object, or per-entity rendering
hook. Do not recreate those semantics inside a large adapter.

If a required behavior has no public PatchMap equivalent, record it as a
migration gap with the old observable behavior, required dataset, expected
host effect, and cleanup owner. Resolve that gap in the package or report it
as structured unsupported behavior before promotion.
