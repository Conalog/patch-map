# Shared verification

Repository-wide gates coordinate the two independently built packages.
`@patch-map/verification` is a private npm workspace, never a distributed runtime.
Its [manifest](package.json) declares its tools; [TypeScript](tsconfig.json) and
[ESLint](eslint.config.js) settings cover shared verification and CI scripts. JavaScript
owns separate build/lint configuration in its package; Dart uses its own pubspec
and analysis options.

The root manifest forwards `verify:*` commands here. Typecheck runs in this
workspace; cross-package gates explicitly change to the repository root before
executing existing tools. This preserves fixture/artifact paths, CI script lint
coverage and the `/verification/conformance/web/` browser URL. No second dispatcher
or runtime wrapper is required. Run `npm ci` once at the root using its lockfile.
Shared and JavaScript dependencies are declared by each consumer even when npm
installs the same version only once.

| Owner | Purpose | Command |
| --- | --- | --- |
| `verification/conformance/` | Contract inventory, fixture comparison and qualification evidence | `npm run verify:conformance` |
| `verification/flutter/` | Native installed consumer and managed asset/Unicode parity | `npm run flutter:verify:package` |
| `verification/docs/` | Documentation links, named paths and page budgets | `npm run verify:docs` |
| `packages/javascript/verification/package/` | npm packed consumers, formats, assets and supply chain | `npm run js:verify:package` |

Product tests and runtime measurements belong to their packages. Shared tooling
may read both implementations but neither implementation imports tooling or its
sibling. Generated evidence stays under ignored `.artifacts/`.
