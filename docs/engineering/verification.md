# Verification policy

Choose checks from changed behavior and resources. Tests verify product
semantics directly; release tooling verifies the package and current browser
resource lifecycle.

## Default loop

```bash
npx vitest run tests/<owner>/<focused>.test.ts --maxWorkers=2
npm run typecheck
npm run lint
```

Use `npm test` for cross-module behavior. Broad runtime or release changes add:

```bash
npm run build
npm run verify:docs
npm run verify:package -- --require-audit
npm run performance:smoke
npm run verify:memory
```

## Risk routing

| Changed risk | Evidence |
| --- | --- |
| Documentation only | owning page review and `npm run verify:docs` |
| Types, exports, examples, public API | focused API tests, typecheck, build, package verification |
| Semantic state, ordering, failure meaning | focused product tests and full unit suite |
| Import or ownership boundary | architecture boundary tests, typecheck, lint, unit, build |
| PixiJS, canvas, frame scheduling, renderer loss | focused rendering tests, benchmark smoke, memory verification |
| Asset, font, capture, package contents | focused tests, package verification; memory for retained resources |
| Destroy, listener, timer, pending work | lifecycle tests and memory verification |
| Measured hot path | correctness checks plus comparable baseline/candidate measurements |

## Performance

- A refactor has no performance claim unless environment, workload, warmup,
  sampling, and concurrency are held constant against a baseline.
- `performance:smoke` proves the benchmark path and lifecycle, not speed.
- Use `performance:benchmark` for renderer, animation, text, or interaction hot
  paths; `performance:update` for transaction work; and
  `performance:extraction` for capture/readback changes.
- `verify:memory` is the release gate for retained heap and resource cleanup.
- Results are current-run artifacts under ignored `.artifacts/performance/`.
  Historical result files are not source-controlled release authority.

## Documentation and package boundaries

- Public behavior and failure meaning live under `docs/`; exact shapes come from
  exported TypeScript declarations.
- Internal ownership and gate routing live under `docs/engineering/` and are not
  published in the package.
- Routers link to one owner instead of copying contracts.
- `verify:package` installs the generated tarball and checks ESM, CommonJS,
  declarations, examples, assets, interaction, capture, and teardown.
- Tests, source, engineering docs, performance tooling, verification code, and
  generated artifacts must not enter the published tarball.
