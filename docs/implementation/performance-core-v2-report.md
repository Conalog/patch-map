# PATCH MAP Performance Core v2 final report

## Verdict

Core v2 selects the aggregate **Mesh** renderer on PixiJS v8 WebGL. The final candidate keeps the v0.10 parser and Core v1-derived dense store common to both spikes, separates stable rectangle/relation geometry from the dynamic bar lane, and synchronizes only dirty bar chunks during animation. It uses a small labeled Pixi scene, root-only federated events, the dense spatial index, and one invalidation/animation scheduler; it does not restore an object, listener, ticker, or closure per entity.

The production fixture expands directly and deterministically to 37,071 entities. Its 9,365 bars are source-hidden (`show: false`), so direct load correctly preserves 0 visible bars. The final benchmark therefore measures a separate visibility transaction before animation. In the independent final-candidate run that transaction took 135.1 ms, visible full-bar animation reached **42.8 ms p95**, and visible 10% bar animation reached **10.6 ms p95** under Chromium 4×.

Mesh remains the measured winner over Particle, but the final visible-production full-animation result is **9.5 ms (28.5%) above the 33.3 ms target**. Core v2 therefore does not receive production performance approval. Production normalization is also 2.28× slower than frozen Core v1, first-presentation and teardown costs are higher directionally, and the synthetic 2,000- and 5,000-input full-animation workloads also miss 33.3 ms. These unfavorable results are release constraints, not hidden outliers.

Functionally, the headed gate passed 31/31 checks with zero console, page, and network errors, including target → non-interactive clear → target restore → empty clear interaction, actual intermediate/final production bar changes, and non-zero Mesh upload after the visibility transaction. Packed ESM/CJS consumers, 40 files / 269 tests, and repeated lifecycle memory proof passed. Chromium 4× is only a development proxy. WebGPU was unavailable and remains experimental; native Windows validation remains **pending**.

## Measurement contract and environment

- Every performance row uses two warmups and seven measured trials. The raw trials, per-trial frame arrays, min, median, p95, and max summaries are retained in JSON.
- Synthetic inputs contain 100, 500, 1,000, 2,000, or 5,000 source items and expand to more dense entities. The production input is the existing v0.10 JSON and expands to 37,071 entities.
- Final performance environment: macOS arm64, Chromium 143.0.7499.4, 1280×720 at DPR 1, CDP CPU throttle 4×, WebGL2 through ANGLE/SwiftShader. The performance matrix is headless; the independent functional gate is headed.
- Unless a column says p95, performance values below are medians in milliseconds. “Frame p95” is the p95 across the seven trials' own per-frame p95 values, not a flattened pool of every frame.
- GPU prepare is public-lifecycle wall time around Pixi Prepare/render work, not a vendor GPU timestamp. Retained heap is JavaScript heap only and excludes browser-native, texture, and GPU allocations.

The final evidence contains **18 runs, 162 raw trials (36 warmups plus 126 measured), and 522 phase summaries**. The selected rows are independent final-candidate samples, not aliases of the spike-selection samples.

## Selected architecture

```text
PATCH MAP v0.10 JSON
  -> immutable schema parser + structured diagnostics
  -> dense store + ID/component/relation/spatial indexes
  -> atomic transactions + central animation table
  -> aggregate Pixi layers
       stable rect Mesh chunks
       dynamic bar Mesh chunks
       relation Mesh chunks
       texture-alias Sprite/image leaves
       BitmapText + guarded Text fallback
       one interaction overlay
  -> PixiJS WebGL, manual Prepare/render
```

The architecture makes the renderer replaceable while holding input interpretation and state mutation constant:

