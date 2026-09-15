# Contributing

Use Node.js 22 (`nvm use`) and npm for repository tooling. Flutter work uses
Flutter 3.41.4 / Dart 3.11. Install npm dependencies with `npm ci`; install native
dependencies with `flutter pub get` from `packages/flutter` and its `example`.

Start with the [engineering router](docs/engineering/README.md), then read the
[system map](docs/engineering/system-map.md) and the owning source. Behavior is
specified once under `docs/`; package APIs bind that contract to each platform.

| Work | Location | Focused command |
| --- | --- | --- |
| JavaScript implementation | `packages/javascript/` | `npm run unit -- tests/<owner>/<test>.test.ts` from that package |
| Dart implementation | `packages/flutter/` | `flutter test test/<owner>/<test>.dart` from that package |
| Shared verification | `verification/`, `conformance/` | `npm run verify:tooling` from the root |
| Cross-runtime observations | `verification/conformance/` | `npm run verify:conformance` from the root |

Use [verification policy](docs/engineering/verification.md) to select additional
gates. Root commands identify their owner: `js:*` invokes the JavaScript package,
`flutter:*` invokes the native package, and `verify:*` owns shared tooling,
documentation and cross-runtime checks. `js:test` runs JavaScript typecheck,
lint and unit tests; `flutter:test` runs Dart tests; `verify:tooling` runs shared
typecheck, lint and tooling tests. There is no unscoped root build or test command.
Package-local npm commands retain their ordinary names, such as `npm run build`.

The root `.nvmrc` selects Node for JavaScript and shared tooling. This contribution
guide applies to both runtimes. The private root `package.json` routes tasks and
`package-lock.json` resolves Node workspaces; tooling dependencies and TypeScript/
ESLint configuration belong to `verification/`. Add npm runtime/build dependencies
in `packages/javascript/package.json`, shared tool dependencies in
`verification/package.json`, and Dart dependencies in the owning pubspec. Flutter
is not an npm workspace and can use its native CLI without npm for Dart-only work.

Keep package production imports inside their runtime. Shared fixtures and tools
are development inputs, never production imports. Edit public documents at the
repository root; npm build generates its allowlisted documentation/license copies.
Do not edit or commit those generated copies.

A feature change updates its owning contract, both implementations and affected
conformance cases. Platform-specific optimizations can be independent when they
preserve that contract. Do not add a second state, publication or cleanup owner.
Current benchmarks measure the shipped Pixi and Canvas paths; retired runtime
experiments are not maintained.

Versions and release metadata live in each package. Run the matching installed
consumer gate after changing distribution layout. Local verification does not
publish either package. Commit complete, targeted, verified units using the
repository's `type: summary` convention.
