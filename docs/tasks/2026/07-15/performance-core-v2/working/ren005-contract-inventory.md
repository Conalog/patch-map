# REN-005 contract inventory

## Purpose and authority

This working note inventories the approved `REN-005 — Render standalone images`
contract without changing any approved fixture or expected evidence. The normative
inputs are:

- `scenarios/rendering-layout-assets.md` (`REN-005` and the scene-asset placeholder profile);
- `evidence/catalog-typed-cases.v1.json` (`REN-005` action/capture/domain declaration);
- `evidence/catalog-fixture-profiles.v1.json` (`image-specimens`, manual clock, WebGL2 environment);
- `evidence/catalog-normalized-expected.v1.json` (the 28 canonical JSON-pointer assertions);
- `semantic-observation.md` (geometry, identity, visibility, hit, and diagnostic rules).

The route is `/lab/core-v2?scenario=REN-005&size=<SIZE>&seed=<SEED>`, the automation
owner is `core-v2-contract/REN-005`, and the focused root is `scenario-ren-005`.
Only the normalized JSON-pointer paths below are canonical; the typed case's shorter
`images.*` paths are source notation and normalize some values under `resources`.

## Contract snapshot

- Priority: P0 capability.
- Actions: 4 (`loadDataset`, `resolveAsset`, `replaceSource`, `completeAsset`).
- Assertions: 28, indexed `0..27` exactly once below.
- Required observation domains declared by the case: `scene`, `geometry`, `paint`,
  `interaction`, `resources`.
- One assertion also targets `outcome` even though `outcome` is not present in the
  case's `requiredObservationDomains` array. Approved evidence is immutable, so the
  implementation and fold must still populate `outcome`; do not add it to the approved
  declaration or drop assertion 22.
- Capture: `images`, after action index 3, path `descriptor/worldBounds`.
- Volatile fields are only `provenance.codeCommit`,
  `provenance.packedPackageSha256`, and `environment.browserVersion`.
- Fixture environment: manual clock starting at 0 ms, 16.666667 ms frame step,
  800×600 CSS pixels, DPR 1, WebGL2, locale `und`, reduced motion disabled.

### Dataset selection trap

The `rendering-specimens` profile's default `datasetRef` is `all-kinds-scene`, but
REN-005 action 0 explicitly loads `datasetId: image-specimens`. Therefore the seven
records in `datasets.image-specimens` are the product input for this case. A generic
profile bootstrap must not leave `all-kinds-scene` loaded or merge it with these seven
records.

## Action and source-replacement timeline

| Action | Logical time | Exact operation | Required product effect |
| --- | ---: | --- | --- |
| A0 / index 0 | 0 ms baseline | `loadDataset({datasetId: "image-specimens"})` | Materialize the seven records immutably; retain stable IDs, authored sources/options, geometry, opacity, visibility, and z-order; establish the fixture resource states and the failed target's placeholder/diagnostic. |
| A1 / index 1 | scheduled for 100 ms | `resolveAsset({targetId: "descriptor", requestId: "old", completeAtMs: 100})` | Register a target-qualified pending request/ticket for the descriptor without changing logical identity or allowing an address/native-resource identity into observations. |
| A2 / index 2 | 20 ms | `replaceSource({targetId: "descriptor", source: "fixture-image", timeMs: 20})` | Atomically change the target's current authored source to the resolved alias, advance its source generation, bind the replacement, and invalidate the old request before it can attach. Target ID and 32×32 geometry remain stable. |
| A3 / index 3 | 100 ms | `completeAsset({requestId: "old", timeMs: 100})` | Settle and release the old request. It must neither overwrite the replacement nor publish stale pixels. Terminal observation has `staleAttachCount = 0` and no abandoned request. Then capture `descriptor/worldBounds`. |

The implementation must keep two facts simultaneously: the approved initial descriptor
identity remains observable under `resources.images.descriptor.initial`, while the
terminal current source is `fixture-image`. Generation/ticket validation happens before
texture attachment and before frame publication. A stale success still settles and
releases its lease; it is not silently forgotten.

## `image-specimens` inventory

