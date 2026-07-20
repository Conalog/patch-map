# REN-005 product architecture plan

Status: implemented checkpoint for `REN-005`; approved fixture, normalized expected, and review evidence remain immutable.

## Product outcome

`REN-005` makes a standalone PATCH MAP v0.10 `image` a dense Core v2 entity whose authored asset source, geometry, opacity, visibility, stacking, hit behavior, and lifecycle remain observable without introducing an entity container, listener, ticker, or frame closure. Pixi owns only one aggregate image container and one `Sprite` leaf per currently visible image. The dense store, immutable projection sidecar, root hit index, and AST-001 asset session remain authoritative.

The implementation must accept all four approved source forms directly:

- registered alias string -> `CoreV2AssetSession.acquire(alias)`;
- absolute URL string -> `acquireSource(url)`;
- data URI string -> `acquireSource(dataUri)`;
- descriptor object -> `acquireSource(descriptor)`, retaining descriptor data such as `resolution` in identity.

No source form is rewritten to another source form. The caller-owned value is cloned/frozen by materialization and no mutable reference is retained.

## Pre-implementation gaps closed by this checkpoint

1. `parser.ts::assetSource` previously collapsed a descriptor to `src` and emitted `asset-resolution-degraded`, destroying descriptor identity and making equal-`src`/different-`data` descriptors indistinguishable.
2. `AggregateLeafLayer` previously understood only a manually loaded `alias -> URL` table; scene images did not acquire aliases, direct sources, and descriptors through AST-001 paths.
3. The image source was indexed only by the dense string channel, with no immutable authored-source/source-kind/cache-identity observation record.
4. `Texture.WHITE` represented every unresolved image without an explicit loading/failed role, target diagnostic, or deterministic failure probe.
5. Manual alias generations existed, but image slots lacked a source-generation guard against late completion after semantic replacement.
6. Missing authored dimensions had no authored-versus-intrinsic policy or completion-driven projection/hit update. REN-005 now uses a deterministic provisional/failure `32 x 32` box and replaces it with decoded logical dimensions only after a current successful resolution.
7. Image child order followed insertion history and ignored the stored `zIndex` inside the image lane.
8. Asset completion lacked one central invalidation and post-frame lease-finalization path.

## Data and projection contract

The implementation keeps an immutable image record in the Core v2 projection index;
descriptor objects do not enter the hot typed arrays:

```ts
interface CoreV2ImageProjection {
  readonly entityId: string;
  readonly authoredSource: CoreV2AssetSource;
  readonly sourceKind: 'alias' | 'url' | 'data-uri' | 'descriptor';
  readonly bindingKey: string;
  readonly cacheIdentity: string;
  readonly authoredSize: boolean;
  readonly dimensionMode: 'authored' | 'intrinsic' | 'layout';
  readonly intrinsicTransform?: CoreV2ImageIntrinsicTransform;
}

interface CoreV2ImageIntrinsicTransform {
  readonly parentAffine: CoreV2AffineMatrix;
  readonly localTranslationAffine: CoreV2AffineMatrix;
  readonly localRotationScaleAffine: CoreV2AffineMatrix;
  readonly localPivotScaleAffine: CoreV2AffineMatrix;
}

interface CoreV2ProjectionIndex {
  // existing fields
  readonly imagesByEntityId?: Readonly<Record<string, CoreV2ImageProjection>>;
}
```

`bindingKey` is a canonical semantic key, produced by one pure source normalizer shared by the semantic parser and AST adapter. It includes the complete normalized descriptor, not just `src`. It is not the friendly fixture resource name and is not an alias masquerading as a URL. The dense `source` column carries this stable binding key for range reconciliation, while the sidecar is the lossless product record used for acquisition and observation. The four exact affine matrices retain ancestor shear/reflection, authored translation, rotation/signed scale, and size-dependent center-pivot authority without lossy decomposition.

The parser must remove `asset-resolution-degraded` for a valid descriptor. Invalid source forms still produce the existing deterministic invalid-source diagnostic and missing-asset binding. Reconcile compares `bindingKey`; changing descriptor data with an unchanged `src` is therefore a real dirty image update. Stable entity ID, slot, component identity, and input immutability do not change.

