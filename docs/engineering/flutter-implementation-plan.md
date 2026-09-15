# Dual-package implementation architecture

- Status: reviewed; independent package, runtime and conformance reviews resolved before implementation.
- Baseline: `release/1.0`, npm `1.0.0-alpha.7`; `main` has different contracts and is not a source for this implementation.
- Decision: [independent Dart and Canvas](flutter-package-design.md).
- Scope: Android/iOS parity, independent distributions, continuous native/browser comparison; no publication.

## Repository and documentation ownership

Both distributions are peers under `packages/`. The repository root owns shared contracts, conformance and task coordination; it is private and cannot be published.

```text
package.json, package-lock.json            private npm workspace coordinator
docs/                                     shared behavior and engineering authorities
conformance/                              revisioned fixtures, API/semantic coverage
verification/                             cross-package checks and documentation gate
packages/javascript/
  package.json, README.md, CHANGELOG.md      npm distribution metadata
  src/, tests/, examples/                   TypeScript/Pixi implementation and consumers
  verification/, performance/              npm artifact gates and current measurements
  vite.config.ts, tsconfig*.json            package-local build and type ownership
packages/flutter/
  pubspec.yaml, README.md, CHANGELOG.md      Dart distribution metadata
  lib/patch_map.dart, lib/src/              Dart engine, Canvas and Widget adapters
  assets/, test/, example/                  native inputs, checks and Android/iOS demos
.artifacts/                               ignored repository verification evidence
```


Existing public API pages continue owning shared behavior. [Flutter binding](../integration/flutter.md) owns native construction, surface, input and diagnostic differences; exact Dart shapes belong to exported declarations. The [conformance design](flutter-conformance-design.md) owns equality rules. This page owns repository folders, dependencies and distribution boundaries. The Dart README links to contracts.

The manifest links behavior to owning documents, TS/Dart entries and executable cases. Every requirement must pass before declaring equivalence. Inventory covers API shapes, defaults, failure/lifecycle rules and dataset kinds. Fixtures contain data, commands, time and expected observations.

## Runtime dependency and ownership

Dependencies point from composition to api/engine, from engine to model/semantic and abstract ports in `packages/flutter/lib/src/engine/ports.dart`, and from host/rendering adapters to those ports. Model/semantic use Dart core libraries only. They never import Flutter, renderer, filesystem, tests or fixtures. The public entry assembles adapters; engine never imports concrete Canvas or Widget code. No production code loads conformance files.

| Owner | Authority and boundary |
| --- | --- |
| Public facade | Typed results/options and synchronous domain calls; no second scene or notifier |
| Dataset authority | Detached normalized authored tree, identity index, semantic hash, revision-bound target sets |
| Transaction coordinator | Prepare all operations and renderer projection, accept once, then publish scene/history/selection; rejected/refused candidates change nothing |
| History authority | Bounded undo/redo cursor, coalescing, selection and companion; cursor moves only after accepted restoration |
| Instance presentation | Concrete grid overlays separate from authored data; field-level null restores current template; keyed alpha does not change hit identity |
| Geometry projection | World geometry, hierarchical stable paint order and hit index shared by renderer, selection and viewport |
| View/interaction | Viewport, map rotation, selection, editor and one transform session; previews never write authored history |
| Publication authority | One dirty frame schedule; accepted scene/view/interaction tuple and confirmed frame; idle schedules nothing |
| Asset session | Admission, per-alias generation, pending work and leases; stale completion releases without publishing |
| Capture authority | Serial queue, visible readiness and exact published tuple; defers resize through extraction |
| Widget host | Surface attach/detach, logical size/DPR, native input and Semantics; rebuild preserves controller |
| Canvas renderer | Aggregate geometry buffers, text/image caches and GPU resources; no mutation or product rules |

All async work checks instance generation and request generation on settlement. Destroy settles each pending operation with its declared outcome (including cancelled rotation results), cancels the sole schedule, disposes resources and listeners once, and makes repeated destroy harmless. Listener callbacks observe accepted state; reentrancy cannot commit an obsolete candidate. Surface preparation and irreversible publication are explicit separate steps.

