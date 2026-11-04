# Runtime delivery coverage

This page tracks implementation and executed evidence against the
[contracts](contracts.md). Internal ownership belongs to [architecture](architecture.md);
measurement methods and raw results remain with their dated checkpoints.

## Current implementation and qualification

| Boundary | Implemented coverage | Evidence and limits |
| --- | --- | --- |
| Dataset and values | Detached schema admission, colors/themes, field resets and reset-aware pending composition | Schema/color tests; gallery/large-grid oracle; atomic rejection and failed-item revalidation tests |
| Geometry and viewport | Shared geometry, bounded spatial index, relation paths, camera and immutable queries | Geometry/viewport tests cover overflow, rotations, missing targets and retained query results |
| Publication and lifetime | Item-consistent retained updates, paint-confirmed completion, replacement, inactivity and reattachment | Session/widget tests cover no-paint noncompletion, failed preparation, callback reentry and removal |
| Rendering and resources | Static chunks, slice bars, shared text/SVG resources and bounded raster owners | Pixel/order/lifetime tests and the checkpoints below; physical/native/graphics memory is not globally qualified |
| Interaction and host API | Range/paint detection, selection decoration, alpha layers, camera callbacks and rotation/gesture options | Focused interaction/widget tests and public package consumers; no editor or item screen-reader claim |
| Playground | Public-package regular/varied 10,000-panel workloads and consumer replays | [Example protocol](../../../packages/flutter/example/README.md), [input replay](mobile-replay.md), [result synchronization](mobile-sync.md) |
| SDK and package tooling | Analysis, tests, package extraction and installed consumer on both recorded roles | CI baseline 3.41.4 and service 3.44.9 passed at the CI snapshot below; this does not qualify every supported SDK/platform |
| Native hosts | Android and iOS simulator development builds | Both passed at the CI snapshot; builds are distinct from executed native functional/performance qualification |
| Full JS/Dart conformance | Incomplete | Shared bindings/witnesses, platform/consumer equivalence and long-duration memory evidence remain incomplete |

