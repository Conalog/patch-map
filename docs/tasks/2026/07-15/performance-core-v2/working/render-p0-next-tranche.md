# Core v2 remaining P0 render/layout/assets tranche

## Scope and immutable sources

This inventory now tracks the ten P0 records remaining after `LAY-005` closed:
`REN-005..011`, `LAY-003/004`, and `AST-001`. It is derived
only from the current-worktree immutable contract corpus and current Core v2
public product source. Canonical fixtures, expected observations, reviews, and
decisions are not implementation inputs to be rewritten.

`LAY-005` is the completed geometry checkpoint: exact bounds/removal automation
matches 14/14, the same focused Lab route is executable, and first/repeat headed
comparison closes the six-route rendering checkpoint at 63/63 with canvas cleanup
and zero console, page, or network errors.

The exact canonical record pointers are:

| ID | fixture / normalized-expected case index |
| --- | ---: |
| REN-005 | 73 |
| REN-006 | 74 |
| REN-007 | 75 |
| REN-008 | 76 |
| REN-009 | 77 |
| REN-010 | 78 |
| REN-011 | 79 |
| LAY-003 | 82 |
| LAY-004 | 83 |
| LAY-005 | 84 |
| AST-001 | 85 |

Remaining corpus totals are **10 cases, 47 ordered actions, 24 unique action types, 176
typed assertions, four capture checkpoints/four captured paths, and ten
observation domains**. The unique action types are:

`acquireAsset`, `completeAsset`, `destroy`,
`initializeWithRequiredAssetFailure`, `loadDataset`,
`loadOrientationMatrix`, `observeItemTextMatrix`, `observeOrientationMatrix`,
`observeRelationContractMatrix`, `observeRelationPath`, `patch`,
`publishFrame`, `redo`, `registerAlias`, `registerAssets`,
`replaceComponentSource`, `replaceSource`, `resolveAsset`,
`setComponentVisibility`, `setContentOrientation`, `setVisibility`,
`setWorldTransform`, `snapshot-observation`, and `undo`.

## Dependency waves and selected next slice

| Wave | Cases | Actions / assertions | Dependency reason |
| --- | --- | ---: | --- |
| Geometry foundation (next) | `LAY-004 -> REN-007` | 10 / 37 | The completed signed-affine bounds source feeds upright/flip basis, relation endpoints, relation-local conversion, and hit geometry. |
| Asset ownership | `AST-001 -> REN-005 -> REN-008 + REN-010` | 19 / 67 | Global alias/cache leases and required/optional failure semantics must exist before image source replacement can make truthful stale-completion and no-leak claims. |
| Deterministic animation | `REN-009` | 4 / 13 | Requires semantic/presentation separation, contract time, `easeOutCubic`, settled delivery, and range upload; it should not be hidden inside ordinary patch. |
| International text | `REN-006 -> REN-011` | 10 / 50 | Standalone deterministic layout and font fallback precede split/auto-font/overflow item text; `REN-011` also consumes upright orientation. |
| Stacking/history closure | `LAY-003` | 4 / 9 | Dense z-order is present, but the exact undo/redo trace requires the later authoritative history tranche. |

### Recommendation

Implement **`LAY-004`, then `REN-007`** as the next dependency-coherent slice.
It has 10 actions, 9 unique action types, 37 assertions, one checkpoint, and the
domains `scene`, `geometry`, `paint`, and `interaction`.

Selection rationale:

1. `LAY-004` extends the completed bounds service with signed bases and upright
   counter-transforms instead of introducing a second transform model.
2. `REN-007` then consumes exact visible world bounds and affine conversions;
   implementing relations first would bake the current axis-aligned/straight
   endpoint approximation into another layer.
3. This slice has no dependency on global `Assets`, deterministic text shaping,
   bar time semantics, or history, so those high-risk domains remain separately
   reviewable.
4. No journey becomes complete from these two cases alone. `REN-007` removes
   the rendering blocker from `CSM-011`; that journey then remains blocked only
   by its `SEL-001/003/004/005/009` and `QRY-001` dependencies. The geometry
   kernel also becomes a prerequisite for later viewport, selection,
   transformer, and fit work even where the manifest does not repeat the ID.

## Exact ordered traces, checkpoints, and assertions

Notation is `path operator JSON-value`; an omitted value means the operator has
no normative value operand. Paths and values below are copied from
`catalog-normalized-expected.v1.json`; traces/checkpoints come from
`catalog-fixtures.v1.json`.

### REN-005 — 4 actions, 28 assertions

Domains: `scene, geometry, paint, interaction, resources`.

Actions:

1. `loadDataset {"datasetId":"image-specimens"}`
2. `resolveAsset {"targetId":"descriptor","requestId":"old","completeAtMs":100}`
3. `replaceSource {"targetId":"descriptor","source":"fixture-image","timeMs":20}`
4. `completeAsset {"requestId":"old","timeMs":100}`