## Implementation contracts

Dart exposes asynchronous `PatchMap.create` and `PatchMapView(controller: ...)`. Controller and visible readiness differ; capture requires an attached, published surface. Domain facades retain data/targets/update/updateBatch/transaction/history/editor/selection/pointer/presentation/viewport/rotation/transform/assets/debug/capture meanings. JSON-shaped dataset and patch inputs remain detached string-keyed maps; results and stable targets use exported Dart classes. Synchronous mutations stay synchronous; cancellation and listener disposal are explicit handles.

The semantic dataset uses immutable maps and indexed targets. Structural edits use detached preparation; grid heights use validated overlays and dirty slots without full tree cloning or parsing. Renderer projection uses packed buffers and ordered batches. Bar projections share original target metadata and create query targets lazily; flat views retain no preceding frames. View changes transform existing geometry. Text measurement, assets and clocks enter through ports. The native surface supplies a monotonic clock between frames; each command samples it once so idle time cannot consume a new bar or rotation animation. Idle schedules no frames.

## Asset decoder decisions

The native backend admits bytes before decoding. PNG/JPEG/WebP/GIF use Flutter codecs; SVG uses flutter_svg/vector_graphics; AVIF uses [flutter_avif](https://pub.dev/packages/flutter_avif). WOFF/WOFF2 use the attributed Apache-2.0 container decoder with [pure Dart Brotli](https://pub.dev/packages/brotli), avoiding host-specific native compression deployment. Bundled Fira Code loads a reproducible SFNT converted from the npm WOFF2; provenance verifies glyphs, metrics and variable weights. TTF/OTF load directly. Session bindings consume the controller's visible geometry, retain the previous texture during replacement, and release superseded or unused leases. Format and failure fixtures qualify both targets.

## Maintenance and verification

The selected implementations are maintained directly. Alternative JS engine, bridge and renderer experiments are removed. Native bar workloads exercise the shipped Dart controller and Canvas surface; npm workloads exercise the shipped Pixi implementation. Functional fixtures and trace equality remain shared under `conformance/` and `verification/conformance/`.

Run package-local focused tests for the changed owner. The private root forwards `js:*` and `flutter:*` commands; shared `verify:*` checks run from the repository root. Unscoped root build/test aliases are not provided. Package-local tools resolve their own package root and use the workspace root only for shared contracts, the npm lockfile and evidence. Neither production runtime imports the sibling package or repository tooling.

Folder changes require import-boundary, build, installed-package, documentation and shared-conformance checks. They make no runtime speed claim. For hot-path changes use the selected renderer's benchmark, controlled baseline/candidate inputs and the [verification policy](verification.md). Do not restore the retired runtime comparison matrix.

## Distribution isolation

npm retains its existing export map and artifact allowlist. Its build stages allowlisted public documentation and the license from repository authorities into ignored package-local outputs; generated copies are never edited or committed. The workspace lockfile owns npm dependency resolution. Dart ships its own lib/assets/docs/license and requires no Node/Pixi or JS engine. Native example platform scaffolding belongs to the example, not the library. Generated build/.dart_tool/Pods outputs are ignored and excluded from documentation scans. Package verifiers explicitly reject accidental cross-package payloads.

Versions are independent; contract revision and capabilities identify equivalent releases. npm release-please tracks `packages/javascript` and its independent version; shared public documentation is staged into its artifact. A shared-contract change must include the corresponding package change; documentation-only commits do not independently advance a package version. Dart release tags must use a separate prefix; registry publication is not enabled (`publish_to: none`). Credentials, tags and publishing stay outside local implementation. Publication remains blocked until full conformance and both platform checks pass.

PR CI pins Flutter 3.41.4/Node 22, verifies inventory/package boundaries, runs Dart analysis/tests and an installed consumer. npm source, dependency, contract, asset and integration-document changes also select this gate. Native OS qualification remains separate; CI selects npm, Flutter and shared gates by their current ownership paths.
