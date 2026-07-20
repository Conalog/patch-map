# REN-008 / REN-010 component-asset product plan

Status: implementation-ready plan. The canonical fixture, normalized expected,
manifest, review registry, and all other approved evidence remain immutable.
Nothing in this document changes an expected value or promotes either case from
`not-run`.

## Boundary and decision

This plan covers the dependency-coherent pair:

- `REN-008` — item backgrounds, including rect-to-asset replacement;
- `REN-010` — item icons, including source replacement and tint mutation.

It uses the completed semantic dataset/parser/reconcile foundation, AST-001 asset
session, and REN-005 scene-image generation/lifecycle substrate. It does not add a
second asset cache, a second geometry model, an entity event listener, an entity
ticker, an entity closure, or an object-per-entity container hierarchy.

The selected product shape is:

```text
caller-owned PATCH MAP array
  -> detached/frozen semantic dataset
  -> dense store + stable element/component/relation indexes
  -> immutable component visual projection
  -> atomic Core reconcile
  -> few role-based Pixi aggregate lanes
       background geometry: Mesh + bounded GraphicsContext fallback
       background assets: Sprite
       ordinary geometry / relations / bars: existing aggregate lanes
       content assets: Sprite
       text
       interaction overlay
  -> manual invalidation/render
  -> post-frame asset retirement
```

WebGL remains the production baseline. Sprite is selected over
`ParticleContainer` for this tranche because source replacement, exact affine
projection, role-specific ordering, visibility transitions, and texture lifecycle
observability are required. Atlas-backed/shared textures can still batch Sprites.
`ParticleContainer` remains a measured later candidate, not an unproved product
claim. WebGPU and native Windows remain explicitly pending.

## Immutable canonical lock

| Case | Fixture / expected index | Fixture SHA-256 | Expected SHA-256 | Route | Root | Actions / assertions |
| --- | ---: | --- | --- | --- | --- | ---: |
| `REN-008` | 76 / 76 | `2f72af379ce4558e1962316bd8d468ff704c1cd86c51aa504d27380459d99592` | `66c2e3c9cc0076c61065f0a54a59efdfe4f388a3b5716ae140d69a38978b76ef` | `/lab/core-v2?scenario=REN-008&size=<SIZE>&seed=<SEED>` | `scenario-ren-008` | 4 / 10 |
| `REN-010` | 78 / 78 | `4fa0f55c4a4d97399e1210f0d65e418b2478fd3ddcac653c43a663ee35a7374d` | `5a0aba5f147116bb97909f9da76378808e9c68aba077a65925d5e5ecb9f3d6f3` | `/lab/core-v2?scenario=REN-010&size=<SIZE>&seed=<SEED>` | `scenario-ren-010` | 3 / 11 |

Both use canonical profile `rendering-specimens` at SHA-256
`a9f24b61a9796fd91594e3080020bf810d5974141c5ebe4c69c1e7210663ff66`
and require the observation domains `scene`, `geometry`, `paint`, and
`resources`.

Canonical execution state stays `not-run`, automation stays
`not-implemented`, and Lab stays `specified-not-implemented` until real actuals,
strict comparison, focused headed evidence, cleanup, and independent review are
present.

### Canonical direct-input datasets

`REN-008` must load this ordinary PATCH MAP array directly:

```json
[
  {
    "type": "item",
    "id": "item",
    "size": { "width": 100, "height": 80 },
    "padding": 10,
    "components": [
      {
        "type": "background",
        "id": "bg",
        "source": {
          "type": "rect",
          "fill": "#ff0000",
          "borderWidth": 2,
          "radius": 8
        },
        "size": { "width": 20, "height": 10 }
      }
    ]
  }
]
```

`REN-010` must load this ordinary PATCH MAP array directly:

```json
[
  {
    "type": "item",
    "id": "item-a",
    "size": { "width": 100, "height": 80 },
    "padding": 10,
    "components": [
      {
        "type": "icon",
        "id": "icon",
        "source": "fixture-icon",
        "size": { "width": "50%", "height": "25%" },
        "placement": "right-top",
        "margin": { "top": 2, "right": 3 }
      }
    ]
  }
]
```

No handler may manufacture a different product dataset merely to obtain the
expected values.

## Exact action maps

The combined lock is **2 cases, 7 ordered actions, 5 distinct action types, one
checkpoint, and 21 assertions**.

### REN-008 — exact four-action trace