- `Application.init()` is asynchronous, `autoStart` is disabled, and rendering is invalidation-driven. A continuous frame loop exists only during an animation or gesture.
- The stage contains a few meaningful, labeled aggregate layers for PixiJS DevTools. Entity identity remains in dense indexes rather than one Pixi `DisplayObject` per entity.
- Fixed-capacity public `MeshGeometry` chunks aggregate rectangles, bars, and relations. The final bar-only fast path leaves stable rectangle/relation meshes untouched and updates dirty bar chunks. Because Pixi's public Buffer API does not prove portable arbitrary byte-offset uploads, this report claims dirty-chunk uploads, not arbitrary byte-range uploads.
- Image/icon assets use explicit Pixi Assets ownership and single-texture alias Sprite bindings. Unload first removes live bindings, renders a safe fallback frame, and then releases the cache entry, preventing stale texture use. Atlas JSON/Spritesheet frame selection is not implemented.
- ASCII text up to 128 characters uses `BitmapText`; non-ASCII or longer content uses the counted `Text` fallback. The guard does not route wrapping or advanced styles. The production fixture contains no source text entities, so the benchmark explicitly inserts one CJK fallback and always mutates it; seeded synthetic data additionally proves bulk `BitmapText` mutation.
- The stage alone owns federated events and a screen-sized hit area. Pointer coordinates are inverse-transformed through the current viewport, then the dense spatial index resolves the entity. Pan, cursor-centered zoom, reset, and fit do not require entity listeners.
- Capture uses Pixi Extract as an explicit diagnostic operation. Resize, asset teardown, geometry/text destruction, and application destruction follow explicit ownership order.
- No custom `RenderPipe`, custom batcher, or backend-specific shader was adopted. Public Mesh is the decisive relative winner, but its 42.8 ms visible-production result misses the target. A custom extension therefore remains a possible next optimization, not a completed claim; adopting one requires a new measured spike plus WebGL/WebGPU shader, package, browser, and lifecycle proof.

## Spike selection: Mesh versus Particle

Both spikes used the same direct parser, dense store, seeded changes, input JSON, browser, and 2+7 protocol. The table is the production selection checkpoint; the last column is the later independent Mesh final candidate.

| Production metric | Mesh spike | Particle spike | Final selected Mesh |
| --- | ---: | ---: | ---: |
| Expanded entities | 37,071 | 37,071 | 37,071 |
| Aggregate render objects | 657 | **35** | 657 |
| Application init | **24.0** | 24.1 | 25.0 |
| Normalize | 345.8 | 374.4 | 403.4 |
| Store load | **562.8** | 568.2 | 578.7 |
| Renderer build | 74.1 | 185.3 | **73.2** |
| GPU prepare | **6.9** | 15.2 | **6.9** |
| Direct-load first frame (bars hidden) | **34.6** | 365.5 | 40.2 |
| Pan/zoom frame p95 | 4.8 | **2.2** | 5.1 |
| Hidden-bar visibility setup | **128.7** | 623.1 | 135.1 |
| Full-bar schedule | 75.8 | **70.2** | 75.0 |
| Visible full-bar frame p95 | **46.3** | 642.8 | **42.8** |
| Visible 10% bar schedule | **13.0** | 20.4 | **12.4** |
| Visible 10% bar frame p95 | **7.4** | 695.1 | 10.6 |
| Injected CJK first render | **5.4** | 141.1 | **5.3** |
| Text change | **4.5** | 129.1 | 5.2 |
| Hit-test per operation | 0.0135 | 0.0131 | **0.0128** |
| Select | **6.5** | 70.8 | 6.6 |
| Resize | 658.3 | **575.8** | 661.0 |
| Destroy | **49.2** | 166.0 | 49.7 |
| Re-initialize | **23.1** | 25.6 | 23.2 |
| Retained JS heap | **23,796 B** | 25,076 B | **21,868 B** |

Every production bar carries a rounded radius and therefore takes Spike B's GraphicsContext fallback, whose aggregate descriptors/contexts are rebuilt on visible mutation. For this production rounded workload, the Particle candidate records zero dynamic, static-invalidated, and total Particle upload counters and zero phase upload chunks. That statement is deliberately production-scoped: synthetic 500/1,000/2,000/5,000 records show three uploaded chunks and two full-animation chunks with zero observed bytes, likely from square item-rectangle static invalidation. This matrix therefore does **not** establish a general ParticleContainer throughput result; it compares the complete Particle/Sprite/GraphicsContext candidate on the actual style mix.

