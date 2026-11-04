# PatchMap workspace

Private repository workspace for independently released JavaScript and Flutter packages.

| Owner | Package | Status |
| --- | --- | --- |
| `packages/javascript/` | `@conalog/patch-map` | JavaScript renderer; version in its [manifest](packages/javascript/package.json) |
| `packages/flutter/` | `conalog_patch_map` | Native runtime implemented; [qualification incomplete](docs/engineering/flutter-runtime/coverage.md), publication blocked |
| `verification/` | `@patch-map/verification` | Private shared tooling |
| `conformance/` | Shared behavior targets | Definitions; Flutter runtime witnesses pending |

Use Node.js 22 and `npm ci` at the repository root. JavaScript source, unit tests,
examples and performance tooling belong to the JavaScript package.

```sh
npm run js:test
npm run js:build
npm run js:verify:package -- --require-audit
npm run flutter:verify
npm run verify:tooling
npm run verify:docs
```

JavaScript installation and usage: [package README](packages/javascript/README.md).
Flutter consumer setup: [package README](packages/flutter/README.md).
JavaScript behavior contracts: [package docs](packages/javascript/docs/README.md).
Repository development: [contributing](CONTRIBUTING.md) and [engineering](docs/engineering/README.md).
Flutter development environment: [package workflow](docs/engineering/flutter-package.md).
Independent npm and Dart releases: [release operations](docs/engineering/releases.md).
Cross-runtime targets and qualification status: [conformance](conformance/README.md).
