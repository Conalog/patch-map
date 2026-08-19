# Worklog

## 2026-07-30 — Cleanup started

- Confirmed clean `performance/core-v2` worktree and active cleanup goal.
- Inventoried the legacy root, Core v1, completed PixiJS runtime, package
  exports, Labs, examples, and verification scripts.
- Identified the retained Core v1 dependency as dense-store substrate rather
  than a shippable product.

## 2026-07-30 — PatchMap product promotion completed

- Promoted the completed PixiJS implementation to `src/patch-map` and the root
  `@conalog/patch-map` export with primary class `PatchMap`.
- Moved the reusable dense store into `src/patch-map/dense`; removed the Core
  v1 Canvas2D product, legacy root implementation, old Labs/tests/builds, and
  unreferenced legacy verification harnesses.
- Consolidated the current Lab, examples, docs, package consumer, browser,
  memory, performance, and main-parity tooling on PatchMap names. Historical
  contract IDs and frozen evidence paths were preserved.
- Verification: typecheck PASS; lint PASS; build and Lab build PASS; unit
  149/149 files and 1,456/1,456 tests PASS; canonical contract 38 decisions and
  173 cases PASS; headless manual Lab 173 routes and 192/192 checks PASS with
  zero console/page/network errors; packed ESM/CJS/types, four examples, and
  38 journeys PASS; 2+7 memory over 5,099 entities PASS with 88,367-byte
  retained-heap median and DOM/scheduler/renderer released.
- The external npm vulnerability audit, WebGPU adapter qualification, and
  Windows-native qualification remain explicitly pending. No renderer hot
  path changed, so no new full performance matrix was run.

## 2026-07-30 — PR review checkpoint

- Reviewed the complete cleanup diff for package/API boundaries, stale
  product names, immutable-evidence isolation, lifecycle/asset ownership,
  deleted-surface references, secret/debug residue, and distribution config.
- Fixed the contract CI path filter so changes under
  `scripts/verification/core-v2-contract/**` trigger verification.
- Changed current operational browser checks to exercise `/lab/patch-map`
  directly instead of relying on the immutable contract's historical
  `/lab/core-v2` compatibility route.
- Regression verification after review fixes: 62/62 targeted tests, scoped
  lint, typecheck, and headless 173-route Lab 192/192 PASS with zero
  console/page/network errors. Browser and Vite test processes exited cleanly.
- Product cleanup commit: `68888cc` (`refactor: promote PatchMap as the root
  product`).

## 2026-07-30 — Single PatchMap Lab

- Removed the duplicate low-level performance Playground, its public bridge,
  renderer/backend selectors, styles, and dedicated WebGL/WebGPU browser
  verifiers. `/lab/patch-map/` now builds and serves only the Korean 173-case
  manual Lab.
- Removed `PatchMapRuntime`, `createPatchMapRuntime()`, and low-level-only
  types from the root package export. The Lab and packed consumer now use
  `PatchMap`; the internal performance harness imports the non-published core
  module explicitly.
- Changed packed verification to write transient results by default. A first
  verification run updated the frozen package evidence before this guard was
  added; that generated change was discarded, the original evidence restored
  exactly, and the package gate rerun without frozen-file drift.
- Verification: targeted 48/48 and release-regression 10/10 tests PASS;
  typecheck and full lint PASS; Lab and package builds PASS; full unit
  149/149 files and 1,456/1,456 tests PASS; canonical 38 decisions and 173
  cases PASS; packed ESM/CJS/types, four examples, and 38 journeys PASS;
  headless 173-route Lab 192/192 PASS with zero browser errors; headless
  10,000-record fit/zoom/animation-during-pan/destroy PASS with canvas and
  bridge cleanup at zero.
- Renderer, scheduler, resource ownership, and destroy paths did not change,
  so the full performance matrix and 2+7 memory gate were not repeated.
  Windows-native and qualified WebGPU measurements remain pending.

## 2026-07-30 — Repository residue cleanup

- Removed the obsolete clean-room handoff/export, root `artifacts` and
  `fixtures`, Core v1 performance control, completed main-parity harness and
  captures, obsolete implementation/task working documents, and unreferenced
  timestamped performance outputs with explicit user approval.