On the visible-production spike, Mesh reduced direct-load first-frame time by 90.5%, visibility-setup time by 79.3%, full-animation frame p95 by 92.8%, and partial-animation frame p95 by 98.9%, while retaining 5.1% less JavaScript heap. The final separated bar lane lowered the independent full-animation p95 from the Mesh spike's 46.3 ms to 42.8 ms, but that improvement is insufficient to meet the 33.3 ms product target.

Particle does have real favorable intervals, and they are not hidden:

- Production pan/zoom p95 is 2.2 ms versus Mesh's 4.8 ms, and the CPU hit micro-operation is 0.0131 ms versus 0.0135 ms. Particle's transform-only path is faster when no dynamic geometry must be rebuilt.
- The rejected candidate's production full-bar scheduling call is also lower: 70.2 ms versus Mesh's 75.8 ms. Its actual GraphicsContext-backed visible-frame p95 is nevertheless 642.8 ms versus 46.3 ms, so the faster scheduling call does not translate to presentation throughput.
- Particle's production resize is lower at 575.8 ms versus Mesh's 658.3 ms. Both are expensive full-surface lifecycle operations, and the selected independent Mesh run remains similarly high at 661.0 ms.
- The rejected candidate submits only 35 aggregate render objects versus Mesh's 657 fixed chunks. That lower object count is a genuine structural advantage, but rounded-bar GraphicsContext reconstruction dominates the visible update result.
- Particle's pan/zoom p95 is lower at most synthetic scales. At 5,000 inputs it reaches 2.2 ms versus Mesh's 2.8 ms, while its full-animation frame p95 is 431.7 ms versus 91.2 ms.
- At the smallest synthetic cases, Particle occasionally wins text, selection, or retained-heap medians. The differences are small/noisy and reverse as the dynamic workload grows.
- Store-load variation is not renderer evidence because the dense store is common. Normalize is not completely common: the Mesh path performs a full-entity degradation-diagnostic scan, so its timing includes strategy-specific reporting work and cannot be interpreted as parser-only or renderer-throughput evidence.

The Particle/Sprite/GraphicsContext candidate remains available as a functionally tested rejected spike, not a production fallback. A future pure-Particle experiment would need a compatible square-corner style contract and new correctness/fidelity evidence.

The selected Mesh raw diagnostics preserve upload granularity: production full animation records 1,094–1,095 cumulative dirty-chunk uploads and about 8.99 MB per trial; randomly scattered 10% animation touches 825–945 cumulative chunks and about 8.96–8.98 MB. These are cumulative public-buffer observations across animation frames, not arbitrary byte-offset or vendor GPU counters.

## v0.10 schema support

The parser accepts the existing JSON value directly. It copies authoritative state, never mutates the caller object, preserves source/component identity, and reports unsupported or degraded interpretation rather than silently dropping records.