### Dimensions and fit

- Authored `size` wins permanently. It defines projection bounds, Sprite stretch-to-box dimensions, placeholder bounds, and hit bounds independently of texture resolution.
- Missing `size` means `dimensionMode: intrinsic`. Until resolution, use the deterministic `32 x 32` provisional box; failure retains that exact fallback when neither authored nor decoded size exists.
- On successful intrinsic resolution, the renderer reports `{entityId, bindingKey, generation, naturalSize}` to the Core. Core accepts it only if the current sidecar still has that binding and generation, batches every accepted resolution into one immutable projection replacement per settlement/frame, recomputes the authored center pivot from the four exact matrices, increments public geometry revision, and rebuilds the bounded hit index. Nested nonuniform rotation, ancestor shear/reflection, geometry, hit, and Sprite therefore consume the same projection rather than three independently measured boxes.
- Texture resolution metadata affects decoded logical intrinsic dimensions only. It never multiplies an authored box.
- The approved standalone image schema has no object-fit variant. Its fit is stretch/fill of the authored box. An unknown future fit field must be diagnosed as unsupported rather than silently interpreted.

Projection recomputation must use the existing exact `projectCoreV2SignedRect`/affine path. Do not decompose reflected/sheared matrices, assign `Sprite.width/height`, or derive hit geometry from Pixi bounds. `resolveCoreV2SlotQuad` remains the single render geometry adapter.

## Aggregate leaf asset state machine

The former alias-only maps are replaced by binding-level state and slot consumers:

```text
idle -> pending -> resolved
                 -> failed
pending/resolved/failed -> released when consumer count is zero
any state -> destroyed
```

Each binding stores normalized authored source, source kind, AST acquisition, texture, intrinsic size, state, request generation, scalar consumer/render/placeholder counters, and release state. Each image slot stores only `bindingKey` and slot generation. Shared aliases/descriptors create one binding/acquisition and many Sprite consumers. Probe and retirement paths remain O(1); they do not scan scene-wide slots or replicate stale outcomes per shared consumer.

During `syncImage`:

1. Read the image sidecar and move the slot atomically from its old binding consumer set to its new one.
2. If visible and binding is idle, start one binding-level acquisition. Promise continuations are per binding/lifecycle operation, not per frame or per entity ticker.
3. Render a deterministic shared placeholder Sprite while pending or failed. A failed Sprite is labeled `core-v2:image-placeholder`, has observer role `asset-placeholder`, uses the same exact projection and opacity, and remains selectable through the root dense hit index. The placeholder's internal visual color is package UI, not authored standalone tint.
4. On success, require a Pixi `Texture`, record its intrinsic logical size, then dirty only current consumer slots. A slot attaches pixels only when both `bindingKey` and generation still match.
5. On failure, retain the placeholder and emit one structured `ASSET_LOAD_FAILED` diagnostic per target entity and binding generation. Shared resource failure may therefore have one physical failure but one target-addressable diagnostic for each affected entity.
6. On hidden/dead/non-image sync, remove and destroy only that Sprite, unindex the slot, and release the binding when it has no consumers. Hidden images have zero render objects and are excluded by the existing visibility-aware hit path. Their authored opacity and source remain observable from dense/sidecar state.

Reconciliation first reserves every desired request signature before retiring prior
owners. A compatible pending/resolved binding therefore survives an `A -> B` ownership
transfer within one commit instead of being unbound and reacquired. Each target keeps
the immutable initial attempt plus a bounded rolling recent history (limit 8); pruning,
removal, and destroy sever the binding backlink and diagnostic ownership so descriptor
objects cannot be retained by a settled binding. Stale completion counters remain
entity-addressable even when many targets consume one binding.

The image container keeps `sortableChildren = false`; every Sprite retains its dense semantic `zIndex`, while the aggregate layer explicitly applies `(zIndex, stable slot, entityId)` order only when image ordering is dirty. This prevents pending/resolved/placeholder replacement history from changing equal-z overlap. Cross-lane z ordering remains a later stacking tranche concern and must not be claimed by REN-005.

### Central invalidation and safe release

