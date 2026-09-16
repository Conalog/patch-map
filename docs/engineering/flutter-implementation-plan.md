# Dual-package implementation architecture

- Status: reviewed; independent package, runtime and conformance reviews resolved before implementation.
- Baseline: `release/1.0`, npm `1.0.0-alpha.7`; `main` has different contracts and is not a source for this implementation.
- Decision: [independent Dart and Canvas](flutter-package-design.md).
- Scope: Android/iOS parity, independent distributions, continuous native/browser comparison; no publication.

## Repository and documentation ownership

Both distributions are peers under `packages/`. The private root owns shared contracts, conformance and coordination.

```text
package.json, package-lock.json            private coordinator and shared Node resolution
.nvmrc, CONTRIBUTING.md                    repository toolchain and contribution guide
docs/                                     shared behavior and engineering authorities
conformance/                              revisioned fixtures, API/semantic coverage
verification/                             private Node tooling workspace
  package.json, tsconfig.json, eslint.config.js  tooling dependencies and checks
packages/javascript/
  package.json, README.md, CHANGELOG.md      npm distribution metadata
  src/, tests/, examples/                   TypeScript/Pixi implementation and consumers
  verification/, performance/              npm artifact gates and current measurements
  vite.config.ts, tsconfig*.json            package-local build and type ownership
packages/flutter/
  pubspec.yaml, README.md, CHANGELOG.md      Dart distribution metadata
  lib/conalog_patch_map.dart, lib/src/              Dart engine, Canvas and Widget adapters
  assets/, test/, example/                  native inputs, checks and Android/iOS demos
.artifacts/                               ignored repository verification evidence
```


Public API pages own shared behavior. [Flutter binding](../integration/flutter.md) owns native construction, surface, input and diagnostic differences; exact Dart shapes belong to exported declarations. The [conformance design](flutter-conformance-design.md) owns equality rules. This page owns folders, dependencies and distributions. The Dart README links to contracts.

Conformance owns inventory and fixture requirements; all must pass before declaring equivalence.

## Runtime dependency and ownership

Dart is performance-first: share schema and feature semantics, not JavaScript
internals. Compile native render data, retain buffers/resources and process dirty
or visible regions. Measured gains may justify structural changes; shared
conformance preserves behavior.

Dependencies point from composition to api/engine, from engine to model/semantic and abstract ports in `packages/flutter/lib/src/engine/ports.dart`, and from host/rendering adapters to those ports. Model/semantic use Dart core libraries only. They never import Flutter, renderer, filesystem, tests or fixtures. The public entry assembles adapters; engine never imports concrete Canvas or Widget code. No production code loads conformance files.

| Owner | Authority and boundary |
| --- | --- |
| Public facade | Typed results/options and synchronous domain calls; no second scene or notifier |
| Dataset authority | Detached normalized authored tree, identity index, semantic hash, revision-bound target sets |
| Transaction coordinator | Prepare all operations and renderer projection, accept once, then publish scene/history/selection; rejected/refused candidates change nothing |
| History authority | Bounded undo/redo cursor, coalescing, selection and companion; cursor moves only after accepted restoration |
| Instance presentation | Concrete grid overlays separate from authored data; field-level null restores current template; keyed alpha does not change hit identity |
| Geometry projection | World geometry, hierarchical stable paint order and hit index shared by renderer, selection and viewport |
| View/interaction | `viewport.dart`, `rotation.dart`, `transform.dart`: viewport/rotation/preview state. `viewport_fit.dart`: validated fit planning. `pointer_policy.dart`: creation policies. Previews never write history |
| Publication authority | One dirty frame schedule; accepted scene/view/interaction tuple and confirmed frame; idle schedules nothing |
| Asset session | Admission, per-alias generation, pending work and leases; stale completion releases without publishing |
| Capture authority | Serial queue, visible readiness and exact published tuple; defers resize through extraction |
| Widget host | Surface attach/detach, logical size/DPR, native input and Semantics; rebuild preserves controller |
| Canvas renderer | Aggregate geometry buffers, text/image caches and GPU resources; no mutation or product rules |

All async work checks instance generation and request generation on settlement. Destroy settles each pending operation with its declared outcome (including cancelled rotation results), cancels the sole schedule, disposes resources and listeners once, and makes repeated destroy harmless. Listener callbacks observe accepted state; reentrancy cannot commit an obsolete candidate. Surface preparation and irreversible publication are explicit separate steps.