| Input surface | Rendered | Retained/indexed | Degraded with explicit diagnostic | Unsupported or atomic error |
| --- | --- | --- | --- | --- |
| Top-level/group | Recursive children; numeric transforms; `show`/`locked` project to visibility/interactivity | Caller `id`, path, type, label, raw attrs/metadata, nested identity | Missing ID receives a deterministic path ID and warning | Original `show`/`locked` booleans are projected, not separately raw-retained; unknown top-level fields have no implicit semantics |
| Grid/cells/item | Rectangular cell expansion, item size/padding, background/bar/icon/text components | Grid ID/path/raw attrs/metadata, cell string identity, item and component source identity | `inactiveCellStrategy: "hide"` expands cell `0` as hidden/non-interactive; an omitted strategy skips cell `0`; any other value warns and falls back to skipping inactive cells | `contentOrientation` emits `content-orientation-unsupported`, is a no-op, and is not retained; non-rectangular/arbitrary layout has no renderer implementation |
| Component identity | Background, bar, icon, and text occurrences; size/margin/placement project to normalized geometry | Exact source identity is `sourceElementId + componentPath` (component array index) `+ componentId/type`; each expanded entity is `instanceId::type:componentId` | Missing optional styling uses deterministic defaults; invalid or ambiguous supported values use documented warnings/fallbacks | Duplicate owner/type/ID produces a duplicate expanded ID and fails atomically; placement is not raw-retained; input `animation`/`animationDuration` emit `component-animation-unsupported` and are neither applied nor retained—the runtime API supplies duration |
| Direct rect | Transform, RGBA fill (including fill alpha), and rectangular geometry | Normalized fill/radius/stroke plus stable element identity/raw attrs/metadata | Rounded radii render as square corners; rect strokes are omitted; both publish aggregate diagnostics | Top-level raw fill/radius/stroke are projected, not copied into raw identity; masks, filters, blend effects, and arbitrary complex paths are not implemented |
| Direct image/icon | Resolved single-texture alias through Sprite; unresolved deterministic placeholder | Normalized source/tint/placement plus stable owner/component identity and raw attrs/metadata | Valid unloaded aliases increment `unresolvedAssetCount`; invalid/missing source emits `invalid-asset-source` | Atlas JSON/Spritesheet frame mapping and advanced image effects are not implemented; projected placement/source fields are not raw-retained |
| Direct/component text | ASCII up to 128 characters via `BitmapText`; non-ASCII or longer content via guarded `Text` | Normalized content/basic font/alignment plus stable owner/component identity and raw attrs/metadata | Fallback text leaves the aggregate fast path and is counted explicitly | Wrapping, rich markup, and advanced style routing are not implemented; projected top-level style is not raw-retained |
| Relations | Aggregate straight-line geometry with basic color, width, and alpha | Relation group/link identity, string or `{ id }` endpoints, and element raw attrs/metadata | `cap`/`join` emit a relation-style diagnostic and render as a basic line | `cap`/`join` raw style is not retained; dangling endpoints fail the load atomically |
| `attrs` / metadata | Numeric `x`, `y`, angle/rotation project only for group/grid/item/rect/image/text/background/bar/icon; `zIndex` projects only for rect/image/relations | `display`, unsupported type/key combinations, unknown open attrs, and metadata remain in raw attrs/metadata | Every retained-only type/key combination emits `attribute-preserved-only`; this includes `display` and relation transform attrs | Preserved attrs/metadata do not acquire implicit visual behavior |
| Visibility | Visible records enter geometry; invisible records do not | Invisible records remain indexed with stable identity | n/a | n/a |
| Numeric geometry | Finite positions, sizes, and transforms | Stable identity and deterministic dense slot assignment | Non-finite numeric attrs/sizes emit `invalid-number`/`invalid-size` and fall back to zero/0×0 | Duplicate stable IDs and dangling relation endpoints fail atomically |

The production fixture contains 458 source element records and 167 component definitions. It expands to 18,730 rectangles, 9,365 bars, 29 images, 8,947 relations, and zero text entities: 37,071 dense entities total. No invisible or unsupported record is silently discarded from the identity/diagnostic result.

## Headed functional result: 31/31

The headed browser evidence records all checks individually. Every check passed, including the ordered target selection → non-interactive non-target clear → target restore → empty clear sequence.