| ID | Authored input | Geometry / state | Required identity or behavior |
| --- | --- | --- | --- |
| `alias` | source `fixture-image`; size 80×40 | top-left (0,0), visible | Bounds `[0,0,80,40]`; alias cache identity `alias:fixture-image`; normalized identity `fixture-image@1`. |
| `url` | source `https://assets.example.test/image.png`; size 64×32 | top-left (0,0), visible | Width 64; direct-URL cache identity and fixture-normalized identity must remain distinct from an alias. |
| `descriptor` | `{src:"https://assets.example.test/image.svg",data:{resolution:2}}`; size 32×32 | top-left (0,0), visible; source replaced at 20 ms | Descriptor options are identity-bearing. Record the initial descriptor identity, then preserve target identity/bounds while the current source becomes `fixture-image`; old completion cannot attach. |
| `data-uri` | inline 16×8 SVG data URI; size 16×8; opacity 0.5 | (100,120), zIndex 3 | Classify as `data-uri` without exposing the full URI as normalized identity; exact bounds, opacity, and stacking survive. |
| `transformed` | source `fixture-image`; size 20×10 | authored top-left (140,120), angle 90°, zIndex 4 | Center-pivot projection must preserve authored-origin semantics and yield transformed AABB `[145,115,10,20]`; reuse the alias's resolved resource. |
| `hidden-image` | source `fixture-image`; size 20×10; opacity 0.25; `show:false` | (180,120), zIndex -2 | Logical/query state and opacity remain observable, but render-object count is 0 and hit is false. Loading/reuse must not make it visible or interactive. |
| `failed-image` | source `fixture://failed-image.png`; no authored size | (220,40), zIndex 5 | Natural size is unavailable, so use the approved 32×32 world fallback. Keep logical identity, placeholder bounds/hit, `asset-placeholder` paint, and exactly one target-scoped failure diagnostic. |

Standalone tint is deliberately outside the strict dataset schema. REN-005 must not
invent a tint input or derive one from the placeholder. Opacity is independent from
visibility: hidden opacity 0.25 remains semantically observable even though it produces
no pixels or hit target.

## Complete 28-assertion map

`A0` means the initial dataset/resource settlement; `A1→A3` means the explicit stale
request race. All terminal values are observed after A3 unless the row names an initial
snapshot.