## Implementation contracts

Dart exposes asynchronous `PatchMap.create` and `PatchMapView(controller: ...)`. Controller and visible readiness differ; capture requires an attached, published surface. Domain facades retain data/targets/update/updateBatch/transaction/history/editor/selection/pointer/presentation/viewport/rotation/transform/assets/debug/capture meanings. JSON-shaped dataset and patch inputs remain detached string-keyed maps; results and stable targets use exported Dart classes. Synchronous mutations stay synchronous; cancellation and listener disposal are explicit handles.

The semantic dataset uses immutable maps and indexed targets. Structural edits use detached preparation; grid heights use validated overlays and dirty slots without full tree cloning or parsing. Renderer projection uses packed buffers and ordered batches. Bar projections share original target metadata and create query targets lazily; flat views retain no preceding frames. View changes transform existing geometry. Text measurement, assets and clocks enter through ports. The native surface supplies a monotonic clock between frames; each command samples it once so idle time cannot consume a new bar or rotation animation. Idle schedules no frames.

`controller.dart` owns lifecycle/publication; `controller_services.dart` exposes
assets/debug/capture. Canvas text and geometry live in `canvas_text.dart` and
`canvas_primitives.dart`; `native_map_surface.dart` holds host adapters. All remain
parts of their existing library with unchanged state/disposal ownership.

The [native rendering owner](flutter-rendering.md) defines retained text/icon resources, incremental projection, cache bounds, invalidation and focused checks.

## Asset decoder decisions

The native backend admits bytes before decoding. PNG/JPEG/WebP/GIF use Flutter codecs; SVG uses flutter_svg/vector_graphics; AVIF uses [flutter_avif](https://pub.dev/packages/flutter_avif). WOFF/WOFF2 use the attributed Apache-2.0 container decoder with [pure Dart Brotli](https://pub.dev/packages/brotli), avoiding host-specific native compression deployment. Bundled Fira Code loads a reproducible SFNT converted from the npm WOFF2; provenance verifies glyphs, metrics and variable weights. TTF/OTF load directly. Session bindings consume the controller's visible geometry, retain the previous texture during replacement, and release superseded or unused leases. Format and failure fixtures qualify both targets.

## Maintenance and verification

Runtime tests and measurements use shipped implementations. Shared traces live
in `conformance/` and `verification/conformance/`; alternative runtime experiments
are removed.

The private root forwards `js:*` to JavaScript, `flutter:*` to native tasks and `verify:*` to the [verification workspace](../../verification/README.md). Root has no development dependencies or compiler/lint configuration. npm workspaces contain JavaScript and tooling; Flutter uses pub. Shared gates execute from the repository root. Package tools use their own root and access shared contracts, lockfile and evidence explicitly. Runtime imports never cross package/tooling boundaries.

Folder changes require import-boundary, build, installed-package, documentation and shared-conformance checks. They make no runtime speed claim. For hot-path changes use the selected renderer's benchmark, controlled baseline/candidate inputs and the [verification policy](verification.md). The [renderer comparison reports](../../verification/flutter/reports/README.md) preserve the decision; experiment sources and tools are removed.

## Distribution isolation

npm retains its existing export map and artifact allowlist. Its build stages allowlisted public documentation and the license from repository authorities into ignored package-local outputs; generated copies are never edited or committed. The workspace lockfile owns npm dependency resolution. Dart ships its own lib/assets/docs/license and requires no Node/Pixi or JS engine. Platform scaffolding belongs to the native example. Generated build/.dart_tool/Pods outputs are ignored and excluded from documentation scans. Package verifiers explicitly reject accidental cross-package payloads.

Versions are independent; contract revision and capabilities identify equivalent releases. The [release owner](releases.md) defines npm/Dart release-please entries, separate tags, registry enablement and retry policy. A shared-contract change must include corresponding changes in both packages; documentation-only commits do not independently advance a version. Dart starts at `1.0.0-alpha.1`. Publication remains blocked until full conformance and both platform checks pass.

PR CI pins Flutter 3.41.4/Node 22, verifies inventory/package boundaries, runs Dart analysis/tests and an installed consumer. npm source, dependency, contract, asset and integration-document changes also select this gate. Native OS qualification remains separate; CI selects npm, Flutter and shared gates by their current ownership paths.