| # | Check | Result/detail |
| ---: | --- | --- |
| 1 | Direct seeded synthetic JSON load | Pass |
| 2 | Mesh WebGL production baseline | Pass |
| 3 | Caller input immutability readout | Pass |
| 4 | Asset load binds texture and updates debug state | Pass; unresolved 1→0, loaded 0→1 |
| 5 | Seeded random text changes values without changing identity/count | Pass; 132/500 sampled values changed |
| 6 | Changed text is published through aggregate text leaves in a new frame | Pass; 500 `BitmapText`, 0 fallback |
| 7 | Pixi Extract PNG capture | Pass |
| 8 | Asset unload restores unresolved fallback/debug state | Pass; loaded 1→0, unresolved 0→1 |
| 9 | First frame after unload has no stale texture binding | Pass |
| 10 | Reset publishes identity viewport | Pass |
| 11 | Fit publishes padded visible bounds | Pass |
| 12 | Transformed root-event hit and selection | Pass |
| 13 | Non-interactive non-target hit clears selection without becoming a target | Pass; interaction sequence then restores the target before the empty-hit check |
| 14 | Real pointer drag pans an empty transformed viewport | Pass |
| 15 | Empty hit clears selection | Pass |
| 16 | Real wheel zoom remains cursor-centered | Pass; presented-screen error 0.627 px |
| 17 | Central-scheduler animation publishes an intermediate bar height | Pass; 50 active sampled bars visibly changed |
| 18 | Bar animation completes at changed target heights | Pass; active animations return to zero |
| 19 | Pixi DevTools sees Application stage and aggregate world labels | Pass |
| 20 | Existing production JSON loads directly to 37,071 entities | Pass |
| 21 | Production input remains immutable | Pass |
| 22 | Direct-load first frame preserves all source-hidden production bars | Pass; 9,365 total, 0 visible, stable identity retained |
| 23 | Separate visibility transaction presents production bars with a Mesh upload | Pass; 9,365 operations/changes and 9,365 visible bars |
| 24 | Production 1% bar animation publishes intermediate heights with non-zero Mesh uploads | Pass; 78 bars changed and the sampled frame recorded a non-zero dirty-Mesh upload |
| 25 | Production partial animation completes at actual changed heights | Pass; all 78 scheduled bars changed and active animations returned to zero |
| 26 | Responsive resize updates the Pixi renderer | Pass |
| 27 | Destroy removes canvas and releases application lifecycle | Pass |
| 28 | Rejected Particle spike remains functionally testable | Pass |
| 29 | Console error count | Pass; 0 |
| 30 | Page error count | Pass; 0 |
| 31 | Network error count | Pass; 0 |

The final unit/integration gate also passed **40 files / 269 tests**.

## Selected Mesh scale results

### Load and first presentation

| Input | Expanded entities | App init | Normalize | Store load | Renderer build | GPU prepare | Direct-load first frame | Pan/zoom frame p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 509 | 22.9 | 8.1 | 10.2 | 6.3 | 5.2 | 18.8 | 1.0 |
| 500 | 2,549 | 23.1 | 36.8 | 44.4 | 22.4 | 6.2 | 51.5 | 1.4 |
| 1,000 | 5,099 | 22.9 | 72.2 | 83.8 | 43.7 | 7.7 | 86.3 | 1.6 |
| 2,000 | 10,199 | 21.9 | 147.6 | 165.1 | 74.8 | 8.5 | 165.4 | 1.6 |
| 5,000 | 25,499 | 25.0 | 328.5 | 380.1 | 152.7 | 11.3 | 394.2 | 5.5 |
| Production | 37,071 | 25.0 | 403.4 | 578.7 | 73.2 | 6.9 | 40.2 | 5.1 |

### Updates and lifecycle