- Preserved the canonical 173-case functional-contract corpus, its immutable
  normalized expected observations/reviews, five digest-bound extraction and
  interaction artifacts, and eleven performance/release results with live
  source references.
- Moved active performance tooling from `performance/core-v2` to
  `performance/patch-map`, renamed current native/release scripts to
  `patch-map-*`, and removed the completed `verify:main-parity` surface.
- Replaced contract-only path-filtered CI with full PR/push validation:
  install, typecheck/lint/unit, canonical contract, product build, and Lab
  build.
- The packed 38-journey run exposed CSM-036 near its generic 45-second
  timeout. Its production-sized editor remount/cleanup journey now has a
  dedicated 120-second verifier ceiling; the rerun completed all 38 journeys
  with lifecycle cleanup.
- Verification: targeted 9 files/281 tests PASS; typecheck PASS; full lint
  PASS; product and Lab builds PASS; full unit 148 files/1,451 tests PASS;
  canonical 38 decisions/173 cases PASS; performance evidence verifiers PASS;
  native release positive proof plus 15 negative probes PASS; packed
  ESM/CJS/types, four examples, and 38 journeys PASS; headless 173-route Lab
  192/192 PASS with zero console/page/network errors.
- Retained local evidence for commit `8d285db` remains internally valid and
  native Windows/NVDA/device/actual-host qualification remains pending.
  Cleanup commit `1f2f3ef` does not reuse that evidence as a new performance
  claim. Renderer, scheduler, resource ownership, and destroy paths did not
  change, so the full performance matrix and 2+7 memory gate were not rerun.
- Cleanup commit: `1f2f3ef` (`refactor: consolidate PatchMap repository
  tooling`).

## 2026-07-30 — Repeated 5,000-bar retarget performance

- Reproduced rapid full-bar updates before prior animation settlement. Active
  presentation count stayed bounded at 5,000 and the central frame loop kept
  one pending RAF; the primary synchronous cost was exact full-dataset digest
  materialization followed by direct projection reconciliation, not animation
  or ticker accumulation.
- Deferred exact semantic hashing until observation, made committed result
  digests lazy and memoized, stopped the Lab from forcing full snapshots during
  active animations, removed redundant direct-batch animation-target Set
  construction, and reused the animated spatial hit envelope across exact
  direct retargets.
- Rejected two measured alternatives: holding normalized batch inputs
  increased allocation pressure, and copying broad stable records instead of
  overlaying them raised reconcile time to 178–227ms. Neither remains in the
  product.
- Headless 5,000-bar smoke with six updates and active pan PASS: repeated
  action median 92.8ms/p95 108.5ms, rAF-gap p95 116.1ms, two long tasks,
  exact digest observable after settlement, and bridge/canvas cleanup zero.
- The final 2+7 checkpoint preserved all raw 1x/4x samples. 1x repeated-action
  trial median was 90.0ms and rAF-gap trial median was 115.9ms versus the
  original diagnostic's 127–198ms action range and 184.3ms rAF p95. One
  system-wide slow trial reached 544.3ms; 4x reached 1,036.9ms, so the
  predeclared 250ms/900ms action budgets remain FAIL rather than being relaxed.
- Verification: targeted 71/71 then 58/58 tests PASS; typecheck and scoped/full
  lint PASS; full unit 148/148 files and 1,453/1,453 tests PASS; Lab build PASS;
  canonical 38 decisions and 173 cases PASS; 2+7 memory over 5,099 entities
  PASS with 90,715-byte retained-heap median and DOM/scheduler/renderer
  released; packed ESM/CJS/types, four examples, and all 38 consumer journeys
  PASS with lifecycle cleanup. Windows-native performance remains pending.

## 2026-07-30 — Actual production data in the single Lab

- Added the user-supplied 1,071,991-byte PATCH MAP JSON as the separate
  `실제 운영 데이터 · 605개 원본` manual-Lab option without replacing the
  seeded production-shaped workload or changing the canonical contract sizes.
- Preserved all 605 roots, stable IDs, 643 components, 170 relation records,
  authored visibility, content orientation, and the original remote image
  source. The frozen source is loaded without seed transformation or caller
  mutation.
