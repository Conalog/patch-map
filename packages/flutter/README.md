# PatchMap for Flutter

`conalog_patch_map` provides an experimental native retained diagram renderer,
version 1.0.0-alpha.1. The widget/controller runtime is implemented. Representative
native behavior, lifecycle and emulator performance checkpoints have run; full
platform and consumer compatibility qualification remains incomplete.
`publish_to: none` continues to block registry publication.

## Consumer setup

Consumer bounds are Dart >=3.11.0 <4.0.0 and Flutter >=3.41.0. Exact CI and
service SDK identities live in the repository's [toolchain metadata](https://github.com/Conalog/patch-map/blob/release/1.0/packages/flutter/toolchains.json).
Current device profiling uses Flutter 3.47.6. That evidence does not replace
qualification on the declared SDK roles or other platforms.

```yaml
dependencies:
  flutter:
    sdk: flutter
  conalog_patch_map:
    path: ../patch-map/packages/flutter
```

The public import is `package:conalog_patch_map/conalog_patch_map.dart`.
Managed `object`, `device`, `loading`, `warning`, and `wifi` SVG icons and Fira
Code font assets are included. Equipment aliases such as `inverter`, `combiner`,
and `edge` must be provided through `symbols`. See [third-party notices](THIRD_PARTY_NOTICES.md).
For checkout path dependencies, run `npm run assets:prepare -- flutter` from the
repository root before dependency resolution. Packaged artifacts include assets.

## Widget and commands

Retain one controller in the application's State, and provide a bounded surface:

```dart
final controller = PatchMapController();

PatchMapView(
  controller: controller,
  initialData: diagram, // Existing JSON List/Map schema; retain this input identity.
  loadingBuilder: (_) => const Center(child: CircularProgressIndicator()),
  onImageFailure: (failures) { /* Report target, code, message, and path. */ },
  onEvent: (event) {
    if (event.kind == PatchMapInputKind.tap && event.target != null) {
      controller.toggleSelection([event.target!.id]);
    }
  },
);

// After attachment: complete or sparse presentation values are both accepted.
final result = await controller.updateValues([
  PatchMapUpdate(
    PatchMapTarget('grid-1.0.0', componentId: 'number'),
    {'text': '1234'},
  ),
]);
```

`draw(data)` replaces the whole diagram. Accepted replacement hides the previous
surface, resets selection/gestures and fits the new bounds while keeping rotation.
Use `loadingBuilder` for the host's spinner. Invalid replacement preserves the
current drawing. A changed non-null `initialData` identity also requests replacement;
use `updateValues` for ordinary display-value changes.

Updates retain omitted fields and use the schema's field-specific reset rules.
Inputs are detached and validated atomically; preparation failures retain the
whole previous item while independent items can succeed. The runtime composes
waiting fields to their latest values. Result `outcome`, `failures`, `superseded`,
and `interruption` are independent diagnostics. Unexpected implementation errors
complete the Future with its original error/stack. Completion confirms drawing
submission, not animation end or physical display presentation.

| Commands | Behavior |
| --- | --- |
| `getValue(target)` | Immutable current effective record; null for a missing target |
| `fit(targets:, padding:)` | Fit all or named targets; preserve rotation |
| `focus(ids, padding:)` | Move to targets; preserve scale and rotation |
| `setCamera(center:, scale:, rotation:)` | World center, logical scale, radians |
| `toWorld(local)` / `toLocal(world)` | Convert logical-pixel coordinates |
| `select` / `addSelection` / `removeSelection` / `toggleSelection` / `clearSelection` | Library-owned selection; host chooses actions |

`dragMode` is pan by default; range and paint modes detect objects and report
callbacks. Input filters only judge candidates: make map changes in result
callbacks. Move callbacks are coalesced per frame while intermediate path hits
are retained. Interrupted drags have one end event with a reason; widget removal
does not emit a new callback. No domain fetching or business action is built in.

The widget owns resources. Removal closes its session; the controller can then
attach to another widget without replaying detached commands. One controller
cannot attach to two live widgets. App background and `active: false` suspend
preparation/frames while preserving the latest admitted values. `colors` and
`symbols` are attachment configuration; changing them requires a new widget key.
Image preparation is asynchronous and does not block the first screen or trigger
a second ready transition.

## Scope and verification

The runtime covers item, grid, group, relations, image, text, rect and the four
item components (background, bar, icon, text). It retains scene geometry and
uses CustomPainter, shared text/SVG resources, and internal bar optimizations.
Editor features, PNG export and per-item screen-reader support are excluded from
the first release. Advanced text effects and full consumer/platform equivalence
must not be inferred from synthetic numeric or unit-test results.

The package-consuming example exercises regular and varied aligned groups of
10,000 panels plus devices, with number/bar/mixed updates and navigation. Its
README explains inputs, measurement boundaries and reproducible profile commands.
Performance checkpoints establish their recorded scope, not release approval or
deployed WebView equivalence. See the [delivery coverage](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/flutter-runtime/coverage.md)
for measured outcomes and remaining qualification.
See the repository [development environment](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/flutter-package.md),
[runtime contracts](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/flutter-runtime/contracts.md)
and [release operations](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/releases.md).