| Input | Visibility setup | Full schedule | Full frame p95 | Partial schedule | Partial frame p95 | CJK first | Text change | Hit/op | Select | Resize | Destroy | Re-init | Retained JS heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.0 | 1.9 | 2.1 | 0.2 | 1.1 | 3.9 | 4.7 | 0.0051 | 2.1 | 362.0 | 11.9 | 20.9 | 25,044 B |
| 500 | 0.0 | 7.4 | 12.6 | 1.9 | 7.6 | 7.6 | 15.2 | 0.0070 | 5.4 | 429.3 | 25.3 | 30.9 | 23,404 B |
| 1,000 | 0.0 | 11.3 | 21.5 | 2.4 | 1.7 | 12.0 | 26.0 | 0.0083 | 11.9 | 436.1 | 62.5 | 22.7 | 27,512 B |
| 2,000 | 0.0 | 23.7 | **91.9** | 5.7 | 2.1 | 20.5 | 51.0 | 0.0100 | 22.3 | 467.8 | 76.7 | 25.2 | 23,660 B |
| 5,000 | 0.0 | 57.0 | **113.4** | 9.6 | 6.3 | 42.7 | 119.4 | 0.0171 | 53.7 | 580.6 | 204.4 | 24.3 | 23,968 B |
| Production | **135.1** | 75.0 | **42.8** | 12.4 | **10.6** | 5.3 | 5.2 | 0.0128 | 6.6 | 661.0 | 49.7 | 23.2 | 21,868 B |

Important unfavorable and non-monotonic results:

- Production visible full-frame p95 is 42.8 ms and fails the 33.3 ms criterion by 9.5 ms. Synthetic 2,000 and 5,000 full-update tails also fail at 91.9 and 113.4 ms.
- Direct compatibility load preserves all 9,365 production bars as hidden. The separate 135.1 ms visibility transaction is intentionally isolated, after which both full and partial animation measure visible geometry and actual dirty-Mesh upload.
- Synthetic first-visible cost reaches 394.2 ms at 5,000 inputs. The production fixture has more total entities but no source text and only 29 images, so its 40.2 ms direct-load first-frame result is composition-sensitive and must not be extrapolated by entity count alone. That direct frame also keeps production bars hidden by source contract.
- Production has zero source text entities. Its 5.3 ms CJK-first result measures insertion/presentation of one benchmark fallback, and its 5.2 ms text-change result always mutates that inserted entity rather than measuring an empty path. Synthetic text rows and headed mutation proof cover larger `BitmapText` sets.
- Resize is a costly full-surface operation: selected Mesh ranges from 362.0 ms at 100 inputs to 661.0 ms on production under the 4× proxy. It is not an interactive-frame result and is reported as an unfavorable lifecycle cost.
- Retained-heap medians are small signed/delta-style JavaScript measurements and are not GPU-memory evidence.

## Frozen Core v1 comparison

Only production has the same 37,071 expanded entities. Core v1 synthetic rows count entities directly, while Core v2 synthetic rows expand each source item to several entities, so synthetic cross-version ratios would be invalid. Both production checkpoints use two warmups, seven measurements, Chromium 143, and 4× throttling, but renderer phase boundaries and some aggregation methods differ.

| Production phase | Frozen Core v1 | Core v2 Mesh | Comparison |
| --- | ---: | ---: | --- |
| Normalize | 177.1 ms | 403.4 ms | Same input/entity boundary, but Core v2 includes a Mesh-only full-entity degradation scan; measured phase is **2.28× slower** (+127.8%), not a parser-only ratio |
| Dense-store load | 600.4 ms | 578.7 ms | Comparable dense load; **Core v2 is 3.6% faster** |
| First presentation | 27.4 ms first Canvas flush | 40.2 ms direct-load Pixi frame | n/a as a speedup denominator; Core v2 is directionally 12.8 ms higher and includes Pixi/GPU presentation work; both preserve source-hidden bars |
| GPU prepare | n/a | 6.9 ms | n/a; Canvas2D exposes no matching upload phase |
| Hidden-bar visibility setup | n/a | 135.1 ms | n/a; the frozen Core v1 protocol has no separate visible-bar setup phase |
| Pan/zoom frame p95 | n/a | 5.1 ms | n/a |
| Visible full animation frame | 25.5 ms flattened frame p95 on the frozen workload | 42.8 ms p95 of seven per-trial p95s after making 9,365 bars visible | n/a; visibility state and aggregation method both differ, so the 17.3 ms directional gap is not a valid regression ratio |
| Visible partial animation | n/a | 12.4 ms schedule / 10.6 ms frame p95 | n/a |
| Text change | n/a | 5.2 ms | n/a; production contains no source text, and Core v2 mutates one injected CJK fallback |
| Resize | n/a | 661.0 ms | n/a; the frozen Core v1 report has no separately comparable resize phase |
| Hit-test | 15.5 ms post-update hit including lazy spatial refresh | 0.0128 ms per operation | n/a; batch/refresh and per-operation semantics differ |
| Selection | 24.6 ms select + Canvas flush | 6.6 ms root hit/select/present path | Directionally 73.2% lower, but not a strict ratio because publication boundaries differ |
| Destroy | 0.0 ms | 49.7 ms | n/a; Pixi releases renderer/GPU-owned resources, Canvas teardown does not have the same lifecycle |
| Retained JS heap | 2,312 B | 21,868 B | n/a; signed collection scopes differ and neither includes native/GPU memory |

