# Contributing to PATCH MAP

Thanks for contributing to `@conalog/patch-map`.

## Before You Start
- Use Node.js `>=20` (`.nvmrc` is provided).
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
`pr title / validate`. The advisory browser job is intentionally not a required
check until its existing failures are resolved.

## Release Process

Release Please owns version changes, changelog updates, Git tags, and GitHub
Releases. After releasable changes land on `main`, it creates or updates a
release pull request. Merging that pull request creates the corresponding
`v<version>` tag and GitHub Release.

npm publication is intentionally disabled until Trusted Publishing is
configured. Activation requires all of the following:

1. Make `npm run test:headless` pass. The browser CI job remains advisory until
   the existing render test failures are resolved.
2. Create a GitHub environment named `npm` and configure its deployment rules.
3. Configure `@conalog/patch-map` on npm with `Conalog/patch-map`, workflow
   `publish-npm.yaml`, environment `npm`, and permission to run `npm publish`.
4. Add the repository variable `NPM_PUBLISH_ENABLED` with the value `true`.

Until the variable is enabled, releases are created without publishing to npm.
After activation, a failed or previously skipped publication can be retried by
manually dispatching the `publish npm` workflow at the release tag.

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
