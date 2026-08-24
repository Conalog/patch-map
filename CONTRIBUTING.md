# Contributing to PatchMap

PatchMap accepts PATCH MAP v0.10 JSON directly and renders it through an
aggregate PixiJS WebGL pipeline. Changes must preserve caller immutability,
stable element/component identity, atomic failure, the approved 173-case
contract, and explicit renderer/resource cleanup.

## Setup

The package supports Node.js 20 or newer. Use Node.js 22 for local repository
work, matching `.nvmrc`. Release CI currently runs Node.js 24:

```sh
nvm use
npm ci
```

Start the Korean manual Lab with `npm run lab`. The production package uses
WebGL2 as its baseline; WebGPU results are experimental and must be reported
separately.

## Verification

Run the checks that match the changed ownership boundary:

- ordinary source changes: focused Vitest files, `npm run lint`, and
  `npm run typecheck`;
- completed product tranche: `npm run unit`, `npm run build`,
  `npm run build:lab`, and `npm run verify:contract`;
- renderer, scheduler, Lab interaction, or lifecycle changes:
  `npm run verify:lab:all`;
- exports, dependencies, public examples, or packaging changes:
  `npm run verify:package`;
- renderer/resource/destroy ownership changes: `npm run verify:memory`;
- measured hot-path changes: the relevant `npm run perf:*` checkpoint with
  output directed to ignored `.perf-results/` unless creating approved
  evidence intentionally.

Do not rewrite approved fixtures, normalized expected observations, review
evidence, or retained digest-bound performance artifacts to make a change
pass. Report Windows-native, qualified WebGPU, and other unmeasured external
cells as pending.

## Pull requests

Keep commits intent-scoped. Explain the user-visible or ownership boundary,
list the exact fresh checks run, and record skipped expensive gates with the
reason they were not affected. Do not bump the package version in a feature
branch; versioning happens after merge.
