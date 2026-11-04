# Independent npm and Dart releases

This page owns version planning, tags, registry publication, external setup and
retries for the two peer packages. Flutter SDK and native host setup belong to
the [development environment](flutter-package.md). Consumer support belongs to
each package's public documentation; release automation does not qualify it.

## Independent release contract

| Owner | Registry/version source | Tag / release PR |
| --- | --- | --- |
| `packages/javascript` | npm `@conalog/patch-map` / [package.json](../../packages/javascript/package.json) | `js-v<version>` / `chore: release js <version>` |
| `packages/flutter` | pub.dev `conalog_patch_map` / [pubspec.yaml](../../packages/flutter/pubspec.yaml) | `dart-v<version>` / `chore: release dart <version>` |

`release-please.yaml` runs on `release/1.0` pushes and plans separate PRs, tags and GitHub Releases. Registry writes and publication
Node.js versions belong to the [npm workflow](../../.github/workflows/publish.yaml)
and [Dart workflow](../../.github/workflows/publish-dart.yaml). Keep historical `v*` releases; the pinned planner uses npm's actual v1.0.0-alpha.9 boundary until its first prefixed
release. Dart-only releases leave npm and the root lock version unchanged. Dart starts at alpha.1; its manifest entry appears in the first release PR, not
before planning. Release histories live in the package-local [JavaScript changelog](../../packages/javascript/CHANGELOG.md)
and [Flutter changelog](../../packages/flutter/CHANGELOG.md); preserve their historical release links.

The planner writes Dart's exact version into `pubspec.yaml` and the example's
path dependency lock while preserving other YAML bytes. Package versions do not
inherit application build numbers. Pubspec, manifest and tag versions must agree.

Review and merge each generated release PR after `CI`. `feat`, `fix`, `perf` and `deps` feed changelogs; use `BREAKING CHANGE:` for breaking behavior. Validate
both implementations and the intended pair before releasing shared behavior. Channels are independent: a transition needs a one-time `Release-As:` footer (e.g.
`1.0.0-beta.1`) and matching prerelease settings; remove those settings for stable promotion and inspect the generated PR. npm maps prereleases to `next` and
stable to `latest`, rejecting backward movement; pub.dev has no dist-tags.

[Shared asset changes](shared-assets.md) are routed into the consuming package
histories before their independent release boundaries are applied. SVG, WOFF2,
license and preparation changes affect both; native TTF/provenance-only changes
affect Dart. Generated package-local copies are not release-planning inputs.

Dart publishing requires tag/package/manifest identity, branch ancestry, verified artifact bytes and executed Android/iOS renderer qualification. The shared
conformance gate continues to reject full JS/Dart parity at the foundation stage. Private packages with `publish_to: none` cannot publish.

Package-local changes feed that package's history. Shared product contracts
under `conformance/` (excluding Markdown guidance) feed both histories; shared assets and their preparation
retain the consumer-specific routing above. Routing preserves each package's
published boundary and deduplicates mixed commits once per consumer.

Repository automation and validation do not assign release ownership:
`.github/`, general `verification/` (including Flutter qualification), root
`package.json`, `.nvmrc`, `release-please-config.json` and
engineering guidance do not create consumer release notes by themselves. A JS
feature that also changes the root lockfile remains JS-only. A tooling-only fix
does not create a package release or change consumer notes.
Immutable root lock changes in the JS build/runtime dependency closure feed JS
notes; private verifier-only changes do not. Unresolvable lock ownership fails
JS planning explicitly, without blocking Dart. Only the existing `feat`, `fix`, `perf` and `deps` release rules create notes for
affected packages; `ci`, `docs`, `test` and `chore` remain maintenance.

Release planning ownership and PR CI gate selection are separate decisions.
Tooling, dependency and workflow changes retain the validation required by
[verification policy](verification.md), even when they produce no release notes.
A Dart release PR still runs its own required native checks; unrelated JS work
must not add a Dart note or cause a needless update of that PR.

The initial peer-release bootstrap starts immediately after the last
single-package npm release, `v1.0.0-alpha.9`. This includes the peer-package
foundation and later common changes without presenting historical npm-only
features as Dart additions. Once published, each package uses its own release
boundary; the bootstrap does not replace either package's release history.

