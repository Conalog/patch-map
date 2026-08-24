# Release 1.0 CI and npm setup

## Bootstrap behavior

`Release 1.0 CI` runs for pull requests targeting `release/1.0` and pushes to
that branch. The branch may initially contain no `package.json` and no
`package-lock.json`; in that exact bootstrap state the product jobs are skipped
and `Release 1.0 validation` succeeds. Introducing only one of those two files
is an error.

Once both files exist, the stable required check `Release 1.0 validation`
requires all of these release gates:

- typecheck, lint, unit tests, and the production build;
- canonical contract verification;
- packed ESM/CJS/types consumer verification with the required audit;
- every headless Lab route; and
- lifecycle memory verification.

Configure the `release/1.0` branch protection rule to require `Release 1.0
validation` before merging. The feature branch's product files and history are
not part of this bootstrap change; they arrive through their own pull request.

## Publication policy

Publication has no pull-request, branch-push, or manual-dispatch trigger. It
can start only when one of these explicit tags is pushed and the tagged commit
is already contained in `origin/release/1.0`:

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
coordination is required for stable promotion and is outside this bootstrap PR.

Before creating a tag, merge the intended version-only release change into
`release/1.0`, wait for `Release 1.0 validation`, verify the commit and package
version locally, enable only the applicable channel variable, create the tag
on that exact commit, and push that single tag. Creating versions or tags is
outside the CI-bootstrap change itself.

## Required GitHub and npm configuration

Use the existing GitHub environment named `npm`. Keep its `main` deployment
branch rule for the maintained 0.10 release line, and narrow its current `v*`
deployment-tag rule to `v1.0.0*` for this workflow. Require a reviewer, prevent
self-review, and disallow administrator bypass where the repository plan
permits. These protection changes affect the shared 0.10 release environment,
so coordinate them with that line before the first 1.0 prerelease.

The publish job intentionally has `id-token: write`, no `NPM_TOKEN`, and no
credential cache. Product installation, build, and validation run without OIDC
permission. That unprivileged job produces one digest-bound tarball; the
protected job only downloads and verifies it, checks npm registry state, and
publishes that exact tarball with lifecycle scripts disabled. Configure npm
Trusted Publishing for `@conalog/patch-map` with these exact values:

- organization/user: `Conalog`
- repository: `patch-map`
- workflow filename: `publish-npm.yaml`
- environment: `npm`
- allowed action: `npm publish`

The package's `repository.url` must continue to identify
`https://github.com/Conalog/patch-map`. npm CLI 11.5.1 or newer is required;
the workflow fails closed if the runner does not provide it. Trusted
Publishing then exchanges the GitHub OIDC identity for a short-lived npm
credential and automatically records provenance for this public package.

At bootstrap time, npm `latest` is `0.10.0`. Prerelease tags use only `next`,
so that existing stable line is unchanged. This setup does not publish or
change any package version by itself.
