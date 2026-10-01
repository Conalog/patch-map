# Flutter development environment

`packages/javascript/` owns the existing npm runtime. `packages/flutter/` owns the new native package. The root and `verification/` are private npm workspaces;
shared behavior targets live in `conformance/`. The Flutter runtime must not import
JavaScript or verification tooling. Independent versioning and publication
belong to [release operations](releases.md).

## SDK and dependencies

Consumer bounds: Dart >=3.11.0 <4 and Flutter >=3.41.0. Exact CI and service SDK versions, bundled Dart versions and official framework revisions have one
source: `packages/flutter/toolchains.json`. `.fvmrc` is its checked CI derivative. After editing the metadata, synchronize FVM and verify both installed SDKs:

```sh
node verification/flutter/toolchains.mjs sync-fvm
npm ci
FLUTTER_TOOLCHAIN_ROLE=ci FLUTTER_BIN=/baseline/bin/flutter npm run flutter:verify
FLUTTER_TOOLCHAIN_ROLE=service FLUTTER_BIN=/service/bin/flutter npm run flutter:verify
```

The selector emits workflow setup outputs; `check ci` checks the installed SDK. An exact pin verifies tooling; consumer lower bounds do not prove every
version's functional compatibility. Service checks use a temporary copy to resolve their example lock without changing the baseline's committed lock.

Current managed-asset dependencies are Flutter, bounded flutter_svg and
vector_graphics, declared in [pubspec.yaml](../../packages/flutter/pubspec.yaml).
Codec inputs remain [conformance targets](../../conformance/README.md); this
foundation has no codec runtime. Android host uses JVM 17, NDK 28.2.13676358
and a bounded 2 GiB Gradle heap.

## Verification and artifact ownership

`flutter:verify` resolves dependencies, checks formatting and analysis, runs example tests, checks pub's dry run, and tests an extracted installed consumer.
That consumer checks the package import, actual SVG decode and bundled font load. Its report records toolchain facts, input and artifact hashes, logs and scope.
Library resolution is unlocked; the example lock is committed.

The publication artifact contains library Dart sources, managed assets and font
license, pubspec, README, changelog, MIT license, third-party
notices and analyzer policy. Example, tests, tools, locks, SDK pins and local
artifacts, including FVM's local `.fvm/` cache, are excluded. The verifier rejects
unknown inputs and product symlinks and
checks extracted bytes before resolving the independent consumer.

CI's stable `CI` aggregate includes changed-package JS, Flutter, shared-tooling and Android/iOS host build checks. Flutter analysis, tests and
installed-consumer checks run on both recorded SDK roles. Native hosts build on the CI baseline; shared contract definitions and release tooling need only Node.
Host builds do not qualify rendering or devices. iOS simulator builds additionally require the selected Xcode's iOS platform installation.

```sh
cd packages/flutter/example
flutter pub get --enforce-lockfile
flutter build apk --debug --no-pub
flutter build ios --simulator --debug --no-codesign --no-pub
```

For native smoke checks, run `flutter test --no-pub -d <device-id> integration_test/foundation_test.dart` in the example. This checks host wiring, SVG decode,
font load and teardown; public map functionality remains pending. Integration tests and reports are excluded from the artifact.
