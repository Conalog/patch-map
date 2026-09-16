# Verification policy

Choose checks from changed behavior and resources. Tests verify product
semantics directly; release tooling verifies the package and current browser
resource lifecycle.

## Default loop

For Dart, run `flutter test test/<owner>/<focused>.dart` from
`packages/flutter/`. Shared checks run from the private repository root.

```bash
npm run js:unit -- tests/<owner>/<focused>.test.ts
```

Start with the focused test owned by the changed boundary. Add
`npm run js:typecheck` and `npm run js:lint` for JavaScript package changes.
Use `npm run verify:tooling` for shared verification code changes. Do not repeatedly run broad suites while editing: pull-request CI owns
the complete gate matrix. Use `npm run js:test` locally only when behavior crosses
several owners or a focused witness cannot cover the changed contract.

Add only the matching gate for broad runtime or release risk:

```bash
npm run js:build
npm run verify:docs
npm run js:verify:package -- --require-audit
npm run js:performance:smoke
npm run js:verify:memory
```

## Risk routing

| Changed risk | Evidence |
| --- | --- |
| Internal engineering documentation only | owning page review and `npm run verify:docs` |
| Packaged public documentation or license assets | owning page review, `npm run verify:docs`, and package verification |
| Types, exports, examples, public API | focused API tests, typecheck, build, package verification |
| Semantic state, ordering, failure meaning | focused product tests; full unit only when shared ordering crosses owners |
| Import or ownership boundary | architecture boundary tests, typecheck, lint, and build |
| PixiJS, canvas, frame scheduling, renderer loss | focused rendering tests; benchmark smoke or memory only for the affected hot path or resource lifecycle |
| Asset, font, capture, package contents | focused tests, package verification; memory for retained resources |
| Destroy, listener, timer, pending work | lifecycle tests and memory verification |
| Measured hot path | correctness checks plus comparable baseline/candidate measurements |

## Pull request CI routing

The classifier independently selects npm validation, Flutter validation and
shared contract comparison. JS source/test changes run npm checks and comparison;
Flutter changes run native checks and comparison. Shared contracts and common
configuration select all three. Internal engineering documentation uses the
lightweight documentation gate. npm-only build/measurement changes retain npm
validation without selecting native tests.

`Shared contract comparison` runs both browser JavaScript and Dart semantic
traces, plus shared data/model/text and API binding checks. It is independent of
`Flutter package`, which owns Dart analysis, tests and installed-artifact checks.
The final `CI` status requires every selected job to succeed and accepts skipped
native/comparison jobs only when explicitly excluded by the classifier. Semantic
comparison does not qualify native pixels, gestures or device performance.

## Performance

- Treat user-visible performance as an invariant for every implementation, but
  measure only when the change touches a hot path or existing evidence shows a
  material scaling risk. Prefer removing unnecessary work over speculative
  tuning.
- A refactor has no performance claim unless environment, workload, warmup,
  sampling, and concurrency are held constant against a baseline.
- Judge materiality at the user-visible milestone and representative scale.
  Report the absolute delta in milliseconds before the relative percentage. A
  one-off 1–2 ms delta within measurement noise is neutral by itself, even when
  a small baseline makes the percentage or p95 change look large.
- Relative percentages and p95 are supporting evidence, not standalone failure
  gates. Treat a slowdown as material when a repeated comparable result exceeds
  noise and can cause a missed frame, input lag, a long task, or a noticeable
  completion delay. Small per-frame costs may still be material when they
  compound across every frame or cross an existing frame budget.
- `js:performance:smoke` proves the benchmark path and lifecycle, not speed.
- Use `js:performance:benchmark` for renderer, animation, text, or interaction hot
  paths; `js:performance:update` for transaction work; and
  `js:performance:extraction` for capture/readback changes.
- `js:verify:memory` is the release gate for retained heap and resource cleanup.
- Results are current-run artifacts under ignored `.artifacts/performance/`.
  Historical result files are not source-controlled release authority.

## Documentation and package boundaries

- VS Code workspace settings exclude `verification/flutter` from Dart analysis:
  `installed-consumer.dart` is a test template copied into a temporary consumer
  with its own `pubspec.yaml`, not a standalone Dart project. The installed
  consumer verifier analyzes and runs that copy against the packaged artifact.
  Generated `.artifacts` and `.release-dart` trees are excluded from editor
  analysis as well; `packages/flutter` and its example remain analyzed.

- Public behavior and failure meaning live under `docs/`; exact shapes come from
  exported TypeScript declarations.
- Internal ownership and gate routing live under `docs/engineering/` and are not
  published in the package.
- Routers link to one owner instead of copying contracts.
- `js:verify:package` installs the generated tarball and checks ESM, CommonJS,
  declarations, examples, assets, interaction, capture, and teardown.
- npm license inventory follows that workspace's build/runtime dependency graph,
  including nested/hoisted dependencies; private sibling tooling is not part of its SBOM.
- Tests, source, engineering docs, performance tooling, verification code, and
  generated artifacts must not enter the published tarball.
