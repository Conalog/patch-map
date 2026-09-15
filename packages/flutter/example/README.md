# PatchMap Flutter examples

Run from this directory with Flutter 3.41.4.

## Interactive 5,000-bar demo

```sh
flutter run --profile -d DEVICE_ID --target=lib/bar_demo.dart
```

The demo creates 50 grids of 4 × 25 cells, with one bar per cell. Every press of
**전체 높이 랜덤 변경** updates all 5,000 heights to different values in 1–20.
The animation switch selects 200 ms height transitions or immediate updates.
Updates preserve the current camera and do not record history.

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
