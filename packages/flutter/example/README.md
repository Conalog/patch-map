# PatchMap Flutter examples

Run from this directory with Flutter 3.41.4.

## Interactive 5,000-panel service demo

```sh
flutter run --profile -d DEVICE_ID --target=lib/bar_demo.dart
```

The shared input is `conformance/scenes/panel-groups.json`: 50 panelGroups,
5 rows × 20 columns each, using the real `patch-service` editor template merged
with its dashboard `panelInitialState`. Panels are 40 × 80 with padding 3,
gap 4, white rounded background, dark border, tinted bar and centered auto-size
text. The hidden loading icon is retained. Source revision and paths are recorded
in the JSON; stable component IDs and deterministic group placement are demo
adaptations. No private plant data is included.

- **Bar 높이**: `bar.show: true`, `text.show: false`. The button changes all
  5,000 heights to different values in 1–100% of the 74-unit content height.
  The animation switch uses the package's default 200 ms transition.
- **Text 값**: `bar.show: true` at 100%, `text.show: true`. The button changes
  only the 5,000 text values (1–9,999), each different from its previous value.
  Height animation is disabled in this mode. Switching back restores the last
  chart heights; switching to text restores its last values.

Both modes keep the same scene and camera, use one `updateBatch` per click,
and disable history. The mode transition updates both component kinds; its
applied count can be 10,000 component changes across 5,000 panels.

The npm counterpart uses the same JSON and seeded update sequence:

```sh
# From the repository root
npm run verify:conformance:serve
```

Open `http://127.0.0.1:5173/verification/conformance/web/panels.html`.
Reload each app to reset the seed. After editing the JSON, run
`node verification/flutter/prepare-fixtures.mjs` before restarting Flutter.
The generated Dart input is verified by `verification/flutter/package.mjs`.

Focused native demo regression check (from this directory):

```sh
flutter test test/panel_demo_test.dart
```

Drag anywhere on the map to pan. Pinch to zoom, or use the zoom buttons.
**전체 보기** fits all grids to the available screen. The footer shows the
applied count; the camera label updates after movement settles. Rendering uses
`PatchMapView` directly, without an enclosing scroll view or per-bar Widgets.

To prepare an ARM64 Android APK without a connected device:

```sh
flutter build apk --profile --target-platform android-arm64 --target=lib/bar_demo.dart
```

Output: `build/app/outputs/flutter-apk/app-profile.apk`.

## Shared contract comparison

```sh
flutter run -d DEVICE_ID --target=lib/main.dart
```

This opens the gallery, updates, editor and codec fixtures. The matching npm
comparison is served by `verification/conformance/vite.config.ts` at the
repository root. The Reset buttons restore the same random seed.
