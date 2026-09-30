# Shared verification workspace

Private `@patch-map/verification` owns repository tooling and its dependencies.

| Owner | Purpose | Root command |
| --- | --- | --- |
| `verification/docs/` | Documentation links, source paths and budgets | `npm run verify:docs` |
| `verification/flutter/` | Extracted Dart artifact, asset consumer and SDK checks | `npm run flutter:verify` |
| `verification/conformance/` | Contract inventory, exact comparison and evidence qualification | `npm run verify:tooling` |
| `.github/scripts/` | Independent release planning, identity and exact publication bytes | `npm run verify:tooling` |

JavaScript unit tests and performance tools belong to `packages/javascript/`;
its installed package tooling belongs to `packages/javascript/verification/package/`.
Generated evidence lives under ignored `.artifacts/`. Passing definition and asset
checks cannot qualify Flutter's pending public runtime.
