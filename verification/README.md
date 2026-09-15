# Shared verification

Repository-wide gates coordinate the two independently built packages.

| Owner | Purpose | Command |
| --- | --- | --- |
| `verification/conformance/` | Contract inventory, fixture comparison and qualification evidence | `npm run verify:conformance` |
| `verification/flutter/` | Native installed consumer and managed asset/Unicode parity | `npm run flutter:verify:package` |
| `verification/docs/` | Documentation links, named paths and page budgets | `npm run verify:docs` |
| `packages/javascript/verification/package/` | npm packed consumers, formats, assets and supply chain | `npm run js:verify:package` |

Product tests and runtime measurements belong to their packages. Shared tooling
may read both implementations but neither implementation imports tooling or its
sibling. Generated evidence stays under ignored `.artifacts/`.