- Split the fixture into an on-demand Lab chunk: the normal Lab chunk remains
  3,777.98KB and the production fixture adds 588.09KB/52.28KB gzip only after
  selection.
- Verification: focused 10/10 unit tests PASS; typecheck and scoped lint PASS;
  Lab build PASS; headless Playwright Chromium loaded WebGL, 605 roots and 643
  components, fit at the 2.5% floor, pan, and destroy PASS with input
  immutability and zero console/page/network errors. Renderer, scheduler,
  package exports, and resource ownership did not change, so performance,
  memory, packed-consumer, and full contract gates were not repeated.

**2026-07-30**

- **Actual production rendering compatibility.** Fixed the v0.10 visual-property family instead of special-casing sample IDs: `attrs.alpha` now multiplies through group/grid/item/component/direct and relation ownership, including local image/text opacity. The producer's `attrs.display: "image"` profile aligns authored image and overlay top-left rotation while the approved default image-center contract remains unchanged.
- Split standalone root images from component assets inside the aggregate Pixi hierarchy, kept root imagery in the underlay, and preserved background, bar/relation, icon, text, and interaction overlay lanes without per-entity scene nodes.
- Added the Lab's explicit `images.conalog.com` ingestion profile and connected asynchronous Core invalidation to the `PatchMap` frame owner. The default package policy remains deny-by-default and resolved asset leases still release on destroy.
- Verification: targeted 77/77 and 29/29 tests PASS; typecheck/full lint PASS; full unit 148 files/1,457 tests PASS; package and Lab builds PASS; canonical 38/173 contract PASS; 173-route headless Lab 192/192 PASS; actual-production headless background `resolved/current` at 1730×1488, image/overlay center distance 11.02px, overlay alpha 0.6, pan/destroy and console/page/network error zero PASS; packed ESM/CJS/types, four examples and 38 journeys PASS; 2+7 memory over 5,099 entities PASS with 94,087-byte retained-heap median and DOM/scheduler/renderer released.
- The memory command's transient update to the retained result path was discarded so digest-bound historical evidence stayed unchanged. No hot animation path changed, so no new full performance matrix was run; Windows-native and qualified WebGPU remain pending.

**2026-07-31**
- Batch: Structural refactor promotion checkpoint. Work: Integrated the completed PatchMap ownership refactor and removed the remaining public Core v2 route/probe identity without changing the root API or immutable contract corpus. Evidence: Final unit/build/contract/package/headless Lab gates PASS and independent review reports no blocker; lifecycle ownership remains proven by the unchanged-path 2+7 checkpoint. The fresh Chromium performance proxy is preserved as FAIL because a 4x outlier exceeded its declared limit, while Windows-native and qualified WebGPU remain pending. Result: The branch is ready for a cleanup PR after the final documentation commit and clean-worktree check; version bump remains post-merge.
- Batch: Promotion paused for full structural refactor. Work: Reopened the cleanup because Core and Engine still combine excessive stateful responsibilities and began a complete allowed-file inventory. Evidence: Previous release results remain baseline-only for unchanged paths. Result: PR creation and versioning remain deferred until the new structural goal and release checkpoint complete.

## 2026-08-02 — Branch readiness fixed point

- Reviewed the full branch for correctness, runtime ownership, workflow scope,
  removable complexity, validation, and documentation drift. Fixed reentrant
  atomicity, replacement supersession, external asset admission, scheduler
  continuation after observer errors, presentation O(N²) lookups, dirty-range
  expansion, package metadata/publish guards, CI packed-consumer coverage,
  JavaScript/public-example lint coverage, and tracked-evidence pollution.
- Consolidated repeated slot-range, strict plain-record, ordered string-array,
  component visual-target, Mesh graphics, and hidden-image probe policy. Kept
  transaction, history, parser diagnostic, and bar hot-path loops separate
  where extraction would blur atomic boundaries or add per-entity calls.
  `jscpd` reports 0.6% duplication at the 8-line/80-token threshold.
- Fresh verification passed full lint/typecheck, 194 unit files / 1,735 tests,
  product and Lab builds, canonical 38 decisions / 173 cases, headless 173
  routes / 192 checks with zero console/page/network errors, packed ESM/CJS/
  types + 38 journeys + four examples, and 2+7 memory over 5,099 entities plus
  nine ownership cycles at 98,319-byte retained-heap median.