| Index | Exact action | Product operation | Required transition |
| ---: | --- | --- | --- |
| 0 | `loadDataset {"datasetId":"background"}` | Load the canonical profile array through the public Core v2 dataset entry point. | A full-item rect background exists at stable entity ID `item::background:bg`; capture checkpoint `initial` records path `id` after this action. |
| 1 | `replaceComponentSource {"ownerId":"item","componentId":"bg","source":"fixture-image","timeMs":20}` | Resolve the component target, clone the patch, and submit one semantic component mutation at contract time 20 ms. | One atomic same-ID dense-kind replacement changes Rect to Image, then the REN-005 controller acquires the current binding. No intermediate source or stale Sprite may be published. |
| 2 | `setComponentVisibility {"ownerId":"item","componentId":"bg","show":false}` | Patch `show:false` through the same component target API. | Semantic identity remains; the visible Sprite is removed and `renderObjectCount` becomes zero before the observation is published. |
| 3 | `setComponentVisibility {"ownerId":"item","componentId":"bg","show":true}` | Patch `show:true` through the same component target API. | The current source is reactivated under the same logical entity/component identity; any old generation remains unable to attach. |

Cleanup is exactly `destroy-case {"expectedResourceDelta":0}`.

### REN-010 — exact three-action trace

| Index | Exact action | Product operation | Required transition |
| ---: | --- | --- | --- |
| 0 | `loadDataset {"datasetId":"icon"}` | Load the canonical profile array through the public Core v2 dataset entry point. | The icon resolves against the padded content box `[10,10,80,60]` at stable entity ID `item-a::icon:icon`. |
| 1 | `replaceSource {"target":{"ownerId":"item-a","id":"icon"},"source":"fixture-icon-2","timeMs":20}` | Normalize the shorthand component target to the same semantic target form and patch only `source`. | Placement and size do not change; the new binding generation owns the next Sprite, and a delayed old completion is rejected/released. |
| 2 | `patch {"target":{"ownerId":"item-a","id":"icon"},"changes":{"tint":"#00ff00ff"}}` | Clone and deep-merge the tint patch, materialize, then reconcile once. | The existing source binding is retained, only GPU-visible tint/alpha state is dirtied, and no asset reacquisition occurs. |

Cleanup is exactly `destroy-case {"expectedResourceDelta":0}`.

The deterministic fixture backend may settle a deliberately delayed old icon
request inside the action/cleanup boundary to prove rejection. That settlement is
a transport fact, not an extra catalog action, and it must not alter the exact
seven-entry action trace.

## Product contract beyond the narrow expected paths

The normalized expected paths are necessary but not the whole product contract.
The scenario prose also requires:

- background geometry always follows the complete parent item frame, including
  parent size changes, and never follows the authored background `size`;
- authored background `size` stays present in a detached roundtrip dataset;
- rect backgrounds preserve transparent fill, tint multiplication, border width,
  border color, and scalar or per-corner radius intent without silent reduction;
- asset-backed background failure keeps full-item placeholder bounds;
- icon pixel, percentage, and supported mixed-unit dimensions resolve against the
  padded content box, then placement and margins determine its local box;
- parent size, padding, component placement, margins, orientation, visibility,
  tint, and source mutations recompute or retain the correct fields in one
  published state;
- missing and delayed icon assets remain recoverable, with icon placeholder bounds
  equal to its resolved component bounds;
- every asset attempt produces at most one target-scoped sanitized diagnostic;
- the first successful replacement frame atomically removes placeholder state
  without changing logical identity;
- hidden components have zero Pixi render objects and no target hit contribution,
  while their semantic component record and stable identity remain queryable;
- renderer pixels are evidence, but normative geometry comes from the shared Core
  affine projection, never from Pixi `getBounds()`.

Any unsupported future source/style/placement form must emit a structured
diagnostic or fail materialization atomically. It must not be silently discarded.

## Current reusable behavior

The implementation should extend, not duplicate, these current guarantees:

1. `semantic/dataset.ts` validates the strict `background` and `icon` fields,
   clones caller values, freezes authoritative data, and preserves authored
   background size.
2. `parser.ts` assigns component entity IDs as
   `${instanceId}::${type}:${componentId}` and indexes the source element and
   component identity. The approved cases therefore use
   `item::background:bg` and `item-a::icon:icon` deterministically.
3. Background geometry already uses `[0,0,item.width,item.height]`; its authored
   `size` is semantically retained but inert for painting.