| # | Canonical path and expected predicate | Action provenance | Domain | Source fixture / implementation proof |
| ---: | --- | --- | --- | --- |
| 0 | `/resources/images/alias/bounds` `orderedEq [0,0,80,40]` | A0 | resources | `alias`; authored size and position copied to resource/image probe without native bounds dependence. |
| 1 | `/resources/images/url/bounds/width` `eq 64` | A0 | resources | `url`; authored width remains 64 after direct-URL resolution. |
| 2 | `/resources/images/descriptor/source` `eq "fixture-image"` | A2, guarded through A3 | resources | `descriptor`; terminal current source is the replacement alias. |
| 3 | `/resources/images/descriptor/staleAttachCount` `zero` | A1→A3 | resources | `descriptor` old request; generation check prevents late attachment/publication. |
| 4 | `/resources/images/descriptor/hitBounds` `eq {$ref:"/captures/images/descriptor/worldBounds"}` | A2→A3 + capture after A3 | resources | `descriptor`; semantic hit bounds and captured terminal transformed world bounds have one revision. |
| 5 | `/resources/abandonedRequests` `noLeak` | A1→A3 + destroy | resources | Exact product attempt `old` is generation-rejected; its controlled-backend token is released/unloaded; post-destroy runtime/backend resource, pending, lease, and cleanup counts are zero. |
| 6 | `/scene/revision` `finite` | A0→A3 terminal | scene | Whole case; published scene revision is finite after replacement and stale completion. |
| 7 | `/geometry/finiteValueCount` `gte 0` | A0→A3 terminal | geometry | Whole case geometry observer; no non-finite image/placeholder/transform values. |
| 8 | `/paint/commandCount` `gte 0` | A0→A3 terminal | paint | Whole case paint observer, including resolved images and placeholder role. |
| 9 | `/interaction/activeGestureCount` `gte 0` | A0→A3 terminal | interaction | Whole case interaction observer; image load actions do not create per-target gesture/listener state. |
| 10 | `/resources/images/data-uri/sourceKind` `eq "data-uri"` | A0 | resources | `data-uri`; source classifier recognizes the URI before transport/cache normalization. |
| 11 | `/geometry/images/data-uri/worldBounds` `orderedEq [100,120,16,8]` | A0 | geometry | `data-uri`; exact authored integer geometry. |
| 12 | `/paint/images/data-uri/opacity` `eq 0.5` | A0 | paint | `data-uri`; semantic opacity and Sprite alpha projection agree. |
| 13 | `/scene/images/data-uri/zIndex` `eq 3` | A0 | scene | `data-uri`; logical stacking survives aggregate leaf ordering. |
| 14 | `/geometry/images/transformed/worldBounds` `orderedEq [145,115,10,20]` | A0 | geometry | `transformed`; 20×10 quad, top-left (140,120), authored 90° rotation, transformed AABB. |
| 15 | `/scene/images/transformed/zIndex` `eq 4` | A0 | scene | `transformed`; stacking remains 4 after transform/resource reuse. |
| 16 | `/scene/images/hidden-image/renderObjectCount` `zero` | A0 | scene | `hidden-image`; `show:false` keeps zero Pixi leaf objects, including after shared alias resolution. |
| 17 | `/interaction/images/hidden-image/hit` `eq false` | A0 | interaction | `hidden-image`; root spatial hit predicate excludes semantic invisibility. |
| 18 | `/paint/images/hidden-image/opacity` `eq 0.25` | A0 | paint | `hidden-image`; retain authored paint intent while emitting no pixels. |
| 19 | `/geometry/images/failed-image/placeholderBounds` `orderedEq [220,40,32,32]` | A0 failed settlement | geometry | `failed-image`; no authored/natural size, hence exact approved fallback bounds. |
| 20 | `/interaction/images/failed-image/hitProbe` `eq {point:[236,56],target:"failed-image"}` | A0 failed settlement | interaction | `failed-image`; placeholder center is hittable through the root spatial index under ordinary visibility/interaction rules. |
| 21 | `/paint/images/failed-image/role` `eq "asset-placeholder"` | A0 failed settlement | paint | `failed-image`; semantic role is explicit, not inferred from `Texture.WHITE` pixels. |
| 22 | `/outcome/images/failed-image/diagnosticCount` `eq 1` | A0 failed settlement | outcome (asserted but undeclared) | `failed-image`; exactly one target-scoped diagnostic for this failed attempt, using the closed diagnostic envelope and sanitized asset identity. |
| 23 | `/resources/images/alias` exact object `{authoredSource:"fixture-image",normalizedResourceIdentity:"fixture-image@1",cacheIdentity:"alias:fixture-image",state:"resolved"}` | A0 | resources | `alias`; compare public semantic identities, never a Pixi `Texture` address. |
| 24 | `/resources/images/url` exact object `{authoredSource:"https://assets.example.test/image.png",normalizedResourceIdentity:"fixture-url-image-64x32@1",cacheIdentity:"url:https://assets.example.test/image.png",state:"resolved"}` | A0 | resources | `url`; direct URL remains a distinct cache-identity class. |
| 25 | `/resources/images/descriptor/initial` exact object `{authoredSource:{src:"https://assets.example.test/image.svg",data:{resolution:2}},normalizedResourceIdentity:"fixture-svg-image@resolution-2",cacheIdentity:"descriptor:https://assets.example.test/image.svg?resolution=2",state:"resolved"}` | A0 snapshot, retained through A2/A3 | resources | `descriptor`; deep authored descriptor and option-sensitive identity must survive parser/store flattening boundaries. |
| 26 | `/resources/images/data-uri` exact object `{authoredSourceKind:"data-uri",normalizedResourceIdentity:"fixture-data-uri-svg-16x8@1",cacheIdentity:"data-uri:fixture-data-uri-svg-16x8",state:"resolved"}` | A0 | resources | `data-uri`; observation is sanitized/stable and does not rely on the raw URI as a native cache key. |
| 27 | `/resources/images/transformed` exact object `{authoredSource:"fixture-image",normalizedResourceIdentity:"fixture-image@1",cacheIdentity:"alias:fixture-image",reusedResolvedResource:true,state:"resolved"}` | A0 | resources | `transformed`; share the canonical alias binding with `alias` while retaining a separate logical image target; reuse is derived from semantic consumer count, never decoded-object identity. |

