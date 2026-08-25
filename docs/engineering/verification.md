# Verification policy

Choose gates from the behavior and resources that changed. Focused tests guide
development; final gates prove the affected boundary and its integration.

## Fast path

```bash
npx vitest run tests/patch-map/<focused>.test.ts --maxWorkers=2
npm run typecheck
npm run lint
```

Run `npm test` when the change crosses modules or affects shared behavior. Run
the full CI-equivalent set for runtime, release, or broad architecture changes:

```bash
npm run typecheck
npm run lint
npm run unit
npm run build
npm run verify:contract
npm run verify:package -- --require-audit
npm run build:lab
npm run verify:lab:all
npm run verify:memory
```

## Risk routing

| Changed risk | Required evidence |
| --- | --- |
| Pure internal documentation | link and command inspection; no runtime claim |
| Public documentation or packaged examples | owning content review plus `npm run verify:package` |
| Types, exports, public API | focused API tests, typecheck, lint, build, package verification |
| Semantic state, ordering, failure meaning | focused unit tests, `npm test`, contract verification |
| Import or ownership boundary | architecture boundary tests, typecheck, lint, unit, build |
| PixiJS, canvas, input, resize, renderer loss | focused tests, Lab build, browser verification, memory verification |
| Asset, font, package, or supply chain | focused tests, build, package verification with audit |
| Destroy, listener, timer, pending work, retained resource | focused lifecycle tests and memory verification |
| Measured hot path | correctness gates plus a controlled baseline/candidate performance run |

## Performance policy

- Treat refactors as no-regression work until comparable measurements prove an
  improvement.
- Use the matching workload under `performance/patch-map/` or
  `scripts/verification/patch-map-*-performance.mjs`.
- Hold workload, environment, cache state, sampling, and concurrency constant.
- Preserve slow samples and failed trials. Do not relax a budget after seeing a
  result.
- Use `npm run verify:memory` for renderer, capture, asset, listener, and destroy
  ownership changes even when throughput improves.
- Exploratory results belong under ignored `.perf-results/`. Promote evidence
  only through the repository's review process.

## Documentation policy

- Public behavior, ordering, failure meaning, runtime support, and package usage
  are documented under `docs/` and must change with the owning code.
- Internal ownership, dependency direction, and gate routing are documented in
  `docs/engineering/`.
- Keep one canonical owner for each fact. Routers link to owners instead of
  copying their content.
- Commands and paths must exist in the current tree. Remove stale routes rather
  than documenting compatibility for internal process artifacts.

## Package policy

- `npm run verify:package -- --require-audit` is the authority for packed files,
  exports, installed ESM/CJS consumers, examples, and audit requirements.
- Internal engineering docs, tests, Lab code, performance harnesses, fixtures,
  and evidence must not enter the package.
- Public documentation and examples required by the package policy must be
  present in the tarball.
- A local build is not package proof; verify the produced tarball through the
  installed-consumer matrix.

## Evidence policy

- Authored fixtures, normalized expectations, generated manifests, browser
  output, and performance results have distinct owners.
- Never edit generated or digest-bound evidence to make a gate pass. Change the
  authored input, regenerate, then review the resulting diff.
- Keep artifact identity, environment, workload, and command provenance with
  retained evidence.
- A browser or operating-system limitation is an environment result, not a
  product pass or failure. Report it separately.
- Do not claim completion while required evidence is missing, stale, or produced
  from a different package artifact.
