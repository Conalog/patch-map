# Core v2 / main black-box parity results

## Boundary

- `main` oracle: `0aaaa98b479c86939b049581734a7fb0745ba70e`
- Core v2 implementation candidate:
  `8d285dbf738f27fb36ae9bd96492210dd515cb81`
- `main` was executed only as a detached, read-only public package runtime.
  Its implementation source was not opened, searched, copied, or modified.
- Both runtimes received independently cloned identical PATCH MAP v0.10 JSON,
  deterministic seeds, manual clocks, 800 x 600 DPR 1 viewports, and the same
  action traces. Actual observations and PNGs were captured before comparison.
- Approved fixtures, normalized expected, and review evidence were not exposed
  to either product runtime and were not modified.

## Coverage

The 173 approved cases are all cross-walked:

| comparison class | cases | interpretation |
| --- | ---: | --- |
| direct main overlap | 12 | the same public input/action/result can be compared directly |
| main partial | 92 | the shared user-visible subset is compared; Core-only assertions remain contract-gated |
| Core contract extension | 5 | approved Core semantics have no exact main public surface |
| consumer seam | 48 | packed package, integration, and consumer lifecycle proof |
| external evidence | 16 | native Windows, assistive technology, security, and operational qualification |

The executable browser matrix contains 28 scenarios and 121 checkpoints.
Sixteen isolated `PAR-*` scenarios are blocking and all pass. The complete
result is 18 pass, eight diagnostic mismatch, two not-comparable, zero blocking
mismatch, 199 accepted differences, and zero runtime errors.

The diagnostic scenarios are `LIF-003`, `DAT-002/003/004`, `REN-008/009`, and
`LAY-004/005`. `REN-003` and `REN-011` are not comparable because `main`
rejects approved Core inputs. Every meaningful shared behavior is isolated
again in `PAR-001..016`, where geometry, hierarchy, selection, viewport,
history, transformer, assets, relations, animation, visibility, text, resize,
and style mutation all pass.

## Repaired misses

1. Standalone styled rectangles lost authored radius and stroke in an ordinary
   quad Mesh. Core v2 now keeps plain rectangles in Mesh and routes only
   radius/stroke rectangles through an aggregate GraphicsContext lane.
2. Rounded bars were rendered as square quads. A temporary Graphics fallback
   proved the semantic fix, then the final implementation moved rounded track
   and fill geometry back to aggregate Mesh using fixed rounded-rectangle
   triangle fans. Production radius-3 bars therefore preserve their corners
   and still produce real Mesh uploads during partial and whole-bar animation.
3. The enlarged Korean manual Lab pushed its canvas below the automation
   viewport. The product hit-test was correct; the verification gesture was
   outside the browser viewport. The runner now scrolls the canvas into view
   before click/drag, and all 173 routes pass 192/192 checks.

## Accepted differences

Accepted differences are explicit, narrow classifications rather than global
pixel tolerances:

| classification | observations |
| --- | ---: |
| approved screen-axis affine order | 54 |
| interaction calibration | 42 |
| approved pinned text metrics | 37 |
| semantic versus painted stroke bounds/envelope | 22 |
| main wrapper versus painted-child visibility | 16 |
| approved background geometry correction | 15 |
| approved center-preserving resize | 6 |
| approved authored-center orientation | 4 |
| approved readable-bar placement | 2 |
| main rejected approved input | 2 |
| approved visibility correction | 1 |

Seven additional image observations are antialiasing, glyph rasterization, or
subpixel sampling only. They do not change visible content, placement, size,
state, or interaction.

Notable semantic differences intentionally retained:

- Core applies screen-axis rotation/reflection order, readable half-plane
  correction, center-preserving resize, and bottom-attached readable bars from
  the approved contract even where `main` differs.
- Core animates directly changed bar heights. Initial load, dataset replacement,
  ancestor-layout restoration, and history restoration snap as approved.
- Core uses the pinned Latin/CJK text profile and explicit white default text
  tint. Platform glyph raster variance is non-normative.
- Core keeps the authored rounded background rectangle where a `main`
  radius/border source update produces malformed painted geometry.

## Final local verification

- Unit: 149 files, 1,447 tests.
- Static/build: full lint, typecheck, Core v2 package build, Core v2 Lab build,
  38 decisions, 32 negative drift probes, and 173 contract records.
- Browser: 31/31 WebGL product checks with zero console, page, or network
  errors.
- Human Lab: 173 routes, 192/192 checks, Korean controls and guidance, zero
  browser errors.
- Package: packed ESM/CJS/types, four examples, 38/38 journeys, terminal canvas
  cleanup.
- Memory: 2 warmups + 7 measured lifecycle samples, nine ownership cycles,
  5,099 entities, 90,295-byte retained-heap median, terminal
  DOM/scheduler/renderer release.
- WebGPU: 18/18 experimental checks on the real WebGPU backend; production
  baseline remains WebGL2.
- Renderer matrix: 18 runs, 162 raw trials, 522 recomputed summaries. Mesh
  remains selected and Particle remains rejected.
- Contract performance: six workloads with 2+7 samples, raw digest
  `4aefc03c17463d67073ea532bd025aaf5a3e0913c65e0aa20d557c7d62a6948f`,
  zero browser/lifecycle errors.
- Release readiness: local evidence passes and 15 native drift probes pass.
  `releaseVerified` remains false because native Windows/N100/NVDA/real-input,
  actual-host, security, migration/rollback, and external review evidence is
  pending.

## Selected Mesh scale results

These are independent selected-candidate trials under Chromium 4x:

| source records | expanded entities | normalize median ms | store median ms | renderer median ms | first frame median ms | pan/zoom trial-p95 p95 ms | full-bar trial-p95 p95 ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 509 | 24.0 | 9.9 | 28.2 | 46.3 | 1.1 | 10.7 |
| 500 | 2,549 | 116.8 | 45.1 | 124.9 | 71.2 | 2.6 | 19.9 |
| 1,000 | 5,099 | 289.0 | 86.3 | 256.6 | 73.4 | 2.6 | 21.3 |
| 2,000 | 10,199 | 465.0 | 160.9 | 436.0 | 78.8 | 2.8 | 32.4 |
| 5,000 | 25,499 | 1,372.8 | 429.6 | 921.2 | 88.1 | 4.0 | 64.1 |
| production | 37,071 | 1,151.7 | 653.1 | 440.1 | 51.7 | 1.7 | 71.0 |

The dedicated 5,000-bar animation-plus-pan run records:

| proxy | action median / p95 ms | pan median / p95 ms | pan rAF p95 ms | canvas median fps | canvas gap p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium headless 1x | 118.7 / 126.0 | 618.8 / 645.0 | 18.4 | 61.4 | 18.7 |
| Chromium headless 4x | 461.0 / 480.4 | 849.5 / 1,003.2 | 49.7 | 50.6 | 55.4 |

The 4x result remains a development proxy with long frames; it is not reported
as native Windows performance. Frozen Core v1 evidence was not rerun or edited.

## Artifacts

- `artifacts/first-tranche/report.json`
- `artifacts/first-tranche/contract-coverage.json`
- paired `*-main.png` / `*-core-v2.png` captures for all 121 checkpoints
- `performance/core-v2/results/latest-full-4x.json`
- `performance/core-v2/results/contract-performance.json`
- `docs/tasks/2026/07-15/performance-core-v2/evidence/interaction-performance-5000.json`
- `docs/tasks/2026/07-15/performance-core-v2/evidence/bar-animation-pan-performance.json`
