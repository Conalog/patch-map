# Core v1 Performance and Release Report

## Verdict

Core v1 is complete as a performance-first development candidate. It is an
intentional replacement product, not a PATCH MAP v0.10-compatible build. The
selected implementation uses a dense numeric entity store, ID-to-slot and
endpoint-adjacency indexes, generation-checked references, atomic ordered
transactions, lazy dirty-slot spatial refresh, explicit animation time and
frame publication, and one aggregate Canvas2D renderer. It creates no
per-entity PixiJS object, listener, ticker, or public live container.

The macOS arm64 Chromium 4× proxy, package, browser, lifecycle, determinism,
and audit gates pass. Native low-end Windows measurement remains pending, so
this report is not Windows-native approval.

## Acceptance workload

The user production fixture is byte-preserved at 1,317,998 bytes with SHA-256
`9afd9e179c613b3833acd99cbe0a747fe2068475dc14ab9dada5d512fdbd1a86`.
Its 458 source records expand deterministically to 37,071 Core v1 entities:
18,730 rects, 9,365 bars, 29 images, and 8,947 relations. Synthetic workloads
contain exactly 100, 500, 1,000, 2,000, and 5,000 entities.

## Selected-path 4× results

Measurements use two warmups and seven measured samples. Cells are median / p95
milliseconds except retained heap. Raw samples, min, max, environment, and
per-phase summaries are preserved in
`performance/core-v1/selected/results/latest-full-4x.json` (SHA-256
`699f21b57993d1a0ac33a4073e9df9466d721a27af221e07f36e3135bce97472`).

| Workload | Normalize | Load | First flush | Trusted 10% commit + flush | Random 10% commit + flush | Animation frame | Post-update hit | Select + flush |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.4 / 1.1 | 3.3 / 3.4 | 3.0 / 3.8 | 1.1 / 1.7 | 1.2 / 1.9 | 0.7 / 1.6 | 1.6 / 2.1 | 1.5 / 2.5 |
| 500 | 1.0 / 1.2 | 12.2 / 16.3 | 4.6 / 9.7 | 3.2 / 4.3 | 2.9 / 3.8 | 2.1 / 3.1 | 2.9 / 4.5 | 3.6 / 4.6 |
| 1,000 | 1.7 / 2.2 | 21.7 / 22.7 | 6.2 / 7.5 | 4.4 / 4.8 | 4.4 / 5.0 | 2.7 / 3.7 | 2.6 / 4.0 | 4.0 / 4.3 |
| 2,000 | 3.6 / 4.0 | 41.9 / 42.5 | 7.2 / 7.6 | 6.8 / 8.9 | 6.0 / 7.0 | 3.4 / 5.4 | 4.4 / 6.2 | 5.0 / 6.8 |
| 5,000 | 10.1 / 11.9 | 98.0 / 101.3 | 11.7 / 13.6 | 12.7 / 13.9 | 12.8 / 13.0 | 5.0 / 8.3 | 9.8 / 10.4 | 8.8 / 10.5 |
| Production 37,071 | 177.1 / 185.3 | 600.4 / 1,171.4 | 27.4 / 44.8 | 62.3 / 85.7 | 52.7 / 72.5 | 17.3 / 25.5 | 15.5 / 17.9 | 24.6 / 26.5 |

Production teardown is 0.0 / 1.0 ms. The forced-GC signed retained JavaScript
heap median is 2,312 bytes; p95 is 6,856 bytes. These values exclude Canvas2D
backing stores, DOM/native allocations, and GPU memory.

## Optimization result

The first selected-path full checkpoint used the same 37,071-entity adapter but
still rebuilt transaction canonicals and spatial buckets too broadly. The final
implementation copies each original entity once per transaction, applies
validated canonical patches without full re-normalization, maintains endpoint
adjacency, updates only dirty spatial memberships, uses ID-indexed queries, and
charges lazy spatial work to the first post-update hit test.

| Production metric | Initial selected full median | Final median | Change |
| --- | ---: | ---: | ---: |
| First flush | 30.1 ms | 27.4 ms | 1.10× faster |
| Trusted 10% commit + flush | 175.3 ms | 62.3 ms | 2.81× faster |
| Random 10% commit + flush | 185.9 ms | 52.7 ms | 3.53× faster |
| Animation frame | 17.6 ms | 17.3 ms | effectively stable |
| Post-update spatial hit | not isolated | 15.5 ms | cost is now explicit |

The frozen compatibility baseline used a different representation and is not a
speedup denominator: it expanded the same source fixture to 19,577 ManagedNodes,
while Core v1 expands to 37,071 flat entities. Directionally, the baseline
recorded 2,076.5 ms load, 2,039.8 ms first render, 3,907.4 ms trusted update,
and 90.67 MB retained load heap at its quick 4× checkpoint. These figures show
the removed responsibility cost but are not an apples-to-apples renderer claim.

## Product and release proof

- Unit/integration: 31 files and 225 tests pass, including atomic failure,
  selection replacement, global z-order, endpoint adjacency, animation/history,
  same-time determinism, stale generation, input copying, and exceptional
  teardown regressions.
- Browser lab: light-mode synthetic, production, and responsive fresh-page
  flows pass with no console, page, or network failures. The smoke asserts 100
  entities, 190 commands, a known entity pixel and ID, plus exact production
  expansion, fixture identity, and 72 aggregate commands.
- Package: a fresh full build and offline packed consumer pass ESM, CJS, and
  strict NodeNext imports through `@conalog/patch-map/core-v1`. The runtime
  surface is exactly `Canvas2DRenderer`, `CoreScene`, `NoopRenderer`,
  `createCoreScene`, and four public error classes. ESM, CJS, UMD, and declaration
  artifacts build; the package verifier checks all declared root/Core targets.
- Lifecycle: nine production cycles retain one canvas, no stale active Core,
  no document/node/listener growth, and 64,464 bytes late-versus-early heap
  growth under a 2 MiB allowance. Direct loaded-production re-initialization
  destroys the old Core and releases the document before creating the next one.
- Supply chain: `npm audit --json` reports zero known vulnerabilities across
  216 dependencies.

## Reproduction and limits

- `npm run lab:core-v1` opens the interactive light verification lab.
- `npm run verify:lab:core-v1` runs fresh-page browser proof.
- `npm run perf:core-v1` reproduces the full 4× matrix;
  `npm run perf:core-v1:quick` is the diagnostic subset.
- `npm run verify:package:core-v1` and `npm run verify:memory:core-v1` reproduce
  the packed-consumer and lifecycle gates.
- `node performance/core-v1/report/verify.mjs` validates the baseline, both
  spikes, and selected-path raw/summary evidence.

Chromium CPU measurements include GC interruptions but do not partition CPU
from GC. Canvas command counts are aggregate submissions, not GPU draw calls or
upload bytes; public browser APIs do not expose reliable GPU-upload or retained
GPU-memory counters for this backend. Headless pixels are QA evidence, not a
cross-platform normative raster contract. Native headed Windows latency,
memory, raster behavior, and GPU characteristics remain pending.
