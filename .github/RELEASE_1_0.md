# Release 1.0 CI and npm setup

## Pull request validation

`CI` runs for pull requests targeting `release/1.0`. It first verifies that
every required release command exists, then classifies the pull-request diff.
Only an internal documentation-only diff may skip the expensive product gates:

- Markdown under `docs/reference/`, `docs/tasks/`, or `docs/designs/`;
- the pull request template; and
- issue templates.

Any other path, an empty or unclassifiable diff, a rename involving a product
path, and every workflow, package, verification, published-documentation, or
example change fail closed to the full gate. This keeps the package-owned
`README*`, `docs/patch-map/`, and `examples/patch-map/` under package
verification.

For a full gate, the `Core`, `Package`, and `Browser` checks require all of
these release validations:

- typecheck, lint, unit tests, and the production build;
- canonical contract verification;
- packed ESM/CJS/types consumer verification with the required audit;
- every headless Lab route; and
- lifecycle memory verification.

The documentation-only path leaves `CI` present and successful while clearly
marking the expensive steps as skipped; it does not use a workflow-level path
filter. Configure the `release/1.0` branch protection rule to require `CI`
before merging. After a merge, the publish workflow is the sole owner of
tagged-source validation and publication, so the PR CI matrix is not run a
second time.

## Publication policy

The release workflow follows the repository `main` release and patch-service
patterns: a push to `release/1.0` asks Release Please to create or update a
release pull request. Merging that release pull request makes Release Please
create the version tag and GitHub Release. The action's `release_created` and
`tag_name` outputs feed the validation and publication jobs in the same
workflow run, so publication does not depend on the generated tag starting a
second workflow.

The workflow fails before Release Please when required release commands are
missing. Release Please manages `package.json`, `package-lock.json`,
`.release-please-manifest.json`, the changelog, the tag, and the GitHub Release.
Pull-request events never run this workflow and therefore never publish.

The package and release manifest value `1.0.0-alpha.0` is a Release Please
baseline only; it is not an npm release or a tag. With the prerelease strategy
set to `alpha`, the first release pull request proposes `1.0.0-alpha.1`.
Supported releases map to npm channels as follows:

| Package version and matching Git tag | npm dist-tag |
| --- | --- |
| `1.0.0-alpha.N` / `v1.0.0-alpha.N` | `next` |
| `1.0.0-beta.N` / `v1.0.0-beta.N` | `next` |
| `1.0.0-rc.N` / `v1.0.0-rc.N` | `next` |
| `1.0.0` / `v1.0.0` | `latest` |

`N` must be a non-negative integer. The workflow rejects a tag/package
version mismatch, any other version, any other package name, a commit outside
the `release/1.0` lineage, or a registry lookup that cannot prove publication
state. A rerun for a version already present on the intended dist-tag succeeds
without publishing again only when the registry SHA-512 integrity also matches
the verified tarball; an existing version on the wrong dist-tag or with different
bytes fails. The workflow also refuses to move `next` or `latest` backward. All
release gates run again from the tagged source before the protected publish job
can start.

A protected manual dispatch with an existing matching tag is the recovery path
for a release that was created while npm publication was disabled. It applies
the same ancestry, version, gate, artifact, and registry checks. Dispatch
`publish.yaml` from the `release/1.0` ref and supply the existing tag in the
`tag` input.

During the alpha line, Release Please increments `alpha.N` automatically. Start
the beta and rc phases through reviewed phase-transition commits containing
`Release-As: 1.0.0-beta.1` and `Release-As: 1.0.0-rc.1`, respectively; later
commits increment the active suffix. Before stable promotion, merge a reviewed
release-configuration change that sets `prerelease` to `false` and carries
`Release-As: 1.0.0`. This produces the exact stable version and marks the GitHub
Release as stable. Do not edit package versions or create release tags manually
during the normal flow.

Publication additionally requires repository variables. A missing variable
is equivalent to disabled:

- `NPM_PUBLISH_ENABLED=true` is the global emergency switch.
- `NPM_PRERELEASE_ENABLED=true` permits only `alpha`, `beta`, and `rc`
  versions to publish with `--tag next`.
- `NPM_LATEST_ENABLED=true` permits only the exact stable `1.0.0` version to
  publish with `--tag latest`. Keep this unset or false until final promotion,
  and disable it again afterward.

The existing `main` workflow publishes 0.x releases with npm's default
`latest` tag and uses the same global switch. Before enabling
`NPM_LATEST_ENABLED` for `1.0.0`, change or pause that external release path so
a later 0.x publication cannot move `latest` back from 1.0.0. A dedicated
legacy dist-tag or a registry monotonicity guard on `main` are both valid; that
coordination is required for stable promotion and is outside this release workflow.

Before merging a Release Please pull request, wait for `CI`,
verify the proposed version and changelog, and enable only the applicable npm
channel variable. The merge triggers the release workflow, which creates the
tag and validates the tagged source before any protected publication can start.

The workflow follows `main` by preferring `RELEASE_PLEASE_TOKEN` and otherwise
using `github.token`. The repository already permits Actions to create pull
requests, but currently has no secret with that name. With the fallback token,
Release Please PR events create approval-required workflow runs; a maintainer
with write access must select **Approve workflows to run** before merging. For
unattended checks, store a narrowly scoped PAT with contents, pull-request, and
issues write access as `RELEASE_PLEASE_TOKEN`. A GitHub App installation token
must instead be minted during the workflow from an app ID and private key; do
not store an expiring installation token as this long-lived secret.

## Required GitHub and npm configuration

Use the existing GitHub environment named `npm`. Keep its `main` deployment
branch rule for the maintained 0.10 release line and add `release/1.0` for the
automatic and documented manual publication paths. If tag-ref dispatches remain
allowed, replace the current broad `v*` policy with `v1.0.0*`. Require a
reviewer, prevent self-review, and disallow administrator bypass where the
repository plan permits. These protection changes affect the shared 0.10
release environment, so coordinate them with that line before the first 1.0
prerelease.

The repository currently has no tag ruleset for this release line. Add an
active tag ruleset targeting `v1.0.0*` that restricts tag updates and deletions,
with no routine human or administrator bypass. Do not restrict creation unless
the Release Please actor has the narrowly scoped bypass needed to create a new
tag. The environment deployment policy controls who may publish, but it does
not make a Git tag immutable.

The publish job intentionally has `id-token: write`, no `NPM_TOKEN`, and no
credential cache. Product installation, build, and validation run without OIDC
permission. That unprivileged job produces one digest-bound tarball; the
protected job only downloads and verifies it, checks npm registry state, and
publishes that exact tarball with lifecycle scripts disabled. Configure npm
Trusted Publishing for `@conalog/patch-map` with these exact values:

- organization/user: `Conalog`
- repository: `patch-map`
- workflow filename: `publish.yaml`
- environment: `npm`
- allowed action: `npm publish`

The package's `repository.url` must continue to identify
`https://github.com/Conalog/patch-map`. npm CLI 11.5.1 or newer is required;
the workflow fails closed if the runner does not provide it. Trusted
Publishing then exchanges the GitHub OIDC identity for a short-lived npm
credential and automatically records provenance for this public package.

Prerelease tags use only `next`, so the existing stable line remains unchanged.
