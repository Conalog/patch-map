# Peer package environment and releases

`packages/javascript/` owns the existing npm runtime. `packages/flutter/` owns the new native package. The root and `verification/` are private npm workspaces;
shared behavior targets live in `conformance/`. No experiment renderer was copied.

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

Current dependencies are Flutter, bounded flutter_svg and vector_graphics for managed asset verification. The experiment's Brotli and AVIF runtime dependencies
will be added with their codec owner and real decode tests. No Kotlin plugin source exclusion or experimental Android DSL workaround is inherited. Android host
uses JVM 17, NDK 28.2.13676358 and a bounded 2 GiB Gradle heap.

## Verification and artifact ownership

`flutter:verify` resolves dependencies, checks formatting and analysis, runs example tests, checks pub's dry run, and tests an extracted installed consumer.
That consumer checks the package import, actual SVG decode and bundled font load. Its report records toolchain facts, input and artifact hashes, logs and scope.
Library resolution is unlocked; the example lock is committed.

The publication artifact contains library Dart sources, managed assets and font
license, pubspec, README, integration notes, changelog, MIT license, third-party
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

## Independent release contract

| Owner | Registry/version source | Tag / release PR |
| --- | --- | --- |
| `packages/javascript` | npm `@conalog/patch-map` / `package.json` | `js-v<version>` / `chore: release js <version>` |
| `packages/flutter` | pub.dev `conalog_patch_map` / `pubspec.yaml` | `dart-v<version>` / `chore: release dart <version>` |

`release-please.yaml` runs on `release/1.0` pushes or manual invocation and plans separate PRs, tags and GitHub Releases. Registry writes belong to
`publish.yaml` and `publish-dart.yaml`. Keep historical `v*` releases; the pinned planner uses npm's actual v1.0.0-alpha.9 boundary until its first prefixed
release. Dart-only releases leave npm and the root lock version unchanged. Dart starts at alpha.1; its manifest entry appears in the first release PR, not
before planning.

Review and merge each generated release PR after `CI`. `feat`, `fix`, `perf` and `deps` feed changelogs; use `BREAKING CHANGE:` for breaking behavior. Validate
both implementations and the intended pair before releasing shared behavior. Channels are independent: a transition needs a one-time `Release-As:` footer (e.g.
`1.0.0-beta.1`) and matching prerelease settings; remove those settings for stable promotion and inspect the generated PR. npm maps prereleases to `next` and
stable to `latest`, rejecting backward movement; pub.dev has no dist-tags.

Dart publishing requires exact tag/package/manifest identity, branch ancestry, verified artifact bytes and complete Android/iOS and shared qualification. Both
`publish_to: none` and `implementationStatus: foundation` block publication; asset tests and contract definitions cannot qualify the public runtime.

## External setup and first Dart publication

Configure only with explicit authorization: `RELEASE_PLEASE_TOKEN` must be a fine-grained bot PAT with Contents, Issues and Pull requests write access;
`GITHUB_TOKEN` cannot trigger downstream tag workflows. Protect `release/1.0` and release tags and require `CI` for every release PR. `Analyze workflow policy`
is path-filtered; making it universally required would stall version-only PRs. Keep npm Trusted Publishing bound to `Conalog/patch-map`, `publish.yaml` and
`npm`, allowing `js-v*` environment deployments. Its switches are `NPM_PUBLISH_ENABLED`, `NPM_PRERELEASE_ENABLED`, `NPM_LATEST_ENABLED`; only `true` enables
publication or its selected channel. See [npm's setup guide](https://docs.npmjs.com/trusted-publishers/).

Keep `PUBDEV_PUBLISH_ENABLED` false/unset during bootstrap. First implement and qualify the functional package, remove its foundation publication blocks in a
reviewed change, confirm package ownership/availability, then merge alpha.1's release PR. Pub.dev requires the first version's manual upload. On a clean
checkout of `dart-v1.0.0-alpha.1`, use Node 22 and the recorded CI SDK. Gather actual executed reports with the [existing
collector](../../verification/conformance/collect-evidence.md):

```sh
node verification/flutter/toolchains.mjs check ci
npm ci
(cd packages/flutter && flutter pub get)
node .github/scripts/release-ready.mjs
node .github/scripts/release-metadata.mjs dart dart-v1.0.0-alpha.1
node .github/scripts/dart-release.mjs prepare
node .github/scripts/dart-release.mjs qualify /absolute/path/to/collected-evidence.json
node .github/scripts/pub-artifact.mjs extract
cd "$(cat .release-dart/publication-directory.txt)"
flutter pub get
flutter pub publish --dry-run
flutter pub publish
```

The last command requires operator authorization and login. Attach the collected envelope as `dart-qualification.json` to that GitHub Release and retain the
compatibility record. After upload, create environment `pub.dev`, authorize `Conalog/patch-map` with pattern `dart-v{{version}}` and required environment
`pub.dev`, then enable the variable. See [pub.dev's automation guide](https://dart.dev/tools/pub/automated-publishing).

## Retry and partial success

The Dart tag run retains `dart-candidate-<SHA>` with the exact tarball, installed report and source snapshot. Collect affected evidence for those inputs, attach
its envelope and rerun the original tag-push execution. Enabling publication requires the full qualification gate and retains `dart-qualified-<SHA>` with
compatibility evidence. Source/contract/lock drift requires fresh affected reports; never relabel old evidence. The publisher checks and extracts the qualified
artifact. `qualified` and `publication: not-recorded` record qualification without establishing publication success: record actual package versions, artifact identity and successful run URL in the
GitHub Release, separately from the qualified pair.

Registry writes are independent. On partial success, record each registry's actual state and retry only the failed package: npm accepts the existing tag through
`publish.yaml`'s `tag` input; Dart reruns its original tag-push run, because pub.dev rejects branch/manual-dispatch publishing. Reuse immutable source and tags.
Already-published versions must match verified contents (and npm's selected dist-tag); mismatches require a new fix version. Preserve source snapshots and
evidence before workflow retention expires. External setup and hosted release execution remain operator steps; local planner tests mock GitHub.