4. Icon dimensions already resolve against the padded content box. In the
   canonical fixture, `50% * 80 = 40`, `25% * 60 = 15`, and `right-top` plus
   margins yields `[47,12,40,15]`, hence `right=87` and `top=12`.
5. Rect backgrounds become dense Rect records; asset backgrounds and icons become
   dense Image records with the lossless REN-005 `imagesByEntityId` source sidecar,
   exact affine projection, tint, and visibility.
6. The semantic mutation path clones patches, materializes a complete candidate,
   and rejects invalid mutations without touching authoritative state.
7. Reconcile can patch a same-kind entity or replace a same-ID Rect with Image in
   one remove/add transaction while preserving the semantic component target.
8. The scene-image controller and aggregate leaf layer already own binding
   generations, placeholder/resolved roles, stale completion/attachment counters,
   exact Matrix projection, hidden-image removal, deferred post-frame release,
   and lifecycle probes.
9. AST-001 already owns alias/direct-source descriptor normalization, backend-wide
   dedupe, instance leases, failed-unload quarantine, and safe late cleanup.
10. The engine already exposes semantic, geometry, renderer, and scene-image facts,
    and uses one manual invalidation/render boundary.

## Gaps that this pair must close

### 1. Cross-lane component ordering

The current world adds the entire aggregate container before the entire leaf
container. The leaf container adds all image Sprites before text. Therefore a
background asset at semantic `zIndex=-10` still renders above every aggregate Mesh,
including ordinary geometry. Sorting inside the image lane cannot repair ordering
across parent containers.

This tranche must split aggregate and leaf ownership into a few meaningful,
interleavable containers. The minimum role order is:

```text
world RenderGroup
  1. backgroundGeometry       (rect/styled item backgrounds)
  2. backgroundAssets         (asset-backed item backgrounds/placeholders)
  3. ordinaryGeometry         (world rects and other non-background geometry)
  4. relationsAndDynamic      (existing semantic draw-order rules within aggregate lanes)
  5. contentAssets            (icons and standalone foreground images)
  6. text
  7. interactionOverlay
```

The exact internal split between ordinary/relation/dynamic aggregate containers may
reuse existing renderer lanes. The non-negotiable part for this slice is that both
background representations are below item content and icons are above background
content. The renderer must expose stable debug labels and counts for these aggregate
roles in PixiJS DevTools.

`LAY-003` remains responsible for generalized arbitrary cross-kind z/history order.
This slice must not falsely claim that all possible user-authored z interleavings are
closed; it closes the fixed product roles required by `REN-008` and `REN-010`.

### 2. Styled background geometry

The production Mesh path currently emits a fill quad and does not paint stroke or
rounded corners. The selected bounded hybrid is:

- unrounded, unstroked backgrounds stay in aggregate Mesh quads;
- a background with positive stroke or non-zero radius enters a
  background-only, fixed-size chunked `GraphicsContext` path;
- each chunk owns a small aggregate `Graphics` object/context, not one object per
  background;
- only the dirty chunk is rebuilt when source/style/tint/geometry changes;
- source replacement Rect -> Image removes the old chunk primitive before the
  background Sprite can publish;
- zero-alpha fill still retains independently visible stroke intent;
- tint is normalized once during semantic projection, not by allocating `Color`
  objects per entity or frame.

Uniform radius can use the public rounded-rect path. Four-corner radius must retain
all four values in an immutable component-paint sidecar and use an explicit
public-path construction; it must not continue the current scalar-only
`finiteNumber(radius)` reduction. If the public Pixi path cannot express a declared
variant exactly, stop the slice and report a structured unsupported variant rather
than using `max(radius)` or another silent approximation.

The GraphicsContext fallback is accepted only if scale measurements show bounded
chunk rebuilds and no steady-frame allocation. If it fails that gate, the fallback
must be replaced by aggregate rounded/stroke tessellation before promotion, not by
per-entity Graphics.

### 3. A lossless component visual projection

Dense rows remain hot numeric authority, but renderer/observer data that cannot fit
losslessly belongs in one immutable sidecar. Extend the projection with a generic
component visual record rather than adding fixture-specific state:

```ts
interface CoreV2ComponentVisualProjection {
  readonly entityId: string;
  readonly ownerId: string;
  readonly componentId: string;
  readonly componentType: 'background' | 'icon' | 'bar' | 'text';
  readonly logicalIdentity: string;
  readonly renderRole: 'background-geometry' | 'background-asset' | 'content-asset';
  readonly authoredSize?: CoreV2ComponentSize;
}

interface CoreV2BackgroundPaintProjection {
  readonly entityId: string;
  readonly sourceKind: 'rect' | 'asset';
  readonly fill: number;
  readonly borderWidth: number;
  readonly borderColor: number;
  readonly radius: readonly [number, number, number, number];
  readonly tint: number;
}

interface CoreV2ProjectionIndex {
  readonly componentsByEntityId?: Readonly<Record<string, CoreV2ComponentVisualProjection>>;
  readonly backgroundsByEntityId?: Readonly<Record<string, CoreV2BackgroundPaintProjection>>;
  // existing imagesByEntityId remains the only asset-source projection.
}
```

Names may be adjusted to match existing source conventions, but the ownership rules
may not change:

- do not duplicate source normalization outside `imagesByEntityId`/AST-001;
- do not place mutable descriptor/style objects in typed arrays;
- do not derive component role from a fixture alias;
- classify role from the parser's actual component projection;
- preserve authored size and all radius corners losslessly;
- freeze projection records and replace them atomically with the dense commit.

### 4. Generic product observation

Add one target-based component visual probe, not `REN-008`/`REN-010` hard-coded
probes. For `{ownerId, componentId}` it joins actual product authorities:

- semantic component: logical identity, detached authored size/source/tint/show;
- projection/dense store: entity kind, local/world/visible bounds, finite geometry,
  current revision;
- scene-image controller/leaf renderer: binding key/generation, role, current source
  identity, Sprite count, placeholder count, stale attach/completion counts;
- renderer: current command/draw-object counts and role-lane counts;
- resource runtime/backend: live requests, leases, resolved resources, pending
  retirements, and cleanup deltas.

The probe must be O(1) after indexes are built. It may return a detached frozen
snapshot, but it must never expose a mutable semantic object, Sprite, Texture, or
GraphicsContext. Contract folds may rearrange these product facts into observation
paths; they may not calculate expected-only facts that the product cannot report.

## Atomicity, stable identity, and input immutability

### Logical identity rule

The stable identity promised by these cases is the semantic component/entity
identity, not a physical Pixi object:

- background Rect -> Image keeps `item::background:bg` and component `bg`;
- hide -> show keeps that logical identity even though zero hidden render objects
  means the Sprite must be removed and a later Sprite may be newly created;
- icon source and tint updates keep `item-a::icon:icon`;
- no test may require the same Sprite object before/after a source or visibility
  transition.

The `REN-008` checkpoint captures the actual logical identity token after action 0.
The `sameIdentity` assertion compares the shown component's actual token to that
capture. A fixture literal such as `"bg"` may not be injected as a substitute for
the product identity lookup.

### Commit rule

Every action follows this sequence:

1. Resolve the target through the stable semantic component index.
2. Deep-clone action operands; never retain the fixture action object's mutable
   aliases.
3. Produce and validate a fully materialized candidate dataset/projection.
4. Plan dense/relation/projection reconciliation.
5. Commit all semantic, dense, identity, projection, and spatial-index changes once,
   or commit none.
6. Reconcile scene-image bindings only after the new semantic generation is
   authoritative.
7. Publish one synchronized manual frame; only after that frame may the old texture
   lease retire.

An invalid rect style, source, dimension, placement, margin, or target must leave
the dataset, dense store, component projection, renderer, binding generation, and
revision unchanged. An asynchronous asset failure is a recoverable post-commit asset
state: semantic source remains authoritative, a bounded placeholder/diagnostic is
published, and an explicit retry/replacement can recover.

### Input proof

Each product integration test records the caller JSON before load/mutation and proves
deep equality afterward. It also mutates a caller-side object after load to prove the
engine retained no mutable alias, and checks that exported semantic data is detached.
Determinism compares semantic hash, stable entity/component IDs, slot assignment,
geometry, action actuals, and cleanup probes across first, repeat, and a fresh
session.

## Asset state and cleanup protocol

### Binding protocol

- Background asset and icon requests both flow through the REN-005 scene-image
  controller and the AST-001 instance session.
- Binding equality uses the complete lossless source binding key; source replacement
  increments one target generation.
- A completion may attach only when `(entityId, bindingKey, generation)` still matches
  the authoritative target.
- Late old completions increment a bounded stale-completion observation and release
  their acquisition; they never replace the current Sprite or tint.