Checkpoint: `{"id":"images","phase":"after-action","afterActionIndex":3,"paths":["descriptor/worldBounds"]}`.

Assertions:

```text
/resources/images/alias/bounds orderedEq [0,0,80,40]
/resources/images/url/bounds/width eq 64
/resources/images/descriptor/source eq "fixture-image"
/resources/images/descriptor/staleAttachCount zero
/resources/images/descriptor/hitBounds eq {"$ref":"/captures/images/descriptor/worldBounds"}
/resources/abandonedRequests noLeak
/scene/revision finite
/geometry/finiteValueCount gte 0
/paint/commandCount gte 0
/interaction/activeGestureCount gte 0
/resources/images/data-uri/sourceKind eq "data-uri"
/geometry/images/data-uri/worldBounds orderedEq [100,120,16,8]
/paint/images/data-uri/opacity eq 0.5
/scene/images/data-uri/zIndex eq 3
/geometry/images/transformed/worldBounds orderedEq [145,115,10,20]
/scene/images/transformed/zIndex eq 4
/scene/images/hidden-image/renderObjectCount zero 0
/interaction/images/hidden-image/hit eq false
/paint/images/hidden-image/opacity eq 0.25
/geometry/images/failed-image/placeholderBounds orderedEq [220,40,32,32]
/interaction/images/failed-image/hitProbe eq {"point":[236,56],"target":"failed-image"}
/paint/images/failed-image/role eq "asset-placeholder"
/outcome/images/failed-image/diagnosticCount eq 1
/resources/images/alias eq {"authoredSource":"fixture-image","normalizedResourceIdentity":"fixture-image@1","cacheIdentity":"alias:fixture-image","state":"resolved"}
/resources/images/url eq {"authoredSource":"https://assets.example.test/image.png","normalizedResourceIdentity":"fixture-url-image-64x32@1","cacheIdentity":"url:https://assets.example.test/image.png","state":"resolved"}
/resources/images/descriptor/initial eq {"authoredSource":{"src":"https://assets.example.test/image.svg","data":{"resolution":2}},"normalizedResourceIdentity":"fixture-svg-image@resolution-2","cacheIdentity":"descriptor:https://assets.example.test/image.svg?resolution=2","state":"resolved"}
/resources/images/data-uri eq {"authoredSourceKind":"data-uri","normalizedResourceIdentity":"fixture-data-uri-svg-16x8@1","cacheIdentity":"data-uri:fixture-data-uri-svg-16x8","state":"resolved"}
/resources/images/transformed eq {"authoredSource":"fixture-image","normalizedResourceIdentity":"fixture-image@1","cacheIdentity":"alias:fixture-image","reusedResolvedResource":true,"state":"resolved"}
```

### REN-006 — 6 actions, 30 assertions

Domains: `scene, geometry, text, paint, interaction`.

Actions:

1. `loadDataset {"datasetId":"standalone-text"}`
2. `snapshot-observation {"label":"initial-text"}`
3. `patch {"targetId":"text","changes":{"text":"مرحبا world"}}`
4. `patch {"targetId":"rapid-text","changes":{"text":"intermediate"}}`
5. `patch {"targetId":"rapid-text","changes":{"text":"final中"}}`
6. `publishFrame {"timeMs":16.666667}`

Checkpoint: `{"id":"text","phase":"after-action","afterActionIndex":5,"paths":["worldBounds"]}`.

Assertions:

```text
/text/content eq "مرحبا world"
/text/lines orderedEq ["مرحبا world"]
/text/fontRuns orderedEq [{"text":"مرحبا world","font":"unifont-base-16.0.04"}]
/text/layoutBounds eq {"x":0,"y":0,"width":88,"height":20}
/text/worldBounds eq {"x":4.823619,"y":20,"width":90.177854,"height":42.094592}
/text/hitBounds eq {"$ref":"/captures/text/worldBounds"}
/text/staleGlyphCount zero
/scene/revision finite
/paint/commandCount gte 1
/interaction/activeGestureCount zero
/text/phases/initial-text/source eq "A\r\n中😀é"
/text/phases/initial-text/lines orderedEq ["A","中😀é"]
/text/phases/initial-text/layoutBounds orderedEq [0,0,40,40]
/text/empty/visibleText eq ""
/text/empty/layoutBounds orderedEq [0,0,0,20]
/text/long/lines orderedEq ["ABCD","EFGH","IJ"]
/text/long/layoutBounds orderedEq [0,0,32,60]
/text/missingFont/fontRuns orderedEq [{"text":"fallback","font":"unifont-base-16.0.04","fallbackReason":"requested-font-unavailable"}]
/text/missingFont/layoutBounds orderedEq [0,0,64,20]
/text/rapid/visibleText eq "final中"
/text/rapid/layoutBounds orderedEq [0,0,56,20]
/text/rapid/intermediatePublicationCount zero 0
/text/rapid/staleGlyphCount zero 0
/scene/text/visible eq true
/scene/text/zIndex eq 0
/paint/text/opacity eq 1
/paint/text/style eq {"fontFamily":"Unifont","fontSize":16,"lineHeight":20,"letterSpacing":0,"fill":"#222222ff"}
/geometry/text/positionWorld orderedEq [10,20]
/geometry/text/rotationDegrees eq 15
/outcome/text/contentChangePreservedStyleAndTransform eq true
```

