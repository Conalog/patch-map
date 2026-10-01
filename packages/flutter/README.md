# PatchMap for Flutter

`conalog_patch_map` is a native Flutter package foundation, version 1.0.0-alpha.1.
There is no map rendering or interaction API yet. The Android/iOS example is a
development host; `publish_to: none` blocks registry publication.

## Consumer setup

Consumer bounds are Dart >=3.11.0 <4.0.0 and Flutter >=3.41.0. Exact CI and
service SDK identities live in the repository's [toolchain metadata](https://github.com/Conalog/patch-map/blob/release/1.0/packages/flutter/toolchains.json).
CI checks analysis, tests and installed assets on both roles; native host builds
use the recorded CI baseline.

```yaml
dependencies:
  flutter:
    sdk: flutter
  conalog_patch_map:
    path: ../patch-map/packages/flutter
```

The public import is `package:conalog_patch_map/conalog_patch_map.dart`.
It exports no runtime API. Managed `object`, `device`, `loading`, `warning`, and
`wifi` icons and Fira Code font assets are included
and verified from an extracted artifact. Use this foundation for independent
package development. Service integration begins after the selected runtime
capabilities are implemented and qualified. See [third-party notices](THIRD_PARTY_NOTICES.md)
for asset scope and licenses.
Equipment icons (`inverter`, `combiner`, `edge`) are not bundled.
When using a repository checkout as a path dependency, prepare its generated
assets from the repository root with `npm run assets:prepare -- flutter` before
Flutter dependency resolution. Published artifacts include the prepared assets.

## Development host

```sh
node verification/assets/prepare.mjs flutter # from the repository root
cd packages/flutter
flutter pub get
cd example
flutter pub get
flutter run
```

Android/iOS builds verify host wiring. Runtime behavior, device performance,
accessibility and capture still require implementation and qualification.
See the repository [development environment](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/flutter-package.md)
and [release operations](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/releases.md).