Coverage self-check: indices `0..27` appear once; 28/28 assertions are mapped. The
authoritative per-row domain is the table. Counts are resources 12 (0–5, 10, 23–27),
scene 4 (6, 13, 15, 16), geometry 4 (7, 11, 14, 19), paint 4 (8, 12, 18, 21),
interaction 3 (9, 17, 20), and outcome 1 (22), totaling 28. Assertion 4 is a hit-bounds
claim but its canonical path places it in `resources`, so it is counted there.

### Immutable strict-equality conflicts observed during implementation

The expected-blind product fold emits every mapped leaf, but the canonical comparator
uses recursive exact equality for `eq`. Three parent assertions therefore cannot pass
at the same time as their required child assertions: `/resources/images/alias` omits
the required `bounds`, `/resources/images/url` omits the required `bounds`, and
`/resources/images/data-uri` omits the required `sourceKind`. First, repeat, and fresh
headed runs deterministically compare `25/28`; the three failures are exactly those
parent paths with `VALUE_MISMATCH`. Approved expected evidence remains unchanged.

## Exact semantic constraints

### Identity and resource ownership

- Preserve the caller's source object and nested `data.resolution` by value in semantic
  state; never retain mutable aliases and never flatten the descriptor to only `src`.
- Use a stable resource-reference/key in the dense image slot, backed by a source table
  that distinguishes alias, URL, descriptor+options, data URI, and failed fixture.
- Deduplicate the canonical alias binding for `alias` and `transformed`, but never merge
  their logical IDs or geometry. `reusedResolvedResource:true` is derived from the
  binding's semantic consumer count, not an object-identity comparison.
- Keep source-generation/request ledgers target-qualified. Replacement invalidates the
  old attachment right immediately; late success must release ownership after all live
  Sprite references have been replaced and a frame boundary has made that safe.

### Geometry, visibility, opacity, and hit

- Local origin is authored top-left. Angle input is degrees. World bounds are the
  transformed axis-aligned enclosure. The 90° transformed fixture has exact authored
  integer AABB `[145,115,10,20]`; do not sample Pixi raster bounds to produce it.
- `show:false` remains queryable but has no render object, pixels, point/box hit, or
  visible relation segment. Its authored opacity and logical zIndex/source remain data.
- A visible transparent/zero-alpha image can still hit when it has finite semantic hit
  bounds; visibility and alpha must not be conflated. This does not override the hidden
  fixture's `hit:false`.
- Entity Sprite/event mode stays `none`; root federated input plus the bounded spatial
  index performs the semantic hit. Do not add per-image listeners.
- Failed image placeholder geometry participates in query, point/box selection,
  relations, focus/fit, and transforms under ordinary predicates. The placeholder
  target is still the logical ID `failed-image`, not a synthetic entity ID.

### Failure and placeholder

- Authored size wins on failure. Only when authored size and natural size are both
  unavailable does the image use 32×32 world units; the former parser's generic 1×1
  missing-size fallback could not represent REN-005 and is no longer used here.
- Placeholder paint must carry semantic role `asset-placeholder` and a sanitized asset
  identity. Exact raster pixels are non-normative. A white unresolved Sprite by itself
  is not proof of placeholder semantics.
- Emit one target-scoped `ASSET_LOAD_FAILED`/`ASSET_FAILURE` diagnostic per failed
  attempt through the stable envelope. Do not leak the full data URI or unsafe source
  details. A successful retry/replacement atomically removes placeholder state without
  changing the target's logical identity.

## Implemented surface inventory