- Tint-only icon changes preserve the binding generation and acquisition.
- Hiding removes the Sprite and active hit contribution. Showing activates only the
  current source. No hidden object remains merely to make identity tests easier.
- Replacement release is frame-safe: the old acquisition enters post-frame retirement
  and is finalized after Pixi rendered the replacement/placeholder frame.
- Destroy cancels controller work, destroys aggregate display objects, releases every
  owned acquisition/session/backend token, and then destroys Application/canvas.
  Shared/global textures are released only through their declared AST ownership; a
  Sprite must not destroy a shared Texture.

### Required zero-state cleanup observation

`/resources/retainedDelta` must be derived from before/after product probes and be
recursively zero for owned resources, including:

- scene targets and target subscriptions;
- active/pending/failed bindings and binding consumers;
- live Sprites/placeholders and aggregate Graphics objects;
- frame-pending and ready-to-release acquisitions;
- AST instance leases, pending users, cleanup failures, and retained late surfaces;
- deterministic fixture backend live requests/resources;
- scheduler callbacks/animation handles;
- renderer, Application, canvas, root listeners, and resize observers.

Cleanup folds need negative tests that deliberately retain an old icon request, a
background replacement lease, or a post-frame release. Each must fail `noLeak`.

## Expected-blind automation design

Implement a shared runtime such as `render-component-assets`; do not duplicate
handlers per case. The proposed future files are:

```text
scripts/verification/core-v2-contract/handlers/render-component-assets.mjs
scripts/verification/core-v2-contract/fold-render-component-assets.mjs
tests/core-v2/contract-render-component-assets-handlers.test.ts
tests/core-v2/contract-render-component-assets-fold.test.ts
tests/core-v2/contract-render-component-assets-product-integration.test.ts
lab/performance-v2/contract/render-component-assets-runtime.ts
```

The exact filenames are secondary; action ownership, expected blindness, and
independent fold tests are mandatory.

### Handler responsibilities

- assert that only `REN-008` or `REN-010` is routed to this runtime;
- verify the received action trace against the immutable fixture record, never the
  normalized expected record;
- load the exact named profile dataset through the actual engine;
- register deterministic fixture assets through the real AST/session + Pixi Texture
  path without network access;
- delegate `setComponentVisibility` to the existing shared component mutation
  primitive instead of implementing a second mutation path;
- normalize both component target syntaxes into the public semantic target API;
- execute action time through a deterministic fixture clock;
- capture actual logical identity at declared checkpoints;
- wait for the declared product settlement/frame boundary only, not arbitrary sleeps;
- snapshot only detached product probes after each action;
- always destroy in `finally`, including handler/assertion failures.

The deterministic backend should make the initial icon request late and the
replacement immediately resolvable so a settled old request proves generation
rejection. The background replacement must exercise a real `Texture`/`Sprite`
attachment under Pixi WebGL. It must not use a network fetch or fake the product
render count.

### REN-008 assertion-to-actual map — all 10

| # | Exact expected assertion | Actual source and independent check |
| ---: | --- | --- |
| 1 | `/paint/background/data/size orderedEq [20,10]` | Read the detached authored `size` from the exported semantic component after the final action; prove renderer geometry did not consume it. |
| 2 | `/paint/background/visibleBounds orderedEq [0,0,100,80]` | Read the final component projection/geometry bounds for `item::background:bg`; cross-check against the same quad used by Sprite projection, not Pixi bounds. |
| 3 | `/paint/background/source eq "fixture-image"` | Read the final semantic source plus current scene-image binding request; the fold fails if these disagree. |
| 4 | `/paint/background/staleTextureCount zero` | Sum the exact target's stale attachment and stale current-texture violations from controller/leaf probes. A rejected old completion may be separately observed but cannot be attached. |
| 5 | `/scene/hidden/renderObjectCount zero` | Read the action-2 snapshot for the target entity from the leaf/role-lane probe. Do not count semantic nodes. |
| 6 | `/scene/shown/id sameIdentity {"$ref":"/captures/initial/id"}` | Read final logical identity from the generic component probe and compare to the action-0 captured product token. |
| 7 | `/scene/revision finite` | Read the real engine/Core revision after the final committed action. |
| 8 | `/geometry/finiteValueCount gte 0` | Traverse/count finite numeric values from the engine geometry observation helper; reject non-finite values before folding. |
| 9 | `/paint/commandCount gte 0` | Read the renderer flush result/debug snapshot for the published final frame. |
| 10 | `/resources/retainedDelta noLeak` | Compute the recursively zero post-destroy delta from scene-image, leaf, AST/session/backend, scheduler, renderer, and DOM probes. |