- The 5,000-bar repeated-retarget 2+7 checkpoint passed: 1x repeated-action
  p95 78.5ms and 4x p95 401.3ms. The 10,000-bar 1x smoke passed at 159.2ms
  repeated-action p95, while 233.3ms rAF p95 and 20 long tasks remain honestly
  unfavorable. Results are transient readiness artifacts; Windows-native and
  qualified WebGPU stay pending. No version, commit, push, or PR metadata was
  changed by the branch-readiness run.

**2026-08-02**
- Repeated the fixed-point review over all 762 allowed current-tree files, including runtime, aggregate renderer, Lab/examples, tests, verification and performance tooling, documentation, configuration, and binary assets; static parsing covered every JavaScript module and JSON document, Markdown local links were checked, source imports had no dependency cycle, and independent reviewers covered runtime ownership, renderer/Lab hot paths, verification, documentation, and final regression risk.
- Fixed async-load supersession, nested descriptor-safe style detachment, reentrant transaction/transformer rollback, same-ID history selection, transformed culling bounds, image retry, host destroy reentrancy, failed cleanup retry ownership, Lab command/probe lifecycle races, package-evidence eligibility, native pending semantics, and candidate-output path confinement; reduced hot-path descriptor and validation work without adding per-entity objects, listeners, tickers, or closures.
- A strict copy/paste scan reported 4.9% across the full logic/test corpus and 1.5% in product source; the dominant full-corpus matches are intentionally independent contract folds/handlers and repetitive test matrices required for expected-blind 1:1 traceability, so only proven semantic-equivalent product and tooling duplication was consolidated.
- Fresh verification passed 195 unit files / 1,759 tests, full lint/typecheck, product and Lab builds, canonical 38 decisions / 173 cases, headless 173 routes / 192 checks with zero console/page/network errors, actual-production WebGL over 605 roots / 643 components, native-release positive/15 negative structural probes, and 2+7 memory over 5,099 entities plus nine ownership cycles at 99,611-byte retained-heap median; the final `.perf-results` output-root hardening then passed its focused 3/3 tests, scoped lint, typecheck, JavaScript syntax checks, and independent P0–P2 re-review.
- The fresh 5,000-bar 2+7 proxy passed at 62.4ms/234.9ms repeated-action p95 for 1x/4x; the 4x rAF p95 remained unfavorable at 251.9ms with long-task-count p95 11, while the 10,000-bar 1x smoke passed at 104.3ms repeated-action p95 and 166.6ms rAF p95 with 21 long tasks retained in the report.
- The strict packed-consumer rerun reached the external install phase but the system volume failed with `ENOSPC` and its temporary workspace was cleaned; this remains an environment-pending release gate rather than reusing prior evidence. The external project-context shape checker still demands legacy task files from the intentionally evidence-only `performance-core-v2` directory, so those removed files were not restored merely to satisfy the stale shape rule. Windows-native and qualified WebGPU measurements also remain pending, and no version, commit, push, or PR metadata was changed.

**2026-08-03**
- After disk capacity recovered, the previously blocked strict packed-consumer gate passed from the current worktree: production build 191 modules, packed ESM/CJS/types, all 38 consumer journeys, four public examples, four aggregate objects, required dependency audit, and lifecycle cleanup. No retained or approved evidence changed, the temporary consumer exited cleanly, Windows-native and qualified WebGPU remain pending, and branch-readiness still performed no commit, push, PR metadata update, merge, or version bump.
- After the user explicitly resumed the unfinished cleanup, the reviewed patch was separated into runtime/rendering atomicity, Lab lifecycle, release-verification, and documentation intents and committed to leave a clean PR-ready worktree; push, PR metadata, merge, and version bump remain outside this checkpoint.

## 2026-08-03 — Concrete grid-instance bar updates

- Added the public `PatchMap.updateInstanceBarHeights()` batch with
  `{ id, componentId }` targets for item and expanded-grid component
  identities. It keeps an atomic runtime overlay over
  authored projection state, reuses dense component indexes and stable-record
  patching, emits only aggregate Mesh dirty ranges, and retargets one central
  animation controller. Missing/duplicate/invalid targets cannot partially
  publish; `null`, semantic reconcile, replacement load, and destroy have
  explicit restore/cleanup behavior.
