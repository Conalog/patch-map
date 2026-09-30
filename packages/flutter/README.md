# PatchMap for Flutter

`conalog_patch_map` is a native Flutter package foundation, version 1.0.0-alpha.1.
There is no map rendering or interaction API yet. The Android/iOS example is a
development host; `publish_to: none` blocks registry publication.

## Consumer setup

Consumer bounds are Dart >=3.11.0 <4.0.0 and Flutter >=3.41.0. CI uses Flutter
3.41.4 / Dart 3.11.1. The referenced service environment uses Flutter 3.44.9 /
Dart 3.12.2; exact SDK facts live in repository toolchain metadata.

```yaml
dependencies:
  flutter:
    sdk: flutter
  conalog_patch_map:
    path: ../patch-map/packages/flutter
```

The public import is `package:conalog_patch_map/conalog_patch_map.dart`.
It exports no runtime API. Managed icons and Fira Code font assets are included
and verified from an extracted artifact. See [integration](INTEGRATION.md) and
[third-party notices](THIRD_PARTY_NOTICES.md) for their scope and licenses.

## Development host

```sh
flutter pub get
cd example
flutter pub get
flutter run
```

Android/iOS builds verify host wiring. Runtime behavior, device performance,
accessibility and capture still require implementation and qualification.
See the repository [environment and release workflow](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/flutter-package.md).