### REN-010 assertion-to-actual map — all 11

| # | Exact expected assertion | Actual source and independent check |
| ---: | --- | --- |
| 1 | `/paint/icon/bounds/width eq 40` | Read final shared geometry quad width for `item-a::icon:icon`. |
| 2 | `/paint/icon/bounds/height eq 15` | Read final shared geometry quad height. |
| 3 | `/paint/icon/bounds/right eq 87` | Compute `x + width` from the actual geometry quad in the fold; independently verify fixture content-box resolution in product tests. |
| 4 | `/paint/icon/bounds/top eq 12` | Read actual geometry quad `y`; no expected literal is returned by the handler. |
| 5 | `/paint/icon/source eq "fixture-icon-2"` | Read the final semantic source and confirm it matches the current binding request/generation. |
| 6 | `/paint/icon/tint eq "#00ff00ff"` | Read the detached final semantic tint and cross-check the renderer's packed tint/alpha observation. |
| 7 | `/paint/icon/staleTextureCount zero` | Read exact-target stale attachment/current-texture counts after the deliberately late initial request settles. |
| 8 | `/scene/revision finite` | Read the real engine/Core revision after source and tint commits. |
| 9 | `/geometry/finiteValueCount gte 0` | Use the same engine geometry observation helper and reject non-finite values. |
| 10 | `/paint/commandCount gte 0` | Read the actual renderer flush result/debug snapshot. |
| 11 | `/resources/retainedDelta noLeak` | Compute the recursively zero post-destroy product delta; deliberately retained old-generation resources must fail. |

### Independence and negative tests

Handler tests should use a strict fake engine surface only to verify delegation,
operand cloning, target normalization, action order, checkpoint timing, and cleanup
in `finally`. Fold tests should use synthetic actual product snapshots and prove that
each malformed/missing product fact fails. Product integration tests must use the
real engine, Pixi renderer, deterministic AST backend, semantic patch path, and
manual frame publication.

At minimum, negative tests must catch:

- authored background size incorrectly changing visible bounds;
- rect-to-image replacement changing logical entity/component ID;
- hidden background retaining a Sprite;
- background asset appearing in the content asset lane;
- radius or border silently disappearing;
- icon percentage size using the item box instead of content box;
- right margin applied with the wrong sign;
- tint patch triggering an asset reacquisition;
- an old icon Texture attaching after replacement;
- a fold returning fixture literals when the product probe is absent;
- any resource retained after cleanup.

## Focused Lab design

Both routes use the same light-theme contract shell, real Product bridge, canonical
Run/Repeat controls, and deterministic size/seed query. Scenario controls are
observational/exploratory additions; the canonical run button must still execute the
exact approved trace.

### REN-008 — `render/background`

The focused panel contains:

- actual Pixi canvas with a full-item bounds overlay;
- authored size `[20,10]` displayed beside resolved visible bounds
  `[0,0,100,80]` so inert roundtrip data is obvious;
- rect/image source switcher;
- fill, border width/color, uniform/per-corner radius, tint, and visibility controls;
- current logical ID, source kind, asset generation/state, render role, Sprite count,
  stale counts, background-lane count, command count, and resource count;
- canonical action rows and capture identity before/after hide/show;
- a delayed replacement option that visibly proves placeholder/current generation
  behavior without changing canonical expected evidence.

### REN-010 — `render/icon`

The focused panel contains:

- actual Pixi canvas with item and padded content-box overlays;
- source/placement/tint matrix using real engine actions;
- pixel, percentage, and supported mixed-dimension controls;
- resolved local bounds, margins, orientation mode, logical ID, binding generation,
  stale counts, Sprite/placeholder counts, command count, and resource count;
- canonical action rows plus optional missing/delayed replacement demonstrations.

Browser verification clicks actual controls, not only bridge functions. First,
repeat, and fresh sessions must match deterministically. Each run must show one
focused root and one canvas while active, then zero canvases/resources after cleanup,
with zero console, page, and network errors.

## Implementation slices and stop gates

### Slice A — contract lock and shared projection

Future implementation ownership:

- extend `src/core-v2/contracts.ts` and `src/core-v2/parser.ts` with lossless
  component visual/background paint projections;
- retain all radius corners, authored size, component role, and stable identity;
- extend projection equality/range detection so style/role/source changes dirty only
  affected slots/chunks;
