# Peer package environment and releases

`packages/javascript/` owns the existing npm runtime. `packages/flutter/` owns
the new native package. The root and `verification/` are private npm workspaces;
shared behavior targets live in `conformance/`. No experiment renderer was copied.

## SDK and dependencies

Consumer bounds: Dart >=3.11.0 <4 and Flutter >=3.41.0. Exact CI and service
SDK versions, bundled Dart versions and official framework revisions have one
source: `packages/flutter/toolchains.json`. `.fvmrc` is its checked CI derivative.
After editing the metadata, synchronize FVM and verify both installed SDKs:

```sh
node verification/flutter/toolchains.mjs sync-fvm
npm ci
FLUTTER_TOOLCHAIN_ROLE=ci FLUTTER_BIN=/baseline/bin/flutter npm run flutter:verify
FLUTTER_TOOLCHAIN_ROLE=service FLUTTER_BIN=/service/bin/flutter npm run flutter:verify
```

The selector emits workflow setup outputs; `check ci` checks the installed SDK.
An exact pin verifies tooling; consumer lower bounds do not prove every version's
functional compatibility. Service checks use a temporary copy to resolve their
example lock without changing the baseline's committed lock.

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
and Android/iOS host build checks. Flutter analysis, tests and installed-consumer
checks run on both recorded SDK roles. Native hosts build on the CI baseline;
shared contract definitions and release tooling need only Node. Host builds do
not qualify rendering or devices. iOS simulator builds additionally require the
selected Xcode's iOS platform installation.

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