Core v1 also reports 62.3 ms trusted and 52.7 ms random 10% commit-plus-flush medians. Core v2 separates a visibility transaction, animation scheduling, and subsequent visible frames, so those values are not used as denominators for Core v2's 12.4 ms partial schedule or 10.6 ms frame p95. The comparison therefore exposes the clear Core v2 measured-normalization regression and modest store-load improvement without manufacturing a renderer-wide “faster than Core v1” claim. Core v1's 25.5 ms animation p95 is retained as historical context only, not evidence that its hidden-source-bar workload is faster than Core v2's explicitly visible-bar stress workload.

## Memory and package proof

The dedicated lifecycle run used 1,000 source items / 5,099 dense entities with two warmups and seven measured create-load-render-destroy cycles:

- Post-GC retained JavaScript heap samples: `[156808, 85956, 359892, 87412, 40712, 46652, 175468]` B. Median **87,412 B**, p95/max 359,892 B, late-versus-early trend 18,660 B.
- Final DOM: zero canvases and zero surface children. Lifecycle failures: zero. Console/page/network errors: zero.
- The process-level before/after difference is 4,410,912 B, but that broad process value includes browser/runtime state and is not treated as a per-Core leak measurement.
- The full production benchmark independently reports a 21,868 B median retained-JS-heap delta.
- Neither proof includes DOM/native texture/GPU allocations because no portable retained-GPU-memory counter is exposed.

The packed consumer gate passed against `@conalog/patch-map/core-v2` with PixiJS 8.19.0:

- ESM consumer: input immutable, four entities parsed/loaded, WebGL Mesh strategy, four aggregate render objects, 8,338-character PNG data-URL capture, destroyed state true, and zero canvases after destroy.
- CJS consumer: parser subpath loaded one entity with the expected stable ID.
- Console/page/network errors: zero. This proves the package subpath, external Pixi peer, capture surface, and destroy lifecycle from an installed consumer rather than only the repository source tree.

## Final verification gates

| Gate | Result |
| --- | --- |
| Core v2 package build | Pass |
| Typecheck | Pass |
| Lint | Pass |
| Unit/integration | Pass — 40 files / 269 tests |
| Core v2 lab build | Pass — build warning only, no failure |
| Headed browser | Pass — 31/31 checks; console/page/network errors 0 |
| Packed ESM/CJS consumer | Pass — Pixi 8.19.0, WebGL Mesh, capture and destroy lifecycle verified |
| Lifecycle memory | Pass — 2+7 cycles, DOM returned to zero, lifecycle/console/page/network failures 0 |
| Full performance evidence | Complete — 18 runs / 162 raw trials / 522 summaries; browser errors 0 |
| Performance report verifier | Pass — all 18 runs, raw trials, summaries, environment and pending fields accepted |
| Visible-production 33.3 ms target | **Fail — 42.8 ms full-animation p95** |

## Backend and release status

