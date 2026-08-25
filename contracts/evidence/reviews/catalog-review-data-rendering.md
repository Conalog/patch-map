# PatchMap data and rendering catalog review

## Reviewed surface

The review covers the current 169-case catalog, with detailed ownership of
`DAT-001..005,007..008`, `REN-001..011`, `LAY-001..005`, and `AST-001..003`.
The generated candidate is bound to these SHA-256 values:

| Binding | SHA-256 |
| --- | --- |
| manifest | `4301c7289e2df417e7a80244bb2c685a8dca005fda62a3d4ac9fc5de15990d91` |
| fixtures | `7ddb0f54dbaf5dd9e509b739b01160240c5cbb6a4ec4bfefced94359a562397f` |
| normalized expected | `2033efb7d64254d8696f5414ebe4bced9ce3e5431b322740a3d9ac99c8bb4f93` |
| typed cases | `3a221cbc5dd479063863cfabbad459c728760ac0de4fe7fc908e68cda966437f` |

## Findings

- Typed cases, fixtures, expected records, and manifest contain the same 169
  unique ordered IDs: 131 capabilities and 38 journeys.
- Fixture action order and typed action operands match for all 631 actions.
- The data-rendering owner contains 26 cases, 108 actions, and 380 assertions.
- Rendering inputs use the canonical background, relation-alpha, placement,
  text-split, spacing, and rect-source forms defined by the current schemas.
- `REN-004` and its `rect-specimen` profile use scalar radius `10`, then patch
  to scalar radius `30`; the expected size, rotated world bounds, hit bounds,
  paint, and z-index assertions are unchanged.
- Candidate fixtures, typed cases, fixture profiles, and the production-shaped
  workload contain no array/object radius on a standalone rect. Rectangular
  component textures retain scalar, tuple, and named-corner normalization.
- Removing relation `cap`/`join` from the production-shaped workload preserves
  its 21 roots, ordered 336 typed IDs, 55 relation records, and 327 links.
- Geometry assertions address the domain tuple directly through
  `/geometry/bounds/revisionLags/scene`.
- `ACC-001` binds `supportedActions`; `PKG-002` binds
  `restrictedImportCount`; their referenced assertion domains are closed.
- Static validation accepts every source, profile, action, observation, and
  assertion binding and rejects all 32 drift probes.

## Reproduction

```sh
node scripts/verification/generate-patch-map-catalog-evidence.mjs --pending-review --output-dir .artifacts/performance/contract-catalog-current
npm run verify:contract:gates
npx vitest run --maxWorkers=2 tests/placement.test.ts tests/text-layout.test.ts tests/style-normalization.test.ts tests/render-schema-support.test.ts tests/parser.test.ts tests/dataset-contract.test.ts
```

Verdict: PASS