`AggregateLeafLayer` receives one renderer-owned callback such as `onAssetTransition(bindingKey, dirtySlots, outcome)`. PixiRenderer merges the slots into dirty ranges, invalidates with a stable reason, and schedules one manual frame through the existing central scheduler. No image owns a ticker, listener, RAF, or gesture closure.

When a source is replaced, the old Sprite is first changed to the new resolved texture or placeholder and one frame is rendered. Only after that frame may the old AST acquisition enter `finalizeAssetUnloads`. A late old completion is allowed to populate a still-consumed old shared binding, but it cannot attach to the replaced slot. If no consumer remains, its acquisition is released immediately after settlement. Destroy invalidates every generation, destroys Sprites before releasing owned acquisitions/session state, and releases late successes without scheduling a frame.

Expose a read-only product probe for independent automation, not fixture-specific expected synthesis:

- authored source/source kind and current binding;
- AST `cacheIdentity`, resource state, consumer/lease counts;
- render role and render-object count;
- intrinsic/authored/effective dimensions;
- failed diagnostic count by target;
- suppressed stale completion count and stale attachment count;
- abandoned request/release count.

Friendly values such as `fixture-image@1` are supplied by the controlled fixture backend's decoded resource probe. Product code must not hard-code REN-005 expected values or infer them from assertion paths. `cacheIdentity` remains the source-form observation (`alias:...`, `url:...`, `descriptor:...`, `data-uri:...`) at the scenario adapter boundary while AST-001's hashed physical cache identity remains available separately. `reusedResolvedResource` is true only when the same semantic binding has multiple consumers; decoded resource object identity is neither observed nor inferred.

## Assertion ownership (28/28 produced; 25/28 strict comparisons pass)

| # | Approved observation | Product owner / proof |
|---:|---|---|
| 1 | alias bounds `[0,0,80,40]` | authored-size projection + geometry snapshot |
| 2 | URL bounds width `64` | authored-size projection |
| 3 | descriptor current source `fixture-image` | slot source replacement commits semantic sidecar before old completion |
| 4 | descriptor stale attach count `0` | slot binding/generation equality gate |
| 5 | descriptor hit bounds equal captured world bounds | root hit index and geometry snapshot share projection |
| 6 | abandoned requests `noLeak` | exact stale attempt + backend token release/unload + post-destroy runtime/backend zero probes |
| 7 | finite scene revision | existing atomic load/reconcile revision |
| 8 | finite geometry values | exact affine projection and finite guards |
| 9 | paint command count nonnegative | leaf debug/probe aggregation |
| 10 | active gesture count nonnegative | existing root interaction scheduler |
| 11 | data URI source kind | lossless image sidecar classification |
| 12 | data URI bounds `[100,120,16,8]` | authored projection |
| 13 | data URI opacity `0.5` | dense opacity -> Sprite alpha/probe |
| 14 | data URI z `3` | dense z + explicit stable image-lane order/probe |
| 15 | transformed bounds `[145,115,10,20]` | exact authored affine projection at 90 degrees |
| 16 | transformed z `4` | dense z + Sprite zIndex |
| 17 | hidden render object count `0` | visibility removes Sprite and binding consumer |
| 18 | hidden hit `false` | visibility-aware entity hit index |
| 19 | hidden opacity `0.25` | dense semantic observation retained while not rendered |
| 20 | failure placeholder bounds `[220,40,32,32]` | authored/fallback projection reused by placeholder |
| 21 | failure hit target `failed-image` at `[236,56]` | placeholder entity remains visible/interactive in root hit index |
| 22 | failure paint role `asset-placeholder` | leaf render-role probe |
| 23 | failure diagnostic count `1` | once-per-target/binding-generation diagnostic ledger |
| 24 | alias authored/normalized/cache/state tuple | source sidecar + fixture decoded resource + AST probe |
| 25 | URL authored/normalized/cache/state tuple | direct-source acquisition/probe |
| 26 | descriptor initial authored/normalized/cache/state tuple | descriptor sidecar before replacement + generation history probe |
| 27 | data URI authored kind/normalized/cache/state tuple | direct-source acquisition/probe |
| 28 | transformed alias reused resolved resource | shared canonical binding + semantic consumer count |

## Implementation slices and targeted gates

