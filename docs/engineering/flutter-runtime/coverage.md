# Runtime delivery coverage

Progress against the [accepted contracts](contracts.md) and
[implementation sequence](README.md). Tests establish only the scope they execute.

## Delivery status

| Boundary | Status | Evidence |
| --- | --- | --- |
| Ownership/contracts | Reviewed; six missing transition conditions incorporated | Independent contract/architecture review against all213 inventoried source sections |
| Dataset | Immutable admission, color/theme resolution and native projection implemented | Focused schema/color tests; normalized gallery/large-grid JSON oracle against executed JS materializer; scalar, mutation and reset isolation |
| Geometry / viewport | Shared initial/incremental geometry, bounded index, camera, readable transforms, relation paths and intrinsic image refresh implemented | Geometry tests include large-grid scan oracle, overflow/moves, rotated fit/padding, relation targets/cycles and replacement dependencies |
| Frame coordinator | Connected to CustomPainter and session submission | Generation/revision paint witness; no-paint noncompletion, idle/inactive/disposal tests |
| Presentation / session | Native backend integrated with reset-aware pending fields and item-atomic publication | Session transition tests plus widget tests for paint, reset, replace, inactive, failed asset retry and refreshed geometry |
| Widget/controller | Implemented; public documentation present | Draw/update, invalid replacement, reattachment, held multitouch invalidation and callback-driven selection tests; device profile build |
| Resource accounting | Native reservation/live/retiring owners integrated | Source streaming/decode/retirement tests, late completion, ownership failure and descriptor-history release checks; physical memory remains a measured risk |
| Rendering/resource owners | Ordered retained plan, static chunks, slice bars, text metrics/Paragraph/atlas and SVG/raster sharing integrated | Pixel/order tests, sparse no-full-traversal witness and measured 10,000-panel device checkpoint; integrated optimization in progress |
| Interaction/lifecycle | Input coordinator and selection overlay integrated | Gesture/input/selection tests, actual selection pixels, deferred paint-generation failure and inactive font/resource continuation regressions |
| Playground uses package | Implemented through public imports only | Example tests; aligned 100-group layouts with exactly 10,000 panels +100 devices and zero conservative AABB overlap; profile source/APK identity archived |
| Platform/WebView qualification | Incomplete | Flutter3.47.6 and CI3.41.4 extracted installed-consumer import/assets and public draw/update/detach smoke passed; CI static analysis passed. Android profile checkpoint is synthetic; service SDK, iOS and deployed WebView equivalence remain unqualified |

The coherent integration suite ran 396 cases after the reviewed lifetime,
compatibility and geometry changes: 395 passed and one stale round-cap test
expected a feature release ignores. Its diagonal-envelope replacement and all
20 input-coordinator tests then passed. Affected focused suites and the example
suite also pass. This reuses unchanged coverage rather than rerunning the whole
suite after a test-only correction. Current-run evidence is preserved under
`.artifacts/performance/flutter/native-runtime3476-device-20261019/` and is not a
release authority. `checkpoint-01` used scattered coordinates and is classified
as overlap stress, not a representative plant baseline. `checkpoint-02-corrected`
uses ordered grids with template/value variety. Neither result is directly
comparable to the old standalone app's different visibility/viewport policy.


The emulator transfer review separates the old experiment's workload from the
package. The standalone app hid numbers at distant scales and bypassed public
admission; its timing is not a package baseline. The package now reuses unchanged
geometry, narrows validation to changed dependencies, shares immutable text
parameters in each preparation, reuses private merge roots and stops the no-op
probe after finding work. Output, reset/atomicity, immutability and failed-source
retry tests cover those changes. The early no-op probe has a separate focused
session/widget run and an independent review.

The final comparison uses the same public app with 10,000 aligned panels and
20,000 mixed values per call. A corrected frame protocol removes automatic host
status repaints and artificial fence frames, drains scheduled/raster work, then
reads process CPU. A host-only/no-op diagnostic found no additional map paint or
frame for unchanged input. The corrected 0/1/100% grid, overview/zoom-pan pair
completed 45 requests per arm without failures or incomplete timings; API response
and CPU medians improved in those six conditions. Frame p95 did not improve in
every condition. Independent review left frame nonregression inconclusive: the
1% overview first-raster cost consistently increased, although total CPU and
final raster completion improved. A reverse-order diagnostic then confirmed that both arms' first frames painted
the corresponding new publication. First-raster cost still differed, while
request CPU, summed raster work and per-request maximum frame timings did not
show consistent worsening. Cost distribution and exact request-to-first-raster
completion remain unresolved; adding response and raster durations is not that
latency. Independent review permits moving to lifecycle qualification without
another broad matrix. Initial visual-response nonregression is not claimed.
One instrumented startup ended in native SIGSEGV; the identical APK retry passed.
The crash is retained as an unresolved stability item, not attributed to the
emulator or instrumentation without evidence. This is synthetic emulator evidence,
not universal frame-rate or device/GPU-memory qualification. Source, APK identity, raw records and limits
are preserved under
`.artifacts/performance/flutter/native-runtime3476-hotpath-emulator-20261019/`
(`SETTLED.ko.md`, `WITNESS.ko.md`, `HOST-DIAGNOSTIC.ko.md`, `FINAL.ko.md`). Earlier frame/CPU windows
remain separate; their response stopwatches are valid for their recorded inputs.

The current runtime also passed the Flutter3.47.6 extracted installed-consumer
check (`.artifacts/flutter/installed-consumer-VBTpBN/report.json`). CI SDK3.41.4
also passed static analysis and the extracted smoke
(`.artifacts/flutter/installed-consumer-KxgGLI/report.json`) for the same artifact
SHA256 `70e760b62417340a3dc9c78b40e276185aad1a79bdae56ddfd23ec3a742981c3`.
This is not a complete CI SDK native qualification. Remaining qualification
includes the service SDK, iOS, deployed WebView equivalence, physical GPU memory
and sustained replacement/removal/rapid-input profiling.
No release or full performance approval is inferred from these checkpoints.