### REN-007 — 6 actions, 26 assertions

Domains: `scene, geometry, paint, interaction`. No checkpoint.

Actions:

1. `loadDataset {"datasetId":"relations"}`
2. `observeRelationPath {"relationId":"links","hitPoints":[[39,10],[60,60]]}`
3. `patch {"targetId":"b","changes":{"attrs":{"x":140,"y":60}}}`
4. `setVisibility {"targetId":"b","show":false}`
5. `setVisibility {"targetId":"b","show":true}`
6. `observeRelationContractMatrix {"valueRef":"relationContractMatrix"}`

Assertions:

```text
/scene/relations/segmentKeys/initial orderedEq ["a>a","a>b","b>a"]
/scene/relations/a>b/startWorld orderedEq [10,10]
/scene/relations/a>b/endWorld/afterMove orderedEq [150,70]
/scene/relations/duplicatePairCount zero
/scene/relations/hiddenB/visibleSegments orderedEq ["a>a"]
/scene/relations/staleSegments zero
/scene/revision finite
/scene/hierarchy/nodeCount gte 0
/geometry/finiteValueCount gte 0
/paint/commandCount gte 0
/interaction/activeGestureCount gte 0
/geometry/relations/selfLink/kind eq "polyline"
/geometry/relations/selfLink/worldPoints orderedEq [[10,0],[30,-10],[40,10],[30,30],[10,20]]
/geometry/relations/selfLink/worldBounds orderedEq [10,-10,30,40]
/interaction/relations/selfLink/hitProbe eq {"point":[39,10],"target":"a>a","tolerance":3}
/interaction/relations/selfLink/missProbe eq {"point":[60,60],"target":null}
/geometry/relations/contractMatrix eq {"initialSegmentKeys":["nested-item>grid.0.0","grid.0.0>nested-item"],"sourceCenterWorld":[120,80],"targetCenterWorld":[210,110],"sourceCenterRelationsLocal":[90,-90],"targetCenterRelationsLocal":[120,-180],"sourceCenterScreen":[170,260],"targetCenterScreen":[230,440],"sourceCenterAfterResizeWorld":[130,80],"finalSegmentKeys":["nested-item>grid.0.0"],"omittedMissingEndpointSegments":1,"visibleAfterGridHide":[],"visibleAfterGridShow":["nested-item>grid.0.0"],"style":{"color":"#123456ff","width":3,"opacity":0.75,"zIndex":-4,"visible":true}}
/paint/relations/nested-links/style eq {"color":"#123456ff","width":3,"opacity":0.75,"zIndex":-4,"visible":true}
/scene/relations/nested-links/segmentKeys/initial orderedEq ["nested-item>grid.0.0","grid.0.0>nested-item"]
/scene/relations/nested-links/segmentKeys/final orderedEq ["nested-item>grid.0.0"]
/outcome/relations/nested-links/omittedMissingEndpointSegments eq 1
/geometry/relations/nested-links/sourceCenterAfterResizeWorld orderedEq [130,80]
/interaction/relations/nested-links/sourceCenterScreen orderedEq [170,260]
/interaction/relations/nested-links/targetCenterScreen orderedEq [230,440]
/scene/relations/nested-links/visibleAfterGridHide orderedEq []
/scene/relations/nested-links/visibleAfterGridShow orderedEq ["nested-item>grid.0.0"]
```

### REN-008 — 4 actions, 10 assertions

Domains: `scene, geometry, paint, resources`.

Actions:

1. `loadDataset {"datasetId":"background"}`
2. `replaceComponentSource {"ownerId":"item","componentId":"bg","source":"fixture-image","timeMs":20}`
3. `setComponentVisibility {"ownerId":"item","componentId":"bg","show":false}`
4. `setComponentVisibility {"ownerId":"item","componentId":"bg","show":true}`

Checkpoint: `{"id":"initial","phase":"after-action","afterActionIndex":0,"paths":["id"]}`.

Assertions:

```text
/paint/background/data/size orderedEq [20,10]
/paint/background/visibleBounds orderedEq [0,0,100,80]
/paint/background/source eq "fixture-image"
/paint/background/staleTextureCount zero
/scene/hidden/renderObjectCount zero
/scene/shown/id sameIdentity {"$ref":"/captures/initial/id"}
/scene/revision finite
/geometry/finiteValueCount gte 0
/paint/commandCount gte 0
/resources/retainedDelta noLeak
```

