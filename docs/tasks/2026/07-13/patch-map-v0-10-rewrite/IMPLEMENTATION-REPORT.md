# PATCH MAP v0.10 Clean-room Implementation Report

## Result

Implementation commit `d2a67e01c5c7b207b47c13d052c90373c1c983f0` covers the twelve documented exports and the cumulative approved v3/v4 public observable contract. All currently executable functional, package, memory, safety, audit, determinism, and performance gates pass. The approved fixture matrix remains Oracle-generated/review-pending, headed Windows native approval remains pending, and the explicitly partial Q4/Q7/Q12/Q18/Q21 observations are not inferred.

## Architecture and performance strategy

- Materialized public data, live scene handles, indexed lookup state, and render primitives are separate layers.
- Public handles retain identity, parent/child traversal, transforms, bounds, props, and destruction semantics.
- A sibling aggregate render layer submits one active backend primitive through 5,000-object draw and update scenarios.
- ID/type/label indices avoid repeated whole-scene selection work; managed refreshes coalesce to explicit render or next-frame boundaries while public return-time state stays synchronous.
- Grid templates and homogeneous components reuse materialized structure without changing public identity.
- Destroy removes listeners, state, indices, scene resources, pending work, and retained references; memory verification covers repeated re-init.

## Functional and release verification

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm run unit` | 21 files, 162 tests passed |
| `npm run conformance -- --repeat 2` | 31 fixtures, 62/62 fresh-session comparisons passed |
| `npm run conformance -- --repeat 10 EVT-101 TRN-101 INT-101` | 30/30 fresh-session comparisons passed |
| `npm run verify:browser` | ten fresh browser-contract sessions passed |
| `npm run verify:memory` | twelve cycles passed; measured retained-heap growth stayed within the gate |
| `npm run verify:package` | 12 exports, 7 entry targets, 37 declaration edges, ESM/CommonJS/NodeNext/UMD and subclass lifecycle passed |
| `npm run verify:safety` | v4 manifest exact; 71 immutable payloads exact; `package.json` implementation-mutable; packaged source maps/evidence: 0 |
| `npm audit --json` | zero vulnerabilities at every severity |
| `npm run perf:check` | implementation performance bootstrap ready |

The approved v4 export was independently verified at import time with manifest SHA-256 `91315bb3449f6650ec89033386fb2c167bceca3a02a31591b23119dcc0a04a5f` and all 72 payload sizes/hashes. In the implementation worktree, `package.json` has intentionally diverged to define the reproducible build/test environment; the other 71 manifest payloads remain exact. Approved expected output and reference screenshots have no staged or unstaged changes.

## S1 scaling results

All rows use two warmups and seven measured samples. Times are milliseconds; heap is retained bytes after draw. Reference comparisons are directional and environment-qualified. Local throttle-1 results are provisional non-Windows evidence.

### Developer-native / throttle 1

| Objects | Initial median ref → impl | Update median ref → impl | Heap median ref → impl | Median reductions |
| ---: | ---: | ---: | ---: | --- |
| 100 | 44.6 → 8.5 | 3.1 → 2.9 | 2,155,971 → 783,668 | 80.9% / 6.5% / 63.7% |
| 500 | 153.4 → 29.8 | 10.9 → 3.7 | 9,465,263 → 3,573,874 | 80.6% / 66.1% / 62.2% |
| 1,000 | 336.0 → 56.0 | 23.5 → 6.9 | 18,883,148 → 6,955,678 | 83.3% / 70.6% / 63.2% |
| 2,000 | 367.3 → 112.7 | 25.9 → 12.4 | 37,374,168 → 13,579,832 | 69.3% / 52.1% / 63.7% |
| 5,000 | 1,107.5 → 279.3 | 68.0 → 39.6 | 91,933,823 → 33,898,032 | 74.8% / 41.8% / 63.1% |

### Chromium 4× proxy

| Objects | Initial median ref → impl | Update median ref → impl | Heap median ref → impl | Median reductions |
| ---: | ---: | ---: | ---: | --- |
| 100 | 135.4 → 36.3 | 11.3 → 12.3 | 2,156,107 → 778,220 | 73.2% / -8.8% / 63.9% |
| 500 | 454.3 → 129.6 | 34.6 → 16.3 | 9,482,707 → 3,577,070 | 71.5% / 52.9% / 62.3% |
| 1,000 | 853.3 → 231.9 | 67.4 → 30.1 | 18,921,823 → 6,961,402 | 72.8% / 55.3% / 63.2% |
| 2,000 | 1,701.6 → 445.1 | 108.2 → 52.8 | 37,378,547 → 13,577,520 | 73.8% / 51.2% / 63.7% |
| 5,000 | 3,161.8 → 1,087.5 | 214.9 → 131.2 | 91,872,129 → 33,876,864 | 65.6% / 38.9% / 63.1% |

The 100-object 4× update median is 1.0 ms slower than reference; every 500–5,000-object update median is lower. Both native and 4× reports preserve min/median/p95/max, raw samples, and p95/median noise ratios.

## S3/S4 and render diagnostics

- 1,000- and 2,000-object native and 4× interaction reports each preserve 14 raw samples and pass 364/364 recomputed compatibility assertions.
- S3 covers bulk highlight, relation refresh/visibility, sequential mixed update, and trusted bulk update.
- S4 covers pan/zoom, hover, pointer hit, box/paint selection, resize, and rotation; noise assessments remain preserved and provisional where ratios exceed policy.
- The render diagnostic reports one active aggregate backend primitive before and after update at 100, 500, 1,000, 2,000, and 5,000 objects. No reference backend count is inferred.

## Preserved artifacts

- `.perf-results/low-end-native-d2a67e01.json`
- `.perf-results/low-end-native-d2a67e01-verified.json`
- `.perf-results/low-end-4x-d2a67e01.json`
- `.perf-results/low-end-4x-d2a67e01-verified.json`
- `.perf-results/perf-interactions-native-d2a67e01.json`
- `.perf-results/perf-interactions-native-d2a67e01-verified.json`
- `.perf-results/perf-interactions-4x-d2a67e01.json`
- `.perf-results/perf-interactions-4x-d2a67e01-verified.json`
- `.perf-results/render-primitives-d2a67e01.json`

## Remaining external and evidence limits

- Q4 authored headless drag callbacks, Q7 exhaustive schema combinations, Q12 raster environment coverage, Q18 exact drill wall-clock window, and Q21 reference backend primitive count retain the v4 partial status.
- TXT-101, S2-101, and UPD-005 macOS headless pixels remain non-normative.
- Native/headed Windows raster and S1/S3/S4 approval remains pending.
- The v4 fixture matrix remains analysis-owner review-pending.
- No other worktree, branch, ref, Git history, PATCH MAP original implementation/test, reference package, archive, dependency bundle content, or source map was used to design the implementation.