- add parser/projection tests for scalar/four-corner radius, background full frame,
  icon content-box geometry, component identity, and caller immutability.

Stop if a valid current schema value is silently approximated or if the direct input
array changes.

### Slice B — role lanes and styled background rendering

Future implementation ownership:

- refactor aggregate/leaf layer interfaces to expose background geometry,
  background asset, content asset, and text containers without increasing scene
  graph size with entity count;
- add the chunk-bounded GraphicsContext path for border/radius backgrounds;
- classify Sprites through component projection, never alias names;
- publish lane labels/counts and exact per-target render-object probes;
- preserve changed-range/chunk updates and manual render.

Stop if role order requires per-entity containers, if a style update clears every
chunk, or if an idle frame allocates/rebuilds graphics.

### Slice C — atomic mutation and asset races

Future implementation ownership:

- add a generic component visual probe to engine/controller/renderer boundaries;
- connect rect-to-image kind replacement to the scene-image controller only after
  the dense commit;
- prove hide/show zero-object behavior and stable logical identity;
- prove tint-only mutation keeps the icon asset generation;
- prove delayed old completion cannot attach and all releases finalize post-frame;
- add cleanup/re-init tests with external and owned asset sessions.

Stop if a mutation publishes an intermediate frame, if an old resource can attach,
or if destroy relies on a later unrelated render to release resources.

### Slice D — expected-blind actual automation

Future implementation ownership:

- add the shared handler/fold/runtime and register both cases executable;
- preserve exact action order/checkpoint/cleanup;
- produce all 21 observations from product snapshots;
- add handler, fold, product-integration, determinism, and negative leak tests;
- run the strict comparator without reading expected in the handler/runtime.

Stop if automation fabricates bounds/source/identity/resource facts or changes the
canonical action trace.

### Slice E — focused Lab and browser evidence

Future implementation ownership:

- connect both exact routes to the shared product runtime and scenario panels;
- exercise Run, Repeat, source, visibility, style/placement, tint, and cleanup through
  actual UI controls;
- preserve first/repeat/fresh actuals, browser logs, screenshots, root/canvas counts,
  and cleanup evidence.

Stop on any console/page/network error, non-deterministic actual, duplicate root,
or canvas/resource remaining after cleanup.

### Slice F — performance/package/memory checkpoint

Run the renderer-impact checkpoint only after Slices A–E are stable:

- packed ESM and CJS consumer with background rect->asset and icon replacement;
- destroy/re-init and shared/external asset ownership proof;
- 2 warmups + 7 measured samples for 100/500/1,000/2,000/5,000 and production data
  if the renderer lane/Graphics change is material;
- raw samples plus median, p95, min, max and environment metadata;
- separate normalization, store/reconcile, binding/GPU upload, first visible frame,
  changed background chunk, changed icon, pan/zoom p95, destroy/re-init, and retained
  heap;
- honest comparison to the prior renderer checkpoint, including unfavorable ranges.

Native Windows remains `pending` until measured on target hardware. Chromium at 4x
CPU throttle is labeled a development proxy. WebGPU remains experimental and must
not be merged into WebGL baseline claims.

## Performance risks and selection gates

| Risk | Required control | Promotion gate |
| --- | --- | --- |
| Styled backgrounds rebuild too much geometry | Fixed chunks; dirty-range to chunk mapping; plain rects stay Mesh | One style/source change visits only the affected chunk; idle flush uploads zero bytes and rebuilds zero contexts. |
| Rect -> Image replacement causes a scene rebuild | Same stable logical ID, bounded dense reconcile, and lane-local structural update | No full dataset normalization or full aggregate rebuild for one component replacement. |
| Texture diversity breaks Sprite batching | Prefer aliases/atlas textures; record unique texture and render-object counts | Report draw objects and frame p95 at all declared scales; do not hide texture-heavy regressions. |
| Sorting costs grow every frame | Sort role-lane children only on source/z/slot structural dirtiness | Pan/zoom and idle frames perform no child reorder/allocation. |
| Per-corner radius is silently degraded | Lossless four-value sidecar plus explicit path generation | Scalar and each corner variant have geometry/visual tests; unsupported forms are diagnostics. |
| Tint path allocates colors per frame | Normalize packed RGBA on mutation/projection | No `Color` construction in slot/frame loops; tint-only update does not acquire assets. |
| Asset race retains Texture/session | Generation guard and post-frame release journal | Delayed old completion, hide/show, destroy-during-pending, and external-session tests all release to zero. |
| Probe becomes an O(n) contract-only scan | Stable entity/component/binding maps | Component visual probe is O(1) and disabled observation does not add frame work. |
| Layer split grows scene graph by entity count | Fixed role containers and chunk objects only | Debug object counts scale with chunks/styles/textures, never one Container/Graphics per entity. |

