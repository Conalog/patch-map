# Flutter binding

- Status: implementation contract; package qualification is not yet complete.
- Shared meaning: [public API index](../README.md); structure: [implementation architecture](../engineering/flutter-implementation-plan.md).

## Package and construction

The Dart package is `patch_map`, managed under `packages/patch_map`. The npm package remains `@conalog/patch-map`. These are independent runtimes implementing the same behavior contract. A development version or example screenshot does not establish full feature equivalence.

`PatchMap.create` asynchronously prepares a controller. `PatchMapView(controller: controller)` attaches the Flutter drawing surface. The controller survives Widget rebuilds; its owner calls `destroy` when finished. Native surface attachment replaces the browser container parameter. Detach permits later reattachment until destroy; `ready` completes only once, while each new attachment must publish before capture. A controller has one attached surface; multiple maps use separate controllers and may share an asset runtime.

Dataset, mutation and transaction inputs use detached JSON-shaped maps/lists. Dart typed numeric lists correspond to JS array-like batch columns. Missing keys remain distinct from explicit null: null restores concrete grid overlay fields where the shared presentation contract defines that behavior. Public results use Dart value types; rejected/refused/unchanged/committed remain separate states.

Synchronous command results and callback ordering follow the shared contract. `data.replace` stays synchronous and `data.replaceAsync` remains asynchronous. Creation, animation completion, extraction and destruction retain their asynchronous boundaries. The controller's `ready` Future completes after the first valid attached surface frame; creation itself prepares data/resources without waiting for Widget attachment. Before attachment, surface-dependent commands are refused and capture waits for readiness; destroy terminates that wait. Listener registration returns a disposer. Flutter consumers do not install npm, run JavaScript or embed a WebView.

## Coordinates, input and output

CSS pixels correspond to Flutter logical pixels; device pixel ratio controls backing resolution. Widget constraints determine size in automatic sizing mode. Manual viewport resize uses logical width/height and explicit DPR. Geometry, component placement, paint order, selection and transforms retain their existing meanings.

Mouse, trackpad, wheel, modifiers and keyboard preserve documented bindings when the device supplies them. Touch supports hit selection, drag/pan, pinch zoom and long-press context-menu intent. Parent scrolling participates in Flutter gesture arbitration; cancelled gestures restore previews and do not add history. Native Semantics provides logical focus order, labels and activation without an entity Widget for every map item.

`capture.png()` returns PNG data URL, MIME and logical size from the current published tuple. The PNG pixel dimensions additionally reflect DPR. It awaits surface readiness and assets and preserves capture/resize ordering. Renderer diagnostics report Canvas/native facts rather than fabricated WebGL/WebGPU values. Browser container/backend/devtools options have explicit platform equivalents or are absent from Dart construction; common product features are not omitted.

## Equality and release

Normalization, identities, semantic hash, transaction/history state, events and target behavior must match shared fixtures. Floating-point comparison tolerances are field-specific; they cannot change a selected target or hide clipped text. Raster antialiasing alone may differ. Native text layout must follow semantic segmentation/wrapping rules instead of using default TextPainter wrapping as the specification.

Android and iOS are required. The development toolchain is pinned to the existing measured Flutter 3.41.4 / Dart 3.11.1 baseline; minimum OS support is qualified against the example builds and required asset decoders before release. Full feature coverage, including image/font formats, text, editor, history, accessibility and capture, is mandatory. The [conformance design](../engineering/flutter-conformance-design.md) owns the release equality gate.
