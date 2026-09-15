# Flutter binding

- Status: native implementation contract; qualification uses recorded execution evidence and registry publishing remains disabled.
- Shared meaning: [public API index](../README.md); structure: [implementation architecture](../engineering/flutter-implementation-plan.md).

## Package and construction

The Dart package is `patch_map`, managed under `packages/flutter`. The npm package remains `@conalog/patch-map`. These are independent runtimes implementing the same behavior contract. A development version or example screenshot does not establish full feature equivalence.

`PatchMap.create` asynchronously prepares a controller. `PatchMapView(controller: controller)` attaches the Flutter drawing surface. The controller survives Widget rebuilds; its owner calls `destroy` when finished. Native surface attachment replaces the browser container parameter. Detach permits later reattachment until destroy; `ready` completes only once, while each new attachment must publish before capture. A controller has one attached surface; multiple maps use separate controllers and may share an asset runtime.

Dataset, mutation and transaction inputs use detached JSON-shaped maps/lists. Dart typed numeric lists correspond to JS array-like batch columns. Missing keys remain distinct from explicit null: null restores concrete grid overlay fields where the shared presentation contract defines that behavior. Public results use Dart value types; rejected/refused/unchanged/committed remain separate states.

Synchronous command results and callback ordering follow the shared contract. `data.replace` stays synchronous and `data.replaceAsync` remains asynchronous. Creation, animation completion, extraction and destruction retain their asynchronous boundaries. The controller's `ready` Future completes after the first valid attached surface frame; creation itself prepares data/resources without waiting for Widget attachment. Before attachment, surface-dependent commands are refused and capture waits for readiness; destroy terminates that wait. Listener registration returns a disposer. Flutter consumers do not install npm, run JavaScript or embed a WebView.

## Coordinates, input and output

CSS pixels correspond to Flutter logical pixels; device pixel ratio controls backing resolution. Widget constraints determine size in automatic sizing mode. `PatchMapView.resizeMode` defaults to `PatchMapResizeMode.observe`. Choose `manual` when the host owns sizing; `controller.viewport.resize` then sets logical width/height and explicit DPR without parent constraints overriding them. The capture boundary follows that explicit viewport size. `background` defaults to `#FAFAFA`, and `antialias` defaults to true on the native surface. Geometry, component placement, paint order, selection and transforms retain their existing meanings.

Mouse, trackpad, wheel, modifiers and keyboard preserve documented bindings when the device supplies them. Touch supports hit selection, drag/pan, pinch zoom and long-press context-menu intent. Parent scrolling participates in Flutter gesture arbitration; cancelled gestures restore previews and do not add history. Native Semantics provides logical focus order, labels and activation without an entity Widget for every map item. It refreshes after selection, viewport and scene changes. Background transitions cancel native presses, tooltip pins and transform sessions, settle bars to their destination, and stop frame scheduling. Resuming requests a fresh visible frame. MediaQuery disableAnimations follows the shared reduced-motion behavior.

`capture.png()` returns PNG data URL, MIME and logical size from the current published tuple. The PNG pixel dimensions additionally reflect DPR. It awaits surface readiness and assets and preserves capture/resize ordering. Renderer diagnostics report Canvas/native facts rather than fabricated WebGL/WebGPU values. Browser container/backend/devtools options have explicit platform equivalents or are absent from Dart construction; common product features are not omitted.

`debug.publication()` is a compact native frame observation. The native debug
snapshot also reports a bounded `lastCallbackFailure` without raw callback
exception text. These are native diagnostic additions. Optional supplied
diagnostic metadata (`logicalId`, `sanitizedHash`, `sanitizedAssetId`) remains
detached and preserved; browser operational telemetry and canvas-taint ledger
fields are not fabricated for a native renderer. Native admission and capture
failures retain their structured error outcomes.

## Platform option mapping

| npm host option | Flutter binding |
| --- | --- |
| container | `PatchMapView` placement and constraints |
| resizeMode | `PatchMapView.resizeMode` (`observe` or `manual`) |
| pixelRatio | observed MediaQuery DPR or explicit manual `viewport.resize` DPR |
| background, antialias | same options on `PatchMapView` |
| backend, powerPreference | selected by the Flutter engine; no WebGL/WebGPU preference is claimed |
| DOM/devtools surface facts | native Canvas, frame and resource diagnostics |