- Moved the single manual Lab's all/partial/selected bar actions to that public
  package path. The 605-root actual-production scene now addresses 2,701
  concrete bar instances independently while retaining all 309 authored bar
  templates byte-for-byte. Fixed the 5-second REN-009 pause/resume path so its
  frame request covers the selected animation duration.
- Added a headless 5,000/10,000-cell 2+7 WebGL checkpoint with six rapid
  retargets during pan. Repeated-action p95 median was 25.5ms at 5,000 and
  58.9ms at 10,000; rAF-gap p95 median was 33.4ms and 99.1ms respectively.
  The 10,000-cell long-task-count median remained 2 and p95 7. Raw samples are
  retained under `.perf-results/patch-map/instance-bar-latest.json`;
  Windows-native and qualified WebGPU remain pending.
- Verification: targeted 56 tests PASS; full typecheck/lint and 195 files /
  1,764 tests PASS; Lab build and canonical 38/173 contract PASS; representative
  and actual-production headless WebGL PASS with console/page/network error 0;
  packed production build plus ESM/CJS/types, 38 journeys, four examples,
  required audit, public overlay call, and lifecycle cleanup PASS; 2+7 memory
  plus nine ownership cycles over 5,099 entities PASS at 98,247-byte retained
  heap median with DOM/scheduler/renderer released.
- Simplified the public instance address from `{ ownerId, componentId }` to
  `{ id, componentId }` without adding a per-target conversion allocation.
  Focused type/lint/unit checks and the strict packed consumer passed. A fresh
  headless smoke recorded repeated-action p95 of 28.1ms at 5,000 targets and
  61.9ms at 10,000 targets, with zero and two long tasks respectively; the
  full 2+7 matrix was not repeated because renderer and lifecycle ownership
  did not change.

## 2026-08-03 — High-level package DX tranche

- Added the runtime-identical `PatchMap.mount()` entry with production WebGL2
  Mesh defaults, owned frame cadence, ResizeObserver integration, initial
  load/fit, and one-call teardown. Grouped normal work into `data`, `targets`,
  `bars`, `texts`, `selection`, `transform`, `viewport`, `history`, `assets`,
  `debug`, and `capture` domains; retained deterministic low-level control as
  `PatchMapAdvanced`.
- Replaced public `ownerId` mutation envelopes with one stable
  `{ id, componentId? }` shape, accepted singular or batched inputs, added
  revision-bound semantic target compilation for repeated instance batches,
  and deliberately excluded JSONPath. Updated all four normal examples and
  package/migration/troubleshooting documentation to start from this path.
- Fix-first review found and corrected three lifecycle/API gaps: concurrent
  captures are serialized behind the owned frame loop, manual mount sizing is
  reachable through `viewport.resize()`, and `selection.onChange()` observes
  both API-originated and canvas-originated changes.
- Verification: focused 12/12 developer/capture tests PASS; full lint,
  typecheck, 196 unit files / 1,772 tests, product and Lab builds, canonical
  38/173 contract, and required-audit packed ESM/CJS/types + 38 journeys + four
  examples PASS. The packed browser retained four aggregate owners and clean
  lifecycle teardown. The earlier unchanged-path 2+7 memory checkpoint also
  passed, but no new performance result is claimed because renderer, dense
  store, and bar animation hot paths did not change.

**2026-08-03**

