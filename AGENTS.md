# PatchMap agent instructions

## Bootstrap and documentation routing

- Use Node.js 22 for repository work (`nvm use`) and npm for project commands.
- Read this file, then choose one documentation router. For public behavior,
  usage, integration, or compatibility, start at `docs/README.md` and select
  one owning page. For implementation, refactoring, testing, architecture, or
  performance work, start at `docs/engineering/README.md` and use
  `docs/engineering/system-map.md` to find the narrow source owner, focused
  tests, and risk gate.
- Do not scan all of `docs/**` or `src/**` first. Expand from the selected owner
  only when it links to another authority or evidence shows cross-owner impact.
  Routers locate owners; they do not duplicate feature contracts.
- Read the owning source before its callers. Extend an existing authority or
  coordinator instead of creating a parallel state, publication, frame, or
  cleanup path.
- Exact public shapes come from exported TypeScript declarations. Owning pages
  under `docs/` define public behavior, ordering, failure meaning,
  compatibility, and package contents; engineering ownership and verification
  policy live under `docs/engineering/`.
- When code and documentation disagree, do not assume code is correct. Decide
  whether the drift is in the document, the implementation, or an unresolved
  product decision before changing either side.
- When a documented public contract changes, update its owning page in the
  same change.

## Keep changes focused

- Preserve unrelated worktree changes and remove code made obsolete by the
  change. Do not retain old paths, branch-specific guidance, migration aliases,
  or compatibility layers without a current product requirement.
- Production code must not import tests, verification, performance tooling, or
  concrete renderer modules across the boundaries in
  `docs/engineering/architecture.md`.
- Consult repository code and documentation first. Use current official
  external documentation when a dependency or platform fact must be verified;
  do not impose a blanket external-reference restriction.

## Verify by changed risk

- Follow `docs/engineering/verification.md`. During implementation, run the
  smallest focused test owned by the changed boundary.
- Add typecheck, lint, build, package, browser, memory, or performance checks
  only when the changed risk calls for them. Do not repeatedly run `npm test`,
  the full unit suite, the full benchmark matrix, or release verification for
  a narrow change; pull-request CI owns broad validation.
- Treat user-visible performance as an invariant. Avoid adding repeated
  traversal, allocation, readback, listener, timer, ticker, RAF, or retained
  resources on hot paths. When a hot path changes, use the matching project
  runner and the materiality rules in `docs/engineering/verification.md`.

## Git and review

- Commit only when requested. Push, open or merge a PR, publish, or modify a
  release only when explicitly requested.
- Use `type: summary` commit messages consistent with repository history and
  keep one intent per commit.
- For large refactors or pre-PR reviews, request an independent subagent review
  of architecture, regression risk, and performance evidence before finishing.
