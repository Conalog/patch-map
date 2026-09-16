# Independent package releases

One repository owns two independently versioned packages. Compatibility comes from the shared contract revision, capabilities and artifact evidence, not equal version numbers.

| Owner | Registry | Version source | Tag | Release PR title |
| --- | --- | --- | --- | --- |
| `packages/javascript` | npm `@conalog/patch-map` | `package.json` | `v<version>` | `chore: release npm <version>` |
| `packages/flutter` | pub.dev `conalog_patch_map` | `pubspec.yaml` | `dart-v<version>` | `chore: release dart <version>` |

Both packages own their changelog; root/verification npm workspaces remain private. No linked-version group is used. npm retains its tag format to preserve release history. Its baseline is the already-published `1.0.0-alpha.9` (2026-09-15); reconciling metadata does not import `main` code.

Dart starts at **`0.1.0-alpha.1`**. Before the first release PR, the release manifest intentionally has no Flutter entry. `initial-version` supplies alpha.1; the merged PR records it, and subsequent fixes advance alpha.2. Do not pre-populate that entry or add a persistent `release-as`.

## Change and version policy

Release-please routes changed file paths. Keep `type: summary` commit messages; package scopes are unnecessary. `feat`, `fix`, `perf` and `deps` produce changelog entries. Use a `BREAKING CHANGE:` footer for breaking changes.

- Runtime-specific fixes release only that package. Dart-only releases leave npm's version and root lockfile unchanged.
- Shared behavior changes include both implementations, documentation and conformance witnesses in one feature PR. Validate the intended pair before publishing either release PR.
- Test/demo/documentation-only commits do not independently require publication. Shared public docs enter the next npm artifact; behavior changes require package changes too.
- Both packages currently use independent alpha channels. Channel transitions require a one-time explicit `Release-As:` commit footer, e.g. `0.1.0-beta.1`, and matching prerelease configuration. Changing `prerelease-type` alone does not switch an existing alpha version. Starting another prerelease cycle needs an explicit numeric `.1`; remove prerelease settings when promoting to stable. Review the generated PR.
- npm prereleases use `next`, stable uses `latest`; the publisher refuses backward channel movement. Pub.dev uses its own prerelease semantics without dist-tags.

## Automation

`release-please.yaml` runs on `release/1.0` pushes or manual invocation. It owns separate release PRs, tags and GitHub Releases; it never publishes registry artifacts. `node-workspace` uses `merge: false`, updating the root lockfile only in the npm PR.

`publish.yaml` retains npm's existing trusted-publisher filename. It accepts `v*` pushes or manual retries of existing tags. Ancestry, tag/package/manifest identity, channel and installed-consumer checks precede publication of the same verified tarball. Digests and registry state are checked.

`publish-dart.yaml` accepts only `dart-v*` pushes. It validates ancestry, identity, Dart analysis/tests, shared public-command comparisons, package boundaries, installed consumer and pub dry-run. Artifact `dart-candidate-<SHA>` retains the deterministic tarball, installed report and source snapshot.

With `PUBDEV_PUBLISH_ENABLED=true`, it also downloads `dart-qualification.json` from that GitHub Release. Generate this envelope using the existing [evidence collector](../../verification/conformance/collect-evidence.md), including actual Android and iOS reports. The unchanged full qualification gate must pass, with the current source fingerprint and exact installed Dart tarball hash. A small CI trace does not qualify the SDK.

Collect affected evidence for the candidate, attach the envelope and rerun the original tag-push run. Missing/stale evidence blocks publication. Use `source-snapshot.json` to diagnose source/resolved-lock drift; never relabel old evidence as current. Hosted CI does not replace native qualification.

Artifact `dart-qualified-<SHA>` retains the qualified tarball and compatibility record: package versions, contract revision/hash, artifact hashes, capabilities and platforms. The publisher verifies the digest, extracts those exact contents and uses pub.dev OIDC. The record proves qualification, not successful registry writes.

CI retains its stable `CI` aggregate status and changed-package routing; shared/release configuration changes check both boundaries. Pinned release-please tests cover package-only/shared candidates, bootstrap, subsequent versions, lockfile ownership, independent manifest updates, tags and existing-PR routing. GitHub is mocked; check the first hosted PR update rather than treating it as proven by the mock.

## External setup

Repository edits do not create credentials, publish packages or change protection rules.

1. Set `RELEASE_PLEASE_TOKEN` to a fine-grained bot PAT with repository Contents, Issues and Pull requests write access, including organization authorization. Its events must trigger downstream workflows; there is no `GITHUB_TOKEN` fallback. A GitHub App requires adding installation-token minting, not storing an expiring token as a permanent secret.
2. Require `CI` and workflow-policy checks before merging release PRs. Protect `release/1.0`, `v*` and `dart-v*` against unauthorized changes.
3. Keep npm Trusted Publishing bound to `Conalog/patch-map`, `publish.yaml`, environment `npm`. Existing switches are `NPM_PUBLISH_ENABLED`, `NPM_PRERELEASE_ENABLED`, `NPM_LATEST_ENABLED`; explicit `true` enables a channel.
4. Create environment `pub.dev`. Keep repository variable `PUBDEV_PUBLISH_ENABLED` unset/false until bootstrap. Then configure pub.dev for `Conalog/patch-map`, pattern `dart-v{{version}}`, required environment `pub.dev`, and enable the variable. No permanent pub token is needed.

Dart dependency ranges retain validated minimums and allow patch updates only. Widening minor boundaries requires compatibility validation. Consumers resolve their own locks; native qualification identifies the tested SDK and lock.

## First Dart publication

Pub.dev requires the first new-package version to be published manually. Confirm `conalog_patch_map` ownership/availability, merge its alpha.1 release PR, and use a clean checkout of `dart-v0.1.0-alpha.1`. Gather full evidence through the collector. Use Node 22 and Flutter 3.41.4 / Dart 3.11.1, matching CI.

```sh
npm ci
(cd packages/flutter && flutter pub get)
node .github/scripts/release-ready.mjs
node .github/scripts/release-metadata.mjs dart dart-v0.1.0-alpha.1
node .github/scripts/dart-release.mjs prepare
node .github/scripts/dart-release.mjs qualify /absolute/path/to/collected-evidence.json
node .github/scripts/pub-artifact.mjs extract
cd "$(cat .release-dart/publication-directory.txt)"
flutter pub get
flutter pub publish --dry-run
flutter pub publish
```

The last command writes to the registry and requires explicit operator intent and login. Verification scripts never invoke it. Attach the envelope as `dart-qualification.json`, retain the compatibility record, then configure OIDC.

## Retry and verification

Registry writes are not atomic. Record actual published versions and the qualified pair; retry only the failed package. npm supports its existing `tag` workflow input. Dart must rerun the **original tag-push execution**; pub.dev rejects branch/`workflow_dispatch` publishing. Already-published versions require matching verified contents; never overwrite versions, move tags or roll channels backward. Content mismatch requires a new fix version.

```sh
node --test .github/scripts/*.test.mjs
npm run verify:tooling
npm run verify:docs
```

Metadata/contents changes also require the matching installed-consumer check and pub dry-run. Release orchestration changes do not require runtime benchmarks.

References: [release-please manifest configuration](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md), [pub.dev automation](https://dart.dev/tools/pub/automated-publishing), [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).