- **Batch: unified mutation API tranche.** Replaced the normal `bars`/`texts` mutation domains with `update()`, columnar `updateBatch()`, and atomic `transaction()`. Added optional unique-component resolution, stable `{ id, componentId? }` addresses, structural-field and typo diagnostics, descriptor-safe input checks, and one strict lowering/commit pipeline while retaining the existing authored and instance fast planners.
- Split facade, semantic lowering, batch interpretation, and commit projection into cohesive modules. Added scene-snapshot address indexing and explicit broad component queries so 10,000 repeated targets resolve in O(N+M) without collapsing identical owner-local component IDs. The Lab and performance verifier now exercise the same final public API and reuse compiled targets.
- Verification passed scoped and full lint/typecheck, 196 unit files / 1,780 tests, product/Lab builds, canonical 38 decisions / 173 cases, required-audit packed ESM/CJS/types + 38 journeys + four examples, and representative headless WebGL with zero console/page/network errors. Focused facade/Lab regressions passed after the final diagnostics hardening.
- The public-path 2+7 Chromium proxy passed with repeated-update p95 medians of 25.2ms for 5,000 concrete bars and 52.1ms for 10,000; rAF-gap p95 medians were 17.4ms and 66.8ms. A final-code 10,000 smoke recorded 49.9ms repeated p95 and zero long tasks. Renderer/resource ownership did not change, so the memory matrix was not repeated. Windows-native and qualified WebGPU remain pending.

**2026-08-03**

- Removed the public `PatchMapAdvanced` alias so applications have one entry:
  `PatchMap.mount()`. Kept the low-level implementation and deterministic
  lifecycle/probe seams internal for Lab and expected-blind verification.
- Reworked the shipped host-adapter example to use `data`, `targets`,
  `transaction`, `selection`, `transform`, `history`, `debug`, and `capture`
  domains. Added optional shared asset runtime/policy ownership to `mount()` so
  legitimate multi-instance sharing does not require a low-level constructor.
- Updated package matrices, ESM/CJS runners, migration documentation, and
  source tests. A packed TypeScript negative check now fails if
  `PatchMapAdvanced` becomes exported again.
- Verification passed scoped lint/typecheck, 24 focused unit tests, required
  dependency audit, packed ESM/CJS/types, all 38 journeys, four public
  examples, four aggregate renderer owners, and clean lifecycle teardown.
  Renderer and mutation hot paths did not change, so browser, memory, and
  performance matrices were not repeated.

**2026-08-03**

- Removed `bar.width` and `bar.fill` from singular and columnar public mutation
  contracts because both used the generic component merge and had no separate
  hot path. Migrated examples and tests to `bar.changes`, retained
  `bar.height`, and added runtime plus packed-declaration negative checks.
- Verification passed the focused developer API suite (18 tests), full
  lint/typecheck, production build, required dependency audit, packed
  ESM/CJS/types, all 38 journeys, four public examples, four aggregate renderer
  owners, and clean lifecycle teardown. Browser, memory, and performance gates
  were not repeated because the aggregate renderer, resource ownership, and
  existing height hot path did not change.

**2026-08-03**

- Replaced the public `targets.compile()` / `PatchMapCompiledTargets` language
  with `targets.query()` / `PatchMapTargetSet`. The result now exposes only
  `matches` and `count`; scene revision and reusable query authority remain
  internal while stale and cross-instance sets continue to fail closed.
- Updated the Lab, 5,000/10,000 performance harness, package declaration
  negative checks, README, migration guide, diagnostics, and focused tests.
  Verification passed 18 developer API tests, scoped lint, typecheck, Lab and
  production builds, required audit, packed ESM/CJS/types, 38 journeys, four
  examples, aggregate ownership, and lifecycle cleanup. No browser, memory, or
  performance matrix was repeated because target resolution, renderer code,
  and hot-path execution were unchanged.

**2026-08-03**

- Normalized the final consumer vocabulary across runtime, declarations, READMEs, API/migration/host docs, four examples, the single Lab, and package verification. Replaced `target`/`resize`, `data.load/export`, unsuffixed transform/viewport deltas, and `assets.inspect`; removed public renderer strategy selection and redundant viewport focus; renamed matching public option/result/target types.
- Replaced the root internal barrel with an explicit shipping allowlist and rewrote the packed consumer around `PatchMap.mount()` and public domains. TypeScript negative probes now prevent the removed names and internal runtime helpers from returning. Updated the extraction-script meta test to assert the public `capture.png()` path instead of the removed low-level package probe.
- Verification passed 196 unit files / 1,783 tests, full lint/typecheck, product and Lab builds, canonical 38 decisions / 173 cases, and required-audit packed ESM/CJS/types with all 38 journeys, four examples, four aggregate objects, and clean headless browser/server teardown. The initial full unit pass found only a stale extraction meta assertion; the corrected final full run passed. Renderer/resource/hot-path code did not change, so memory and performance matrices were not repeated and no new performance result is claimed.

