# Dual-package implementation architecture

- Status: reviewed; independent package, runtime and conformance reviews resolved before implementation.
- Decision: [independent Dart and Canvas](flutter-package-design.md).
- Scope: full Android/iOS functionality, two independent distributable packages, continuous native/browser comparison; no registry publication in this work.

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

The contract manifest links each behavior to its owning document, TS/Dart entry and executable case. It distinguishes implemented witnesses from pending implementation; all required entries must pass before declaring feature equivalence. API inventory includes members, options, union variants, defaults, failure and lifecycle rules. Dataset kinds require explicit entries because the public loader accepts unknown input. A fixture carries dataset, commands, virtual time and expected observations, never executable source.

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

The semantic dataset stores normalized immutable maps and indexed authored/grid targets. Candidate structural edits use detached preparation; high-frequency grid heights use validated delta overlays and dirty slots, avoiding full tree clone/reparse. Renderer projection uses packed numeric buffers and ordered batches, not per-item Widgets. View-only changes update a transform without rebuilding scene geometry. Text measurement is a host port; segmentation, wrapping and overflow decisions remain semantic. Assets and clocks also enter through ports so tests can supply deterministic completions.

## Asset decoder decisions

The native asset backend receives admitted bytes, never a network URL bypassing policy. PNG/JPEG/WebP/GIF use Flutter codecs; SVG uses flutter_svg/vector_graphics decoding into retained pictures; AVIF uses the bytes decoder in [flutter_avif](https://pub.dev/packages/flutter_avif). WOFF/WOFF2 are converted to SFNT using [woff2](https://pub.dev/packages/woff2) before FontLoader, while TTF/OTF load directly. Native package versions are pinned when resolved. Font family/weight identity and glyph assets derive from the existing licensed source; no default network cache or loader owns admission. Format-specific fixtures verify the selected adapters on both targets, including unsupported collection/error behavior against the existing admission contract.

## Sequencing and effective verification

| Unit | Implementation and completion witness |
| --- | --- |
| A Repository/contracts | Package boundaries, binding document, coverage inventory and fixture envelope; docs/import/package checks |
| B Dataset/geometry | Every element/component, normalization, hash, targets, transforms and paint order; TS/Dart fixture observations |
| C Controller/Canvas | Lifecycle, scene publication, aggregated drawing and viewport; same scene shown in web and Android emulator |
| D Editing/presentation | Atomic updates/batches/transactions, history, overlays, selection, editor and transform sessions; shared command traces and focused tests |
| E Host completeness | Text/fonts, image admission/codecs, animations, pointer/keyboard/accessibility, capture and cleanup; failure/lifecycle cases plus Android/iOS screenshots |
| F Qualification | Required manifest coverage, installed consumers, native builds, representative bar performance, final side-by-side review |

Parallel work requires agreed interfaces and disjoint ownership. Each reviewable unit is committed after focused checks. A/B/C are intermediate work, never a reduced-function release. Unsupported placeholders or successful no-op facades do not count as implementation.

During development run only tests for the changed owner and affected conformance IDs. Rebuild native apps when a vertical slice changes observable behavior; keep the browser comparison server running. Use hot reload for UI iteration, not as release evidence. Full package checks and broad native integration run at F or after a cross-owner failure warrants them. Do not repeat the full runtime benchmark matrix; measure the selected Dart renderer on representative 5,000/10,000-bar changes.

## Distribution isolation

npm retains its existing export map and artifact allowlist. Dart ships its own lib/assets/docs/license and requires no Node/Pixi or JS engine. Native example platform scaffolding belongs to the example, not the library. Generated build/.dart_tool/Pods outputs are ignored and excluded from documentation scans. Package verifiers explicitly reject accidental cross-package payloads.

Versions are independent; contract revision and qualified capability set identify equivalent releases. Dart tags use a separate prefix and release job; npm release classification excludes Dart-only paths. Flutter changes cannot silently bump or publish npm. Registry credentials, tags and publishing stay outside local implementation. Publication remains blocked until full conformance and both platform checks pass.
