# Flutter package development and release

Owner: `packages/flutter/`; verification: `verification/flutter/run.mjs`;
CI: `.github/workflows/flutter.yaml`. The JavaScript package keeps its existing
release process. Flutter package versions and future `flutter-v<version>` tags
are independent of npm versions and `v<version>` tags.

## Development baseline

Use Node.js 22 (`nvm use`) for repository commands. The Flutter SDK pin is
`packages/flutter/.fvmrc`: Flutter 3.41.4 / Dart 3.11.1. FVM is optional; a
matching SDK on PATH works. CI reads this pin and the verifier rejects drift.
Runtime SDK lower bounds in pubspec are consumer constraints, not CI pins.

```sh
npm run flutter:analyze
npm run flutter:test
npm run flutter:verify
```

`flutter:verify` resolves dependencies, checks formatting and analysis, runs
example widget tests, validates publication and checks an extracted consumer.
Package tests will also run when a package `test/` directory is added. Currently
there is no renderer or public runtime API; the example only validates the host.
Its lockfile is committed; library resolution is unlocked for consumer coverage.
Native builds are separate CI gates, using the generated Android/iOS host.

```sh
cd packages/flutter/example
flutter pub get --enforce-lockfile
flutter build apk --debug --no-pub
flutter build ios --simulator --debug --no-codesign --no-pub
```

Android needs a JDK and Android SDK. iOS simulator builds need macOS and Xcode.
If Xcode reports no eligible simulator destination, install the iOS platform
matching the selected Xcode in Settings > Components before rerunning the gate.
These builds qualify host wiring, not device rendering, performance or App Store
distribution. Do not claim platform support before renderer qualification.

## Artifact boundary

`.pubignore` permits library Dart sources, README, changelog, MIT license,
pubspec and the minimal Dart example. Native scaffolding, tests, SDK metadata,
locks, local assets and benchmark evidence stay outside the published package.
Add any future required assets to both the pubignore policy and verifier.

`npm run verify:flutter-package` takes a fresh snapshot of tracked and non-ignored
untracked package files, runs pub's dry run, then uses Dart 3.11.1's archive-only
`--to-archive` option. It verifies actual archive entries and resolves/analyzes
the example against extracted package sources outside the repository. The
archive lives in ignored `.artifacts/flutter/package.tar.gz`; it is local
verification evidence, not an approved release. Recheck the archive option when
upgrading the SDK. This path never authenticates or uploads.

## First release

`publish_to: none` deliberately blocks uploads while only the foundation exists.
Before enabling a release, implement and qualify the minimum native map behavior
with recorded consumer inputs and overlapping request flows. Verify final-state
correctness, camera/selection continuity and device performance separately from
the service app. Do not migrate the previous experiment wholesale or infer speed
from the development host's startup.

When a functional release is explicitly authorized:

1. Confirm pub.dev name availability and the owning Google account/publisher.
2. Select an independent prerelease version and update the package changelog.
3. Remove `publish_to: none`, complete all package/native/device gates, and commit.
4. Run `flutter pub publish --dry-run` from the package root at the exact clean
   release revision, inspect the file list, then use `flutter pub publish` for the
   first upload. No credentials belong in the repository.
5. Transfer the package to the organization's verified publisher if required.
6. After the first upload, configure pub.dev's GitHub OIDC publishing for this
   repository and a `flutter-v{{version}}` tag pattern. Add a separately reviewed
   workflow with matching version/tag validation and qualified artifact checks.

CI currently has read-only permissions and no upload step. First-upload ownership
and later OIDC configuration require external account setup; they are not implied
by passing a dry run. See [publishing](https://dart.dev/tools/pub/publishing) and
[automated publishing](https://dart.dev/tools/pub/automated-publishing).
