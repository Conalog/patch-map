# Performance Core v2: PixiJS architecture and experiment plan

## Decision status

Core v2 keeps the Core v1 dense store, transaction planner, animation table, spatial index, and stable ID semantics as the common control. It replaces only normalization at the input edge and rendering/resource orchestration at the output edge. The production baseline is PixiJS v8 WebGL. WebGPU is an explicitly experimental result and cannot select the production renderer.

The aggregate renderer was not selected by design preference. Two implementations passed the same correctness gates and then ran against the same normalized store:

- **Spike A — aggregate Mesh:** fixed-capacity geometry chunks for rectangles, bars, and relations. Store changes mark chunks dirty; only dirty chunk buffers are uploaded. Images use explicit texture aliases with sprites, while text uses the policy below.
- **Spike B — Particle/Sprite/GraphicsContext:** white-texture particles for compatible rectangles/bars, texture-alias particles/sprites for images, and retained `GraphicsContext` geometry for rounded/static shapes and relations. The measured workloads use radius on every bar, so their bars exercise the GraphicsContext fallback rather than the ParticleContainer dynamic lane.

Custom render pipes or batchers are not the first implementation. They are backend-specific extension points with a larger lifecycle and shader compatibility surface. A custom pipe is justified only if the public Mesh implementation misses the animation target after profiling and a measured spike improves the failing phase.

## Final measured decision

Chunked aggregate Mesh is selected for the WebGL production baseline. A bar-only dirty chunk now updates only its bar position buffer; rect and relation Mesh objects remain stable. The adapter records prior slot topology, so removal, insertion, or same-slot kind replacement takes the structural path and cannot leave ghost geometry. Pixi's public `Buffer.update(sizeInBytes)` supports a dirty-buffer prefix, not a portable byte offset; evidence therefore says “bar-lane dirty chunk upload,” not arbitrary GPU byte-range upload.

The production fixture marks all 9,365 bars hidden. The final protocol therefore preserves that source state for first-frame evidence, then measures a separate visibility transaction before starting visible animation. In independent Chromium 4× production trials over 37,071 dense entities, selected Mesh measured 40.2 ms for the source-faithful first frame, 135.1 ms for the visibility setup, 42.8 ms for full-bar trial-p95 p95, and 10.6 ms for partial-bar trial-p95 p95. The rejected Particle/Sprite/GraphicsContext spike measured 365.5/623.1/642.8/695.1 ms for those phases. Its rounded-bar GraphicsContext fallback dominated visible production mutation; production Particle upload counters were zero, so this result does not support a general ParticleContainer throughput claim. Some synthetic trials did invalidate static Particle state for interleaved square item rectangles, which is reported separately from the rounded-bar path. The rejected spike remained faster for production pan/zoom (2.2 ms versus selected Mesh 5.1 ms), full-animation scheduling (70.2 ms versus 75.0 ms), and resize (575.8 ms versus 661.0 ms), and had comparable post-return JS heap.

Mesh remains the decisive winner among the two measured renderers, but its visible full-bar result misses the 33.3 ms Chromium proxy target by 9.5 ms (28.5%). Core v2 therefore does not claim production animation acceptance. A custom batcher or RenderPipe is now a justified future experiment if native Windows evidence confirms the bottleneck, but it is not implemented or credited in this checkpoint. The evidence records the target miss instead of substituting the earlier hidden-bar result.

The selected Mesh path renders fills and relation width/color/alpha. It retains radius and rect stroke data in the dense store but currently renders rounded rects/bars with square corners and omits rect strokes. Loads publish aggregate `mesh-radius-degraded` and `mesh-stroke-unsupported` warnings; the final support table does not claim pixel fidelity for those styles. Particle's retained Graphics fallback renders those styles but is rejected on the measured mutation path.

## Official PixiJS v8 findings

