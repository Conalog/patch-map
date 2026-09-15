# PatchMap

Two independently distributed implementations of the same map contract:

| Package | Runtime | Source and usage |
| --- | --- | --- |
| `@conalog/patch-map` | TypeScript and PixiJS for the web | [JavaScript package](packages/javascript/README.md) |
| `patch_map` | Dart and Flutter Canvas for Android and iOS | [Flutter package](packages/flutter/README.md) |

Both packages own their dependencies, tests, examples and distribution metadata.
The repository root is private and is not a published package. Neither runtime
loads the other. Flutter registry publication remains disabled while release
qualification is managed separately.

[Public documentation](docs/README.md) is the behavior SSOT.
[Conformance](docs/engineering/flutter-conformance-design.md) maps that contract
to both implementations and checks their observations. Versions are independent;
matching features are established by the contract and executable checks.

## Development

Use Node.js 22 and npm for web/shared tooling, and Flutter 3.41.4 for native work.

```sh
nvm use
npm ci
npm run build
npm run verify:docs
cd packages/flutter
flutter pub get
flutter test --concurrency=2
```

The root forwards npm package tasks; package-local commands also work from
`packages/javascript`. Shared comparison commands run from the repository root:

```sh
npm run dev:comparison
npm run verify:conformance
```

The [native demo](packages/flutter/example/README.md) includes 5,000 animated bars,
random height changes, pan and zoom. Run it with `npm run flutter:demo` after
installing its Flutter dependencies. The [npm measurements](packages/javascript/performance/README.md)
and [native measurements](verification/flutter/benchmark.md) exercise the selected
implementations.

See [Contributing](CONTRIBUTING.md), [system ownership](docs/engineering/system-map.md)
and the [dual-package architecture](docs/engineering/flutter-implementation-plan.md).