### REN-009 — 4 actions, 13 assertions

Domains: `scene, geometry, paint, events, revisions`. No checkpoint.

Actions:

1. `loadDataset {"datasetRef":"interactive-scene","timeMs":0}`
2. `patch {"target":{"ownerId":"item-a","id":"bar"},"changes":{"size":{"width":60,"height":40}},"timeMs":0}`
3. `publishFrame {"timeMs":100}`
4. `publishFrame {"timeMs":200}`

Assertions:

```text
/paint/bar/semantic/height/return eq 40
/paint/bar/presentation/height/t0 eq 10
/paint/bar/presentation/height/t100 eq 36.25
/paint/bar/presentation/height/t200 eq 40
/paint/bar/presentation/height/t100 gte 10
/paint/bar/presentation/height/t100 lte 40
/paint/bar/settledEvents/count eq 1
/paint/bar/ghostCount zero
/scene/revision finite
/geometry/finiteValueCount gte 0
/paint/animation/activeCount gte 0
/events/totalCount gte 0
/revisions/frame/revision finite
```

### REN-010 — 3 actions, 11 assertions

Domains: `scene, geometry, paint, resources`. No checkpoint.

Actions:

1. `loadDataset {"datasetId":"icon"}`
2. `replaceSource {"target":{"ownerId":"item-a","id":"icon"},"source":"fixture-icon-2","timeMs":20}`
3. `patch {"target":{"ownerId":"item-a","id":"icon"},"changes":{"tint":"#00ff00ff"}}`

Assertions:

```text
/paint/icon/bounds/width eq 40
/paint/icon/bounds/height eq 15
/paint/icon/bounds/right eq 87
/paint/icon/bounds/top eq 12
/paint/icon/source eq "fixture-icon-2"
/paint/icon/tint eq "#00ff00ff"
/paint/icon/staleTextureCount zero
/scene/revision finite
/geometry/finiteValueCount gte 0
/paint/commandCount gte 0
/resources/retainedDelta noLeak
```

### REN-011 — 4 actions, 20 assertions

Domains: `scene, geometry, text, paint, revisions`. No checkpoint.

Actions:

1. `loadDataset {"datasetRef":"item-text-corpus"}`
2. `observeItemTextMatrix {"valueRef":"itemTextContractMatrix"}`
3. `patch {"target":{"ownerId":"item-a","id":"bidi"},"changes":{"text":"中😀é\nمرحبا"}}`
4. `publishFrame {"timeMs":16.666667}`

Assertions:

```text
/text/texts/zero/visibleText eq "AB😀CD"
/text/texts/zero/layoutBounds eq {"x":0,"y":0,"width":48,"height":20}
/text/texts/positive/lines orderedEq ["AB","😀C","D"]
/text/texts/positive/layoutBounds eq {"x":0,"y":0,"width":24,"height":60}
/text/texts/negative/visibleText eq "AB😀CD"
/text/texts/negative/lineCount eq 1
/text/texts/negative/layoutBounds eq {"x":0,"y":0,"width":48,"height":20}
/text/texts/bidi/visibleText eq "中😀é\nمرحبا"
/text/texts/bidi/lines orderedEq ["中😀é","مرحبا"]
/text/texts/bidi/layoutBounds eq {"x":0,"y":0,"width":40,"height":40}
/text/texts/bidi/staleGlyphCount zero
/text/texts/graphemeIntegrity eq true
/scene/revision finite
/paint/commandCount gte 4
/revisions/frame/revision finite
/text/contractMatrix orderedEq [{"id":"placed","source":"AB","placement":"right-bottom","margin":5,"tint":"#ff0000","localBounds":[219,135,16,20],"rgba":"#ff0000ff"},{"id":"auto","source":"ABCD","frame":[32,20],"autoFont":{"min":8,"max":18,"chosen":16},"visibleText":"ABCD","layoutBounds":[0,0,32,20]},{"id":"wrap","source":"ABCDEFGHIJ","wrapWidth":32,"lines":["ABCD","EFGH","IJ"],"layoutBounds":[0,0,32,60]},{"id":"overflow-visible","source":"ABCDEFGHIJ","frame":[32,20],"overflow":"visible","visibleText":"ABCDEFGHIJ","layoutBounds":[0,0,80,20]},{"id":"overflow-hidden","source":"ABCDEFGHIJ","frame":[32,20],"overflow":"hidden","visibleText":"ABCD","layoutBounds":[0,0,32,20]},{"id":"overflow-ellipsis","source":"ABCDEFGHIJ","frame":[32,20],"overflow":"ellipsis","visibleText":"ABC…","layoutBounds":[0,0,32,20]},{"id":"upright","source":"AB","placement":"center","itemAngle":37,"orientation":"upright","screenAngle":0,"layoutBounds":[0,0,16,20]}]
/paint/texts/placed/tint eq "#ff0000ff"
/geometry/texts/placed/localBounds orderedEq [219,135,16,20]
/geometry/texts/upright/screenAngle eq 0
/outcome/textContractMatrix/allRowsExact eq true
```