## Asset runtime and backend

`PatchMapAssetRuntime([backend])` owns an initially empty alias catalog. Pass it as
`PatchMap.create(assetRuntime: runtime)` to share it between native maps. Mounting
registers `patchMapBuiltinAssets`; manual sessions use
`runtime.createSession(instanceId: 'host', policy: {...})` and
`session.registerAssets()` for the same defaults. Registration is atomic and
returns registered/duplicate alias lists. Conflicting descriptors reject the
whole batch.

`session.acquire(alias)` resolves a registered alias; `acquireSource(source)`
always treats its input as a descriptor, including strings. Each acquisition
exposes `resource`, `cacheIdentity`, `normalizedResourceIdentity`, optional
`describedCacheIdentity`, and idempotent asynchronous `release()`. Session
`destroy()` cancels pending acquisitions and releases its own leases. It does
not wait for an abandoned decode; the runtime retains cleanup ownership.
`probe()`, `runtimeProbe(alias)`, and runtime `probe(alias)` report pending,
leased and failed-cleanup state. `retryCleanup()` retries unload failures;
reacquisition waits for successful cleanup before using a fresh physical key.

For the exported low-level coordinator protocol, `PatchMapAssetUse(source:
runtime.sourceEntry(source))` provides the native use record. Runtime
`attach(use)`, `release(use)` and `retryCleanupFor(canonicalKeys)` use the same
coordinator as sessions; `promise`, `status`, `entry`, identities and description
expose its state. Ordinary consumers use session acquisition handles.

Subclass `PatchMapAssetBackend` to implement synchronous `get(request)`,
asynchronous `load(request)`/`unload(key)`, and optional `describe(request,
resource)`. A non-null `get` result is externally owned and is never unloaded by
PatchMap. Runtime objects using the same backend object share decoded resources;
alias catalogs remain independent. Host admission policies isolate leases,
while trusted builtin signatures share across policies. Backend descriptions
cannot replace coordinator identities.

The default `createPatchMapNativeAssetBackend()` admits and decodes native
images/fonts. Manual sessions allow opaque backend resources; resources used by
a mounted image must be `NativeAsset` with valid dimensions and an `image` or
`picture` for Canvas drawing. This replaces the Pixi resource boundary.
`normalizePatchMapAssetDescriptor`, `normalizePatchMapAssetPolicy`,
`evaluatePatchMapAssetResponsePolicy`, and `assertPatchMapAssetResponseAllowed`
use shared JSON field meanings. Custom backends receive normalized policy and
own equivalent admission before returning resources. `PatchMapAssetError`
provides `code`, `category`, and `retryable`.

## Equality and release

Normalization, identities, semantic hash, transaction/history state, events and target behavior must match shared fixtures. Floating-point comparison tolerances are field-specific; they cannot change a selected target or hide clipped text. Raster antialiasing alone may differ. Native text layout must follow semantic segmentation/wrapping rules instead of using default TextPainter wrapping as the specification.

Android/iOS apps are required; Flutter web is unsupported. Compare npm in the browser with native simulator demos, and measure performance separately under fixed conditions. The development toolchain is pinned to the existing measured Flutter 3.41.4 / Dart 3.11.1 baseline; minimum OS support is qualified against the example builds and required asset decoders before release. Full feature coverage, including image/font formats, text, editor, history, accessibility and capture, is mandatory. The [conformance design](../engineering/flutter-conformance-design.md) owns the release equality gate.

Bundled Fira Code uses a native TTF derived from the exact npm WOFF2, preserving its glyphs, horizontal metrics and 300–700 variable weight axis. Source and converted hashes are recorded in the package asset provenance. Host WOFF/WOFF2 are decoded with pure Dart Brotli before FontLoader; desktop compression libraries are not required. FontLoader registers the bundled family once per process, while each controller releases its logical font lease on destruction. Flutter has no family-unregistration API, so process font registration is separate from instance resource cleanup.

After successful controller destruction, `assets.status().session` is null and
`assets.status().runtime` remains inspectable. If cleanup fails, the destroyed
session probe remains available for retry; successful retry clears it. Concurrent
destruction calls join the same cleanup attempt.