| Area | Public API finding | Core v2 consequence |
| --- | --- | --- |
| Application and render loop | `new Application()` is followed by async `init()`. `autoStart: false` permits explicit `app.render()` and avoids an always-running ticker. [Application](https://pixijs.com/8.x/guides/components/application), [render loop](https://pixijs.com/8.x/guides/concepts/render-loop) | Initialization is async; the data model remains synchronous after creation. Rendering is invalidation-driven and runs continuously only during gestures or animation. |
| Backend | WebGL is the recommended stable backend. WebGPU is feature-complete but still experimental and affected by browser implementation differences. [Renderers](https://pixijs.com/8.x/guides/components/renderers) | Force `preference: 'webgl'` for production evidence. Record WebGPU separately when available. |
| Scene graph | The root is already a render group; additional render groups can move group transforms to the GPU, but too many add overhead. [Render groups](https://pixijs.com/8.x/guides/concepts/render-groups) | Use a small labeled hierarchy: world, static, dynamic, relation, text/assets, and interaction overlay. Never create one container per entity. |
| Mesh and buffers | Mesh accepts reusable geometry and shaders. Public buffers expose `update(sizeInBytes)` but no portable arbitrary byte-offset upload. [Mesh](https://pixijs.com/8.x/guides/components/scene-objects/mesh), [Buffer API](https://pixijs.download/release/docs/rendering.Buffer.html) | Use fixed-capacity chunks and upload only dirty chunks. Do not claim arbitrary sub-buffer ranges that the public API cannot prove. |
| Custom renderer extensions | Renderer work is split into systems and pipes; a custom `RenderPipe` owns add/update/validate/destroy lifecycle. Custom batchers are advanced extension points. [Architecture](https://pixijs.com/8.x/guides/concepts/architecture), [RenderPipe API](https://pixijs.download/v8.18.1/docs/rendering.RenderPipe.html) | Keep renderer-specific code behind one adapter. Escalate to a custom pipe only at a measured selection checkpoint. |
| Particles and sprites | `ParticleContainer` is optimized for many lightweight particles, has explicit static/dynamic property choices, and is marked stable-but-experimental. Dynamic properties are uploaded every frame; static changes need `update()`. [ParticleContainer](https://pixijs.com/8.x/guides/components/scene-objects/particle-container), [Sprite](https://pixijs.com/8.x/guides/components/scene-objects/sprite) | Spike B groups compatible particles by loaded texture source and sets an explicit bounds area. Rounded bars fall back to GraphicsContext, so the final matrix is not a standalone ParticleContainer benchmark. |
| Graphics | `GraphicsContext` is shareable retained geometry. Repeatedly clearing and rebuilding graphics is an avoidable dynamic cost. [Graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics) | Use retained contexts only for static/fallback geometry and rebuild aggregate relation contexts at transaction boundaries, not every frame. |
| Text | `Text` creates textures and is expensive to update. `BitmapText` uses an atlas and scales to frequently changing short text; very large CJK/emoji alphabets are poor bitmap-font candidates. [Text](https://pixijs.com/8.x/guides/components/scene-objects/text), [BitmapText](https://pixijs.com/8.x/guides/components/scene-objects/text/bitmap) | ASCII text up to 128 characters uses BitmapText; non-ASCII or longer text uses counted `Text` fallback. Wrapping, rich markup, and advanced style selection are not implemented by this guard. |
| Assets and upload | `Assets.load()` caches resources; `Assets.unload()` releases the cache entry. The Prepare extension can explicitly upload resources before the visible frame. [Assets](https://pixijs.com/8.x/guides/components/assets), [textures](https://pixijs.com/8.x/guides/components/textures), [Prepare API](https://pixijs.download/dev/docs/rendering.PrepareSystem.html) | Asset aliases map to caller-provided single-texture URLs. Load/unload is explicit and unresolved aliases are counted. Atlas JSON/Spritesheet frame mapping is not implemented. GPU-preparation time is measured separately from normalization/store load. |
| Events and coordinates | Federated events support root hit areas and event modes; hit testing normally walks interactive descendants. [Events](https://pixijs.com/8.x/guides/components/events) | The stage alone is interactive, has a screen-sized hit area, and has `interactiveChildren = false`. Screen coordinates are inverse-transformed, then the dense-store spatial index decides the target. |
| Caching, culling, extraction, destruction | Culling can exchange CPU cost for GPU savings; `cacheAsTexture` allocates an extra texture and fits stable complex content. Extract can produce pixels/canvas/image/texture and is expensive. GPU resources need explicit destruction. [Performance tips](https://pixijs.com/8.x/guides/concepts/performance-tips), [garbage collection](https://pixijs.com/8.x/guides/concepts/garbage-collection), [Extract API](https://pixijs.download/release/docs/rendering.ExtractSystem.html) | Do not cache the large dynamic world. Do not enable culling without evidence. Capture is an explicit diagnostic operation. Destroy clears application, geometry, text, textures owned by Core v2, handlers, and scheduled frames. |

## Input inventory and compatibility boundary

The public input is the existing PATCH MAP v0.10 JSON value, not a preconverted scene document. The parser never mutates it. It emits a dense-scene document plus a source identity index and diagnostics.

| Input shape | Observed/declared fields | Core v2 support |
| --- | --- | --- |
| top-level/group | `id`, `label`, `show`, `locked`, `attrs`, nested elements | Recursive. `show`/`locked` project to normalized visibility/interactivity but are not separately raw-retained. ID/path/type/label plus raw attrs/metadata are indexed; a missing ID gets a deterministic path ID and warning. |
| grid | `cells`, `item`, `gap`, `inactiveCellStrategy`, item size/padding/orientation/components | Active cells expand to deterministic `${gridId}.${row}.${column}` entities. String cell identity is retained in the source index. `hide` retains inactive cells as invisible; undefined skips them; other strategies warn and fall back to skip. |
| item | `size`, `components`, `padding`, `contentOrientation` | Background/bar/icon/text components become deterministic compound entities without changing the source component ID. `contentOrientation` is currently a no-op and is not retained in the identity result. |
| relations | `links`, `style`, string or `{ id }` endpoints | Aggregate basic line geometry; dangling endpoints are an error. Relation group/link identity is indexed. `cap`/`join` are diagnosed and ignored, not raw-retained. |
| rect/image/text | direct element attributes plus source/style/fill/stroke/radius | Direct input support. Selected Mesh renders rect radius as square corners and omits rect strokes while retaining both and publishing structured diagnostics. |
| component | `background`, `bar`, `icon`, `text`; observed size/source/tint/margin/placement/animation fields | Template identity is `sourceElementId + componentPath(array index) + componentId/type`; expanded entities use `instanceId::type:componentId`, and a duplicate owner/type/ID fails atomically. Geometry/style/placement project into normalized entities, while placement is not raw-retained. Input `animation`/`animationDuration` warn and are not applied or retained; the runtime API supplies duration. |
| attrs/metadata | observed `x`, `y`, `angle`, `display`; relation metadata with light/dark color and parent; schema permits open attrs | Transform attrs affect group/grid/item/rect/image/text/background/bar/icon; `zIndex` affects rect/image/relations. Other attrs, including `display`, are raw-retained and diagnosed as preserved-only; metadata is raw-retained without implicit visual meaning. |

No input record is silently dropped. Invisible records remain indexed and are omitted from visible geometry. The table explicitly identifies known fields that are projected, raw-retained, degraded, or unsupported. Missing IDs, unknown colors, invalid asset sources, non-rectangular layout behavior, and selected style degradation produce deterministic diagnostics; unresolved valid texture aliases produce placeholder rendering plus a debug count. Duplicate stable IDs and invalid relation endpoints fail the load atomically. Non-finite numeric attributes/sizes emit a warning and take a deterministic zero/0×0 fallback.

## Data and rendering pipeline

```mermaid
flowchart LR
  J["PATCH MAP v0.10 JSON"] --> P["immutable schema parser"]
  P --> X["source/component/metadata identity index"]
  P --> D["Core v1-compatible SceneDocument"]
  D --> S["dense SoA store + ID/relation/spatial indexes"]
  S --> T["atomic transaction + central animation table"]
  T --> B["Core v2 change bridge"]
  B --> A["Spike A: chunked aggregate Mesh"]
  B --> C["Spike B: Particle/Sprite/GraphicsContext"]
  A --> G["PixiJS WebGL renderer"]
  C --> G
```

Core v1 remains the common model control. Core v2 adds a thin bridge with a monotonically increasing store epoch, full-rebuild flag, view invalidation, and changed slot ranges. A reload changes the epoch even when IDs or slots repeat, preventing stale GPU cache reuse. Kind and generation are checked when a chunk is synchronized.

The stage and aggregate layers receive meaningful labels and debug counters so PixiJS DevTools exposes the application and architectural layers. `debugSnapshot()` reports entity counts, geometry chunks, draw submissions, uploaded bytes/chunks, text fallback counts, asset counts, and the last invalidation reason. A draw submission is defined as one aggregate renderable submitted by Core v2, not a Canvas command.

## Frame scheduling and interaction

The scheduler has one requestAnimationFrame callback and one monotonic local animation clock. Data commits, resize, asset completion, selection, and view changes set invalidation flags. An idle invalidation schedules exactly one frame. Animation or an active pan/zoom gesture schedules the next frame only while work remains.

Each animation frame advances the common dense animation table, records changed ranges, synchronizes the renderer, and renders once. Bar animation visibly interpolates geometry. Fixed chunks make an update upload proportional to touched chunks rather than total entity count. No entity owns a ticker, closure, listener, or Pixi event target.

The stage receives pointer and wheel events. Cursor-centered zoom preserves the world point under the cursor. Selection maps screen coordinates through the inverse viewport transform, then uses the common exact spatial hit test. Empty and non-interactive non-target hits clear replacement selection; the overlay is a single aggregate diagnostic object.

## Experiment matrix and selection rule

Every run uses seeded input and the same direct JSON parser, dense store, view, animation schedule, asset map, text mutations, and hit coordinates. Sizes are 100, 500, 1,000, 2,000, and 5,000 generated objects plus the production JSON. Chromium at 4× CPU slowdown is a development proxy; Windows native remains `pending` until executed on that host.

Warm up twice, measure seven times, and retain every raw sample. For every phase report min, median, p95, and max:

1. immutable normalization;
2. dense-store load;
3. GPU synchronization/upload;
4. first visible frame;
5. pan/zoom frame p95;
6. full and 10% bar animation frame p95 plus completion time;
7. first text render and seeded random text change;
8. transformed hit-test and selection;
9. resize;
10. destroy and re-initialize;
11. retained heap after lifecycle loops.

Correctness is a hard gate: direct legacy load, deterministic output, immutable input, visible bar interpolation, text mutation, transformed hit behavior, asset load/unload, resize, destroy/re-init, capture, package consumer, and headed-browser console/network error count zero.

Among passing spikes, choose Mesh when it improves either full or partial production bar-animation p95 by at least 15% without making first visible frame or retained heap more than 25% worse. Choose the simpler Particle/Graphics implementation when Mesh does not clear that threshold. Either candidate must keep production animation p95 below 33.3 ms in the Chromium 4× proxy. A miss is reported rather than hidden.

## Risks and proof obligations

- Public Pixi buffers do not promise arbitrary offset updates. The evidence must say “dirty chunk upload,” not “byte-range update,” unless a later official API proves otherwise.
- `ParticleContainer` has experimental status and dynamic properties can force full property-buffer uploads.
- Non-ASCII/long-text fallback can reintroduce many scene objects and texture churn. Counts and random-change timings must be reported; wrapping, rich markup, and advanced style routing remain unsupported.
- Loaded images can share texture sources, but atlas JSON/Spritesheet frame selection is not exposed. Unresolved aliases render a deterministic placeholder and increment an explicit debug count.
- WebGL and WebGPU shader languages/resources differ. Any custom shader must contain both supported programs or remain WebGL-only and be labeled accordingly.
- Rounded rectangles, advanced strokes, masks, blend modes, filters, rich text, and arbitrary open metadata may be only partially rendered; the final schema table must distinguish retained, rendered, degraded, and unsupported.
- Pixi global caches and browser GPU allocations make `destroy()` evidence sensitive. Heap proof must combine repeated application lifecycle, explicit resource unload/destruction, and post-GC retained-heap deltas where browser support permits.
- Core v1 slot generations can collide across a reload. Core v2 must key renderer caches by its own store epoch plus slot/generation rather than weakening the stable-ID contract.