### LAY-003 — 4 actions, 9 assertions

Domains: `scene, paint, history`. No checkpoint.

Actions:

1. `loadDataset {"datasetId":"stacking"}`
2. `patch {"targetId":"low","changes":{"attrs":{"zIndex":6}}}`
3. `undo {"timeMs":10}`
4. `redo {"timeMs":20}`

Assertions:

```text
/scene/initial/renderOrder orderedEq ["low","first","second","high","selection","transformer"]
/scene/afterPatch/renderOrder orderedEq ["first","second","low","high","selection","transformer"]
/scene/hierarchy/equalZOrder orderedEq ["first","second"]
/scene/afterUndo/renderOrder orderedEq ["low","first","second","high","selection","transformer"]
/scene/afterRedo/renderOrder orderedEq ["first","second","low","high","selection","transformer"]
/scene/revision finite
/scene/hierarchy/nodeCount gte 0
/paint/commandCount gte 0
/history/depth gte 0
```

### LAY-004 — 4 actions, 11 assertions

Domains: `scene, geometry, interaction`.

Actions:

1. `loadOrientationMatrix {"itemId":"item"}`
2. `setWorldTransform {"rotationDegrees":90,"flipX":true,"flipY":false}`
3. `setContentOrientation {"itemId":"item","mode":"upright"}`
4. `observeOrientationMatrix {"valueRef":"orientationMatrix"}`

Checkpoint: `{"id":"before","phase":"after-action","afterActionIndex":0,"paths":["item/id"]}`.

Assertions:

```text
/geometry/follow-item/screenAngle/at90 eq 90
/text/upright/screenAngle/at90 zero
/text/upright/visibleCenter orderedEq [50,40]
/outcome/matrix/allAnglesFinite eq true
/outcome/matrix/allFlipCentersStable eq true
/interaction/modeChange/identity sameIdentity {"$ref":"/captures/before/item/id"}
/scene/revision finite
/geometry/finiteValueCount gte 0
/interaction/viewport/scale finite
/geometry/orientationMatrix orderedEq [{"id":"text-0","kind":"text","mode":"follow-item","screenBasis":[1,0,0,1],"visibleCenter":[50,40]},{"id":"icon-90","kind":"icon","mode":"follow-item","screenBasis":[0,1,-1,0],"visibleCenter":[50,40]},{"id":"bar-180","kind":"bar","mode":"follow-item","screenBasis":[-1,0,0,-1],"visibleCenter":[50,40]},{"id":"text-270","kind":"text","mode":"follow-item","screenBasis":[0,-1,1,0],"visibleCenter":[50,40]},{"id":"text-37","kind":"text","mode":"follow-item","screenBasis":[0.798636,0.601815,-0.601815,0.798636],"visibleCenter":[50,40]},{"id":"nested-67","kind":"icon","mode":"follow-item","screenBasis":[0.390731,0.920505,-0.920505,0.390731],"visibleCenter":[50,40]},{"id":"flip-x","kind":"bar","mode":"follow-item","screenBasis":[-1,0,0,1],"visibleCenter":[50,40]},{"id":"flip-y","kind":"icon","mode":"follow-item","screenBasis":[1,0,0,-1],"visibleCenter":[50,40]},{"id":"flip-xy","kind":"text","mode":"follow-item","screenBasis":[-1,0,0,-1],"visibleCenter":[50,40]},{"id":"negative-scale-37","kind":"bar","mode":"follow-item","screenBasis":[-0.798636,-0.601815,-0.601815,0.798636],"visibleCenter":[50,40]},{"id":"upright-nested","kind":"text","mode":"upright","screenBasis":[1,0,0,1],"visibleCenter":[50,40]}]
/outcome/orientationMatrix/allRowsExact eq true
```

### LAY-005 — completed checkpoint, 4 actions, 14 assertions

Domains: `scene, geometry, interaction, revisions`. No checkpoint.

Actions:

1. `loadBoundsMatrix {"datasetId":"bounds"}`
2. `queryBounds {"targets":["rotated","flipped","overflow-text","hidden","transparent-interactive","zero-size"]}`
3. `hitTest {"points":[[10,10],[210,10]]}`
4. `destroyTarget {"id":"rotated"}`

Assertions:

