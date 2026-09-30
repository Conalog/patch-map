# Peer package environment and releases

`packages/javascript/` owns the existing npm runtime. `packages/flutter/` owns
the new native package. The root and `verification/` are private npm workspaces;
shared behavior targets live in `conformance/`. No experiment renderer was copied.

## SDK and dependencies

Consumer bounds: Dart >=3.11.0 <4 and Flutter >=3.41.0. `.fvmrc` selects the CI
baseline, Flutter 3.41.4 / Dart 3.11.1. `packages/flutter/toolchains.json` records
that baseline separately from the referenced service SDK, Flutter 3.44.9 /
Dart 3.12.2, revision 6b182d2c7585eba26d4edce0f97630effd256c33.
Use `FLUTTER_BIN` to verify with a specific SDK; a lower bound is not an exact pin
or proof of functional compatibility across every supported version.

```sh
npm ci
npm run flutter:verify
FLUTTER_BIN=/path/to/flutter/bin/flutter npm run flutter:verify
```

Current dependencies are Flutter, bounded flutter_svg and vector_graphics for
managed asset verification. The experiment's Brotli and AVIF runtime dependencies
will be added with their codec owner and real decode tests. No Kotlin plugin source
exclusion or experimental Android DSL workaround is inherited. Android host uses
JVM 17, NDK 28.2.13676358 and a bounded 2 GiB Gradle heap.

## Verification and artifact ownership

`flutter:verify` resolves dependencies, checks formatting and analysis, runs
example tests, checks pub's dry run, and tests an extracted installed consumer.
That consumer checks the package import, actual SVG decode and bundled font load.
Its report records toolchain facts, input and artifact hashes, logs and scope.
Library resolution is unlocked; the example lock is committed.

The publication artifact contains library Dart sources, managed assets and font
license, pubspec, README, integration notes, changelog, MIT license, third-party
notices and analyzer policy. Example, tests, tools, locks, SDK pins and local
artifacts are excluded. The verifier rejects unknown inputs and symlinks and
checks extracted bytes before resolving the independent consumer.

CI's stable `CI` aggregate includes changed-package JS, Flutter, shared-tooling
and Android/iOS host build checks. Host builds do not qualify rendering or devices.
The service SDK can be checked locally with the same commands; CI retains its
recorded baseline. iOS simulator builds additionally require the selected Xcode's
iOS platform installation.

```sh
cd packages/flutter/example
flutter pub get --enforce-lockfile
flutter build apk --debug --no-pub
flutter build ios --simulator --debug --no-codesign --no-pub
```

Native smoke verification runs the development host, SVG raster decode, bundled
font load and widget teardown on a selected simulator or device:

```sh
cd packages/flutter/example
flutter test --no-pub -d <device-id> integration_test/foundation_test.dart
```

This covers foundation host wiring and assets; public map functionality remains
pending. Integration tests and reports are excluded from the publication artifact.

## Independent release contract

`release-please-config.json` plans separate npm and Dart release PRs with `js-v`
and `dart-v` tags. The pinned planner retains npm's actual historical v1.0.0-alpha.9
boundary until its first prefixed release. Dart-only releases leave the npm
package and root lock version unchanged. Its initial planned version is
1.0.0-alpha.1; the release manifest receives Dart only after that release.

`publish.yaml` publishes the verified npm artifact. `publish-dart.yaml` checks
exact identity, ancestry and artifact bytes; publication additionally requires
`PUBDEV_PUBLISH_ENABLED`, the `pub.dev` environment, and complete collected
Android/iOS and shared contract evidence. `implementationStatus: foundation` in
the contract manifest rejects qualification even with complete-looking reports.
`publish_to: none` also rejects Dart publication identity. Definition checks and
asset consumer tests cannot claim public SDK parity.

The first pub.dev upload requires a functional, qualified package and explicit
publication authorization. After first upload, configure repository OIDC with
`dart-v{{version}}` and the `pub.dev` environment. The [official automated
publishing guide](https://dart.dev/tools/pub/automated-publishing) requires an
existing package and a tag-push workflow. External accounts, variables, secrets,
tags and registries are not configured by this foundation change.
