# Contributing to PATCH MAP

Thanks for contributing to `@conalog/patch-map`.

## Before You Start
- Use Node.js `>=20` (`.nvmrc` is provided).
- Install dependencies with `npm install`.
- If your change is large, open an issue first to align on direction.

## Local Development
- Build: `npm run build`
- Unit tests: `npm run test:unit`
- Browser tests (headed): `npm run test:browser`
- Browser tests (headless): `npm run test:headless`
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

## Documentation
- Update `README.md` for user-facing behavior changes.
- Update `README_KR.md` together when applicable.

## Review Expectations
- Keep PRs scoped and easy to review.
- Explain why the change is needed, not only what changed.
- Highlight any trade-offs, risks, or follow-up work.