```text
/geometry/rotated/localBounds orderedEq [0,0,40,20]
/geometry/rotated/worldBounds orderedEq [-14.142136,0,42.426407,42.426407]
/geometry/rotated/screenBounds orderedEq [-14.142136,0,42.426407,42.426407]
/geometry/flipped/localBounds orderedEq [0,0,40,20]
/geometry/flipped/worldBounds orderedEq [40,0,40,20]
/geometry/overflow-text/worldBounds orderedEq [0,80,272,20]
/geometry/transparent-interactive/worldBounds orderedEq [200,0,20,20]
/interaction/transparent-interactive/hitCount eq 1
/geometry/zero-size/worldBounds orderedEq [240,0,0,0]
/scene/destroyed/rotated/queryCount zero
/geometry/bounds/revisionLag zero
/interaction/activeGestureCount zero
/scene/revision finite
/revisions/frame/revision finite
```

### AST-001 — 8 actions, 18 assertions

Domains: `revisions, resources, scene, outcome`. No checkpoint.

Actions:

1. `registerAssets {"instanceId":"A"}`
2. `registerAssets {"instanceId":"B"}`
3. `initializeWithRequiredAssetFailure {"alias":"required-fixture","source":"fixture://required-init-failure.png","expectedCode":"ASSET_LOAD_FAILED"}`
4. `acquireAsset {"instanceId":"A","alias":"device"}`
5. `acquireAsset {"instanceId":"B","alias":"device"}`
6. `destroy {"instanceId":"A"}`
7. `destroy {"instanceId":"B"}`
8. `registerAlias {"alias":"device","descriptor":{"src":"https://assets.example.test/other.png"}}`

Assertions:

```text
/paint/builtins/aliases contains ["object","inverter","combiner","device","edge","loading","warning","wifi"]
/text/fonts/weights orderedEq [300,400,500,600,700]
/resources/cache/device/resourceCount eq 1
/resources/cache/device/leaseCount/afterA eq 1
/resources/cache/device/leaseCount/afterB zero
/outcome/aliasConflict/code eq "ASSET_ALIAS_CONFLICT"
/outcome/requiredFailure/initState eq "rejected"
/resources/afterDestroy noLeak
/revisions/lifecycle/generation finite
/resources/assets/pendingCount gte 0
/scene/revision finite
/outcome/recorded eq true
/outcome/requiredFailure/code eq "ASSET_LOAD_FAILED"
/outcome/requiredFailure/initState eq "rejected"
/resources/requiredFailure/canvasCount zero 0
/events/requiredFailure/readyCount zero 0
/resources/requiredFailure/pendingCount zero 0
/resources/requiredFailure/leaseCount zero 0
```

## Current product gap inventory

| Case | Already present in current Core v2 | Promotion-blocking gap |
| --- | --- | --- |
| REN-005 | Direct image parsing covers source, size, opacity, transform, visibility, interactivity, and z-index; the leaf layer uses Pixi `Sprite` and URL-level shared leases. | Descriptor loader options are flattened to `src`; scene sources do not auto-acquire; no per-target request generation/stale-completion guard, deterministic placeholder/diagnostic, cache-identity probe, or Engine asset seam exists. |
| REN-006 | Standalone text normalization and a guarded ASCII `BitmapText`/Unicode `Text` branch exist. | Current width/wrap logic is a projection approximation; line height, letter spacing, baseline, grapheme/bidi/font runs, deterministic fallback, publication/stale-glyph proof, and a public text-layout probe are missing. |
| REN-007 | Ordered-pair normalization deduplicates links and aggregate Mesh/Graphics relation lanes draw resolved endpoint centers. | Self-links are dropped as zero-length lines; endpoint visibility is not part of resolution; relation-element transforms/local coordinates, transformed endpoint bounds, link-set mutation, cap/join parity, screen-space hit tolerance, and relation path probes are missing. |
| REN-008 | Background geometry now always covers the full item while authored `size` remains semantic; rect/image source kinds and visibility reconcile. | Rect-to-image replacement has no authoritative async asset state, stale-generation check, per-target texture status, or retained-resource observation. |
| REN-009 | One central scheduler, dense animation support, and Mesh dirty-bar range uploads exist. | Public bar mutation currently commits an ordinary immediate reconcile; `animateBarHeights` defaults to 240 ms/`easeInOut`, parser does not retain runtime animation policy, Engine publication ignores supplied time, and no settled event/semantic-versus-presentation probe exists. |
| REN-010 | Percentage sizing, content-box placement, margin, tint, source, visibility, and source/tint reconcile are present. | Asset source changes still bind unresolved white textures without request-generation, stale-texture, alias/cache, or no-leak evidence at the public Engine seam. |
| REN-011 | Semantic materialization preserves split, text style, auto-font/overflow fields, placement, margin, and tint. | Parser explicitly degrades nonzero split and advanced style; deterministic grapheme split, auto-font, wrap/overflow, international layout, upright orientation, and text probes are missing. |
| LAY-003 | Dense z-index sorting and stable authored order within equal z are present; overlay containers are separate. | Engine history is always depth zero and exposes no `undo`/`redo`; exact overlay order is not published as a product render-order probe. |
| LAY-004 | Rotation composition exists for the current flat projection. | Parser emits `content-orientation-unsupported`; signed scale/flips and world flips are not represented, and no screen basis/upright counter-transform or mode-change geometry publication exists. |
| LAY-005 | Exact local/world/screen/visible bounds, signed direct-rect projection, transformed hit rules, revision truth, and atomic `destroyTarget` now use the committed projection/reconcile authority. | Complete for the approved fixture; item/grid upright bases remain `LAY-004`, and clipped visible bounds remain outside this case's approved matrix. |
| AST-001 | The leaf layer reference-counts one Pixi `Assets` URL across instances, borrows externally owned cache entries, waits through release races, and unloads the last Core-owned lease. | There is no global descriptor-aware alias registry, built-ins/font catalog, per-instance security revalidation, required-init asset phase/failure rollback, conflict diagnostic, pending-user count, or public cache/lease observation. |

