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

`release-please.yaml` runs on `release/1.0` pushes or manual invocation and plans separate PRs, tags and GitHub Releases. Registry writes and publication
Node.js versions belong to the [npm workflow](../../.github/workflows/publish.yaml)
and [Dart workflow](../../.github/workflows/publish-dart.yaml). Keep historical `v*` releases; the pinned planner uses npm's actual v1.0.0-alpha.9 boundary until its first prefixed
release. Dart-only releases leave npm and the root lock version unchanged. Dart starts at alpha.1; its manifest entry appears in the first release PR, not
before planning. Release histories live in the package-local [JavaScript changelog](../../packages/javascript/CHANGELOG.md)
and [Flutter changelog](../../packages/flutter/CHANGELOG.md); preserve their historical release links.

The planner writes Dart's exact planned version into `pubspec.yaml`, retaining
YAML comments and publication blocks. Package versions do not inherit or
increment application build numbers; pubspec, manifest and release tag versions
must agree.

Review and merge each generated release PR after `CI`. `feat`, `fix`, `perf` and `deps` feed changelogs; use `BREAKING CHANGE:` for breaking behavior. Validate
both implementations and the intended pair before releasing shared behavior. Channels are independent: a transition needs a one-time `Release-As:` footer (e.g.
`1.0.0-beta.1`) and matching prerelease settings; remove those settings for stable promotion and inspect the generated PR. npm maps prereleases to `next` and
stable to `latest`, rejecting backward movement; pub.dev has no dist-tags.

[Shared asset changes](shared-assets.md) are routed into the consuming package
histories before their independent release boundaries are applied. SVG, WOFF2,
license and preparation changes affect both; native TTF/provenance-only changes
affect Dart. Generated package-local copies are not release-planning inputs.

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
node verification/assets/prepare.mjs flutter
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

If a planner fix must repair files in an open release PR without changing its
release notes, manually run `release-please.yaml` on `release/1.0` with
`force_update: true`. This uses the planner's existing forced-update path to
refresh pending PRs; ordinary branch pushes still skip unchanged release notes.
Use it after the planner fix is merged, then check the updated PR files and CI.
