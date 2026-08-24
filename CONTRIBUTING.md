# Contributing to PatchMap

PatchMap is a PixiJS-based renderer for PATCH MAP data.

## Setup

The package supports Node.js 20 or newer. Use Node.js 22 for local repository
work, matching `.nvmrc`. Release CI currently runs Node.js 24:

```sh
nvm use
npm ci
```

Start the Korean manual Lab with `npm run lab`.

## Verification

Start with the checks that apply to every code change:

- `npm run typecheck`
- `npm run lint`
- `npm run unit`

Add the gates owned by the changed boundary:

| Changed boundary | Required gates |
| --- | --- |
| production source, declarations, or public behavior | `npm run build` and `npm run verify:contract` |
| public documentation, package files, exports, examples, or artifact policy | `npm run verify:package` |
| Lab routes, browser interaction, rendering, or lifecycle ownership | `npm run build:lab`, `npm run verify:lab:all`, and `npm run verify:memory` |
| measured hot path | the matching harness in [`docs/maintainers/performance.md`](docs/maintainers/performance.md), with locked baseline and candidate identities |
| repository-internal Markdown only | local-link validation and `git diff --check` |
| CI classification or release workflow | `node --test .github/scripts/classify-ci-files.test.mjs` and `node .github/scripts/release-ready.mjs --require` |

Use the smallest representative performance workload for a refactor, but do not
replace correctness, package, browser, or lifecycle gates with a faster timing.
The release workflow requires typecheck, lint, unit, build, canonical contract,
packed consumer, full Lab, and memory commands to remain available.

## Pull requests

Keep pull requests focused and describe the checks you ran.