PixiJS routing implications: keep aggregate geometry in Mesh/Graphics lanes; keep
signed transforms and hit math in immutable numeric sidecars rather than restoring
per-entity Containers. Use Pixi `Assets.load`/`Assets.unload` only behind explicit
lease ownership. Continue routing dynamic ASCII/numeric strings to `BitmapText`, but
use guarded `Text` for CJK/Arabic/emoji and derive normative semantic layout from the
deterministic text contract rather than platform raster bounds.

## Direct journey dependencies

The immutable manifest has these direct edges:

- `REN-007 -> CSM-011`.
- `REN-006 + REN-011 -> CSM-027` and `CSM-029` (`REN-004` is already in the latter).
- `AST-001 -> CSM-032` together with `AST-002/003`, `EVT-006`, and `ERR-003`.
- `REN-005`, `REN-008`, `REN-009`, `REN-010`, and `LAY-003/004/005` are not named
  directly by a journey record. They still provide runtime prerequisites used by
  update, interaction, viewport, transformer, and cleanup capabilities.

## Concrete implementation plan for the selected slice

### Product

1. Add `src/core-v2/semantic/geometry.ts` as the single allocation-conscious
   affine kernel: compose 2x3 transforms, signed scale/flip, invert, apply,
   local/world/screen bounds, basis normalization, relation-local conversion,
   segment/polyline distance, and six-decimal observation rounding only at the
   probe boundary.
2. Extend `src/core-v2/contracts.ts` and `src/core-v2/parser.ts` with an immutable
   render-projection sidecar keyed by stable dense entity ID. Preserve signed
   scale and `contentOrientation`; do not put per-entity Pixi objects in it.
3. Update `src/core-v2/core.ts` reconciliation so semantic-only projection
   changes invalidate the affected dense slots even when the Core v1-compatible
   dense patch is empty. The parser projection and dense transaction must publish
   as one revision.
4. Update `src/core-v2/renderers/types.ts`, `pixi-renderer.ts`, `mesh-layer.ts`,
   `particle-layer.ts`, and `leaf-layer.ts` to consume projection matrices. Mesh
   remains the WebGL production lane; the Particle/Graphics competitor must use
   the same matrices. Upright text/icon/bar gets a counter-transform around the
   stable visible center without creating item Containers.
5. Extend `src/core-v2/engine.ts` geometry records with `localBounds`,
   `worldBounds`, `screenBounds`, `screenBasis`, and relation paths derived from
   that same sidecar. Add an atomic semantic `remove`/`destroyTarget` path through
   incremental reconcile; never call full `loadDataset` as a removal fallback.
6. Add world rotation and signed flips to the Engine/surface viewport contract,
   then make root hit testing and relation hit testing consume the inverse affine
   matrix. Hidden endpoints retain identity/geometry but suppress segments.
7. Represent non-self relations as aggregate segments and self-relations as the
   deterministic five-point polyline from the fixture. Deduplicate ordered pairs
   before dense materialization, preserve reverse pairs, and publish omitted
   dangling counts rather than creating placeholder segments.

Product tests:

- New `tests/core-v2/semantic-geometry.test.ts` for composition, inversion,
  signed basis, upright counter-transform, AABBs, and polyline distance.
- Extend `tests/core-v2/parser.test.ts` and
  `tests/core-v2/render-projection-closure.test.ts` for `scaleX`, nested signed
  transforms, orientation, and relation-local metadata.
- Extend `tests/core-v2/engine-geometry-probe.test.ts` for exact local/world/screen
  values, basis, revision alignment, hidden endpoint behavior, and self paths.
- New `tests/core-v2/engine-geometry-mutation.test.ts` for one-batch removal,
  stable unaffected refs, mode changes, and no full-load fallback.
- Extend `tests/core-v2/mesh-layer.test.ts` and
  `tests/core-v2/particle-layer.test.ts` for the identical projected vertices,
  hidden endpoints, self polylines, dirty ranges, and renderer parity.