| Surface | REN-005 result | Remaining checkpoint work |
| --- | --- | --- |
| source/parser/projection | Lossless alias, URL, data URI, and full descriptor identity; 32×32 intrinsic fallback; exact four-matrix intrinsic recomputation; immutable input and stable slot/component identity. | Retain targeted projection and reconcile regressions. |
| dense Core/controller | Atomic source replacement and visibility patching; desired-signature ownership reservation; entity-addressable stale/failure history; initial-plus-bounded-recent attempt retention; single batched projection publication per intrinsic settlement. | Exact attempt generation/binding/source and backend token/key are cross-linked through terminal settlement, unload, and post-destroy zero probes. |
| aggregate Pixi leaf | Actual Sprite/placeholder/hidden behavior; deterministic `(zIndex, slot, entityId)` order; frame-safe release; O(1) binding counters and retirement; semantic shared-binding reuse without decoded-object identity. | Cross-kind stacking remains a later tranche by design. |
| engine/geometry/hit | Public image/attempt probes, intrinsic projection revision, transformed world/hit bounds, placeholder hit, hidden exclusion, and lifecycle failure aggregation. | Retain exact nested-affine and destroy/re-init coverage in the milestone suite. |
| automation/Lab | Four expected-blind actions, fourteen-domain fold, all 28 actual leaves with three immutable strict-equality conflicts exposed, exact post-destroy cleanup proof, click-only focused controls, seven-specimen observer, per-run main-thread metrics, and real Pixi WebGL execution. | Headed first/repeat/fresh passes 125/128 with only the three immutable conflicts, canvas 0→1→0, and browser errors zero. Packed ESM/CJS and 2+7 lifecycle checkpoints pass; generated result files remain at their immutable baseline. |

## Implementation order and proof gates

1. **Source model and parser closure.** Define a frozen normalized image-source record or
   stable resource-reference table; preserve descriptor options and classify
   alias/URL/data URI. Remove only the now-obsolete descriptor-degradation diagnostic.
   Preserve strict rejection/diagnosis for genuinely invalid sources. Add exact parser,
   input-immutability, deterministic identity, and missing-size tests.
2. **Dense image state.** Carry authored source identity, authored-size presence,
   logical target ID, source generation, resource state, and placeholder state outside
   Pixi object identity. Preserve slot identity across `replaceSource`.
3. **Fixture backend/resource resolver.** Map approved fixture sources to the exact
   normalized/cache identities in assertions 23–27. Deduplicate the alias physically,
   keep descriptor options distinct, sanitize data-URI/failed identities, and expose
   target/request probes.
4. **Action semantics and race.** Implement expected-blind `loadDataset`,
   `resolveAsset`, `replaceSource`, and `completeAsset` against the manual clock. Prove
   replacement at 20 ms invalidates request `old` before its 100 ms completion, never
   increments stale attach, and drains the request/lease ledger.
5. **Sprite/placeholder projection.** Attach resolved textures via the scoped asset
   session; retain aggregate containers and no entity listeners. Add an explicit
   placeholder paint path/role and frame-safe texture replacement/unload. Hidden targets
   allocate no Sprite even when the shared alias is ready.
6. **Geometry and interaction closure.** Compute source-independent semantic bounds,
   exact transformed AABB, 32×32 failed fallback, and root-index hit results. Publish
   scene/geometry/hit/paint/resource state under one revision before capture.
7. **Observation and capture.** Produce all five declared domains plus the asserted
   `outcome` record. Capture terminal `descriptor/worldBounds` after action 3 and make
   assertion 4 compare against that capture, not a duplicate hard-coded value.
8. **Independent automation and focused Lab.** Unit-test source classification,
   identities, hidden/opacity, placeholder/diagnostic, transform, shared reuse, stale
   completion, cleanup, and deterministic replay. Then connect the expected-blind fold
   and `/lab/core-v2?scenario=REN-005...` delayed/failing chooser; run headed WebGL2
   with zero console/network errors and package/lifecycle checks proportional to the
   asset changes.

## Selection / rejection criteria

Accept the implementation only if all approved 28 assertions are compared from actual
product observations, the exact three immutable parent conflicts remain visible,
request/texture ownership returns to baseline, and the route uses
the same action handler as automation. Reject designs that flatten descriptors, use
Pixi object addresses as identity, create per-image event listeners/tickers, treat
`Texture.WHITE` as implicit placeholder evidence, keep 1×1 for the failed no-size
fixture, attach the late old texture even transiently, or repair failures by changing
canonical expected evidence.
