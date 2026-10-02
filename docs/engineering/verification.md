# Verification policy

Choose checks from changed behavior and resources. Tests verify product
semantics directly; release tooling verifies the package and current browser
resource lifecycle.

## Default loop

```bash
cd packages/javascript
npx vitest run tests/<owner>/<focused>.test.ts --maxWorkers=2
```

Start with the focused test owned by the changed boundary. Add `npm run
typecheck` and `npm run lint` when TypeScript, imports, or linted configuration
changes. Do not repeatedly run broad suites while editing: pull-request CI owns
the complete gate matrix. Use `npm test` locally only when behavior crosses
several owners or a focused witness cannot cover the changed contract.

Run these forwarding commands from the repository root for runtime or release risk:

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
- `performance:smoke` proves the benchmark path and lifecycle, not speed.
- Use `performance:benchmark` for renderer, animation, text, or interaction hot
  paths; `performance:update` for transaction work; and
  `performance:extraction` for capture/readback changes.
- `verify:memory` is the release gate for retained heap and resource cleanup.
- Results are current-run artifacts under ignored `.artifacts/performance/`.
  Historical result files are not source-controlled release authority.

## Documentation and package boundaries

- JavaScript behavior and failure meaning live under `packages/javascript/docs/`;
  exact shapes come from exported TypeScript declarations. Flutter consumer
  status lives in its package README until a public runtime is implemented.
- Internal ownership and gate routing live under `docs/engineering/` and are not
  published in the package.
- JavaScript Markdown changes keep documentation, npm package and shared contract
  checks. They do not select Flutter SDK or native host jobs. Mixed changes use
  the union of affected gates; Flutter, shared assets, tooling and workflow inputs
  retain their required checks. Non-Markdown documentation assets still select
  both packages. Registry qualification gates are independent of PR routing.
- Release metadata is compared between immutable Git revisions. JavaScript-only
  package and lockfile version changes plus its manifest entry select npm checks;
  Dart-only manifest entry changes select Flutter checks. Each release retains
  shared release-tooling and contract checks. Dependency, script, unknown-owner,
  unreadable or malformed metadata changes retain the broader path-based gates;
  mixed changes use the union of affected owners. PR names and labels never
  determine which checks are skipped.
- Repository tooling (typecheck, lint and tests) runs once in the shared contract
  job when selected, otherwise in the JavaScript core job. JavaScript static
  checks remain in the core job regardless of shared contract routing.
- Planner unit fixtures own their package versions, changelogs and release
  history; they must not inherit mutable publication artifacts from the current
  checkout. `node --test verification/release-inputs.test.mjs` runs the release
  suites in temporary input sandboxes for unreleased, independent JS/Dart,
  later Dart, beta and stable metadata. The normal tooling gate includes these
  witnesses and requires the nested suites to actually execute.
- Selected Flutter verification and Android/iOS host builds start independently
  after classification. Each prepares its own SDK, assets and dependencies; the
  final `CI` aggregate waits for both and requires both to succeed. This reduces
  dependency waiting on successful runs, but host builds may consume runner time
  even when Flutter verification fails.
- Routers link to one owner instead of copying contracts.
- `verify:package` installs the generated tarball and checks ESM, CommonJS,
  declarations, examples, assets, interaction, capture, and teardown.
- Tests, source, engineering docs, performance tooling, verification code, and
  generated artifacts must not enter the published tarball.