| Target | Status | Meaning |
| --- | --- | --- |
| PixiJS WebGL2 | Selected renderer baseline; performance target failed | Full evidence is complete, but visible-production full animation is 42.8 ms p95 versus the 33.3 ms target |
| PixiJS WebGPU | **Unavailable / experimental** | No adapter was available in the benchmark environment; no performance or compatibility claim is made |
| Chromium 4× | Development proxy | Useful for stable relative selection, not native device approval |
| Native Windows | **Pending** | Latency, raster behavior, GPU driver behavior, texture/native memory, and lifecycle must be measured on actual target hardware |

Core v2 is therefore a functionally, lifecycle-, and package-validated WebGL development candidate whose visible-production full-animation performance target remains unmet. It is neither production performance approval nor Windows-native approval. A Windows checkpoint must retain the same JSON inputs, visibility setup boundary, 2+7 raw protocol, and separate WebGPU evidence if a WebGPU adapter is tested.

## Durable evidence

| Evidence | Path | SHA-256 / note |
| --- | --- | --- |
| Final raw 4× matrix | `performance/core-v2/results/full-4x-2026-07-15T13-52-05-900Z.json` | `0ab012d0ade78a366f8d0898613488d53fcae3f410f11b3b3f691903cc46eb69` |
| Final raw alias | `performance/core-v2/results/latest-full-4x.json` | Same SHA-256; 18 runs / 162 raw trials / 522 summaries |
| Human-readable matrix | `performance/core-v2/results/latest-full-4x.md` | Environment, selected/spike tables, and measurement limits |
| Headed 31-check proof | `performance/core-v2/results/browser-functional.json` | `8d838576b77124e8a28bab70a0d04368ef0376cfdd8b614a44ab63ec8c4c00a2` |
| Lifecycle memory proof | `performance/core-v2/results/memory-lifecycle.json` | `5daf0edf43850265b569b965bec76f335a476b6e381a1edcfe21da6078b62d57` |
| Packed consumer proof | `performance/core-v2/results/package-consumer.json` | `805c86fc9e3a3159ade301d79a45718b101fc289d0338df4d12670a24ac13781` |
| Architecture and official-API rationale | `docs/implementation/performance-core-v2-architecture.md` | Pixi lifecycle/backend/rendering/resource findings and selection contract |
| Frozen Core v1 raw control | `performance/core-v1/selected/results/latest-full-4x.json` | `699f21b57993d1a0ac33a4073e9df9466d721a27af221e07f36e3135bce97472` |
| Frozen Core v1 report | `docs/implementation/performance-core-v1-report.md` | Read-only comparison methodology and limits |

Reproduction entry points are `npm run perf:core-v2`, `npm run verify:performance-report:core-v2`, `npm run verify:lab:core-v2`, `npm run verify:package:core-v2`, and `npm run verify:memory:core-v2`. Native Windows remains intentionally absent from the completed evidence until it is measured on the target hardware.

## Commit manifest

The Core v2 implementation/evidence sequence on `performance/core-v2` is:

- `a4ce297` — durable Pixi architecture and experiment contract
- `2a6d9a1` — direct immutable v0.10 parser
- `49056e3` — aggregate Pixi runtime
- `3e89f43` — initial bar Mesh upload optimization
- `2dab3f7` — duplicate source-identity rejection
- `1c060a8` — shared Pixi asset ownership
- `3690fbe` — renderer mutation-path refinements
- `07bb8e5` — browser and performance proof surface
- `beeb10c` — superseded hidden-bar checkpoint retained only in Git history
- `ffc2ccc` — in-place bar position-buffer updates
- `45c59a9` — visible production bar evidence requirement
- `8ab9878` — ignored generated lab output
- `636b6b8` — corrected visible-production final evidence
- `2939d54` — `fix: diagnose unsupported Core v2 schema fields`
- `e02272c` — `fix: refresh Core v2 unresolved asset state`
- `96b5080` — `test: prove Core v2 non-target interaction`
- `0dc714c` — `perf: record audited Core v2 final evidence`

The final documentation commit cannot self-reference its own object ID; its SHA is part of the clean-worktree handoff.
