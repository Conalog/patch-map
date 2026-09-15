# Dual-package implementation architecture

- Status: reviewed; independent package, runtime and conformance reviews resolved before implementation.
- Baseline: `release/1.0`, npm `1.0.0-alpha.7`; `main` has different contracts and is not a source for this implementation.
- Decision: [independent Dart and Canvas](flutter-package-design.md).
- Scope: Android/iOS parity, independent distributions, continuous native/browser comparison; no publication.

## Repository and documentation ownership

The npm package stays at the repository root. The Dart package has an independent runtime.

```text
package.json, src/, tests/, examples/       existing npm package
packages/patch_map/
  pubspec.yaml, README.md, CHANGELOG.md, LICENSE
  lib/patch_map.dart                       supported Dart exports
  lib/src/api/                            detached public values and facades
  lib/src/model/                          JSON values, normalized dataset, identity
  lib/src/semantic/                       geometry, text, mutation planning
  lib/src/engine/                         state, commits and lifecycle authorities
  lib/src/rendering/                      Canvas projection and retained resources
  lib/src/host/                           Widget, input, asset and frame adapters
  test/                                  focused Dart and Widget tests
  example/                               Android/iOS consumer and comparison UI
conformance/                              revisioned fixtures, schema, coverage manifest
verification/conformance/                 inventory, JS runner, trace comparison
verification/flutter/                     package and architecture gates
.artifacts/flutter/                       ignored observations, screenshots, builds
```

Existing public API pages continue owning shared behavior. [Flutter binding](../integration/flutter.md) owns native construction, surface, input and diagnostic differences; exact Dart shapes belong to exported declarations. The [conformance design](flutter-conformance-design.md) owns equality rules. This page owns folders, dependencies and implementation sequencing. The Dart README links to contracts.

The manifest links behavior to owning documents, TS/Dart entries and executable cases. Every requirement must pass before declaring equivalence. Inventory covers API shapes, defaults, failure/lifecycle rules and dataset kinds. Fixtures contain data, commands, time and expected observations.

## Runtime dependency and ownership

Dependencies point from composition to api/engine, from engine to model/semantic and abstract ports in `packages/patch_map/lib/src/engine/ports.dart`, and from host/rendering adapters to those ports. Model/semantic use Dart core libraries only. They never import Flutter, renderer, filesystem, tests or fixtures. The public entry assembles adapters; engine never imports concrete Canvas or Widget code. No production code loads conformance files.

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

Dart construction uses asynchronous `PatchMap.create` returning a controller and `PatchMapView(controller: ...)` as the surface binding. Controller readiness and visible readiness are distinct; capture requires an attached, published surface. Domain facades retain data/targets/update/updateBatch/transaction/history/editor/selection/pointer/presentation/viewport/rotation/transform/assets/debug/capture meanings. JSON-shaped dataset and patch inputs remain detached string-keyed maps; results and stable targets use exported Dart classes. Synchronous mutations stay synchronous; cancellation and listener disposal are explicit handles.

The semantic dataset uses immutable maps and indexed targets. Structural edits use detached preparation; grid heights use validated overlays and dirty slots without full tree cloning or parsing. Renderer projection uses packed buffers and ordered batches. View changes transform existing geometry. Text measurement, assets and clocks enter through ports. The native surface supplies a monotonic clock between frames; each command samples it once so idle time cannot consume a new bar or rotation animation. Idle schedules no frames.

## Asset decoder decisions

The native backend admits bytes before decoding. PNG/JPEG/WebP/GIF use Flutter codecs; SVG uses flutter_svg/vector_graphics; AVIF uses [flutter_avif](https://pub.dev/packages/flutter_avif). WOFF/WOFF2 use the attributed Apache-2.0 container decoder with [pure Dart Brotli](https://pub.dev/packages/brotli), avoiding host-specific native compression deployment. Bundled Fira Code loads a reproducible SFNT converted from the npm WOFF2; provenance verifies glyphs, metrics and variable weights. TTF/OTF load directly. Session bindings consume the controller's visible geometry, retain the previous texture during replacement, and release superseded or unused leases. Format and failure fixtures qualify both targets.

## Sequencing and effective verification

| Unit | Implementation and completion witness |
| --- | --- |
| A Repository/contracts | Package boundaries, binding document, coverage inventory and fixture envelope; docs/import/package checks |
| B Dataset/geometry | Every element/component, normalization, hash, targets, transforms and paint order; TS/Dart fixture observations |
| C Controller/Canvas | Lifecycle, scene publication, aggregated drawing and viewport; same scene shown in web and Android emulator |
| D Editing/presentation | Atomic updates/batches/transactions, history, overlays, selection, editor and transform sessions; shared command traces and focused tests |
| E Host completeness | Text/fonts, image admission/codecs, animations, pointer/keyboard/accessibility, capture and cleanup; failure/lifecycle cases plus Android/iOS screenshots |
| F Qualification | Required manifest coverage, installed consumers, native builds, representative bar performance, final side-by-side review |

Parallel work uses agreed interfaces and disjoint ownership. Commit units after focused checks. A/B/C are intermediate work, never a reduced-function release. Unsupported placeholders or successful no-op facades do not count as implementation.

During development run only tests for the changed owner and affected conformance IDs. Rebuild native apps when a vertical slice changes observable behavior; keep the browser comparison server running. Use hot reload for UI iteration, not as release evidence. Full package checks and broad native integration run at F or after a cross-owner failure warrants them. Do not repeat the full runtime benchmark matrix; measure the selected Dart renderer on representative 5,000/10,000-bar changes.

## Distribution isolation

npm retains its existing export map and artifact allowlist. Dart ships its own lib/assets/docs/license and requires no Node/Pixi or JS engine. Native example platform scaffolding belongs to the example, not the library. Generated build/.dart_tool/Pods outputs are ignored and excluded from documentation scans. Package verifiers explicitly reject accidental cross-package payloads.

Versions are independent; contract revision and qualified capability set identify equivalent releases. npm's release-please root excludes Dart package, shared verification and Flutter-only documentation paths. Dart release tags must use a separate prefix; registry publication is not enabled (`publish_to: none`). Credentials, tags and publishing stay outside local implementation. Publication remains blocked until full conformance and both platform checks pass.

PR CI pins Flutter 3.41.4/Node 22, verifies inventory/package boundaries, runs Dart analysis/tests and an installed consumer. npm source, dependency, contract, asset and integration-document changes also select this gate. Native OS qualification remains separate; npm gates retain existing routing.
