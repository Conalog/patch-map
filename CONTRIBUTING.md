# Contributing to PATCH MAP

Thanks for contributing to `@conalog/patch-map`.

## Before You Start
- Use Node.js `^22.22.1 || ^24 || >=26` (`.nvmrc` selects Node.js 24 for local development).
- Install dependencies with `npm install`.
- If your change is large, open an issue first to align on direction.

## Local Development
- Build: `npm run build`
- Formatting and lint checks: `npm run check`
- Unit tests: `npm run test:unit`
- Browser tests (headed): `npm run test:browser`
- Browser tests (headless): `npm run test:headless`
- Package export and type checks: `npm run build && npm run pack:check`
- Auto-fix formatting/lint issues: `npm run lint:fix`

Note:
- `npm run lint` checks staged files (`biome check --staged`).
- For PR validation, prefer running build + relevant tests.

## Commit Message Convention
This repository uses Conventional Commits.

Recommended prefixes:
- `feat:` for new features
- `fix:` for bug fixes
- `chore:` for maintenance work
- `docs:` for documentation-only changes
- `refactor:` for code restructuring without behavior changes
- `test:` for test-only changes

## Pull Request Process
1. Create a branch from `main`.
2. Make focused changes and include tests when behavior changes.
3. Use the correct PR template:
Feature PR: `https://github.com/Conalog/patch-map/compare/main...YOUR_BRANCH?expand=1&template=feature.md`
Bugfix PR: `https://github.com/Conalog/patch-map/compare/main...YOUR_BRANCH?expand=1&template=bugfix.md`
Chore PR: `https://github.com/Conalog/patch-map/compare/main...YOUR_BRANCH?expand=1&template=chore.md`
4. Link related issues in the PR body (for example, `Fixes #123`).
5. Ensure checks are green before requesting review.

When branch protection is enabled, require `ci / verify` and
`pr title / validate`. The browser suite is available through the manually
dispatched `browser tests` workflow and is not currently a required check.

## Release Process

Release Please owns version changes, changelog updates, Git tags, and GitHub
Releases. After releasable changes land on `main`, it creates or updates a
release pull request. Merging it creates the corresponding legacy
`v<version>` tag and GitHub Release.

The `release/1.0` branch owns npm publication. A `js-v*` tag triggers
`Publish npm` through Trusted Publishing. The `npm` environment allows
`js-v*` tags and the `release/1.0` workflow ref for manual retries. See the
[release operations guide](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/releases.md)
for the publisher configuration and channel switches.

To retry publication, select `release/1.0` as the workflow ref and enter the
existing `js-v<version>` tag in the `tag` input. For example:

```sh
gh workflow run publish.yaml --ref release/1.0 -f 'tag=js-v<version>'
```

The browser suite is not currently an npm publication gate. Run the manual
`browser tests` workflow for render coverage; promoting it to required CI is a
separate repository-settings change.

By default Release Please uses the repository `GITHUB_TOKEN`. Configure a
`RELEASE_PLEASE_TOKEN` secret backed by a least-privilege GitHub App or token if
release pull request CI should start without workflow approval.

## Documentation
- Update `README.md` for user-facing behavior changes.
- Update `README_KR.md` together when applicable.

## Review Expectations
- Keep PRs scoped and easy to review.
- Explain why the change is needed, not only what changed.
- Highlight any trade-offs, risks, or follow-up work.