The November 3, 2026 [CI run](https://github.com/Conalog/patch-map/actions/runs/41614561319)
passed all gates for `f7013232`, including both SDK roles, extracted consumers,
Android/iOS host builds, JS tests/package/lifecycle checks and shared tooling.
SDK identities and verification commands remain owned by the
[Flutter environment](../flutter-package.md). The service SDK tooling gap in the
initial October checkpoint is closed; service-device performance is not thereby
qualified. The [conformance manifest](../../../conformance/README.md) retains its
foundation-stage block for full JS/Dart qualification.

## Historical integration and platform evidence

The following October 19 records describe their archived source snapshots, not
a fresh measurement of the current package. Raw evidence is under the listed
ignored artifact roots; it is not release authority.

| Record | Executed scope and preserved limitation | Repository-relative artifact root |
| --- | --- | --- |
| Initial integration | 396-case run: 395 passed, one stale round-cap assertion replaced; focused input/example suites then passed. Scattered checkpoint-01 was overlap stress; checkpoint-02 used ordered groups. | `.artifacts/performance/flutter/native-runtime3476-device-20261019/` |
| Matched update comparison | 45 requests per arm, 0/1/100% changes in overview/zoom-pan; response/CPU improved in six conditions. The 1% overview first-raster cost increased; exact first-visible latency and universal frame nonregression remained inconclusive. | `.artifacts/performance/flutter/native-runtime3476-hotpath-emulator-20261019/` |
| Lifetime cycles | Four 10,000-panel profile cycles; eight final checks matched 20,000 records and all 24 timing windows completed. Package live counts returned to baseline; post-GC Dart heap 8.409 MiB, PSS 179 then 162–168 MiB. This is not native/GPU or all-duration leak proof. | `.artifacts/performance/flutter/native-runtime3476-lifecycle-emulator-20261019/` |
| Native functional smoke | Android API 34 and iOS 26.3 Simulator passed public update/pixel/removal/reattachment checks in debug on Flutter 3.47.6. iOS used a separately archived iOS 15/SPM host migration. | `.artifacts/flutter/native-runtime-platform-smoke-20261019/` |
| Extracted consumer | Flutter 3.47.6 and CI 3.41.4 passed on artifact SHA `70e760b62417340a3dc9c78b40e276185aad1a79bdae56ddfd23ec3a742981c3`; the later CI snapshot above verifies newer package tooling. | `.artifacts/flutter/installed-consumer-VBTpBN/`, `.artifacts/flutter/installed-consumer-KxgGLI/` |

The instrumented emulator SIGSEGV originally recorded with the update comparison
was subsequently traced, together with the physical-device failure, to a premature
null-field read in AOT component projection. The [crash checkpoint](native-crash-checkpoint.md)
records the guard mitigation and bounded repetition evidence. It is no longer an
unexplained GPU/device failure, but that fix does not establish universal stability.
Historical frame/CPU windows with different clocks, host fences or raster-drain
rules remain separate; see the example's measurement protocol before comparing them.

## Checkpoint index

These links preserve the evidence chain without treating old timings as current
performance or combining different workloads. Current behavior is defined by the
contract and architecture owners; each report owns its measured tradeoffs.

| Area | Historical evidence and disposition |
| --- | --- |
| Experiment-to-package cost | [Parity diagnosis](experiment-parity-checkpoint.md), [preparation reuse](update-reuse-checkpoint.md), [cost sweep](preparation-sweep-checkpoint.md), [device review](final-device-profile-checkpoint.md); the initial bar regression motivated later work, and the device review's extra candidates were not adopted |
| Changed dependencies and retained objects | [Field dependencies](field-dependency-checkpoint.md), [validated retained transfer](retained-update-checkpoint.md), [bar transforms](bar-transform-reuse-checkpoint.md): adopted with their recorded limits |
| Paragraph metrics | [Separate resolver candidate](numeric-paragraph-metrics-checkpoint.md), [factor diagnosis](numeric-paragraph-factor-diagnosis.md), [general-path metric reuse](numeric-paragraph-shared-checkpoint.md): only the final general-path reuse adopted |
| Text preparation and GC | [Parameter/key reuse](text-parameter-key-reuse-checkpoint.md), [frame diagnosis](text-key-frame-diagnosis.md), [allocation diagnosis](overview-allocation-diagnosis.md): lower CPU did not imply uniformly lower frame-local GC |
| Paint allocation changes | [Origin Offset](origin-offset-checkpoint.md), [placement slots emulator](placement-slots-checkpoint.md), [placement slots device](placement-slots-device-checkpoint.md), [Paragraph configuration](paragraph-configuration-checkpoint.md): adopted; the physical slots result supersedes the emulator's inconclusive timing ranking |
| Offscreen output | [Projection deferral](offscreen-preparation-checkpoint.md), [fit-raster diagnosis](fit-raster-diagnosis.md): output coordinate/matrix deferral adopted; eager validation/local geometry retained |
| Rejected reuse candidates | [Dimension-string sharing](dimension-sharing-checkpoint.md), [resolver-owned copy](record-copy-checkpoint.md): deferred/not adopted; no end-to-end gain established |
| Presentation rendering | [Layer smoke](presentation-checkpoint.md), [hidden-alpha batching](hidden-presentation-batching-checkpoint.md), [background topology reuse](presentation-topology-checkpoint.md), [GC diagnosis](presentation-topology-gc-diagnosis.md), [component show](component-show-checkpoint.md): bounded adopted evidence, with memory/GC tradeoffs preserved |
| Consumer comparisons | [Common-input WebView](webview-checkpoint.md), [mobile mode-switch diagnosis](mobile-overview-mode-switch-checkpoint.md): recorded host/workload only, not universal deployed WebView equivalence |

## Renderer release qualification

The first public renderer requires an installed artifact check and executed
Android and iOS integration tests on the CI SDK. The release suite covers
bundled SVG/font assets, public draw and update, hit detection and selection,
native pixel changes, alpha layers, replacement and teardown. It binds both
results to the exact artifact and platform source inputs. Use the commands in
[release operations](../releases.md#external-setup-and-first-dart-publication).

## Remaining broader qualification

- Complete shared conformance API bindings and named executed witnesses without
  weakening JavaScript requirements to match Flutter's narrower first release.
- Qualify representative consumer inputs and journeys on the intended package,
  deployed WebView identity and host configuration. Synthetic and source-generated
  replays cover only their recorded scenarios.
- Establish iOS performance and remaining supported-platform functional coverage;
  CI builds and debug pixel smoke do not substitute for profile measurements.
- Attribute physical/native/graphics memory and exercise long-duration/device
  replacement, removal and activity transitions. Bounded Dart live-count recovery
  does not prove native/GPU reclamation.

No aggregate speedup, universal frame nonregression or release approval follows
from this index. Reuse unchanged evidence and rerun only affected checks according
to [verification policy](../verification.md).