### Expected-blind automation

- Add `scripts/verification/core-v2-contract/handlers/render-geometry.mjs` owning
  exactly the 13 selected action types and three exact traces. It may read fixture
  params but must not import normalized expected evidence.
- Add `scripts/verification/core-v2-contract/fold-render-geometry.mjs` projecting
  only public Engine snapshots, geometry/relation probes, event journal, captures,
  and cleanup into all fourteen domains.
- Add `tests/core-v2/contract-render-geometry-handlers.test.ts` for exact trace,
  operands, immutable input, product-call sequencing, capture, and refusal paths.
- Add `tests/core-v2/contract-render-geometry-fold.test.ts` for exact source
  provenance, unavailable-domain honesty, reference resolution, and all 51
  assertion comparisons without reading expected values inside handlers/fold.
- Register the handler/fold only in the execution composition; do not loosen the
  canonical action registry or default unknown-action failure.

### Focused Lab

- Extend `lab/performance-v2/contract/executable-cases.ts` from the then-current
  catalog count by exactly three cases, 14 actions, and the selected unique action
  types; preserve canonical routes and digests.
- Extend `lab/performance-v2/contract/executable-runtime.ts` with a
  `render-geometry` descriptor importing the same handler/fold modules used by
  automation.
- Keep the generic route/presenter shell in
  `lab/performance-v2/contract/route.ts` and `presenters.ts`; add scenario controls
  in `main.ts` only where the generic action trace cannot expose bounds/basis/path
  overlays.
- Extend `tests/core-v2/contract-lab-route.test.ts`,
  `contract-lab-execution.test.ts`, and `contract-product-integration.test.ts` to
  prove exact route identity, same runtime, cleanup, and product-owned geometry.
- Headed checkpoint: run all three routes and require zero console/network errors;
  visually verify bounds overlays, upright center stability, self-link shape,
  hidden endpoint suppression, and transformed hit probes.

### Targeted validation checkpoints

1. Geometry kernel and `LAY-005`: targeted unit/handler/fold tests, lint, and
   typecheck; require 14/14 exact assertions before adding orientation.
2. `LAY-004`: run the full 11-row basis matrix on both renderer strategies;
   require identical semantic geometry and stable visible centers.
3. `REN-007`: run relation renderer parity, hidden/show, self/reverse/duplicate,
   resize, dangling, and transformed hit tests; then run the three-route Lab build
   and headed checkpoint.
4. Only after those product/evidence changes are committed run the full contract
   verifier. The expensive performance matrix remains deferred until a renderer
   or final-candidate milestone.

## Risks and non-negotiable selection gates

- **Two transform truths:** rejected. Dense store and projection sidecar must be
  committed from one parsed candidate and carry the same revision; geometry,
  renderer, hit testing, relations, and overlays must consume the sidecar.
- **Object-per-entity fallback:** rejected. Signed/upright behavior is vertex or
  leaf-transform data, not a Container hierarchy restoration.
- **Platform Pixi bounds as normative geometry:** rejected. Pixi display bounds
  can be diagnostic, but immutable contract geometry comes from deterministic
  semantic matrices and text layout.
- **Relation rebuild fan-out:** relation indexes must map endpoint IDs to affected
  segment slots so endpoint changes dirty only those ranges.
- **Floating drift:** retain full precision internally and normalize only
  observation output; do not round renderer/store authority each frame.
- **WebGPU inference:** all selected promotion evidence is WebGL. WebGPU remains
  experimental and separately reported.
- **Windows evidence:** native Windows remains pending until measured on target
  hardware; Chromium development results cannot close it.

## Reproducible corpus-count check

The inventory was checked with a read-only Node snippet equivalent to:

```js
const ids = new Set([
  'REN-005', 'REN-006', 'REN-007', 'REN-008', 'REN-009', 'REN-010',
  'REN-011', 'LAY-003', 'LAY-004', 'LAY-005', 'AST-001',
]);
const fixtures = require('./docs/reference/core-v2-functional-contract/evidence/catalog-fixtures.v1.json');
const expected = require('./docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json');
const selected = fixtures.cases.filter((entry) => ids.has(entry.id));
const assertions = expected.cases.filter((entry) => ids.has(entry.id));
console.log({
  cases: selected.length,
  actions: selected.reduce((sum, entry) => sum + entry.actionTrace.length, 0),
  types: new Set(selected.flatMap((entry) => entry.actionTrace.map((action) => action.type))).size,
  assertions: assertions.reduce((sum, entry) => sum + entry.expected.assertions.length, 0),
  checkpoints: selected.reduce((sum, entry) => sum + entry.captureCheckpoints.length, 0),
});
// { cases: 11, actions: 51, types: 28, assertions: 190, checkpoints: 4 }
```
