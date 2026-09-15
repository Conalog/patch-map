# PatchMap for Flutter

Native Dart controller and Flutter Canvas rendering for PATCH MAP datasets,
targeting the `@conalog/patch-map` 1.0.0-alpha.7 contract on Android and iOS.
It runs without a WebView, JavaScript engine or Node runtime. Release
qualification is recorded separately from implementation; registry publishing
is disabled.

## Use the local package

```yaml
dependencies:
  patch_map:
    path: ../patch-map/packages/flutter
```

Create a controller once outside `build`, then attach it to a Widget:

```dart
import 'package:patch_map/patch_map.dart';

final controller = await PatchMap.create(
  data: [
    {'id': 'zone', 'type': 'rect',
     'size': {'width': 100, 'height': 80}, 'fill': '#2563eb'},
  ],
);

// Place this Widget in bounded layout; keep the controller across rebuilds.
final view = PatchMapView(controller: controller);
```

After the Widget is attached, `await controller.ready` waits for its first
published frame. Mutations are synchronous and preserve atomic failure and
history semantics:

```dart
final result = controller.update({
  'id': 'zone', 'changes': {'fill': '#16a34a'},
});
controller.history.undo();
final png = await controller.capture.png();
// The controller owner releases it when the screen is permanently removed.
await controller.destroy();
```

`ready` requires an attached surface; do not await it before mounting the Widget.
An unattached controller refuses rendering-dependent mutations. A screen that
finishes asynchronous creation after disposal must destroy that late controller.

The example contains gallery, update/history, editor and image/font scenes using
the same fixtures as the npm comparison page. From `example/`, run
`flutter run -d <emulator-or-simulator-id>`.

Shared behavior is documented in the repository's
[API documentation](https://github.com/Conalog/patch-map/tree/release/1.0/docs/api).
The [Flutter binding](https://github.com/Conalog/patch-map/blob/release/1.0/docs/integration/flutter.md)
describes native construction, coordinates and lifecycle.