## External setup and first Dart publication

Configure only with explicit authorization: `RELEASE_PLEASE_TOKEN` must be a fine-grained bot PAT with Contents, Issues and Pull requests write access;
`GITHUB_TOKEN` cannot trigger downstream tag workflows. Protect `release/1.0` and release tags and require `CI` for every release PR. `Analyze workflow policy`
is path-filtered; making it universally required would stall version-only PRs. Keep npm Trusted Publishing bound to `Conalog/patch-map`, `publish.yaml` and
`npm`, allowing `js-v*` environment deployments. Its switches are `NPM_PUBLISH_ENABLED`, `NPM_PRERELEASE_ENABLED`, `NPM_LATEST_ENABLED`; only `true` enables
publication or its selected channel. See [npm's setup guide](https://docs.npmjs.com/trusted-publishers/).

Keep `PUBDEV_PUBLISH_ENABLED` false/unset during bootstrap. Confirm package ownership/availability, then merge the release PR for the first publishable
version. Leave any private tag on its original commit. Pub.dev requires a manual first upload. On the new tag use Node 22, the CI SDK, and one running
Android and iOS device or simulator. Run the [renderer checks](flutter-runtime/coverage.md) against the exact tagged artifact:

```sh
node verification/flutter/toolchains.mjs check ci
npm ci
node verification/assets/prepare.mjs flutter
(cd packages/flutter && flutter pub get)
node .github/scripts/release-ready.mjs --scope dart
node .github/scripts/release-metadata.mjs dart "$(git describe --tags --exact-match --match 'dart-v*')"
node .github/scripts/dart-release.mjs prepare
node verification/flutter/renderer-qualification.mjs android <android-device-id>
node verification/flutter/renderer-qualification.mjs ios <ios-device-id>
node .github/scripts/dart-release.mjs collect
node .github/scripts/pub-artifact.mjs extract
cd "$(cat .release-dart/publication-directory.txt)"
flutter pub get
flutter pub publish --dry-run
flutter pub publish
```

The last command requires operator authorization and login. Attach `.release-dart/dart-qualification.json` to the GitHub Release and retain both native logs
and the qualification record. After upload, authorize `Conalog/patch-map` with pattern `dart-v{{version}}` and required environment
`pub.dev`, then enable the variable. See [pub.dev's automation guide](https://dart.dev/tools/pub/automated-publishing).

## Retry and partial success

Tag runs retain `dart-candidate-<SHA>` with the tarball, installed report and source snapshot. When publication is enabled, GitHub runs Android and iOS
renderer tests on that candidate and joins both reports before uploading to pub.dev. `dart-qualified-<SHA>` retains the archive and qualification envelope.
The iOS job pins macOS 15, Xcode 26.3 and iOS 26.2. Keep CocoaPods aligned in `Gemfile.lock` and `Podfile.lock` to preserve tagged build inputs.
Workflow PRs exercise the same qualification without publishing. Retry failed jobs on the original tag run and inspect the per-platform renderer logs.
Record the actual package version, artifact and successful run URL separately from qualification.

Registry writes are independent. On partial success, record each registry's actual state and retry only the failed package: npm accepts the existing tag through
`publish.yaml`'s `tag` input; Dart reruns its original tag-push run, because pub.dev rejects branch/manual-dispatch publishing. Reuse immutable source and tags.
Already-published versions must match verified contents (and npm's selected dist-tag); mismatches require a new fix version. Preserve source snapshots and
evidence before workflow retention expires. External setup and hosted release execution remain operator steps; local planner tests mock GitHub.

The planner executes each package independently and reports failures after
attempting its peer. Pending tags block only their owning package. Existing PRs refresh
when their actual branch head lacks the current base or planned metadata. This repairs the shared manifest after either merge
order without inventing consumer notes; unchanged current PRs skip updates.
Readiness uses `--scope repository`, `js` or `dart`; publishers validate their metadata
alongside shared policy. Local tests mock GitHub and test actual Git merge orders; hosted execution remains an operator check.