ParticleContainer is accepted only if a later measured spike preserves the full
source/tint/visibility/orientation/lifecycle contract and improves end-to-end results.
A custom RenderPipe is out of scope unless public Pixi APIs, WebGL package tests, and
measured benefit justify its backend/maintenance cost.

## Validation commands

Targeted implementation checkpoint:

```sh
npx vitest run \
  tests/core-v2/dataset-contract.test.ts \
  tests/core-v2/render-schema-support.test.ts \
  tests/core-v2/render-projection-closure.test.ts \
  tests/core-v2/image-source-projection.test.ts \
  tests/core-v2/semantic-mutation.test.ts \
  tests/core-v2/semantic-reconcile.test.ts \
  tests/core-v2/scene-images.test.ts \
  tests/core-v2/leaf-layer.test.ts \
  tests/core-v2/mesh-layer.test.ts \
  tests/core-v2/orientation-renderer-lanes.test.ts \
  tests/core-v2/contract-render-component-assets-handlers.test.ts \
  tests/core-v2/contract-render-component-assets-fold.test.ts \
  tests/core-v2/contract-render-component-assets-product-integration.test.ts
npm run typecheck
npm run lint
npm run build:lab:core-v2
```

Actual/strict/focused checkpoint, using the existing verifier's eventual targeted
case selection or an equivalent expected-blind target option:

```sh
npm run verify:core-v2-contract
node scripts/verification/core-v2-contract/execute-worker.mjs --case REN-008
node scripts/verification/core-v2-contract/execute-worker.mjs --case REN-010
node scripts/verification/core-v2-contract-render-browser.mjs --case REN-008 --headed
node scripts/verification/core-v2-contract-render-browser.mjs --case REN-010 --headed
```

If those CLIs do not currently expose `--case`, add a documented targeted entry point
rather than running a fake side harness. Do not change comparator semantics or relax a
gate.

Meaningful renderer/lifecycle checkpoint:

```sh
npm run build:core-v2
npm run verify:package:core-v2
npm run verify:memory:core-v2
npm run perf:core-v2:quick
npm run verify:performance-report:core-v2
```

Run the full expensive performance matrix only once the selected background lane and
Sprite lifecycle are stable. Preserve all seven raw samples and both favorable and
unfavorable comparisons.

## Completion checklist

- [ ] Canonical fixture/expected/review digests are unchanged.
- [ ] All 7 exact actions execute in order; no hidden catalog action is added.
- [ ] The one `REN-008` checkpoint captures actual logical identity after action 0.
- [ ] All 10 `REN-008` assertions come from product actuals.
- [ ] All 11 `REN-010` assertions come from product actuals.
- [ ] Direct input arrays remain deeply unchanged and no mutable aliases are retained.
- [ ] Rect/image background source changes keep stable component/entity identity.
- [ ] Authored background size roundtrips but never changes full-item geometry.
- [ ] Border and scalar/per-corner radius intent is rendered or explicitly rejected;
  it is never silently reduced.
- [ ] Background geometry/assets render below content assets with fixed aggregate
  role lanes; no per-entity Container/Graphics/listener/ticker is introduced.
- [ ] Icon geometry is `[47,12,40,15]` for the canonical fixture and consumes the
  shared affine projection.
- [ ] Tint-only icon mutation does not reacquire the asset.
- [ ] Hidden background has zero render objects and shown identity matches capture.
- [ ] Delayed source completion cannot attach a stale texture.
- [ ] Destroy/re-init returns every owned resource, callback, canvas, and renderer
  probe to zero.
- [ ] Both exact focused Lab routes pass first/repeat/fresh in headed WebGL with zero
  console/page/network errors.
- [ ] Packed ESM/CJS, memory, and risk-proportional performance checkpoints pass or
  report honest unfavorable results.
- [ ] WebGPU experimental and native Windows pending are reported separately.

Promotion is allowed only when this checklist is backed by actual product evidence
and independent review. Passing the 21 narrow assertions alone is not permission to
hide unsupported border/radius, ordering, race, immutability, or cleanup behavior.