**2026-08-03**

- Closed the pre-push review findings at the actual runtime boundary. The root
  `PatchMap` now rejects direct construction, `mount()` returns a frozen public
  facade without Engine lifecycle/probe seams, and packed ESM/CJS verification
  asserts both properties. Reworked the two packed foundation journeys to use
  `mount()`, `data`, `targets`, `history`, `debug`, `capture`, and `destroy`
  instead of relying on the leaked constructor.
- Preflighted replacement fit padding and target-set authority before sync or
  async dataset commits, preventing a cross-instance/stale target or invalid
  padding failure from committing data first. Split independent legacy mount
  option type probes, corrected stale troubleshooting/changelog claims, and
  renamed newly generated supply-chain evidence to PatchMap-neutral naming.
- Verification passed the focused 24 tests, full typecheck/lint, 196 unit files
  / 1,785 tests, canonical 38 decisions / 173 cases, and the required-audit
  packed ESM/CJS/types consumer with all 38 journeys, four examples, aggregate
  ownership, and clean lifecycle teardown. Renderer/resource/hot-path code did
  not change, so memory and performance matrices were not repeated.

**2026-08-04**

- **Batch: Lab coverage ownership refactor.** Replaced the per-action keyword
  classifier and duplicate 646-row action list with one explicit 11-workflow
  manual catalog. Classified all 173 routes as 18 dedicated, 134 shared, or 21
  automated-only cases; corrected case-specific tool ownership, kept the exact
  expected-blind runner as the sole action-trace authority, and made the Korean
  UI state that boundary directly.
- Removed the dead action-to-panel listener and its CSS, added coverage and
  exact-action metadata to every route, and made the full-route browser probe
  verify those invariants. Reduced headless route concurrency from four pages
  to two to avoid resource contention without reducing route or assertion
  coverage.
- Verification passed focused 29 tests, scoped lint, full typecheck, 196 unit
  files / 1,786 tests, the Lab build, canonical 38 decisions / 173 cases, and
  all 173 headless WebGL routes / 192 checks with zero console/page/network
  errors. Package exports, renderer/resource ownership, lifecycle destroy, and
  hot paths were unchanged, so packed consumer, memory, and performance gates
  were intentionally not repeated.

**2026-08-19**

- **Batch: Text viewport demand materialization.** Preserved the existing
  world-matrix text culler and 64-slot chunk ownership while splitting visible
  semantic slot geometry from materialized Pixi text objects. Full rebuilds now
  rasterize only viewport-near chunks; pan, zoom, and moved-in geometry
  materialize through the central leaf lifecycle. Offscreen content/style
  texture regeneration remains deferred, and renderer debug is refreshed after
  culling materializes a chunk.
- Added explicit 0.1x/4x culling coverage, bounded initial materialization,
  lazy pan materialization, moved-in geometry, and destroy-retention checks.
  Extended the public-path performance verifier with initial/final render-command
  observations and fail-closed bounds without exposing a new runtime API.
- The final 5,000/10,000-cell 2+7 WebGL proxy passed with mount medians of
  721.9/1,054.3ms, first-overlay medians of 414.5/744.9ms, repeated-update p95
  medians of 401.9/672.8ms, and initial/final render-command counts of
  605/670 and 634/699. Against the preceding exact checkpoint, mount improved
  from 1,090.6/1,469.4ms and repeated-update p95 from 468.9/846.9ms. The
  rAF-gap p95 medians remain unfavorable at 400.3/666.6ms and long-task-count
  medians remain 8/8; no low-zoom semantic label LOD is claimed.
- Verification passed 42 focused leaf/publication tests, full lint/typecheck,
  production build, canonical 38 decisions / 173 cases, combined bar/icon and
  background/text WebGL pixels, the native release-readiness unit, and the 2+7
  memory lifecycle over 5,099 entities plus nine ownership cycles. The broad
  parallel unit gate passed 193 files / 1,851 tests and retained the same 10
  known render-text fold failures across four files caused by immutable
  actual-only `plannedRoute` versus synthetic `attachedRoute` rows; those
  fixtures and fold evidence were not modified.
