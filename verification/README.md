# Shared verification workspace

Private `@patch-map/verification` owns repository tooling and its dependencies.

| Owner | Purpose | Root command |
| --- | --- | --- |
| `verification/assets/` | Shared asset inventory, consumers and output preparation | `npm run assets:prepare` |
| `verification/docs/` | Documentation links, source paths and budgets | `npm run verify:docs` |
| `verification/flutter/` | Extracted Dart artifact, asset consumer and SDK checks | `npm run flutter:verify` |
| `verification/conformance/` | Contract inventory, exact comparison and evidence qualification | `npm run verify:tooling` |
| `.github/scripts/` | Independent release planning, identity and exact publication bytes | `npm run verify:tooling` |

JavaScript unit tests and performance tools belong to `packages/javascript/`;
its installed package tooling belongs to `packages/javascript/verification/package/`.
Generated evidence lives under ignored `.artifacts/`. Passing definition and asset
checks cannot qualify Flutter's pending public runtime.

`npm run verify:typecheck` strictly checks the executable asset catalog and
preparation modules using `checkJs` and JSDoc, without emitting files. Other
tooling currently relies on lint and focused execution tests; extend the explicit
compiler inputs when another module is ready. Virtual consumer tests verify that
invalid package names, paths, byte operations and catalog mutations are rejected.