1. **Lossless semantic source.** Add the image projection record and pure source classification/canonicalization; update parse/reconcile tests. Assert caller input unchanged, descriptor data preserved, URL and data URI not treated as aliases, deterministic binding key, and source replacement dirties the stable slot.
2. **Binding state machine.** Connect visible image sidecars to `acquire`/`acquireSource`; retain current explicit `loadAsset` API only as a host preload/registration compatibility seam. Unit-test shared acquisition, policy failure, decode failure, hidden consumer removal, once-only diagnostics, and post-frame unload.
3. **Projection/render/hit closure.** Apply authored/intrinsic dimensions, opacity, z, transforms, and deterministic placeholder. Extend orientation/projection tests to assert Sprite matrix equals `resolveCoreV2SlotQuad`; extend hit-index/engine bounds tests to prove identical transformed bounds.
4. **Race/lifecycle.** Deterministically delay descriptor completion, replace it at `20ms`, settle old at `100ms`, and prove no stale pixels, no old target binding, no lease/request residue. Repeat with destroy-before-completion and unload failure/retry behavior inherited from AST-001.
5. **Independent actual + focused Lab.** The expected-blind REN-005 handler derives all 28 observations from public engine/debug probes and geometry/hit APIs. The same route executes alias, URL, descriptor, data URI, transformed, hidden, and failed specimens plus the delayed replacement race. No route-local fake product values.

Minimum commands after implementation: targeted parser/reconcile/leaf/orientation/hit/engine asset tests; REN-005 actual runner and exact comparator; focused Lab verifier and headed browser console/network check; typecheck and lint. Run package and 2+7 memory gates because the change crosses the public engine asset lifecycle. Do not run the full 173 matrix until this implementation/evidence milestone is stable.

Checkpoint verification completed on 2026-07-20: the nine-route headed WebGL run
produced the same `125 pass / 3 immutable conflicts` for first, repeat, and a fresh
session; each lifecycle returned canvas count `0 -> 1 -> 0`, and console, page, and
network error counts were zero. The packed ESM/CJS consumer passed with four dense
entities and four aggregate render objects, capture support, and clean destroy. The
2+7 lifecycle run expanded 1,000 input items to 5,099 entities, retained a current-run
median of 94,475 JS-heap bytes, and released DOM, scheduler, and renderer resources.
Those package/memory reruns were observational checkpoints: their generated result
files were restored to the immutable baseline rather than committed as new evidence.

## Risk register and stop conditions

- **Projection divergence (highest):** intrinsic size cannot live only on Sprite. Stop landing if geometry, hit, and render do not consume the same immutable effective projection.
- **Descriptor identity loss (highest):** stop if two descriptors with equal `src` and different `data` share a semantic binding accidentally.
- **Stale attachment/leak (highest):** stop if replacement/destroy permits an old generation to mutate a current Sprite, or if late settlement leaves an AST lease/pending use.
- **Manual-render starvation:** completion must schedule exactly the needed aggregate frame; no polling/ticker workaround.
- **Premature texture release:** release only after a replacement frame has removed Pixi batch references; never destroy shared textures from `Sprite.destroy()`.
- **Diagnostic multiplication:** retries/source changes advance the target generation; rerenders do not emit duplicates.
- **URL classification/security:** only explicitly supported absolute schemes and data URIs enter direct acquisition, always through AST policy. Ambiguous relative strings remain aliases and fail explicitly if unregistered.
- **Ordering claim:** REN-005 closes image-with-image z order only. Cross-kind z order is a documented later tranche dependency.
- **Performance:** source classification and sidecar creation happen during normalization; per-frame sync compares stable keys and numeric generations. No descriptor serialization, URL parsing, Promise creation, Set allocation, or diagnostic formatting belongs in a steady rendered frame.

Landing is acceptable only when all 28 approved observations are produced without changing expected evidence, delayed replacement and destroy races release to zero, visible image count equals Sprite count, hidden image count is zero, and the focused headed route has zero console/network errors. The independent strict comparator currently reports exactly `25 pass / 3 fail`: assertions 23, 24, and 26 are immutable parent-object `eq` records that omit child fields simultaneously required by assertions 0, 1, and 10. They remain explicit `observed-contract-conflict` results rather than being hidden or repaired in actual output.
