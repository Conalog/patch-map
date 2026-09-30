# PatchMap for Flutter

`conalog_patch_map` is the foundation for a native Flutter PATCH MAP package.
It currently has **no map rendering or interaction API** and is not published.
The Android/iOS example is a development host, not a functional map demo.

## Local dependency

Requires Dart >=3.11.1 <4.0.0 and Flutter >=3.41.4. Development and CI use
Flutter 3.41.4 / Dart 3.11.1.

```yaml
dependencies:
  flutter:
    sdk: flutter
  conalog_patch_map:
    path: ../patch-map/packages/flutter
```

Run `flutter pub get` in the consumer. The public import path is
`package:conalog_patch_map/conalog_patch_map.dart`; it intentionally exports
no runtime API yet. Keep application integration on a fixed package revision
while developing and measuring the library separately.

## Development host

From this package directory:

```sh
flutter pub get
cd example
flutter pub get
flutter run
```

The host has Android and iOS scaffolding. These targets are intended for the
first implementation; renderer behavior and performance are not yet qualified.
No web or desktop support is claimed.

## Development and release

See the repository's [Flutter package workflow](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/flutter-package.md)
for verification, package contents and first-release steps. `publish_to: none`
blocks uploads until a functional release is ready; CI only performs a dry run.
