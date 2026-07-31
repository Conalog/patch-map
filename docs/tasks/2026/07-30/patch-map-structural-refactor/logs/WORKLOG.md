# Worklog

**2026-07-30**

- **Batch:** Structural and performance inventory.
- **Work:** Confirmed the clean dedicated branch; inventoried product, Lab, tests, performance, and verification code; measured LOC/import direction; classified large files by responsibility; and ran an exact-clone scan.
- **Evidence:** `src/patch-map` is 64,704 LOC; the largest files are `engine.ts` 11,270, `core.ts` 4,738, `semantic/transaction.ts` 3,564, `parser.ts` 3,038, and `renderers/mesh-layer.ts` 2,813; exact-clone scan found 805 clones / 7.3% across the scoped corpus.
- **Result:** Established a staged target structure and rollback criteria; no product code or immutable evidence changed in this batch.

**2026-07-30**

- **Batch:** T1 exact utilities and surface contract direction.
- **Work:** Consolidated the identical FNV-1a identity hash, bounded spatial
  grid coverage, and relation endpoint geometry; moved surface geometry types
  below the engine facade; redirected accessibility to that narrow contract.
- **Evidence:** Targeted 100 tests, scoped lint, and typecheck passed. The
  tranche gate passed 148 files / 1,457 tests, full lint/typecheck, package and
  Lab builds, and the canonical 135 capability + 38 journey verifier. An
  independent review returned a clean verdict.
- **Result:** Replaced 185 duplicated or facade-owned source lines with 174
  shared/contract lines (11 net lines removed) and eliminated the
  `accessibility -> engine` back-edge without changing runtime ownership or the
  root public API; browser, memory, packed-consumer, and performance gates were
  intentionally not run because their code paths did not change.

**2026-07-30**

- **Batch:** T2 surface geometry ownership.
- **Work:** Moved surface/world geometry snapshots, readable content
  orientation, relation hit testing/indexing, and private geometry helpers from
  `engine.ts` into `engine/surface-geometry.ts`; moved their narrow value
  contracts into `engine/surface-contract.ts` and retained facade re-exports.
- **Evidence:** Targeted 56 tests, scoped lint, and typecheck passed. The
  tranche gate passed 148 files / 1,457 tests, full lint/typecheck, package and
  Lab builds, and the canonical 173-record verifier. Independent normalized
  review found all 30 moved functions behavior-equivalent.
- **Result:** Reduced `engine.ts` from 11,200 to 10,408 lines and established a
  one-way pure geometry boundary. No Pixi, scheduler, asset, publication, or
  lifecycle owner changed, so browser, packed-consumer, memory, and performance
  gates were intentionally deferred.

**2026-07-30**

- **Batch:** T3 semantic index ownership.
- **Work:** Moved component/text semantic probe contracts, full indexing,
  structural and flat incremental reconciliation, detached probe cloning, and
  direct/planned bar-height semantic fast paths into `engine/semantic-index.ts`.
- **Evidence:** Targeted 108 tests, scoped lint, and typecheck passed. The
  tranche gate passed 148 files / 1,457 tests, full lint/typecheck, package and
  Lab builds, and the canonical 173-record verifier. Independent review found
  item/grid/group traversal, visibility/lock inheritance, identity keys, and
  fast paths behavior-equivalent.
- **Result:** Reduced `engine.ts` from 10,408 to 9,887 lines while preserving
  its sole authority over atomic load/patch/history map replacement. No
  renderer, asset, scheduler, or lifecycle owner changed, so browser,
  packed-consumer, memory, and performance gates remained deferred.

**2026-07-30**

- **Batch:** T4 Pixi surface adapter ownership.
- **Work:** Moved the `PixiEngineSurface` class, default Core factory, surface
  port contracts, pointer bridge, and image probe projection into
  `engine/pixi-surface.ts` and `engine/contracts.ts`; retained all compatibility
  re-exports and the default factory selection in `PatchMap`.
- **Evidence:** Targeted 57 tests, scoped lint, and typecheck passed. The
  tranche gate passed 148 files / 1,457 tests, full lint/typecheck, package and
  Lab builds, and the canonical verifier. Headless Lab passed 173 routes /
  192 checks with zero console/page/network errors; actual-production passed
  605 roots / 643 components and destroy cleanup; 2+7 memory passed 5,099
  entities plus 9 ownership cycles with 92,939-byte retained-heap median.
  Independent review returned a clean verdict.
- **Result:** Reduced `engine.ts` from 9,887 to 8,866 lines and made the
  facade-to-surface port explicit without adding a scheduler, listener, ticker,
  asset owner, or per-entity object. Packed-consumer was not repeated because
  package exports/dependencies did not change; performance was deferred until
  the fresh pre-hot-path baseline. Windows native remains pending.

**2026-07-31**
- **Batch:** T5 aggregate Mesh planning boundary. **Work:** Moved typed-array geometry atoms into `renderers/mesh/geometry.ts` and store/projection-to-CPU lane planning into `renderers/mesh/chunk-geometry.ts`; retained Pixi creation, culling, GPU upload, incremental binding validation, and destroy ownership in `mesh-layer.ts` with facade re-exports. **Evidence:** Typecheck, full lint, targeted 59 renderer tests, package/Lab builds, canonical 173 contract, and two independent reviews passed; the full unit run passed 1,454/1,457 before three CPU-contention timeouts, and isolated reruns passed UPD-007/CSM-018 at normal limits plus both CSM-010 assertions at a diagnostic 180-second limit (95.7 seconds). **Result:** Reduced `mesh-layer.ts` from 2,789 to 1,625 lines without changing algorithms, public imports, resource ownership, or hot-path allocations; browser, package-consumer, memory, and performance gates were intentionally not repeated because those paths did not change.
- **Batch:** T6 rounded-bar retained geometry hot path. **Work:** Reused fixed 21-vertex rounded Mesh geometry for value-only bar retargets, retained Mesh/Geometry/UV/index identity, uploaded only dirty position buffers, and added selectable 1x/4x benchmark profiles; structural radius/style/visibility/fill-presence transitions keep the rebuild path. **Evidence:** Targeted 18 renderer tests, typecheck, full lint, 148 files / 1,458 unit tests, package/Lab builds, canonical 173 contract, headless 173 routes / 192 checks, 10,000-bar load/animate-pan/destroy, and independent renderer review passed with zero browser errors. The fresh 5,000 checkpoint reduced repeated-action p95 by about 89% at 1x and 71% at 4x versus the prior rebuild baseline; a same-session 10,000 4x cross-check reduced repeated-action p95 614.8 to 538.3 ms and rAF p95 782.4 to 666.4 ms, while first-action p95 was unfavorable at 806.5 to 935.2 ms. **Result:** Kept the retained path because repeated retarget and animation scheduling improved without observable or ownership changes; package-consumer and memory gates were deferred because exports and destroy ownership did not change, and Windows native remains pending.
- **Batch:** T7 allocation-free presentation reconcile. **Work:** Added one controller-owned ephemeral reconcile state and scalar lookup/retarget/cancel kernels; Core now consumes those kernels while public presentation methods retain sequential validation, canonical time, per-operation publication counters, and nested frozen observations. Cancel, destroy, and reset clear retained IDs. **Evidence:** Public/internal parity covers schedule, sampled retarget, equal and immediate destinations, identity replacement, cancel mismatch/success, invalid atomicity, negative zero, no-op carry, and destroy cleanup. Targeted 35 tests, typecheck, full lint, 148 files / 1,462 unit tests, package/Lab builds, canonical 173 contract, headless 173 routes / 192 checks, 10,000-bar animate-pan/destroy, and independent review passed. A same-process 5,000 by 6-operation control reduced the target controller stage median 94.7 to 44.1 ms and p95 622.8 to 117.6 ms; the 5,000 1x browser run kept repeated-action p95 effectively flat at 59.8 to 58.4 ms and improved rAF p95 66.7 to 50.0 ms. **Result:** Removed per-row frozen probe/input/result allocations without a new scheduler or public API. Chromium 4x and the later 10,000 1x performance cells remain pending because unrelated concurrent builds and browsers produced multi-second external stalls; their failures are preserved and not used as positive evidence. Package-consumer and memory were not repeated because exports and lifecycle ownership did not change; Windows native remains pending.
- **Batch:** T8 Lab composition and runtime values. **Work:** Moved all pure Korean workbench markup, panels, labels, command help, advanced examples, and default animation-duration policy from `manual-workbench.ts` into `manual-workbench-view.ts`; retained mount, engine, pointer, asset, lifecycle, and DOM-mutation ownership in the session facade. Added one import-free `runtime-values.ts` leaf for the exact cycle-safe deep-freeze, clone-and-freeze, and plain-record helpers used by seven contract runtimes; the import-forbidden presentation runtime remains standalone. **Evidence:** Targeted 332 tests, scoped lint, typecheck, full lint/typecheck, 149 files / 1,466 unit tests, package/Lab builds, canonical 173 contract, and two independent reviews passed. A first all-route browser run hit one transient 20-second route-ready timeout, so the verifier now reports case/URL/state/errors; the unchanged rerun passed 173 routes / 192 checks with zero console/page/network errors. **Result:** Reduced the live workbench session from 2,653 to 2,050 lines, established a 628-line pure view, and removed exact runtime helper copies without changing product code, package exports, lifecycle/resource ownership, or hot paths. Packed consumer, 2+7 memory, and performance were intentionally not repeated; Windows native remains pending.
- Batch: T9 public contracts and contract test harness. Work: Moved Core DTOs and text-target validation into core/contracts.ts, moved 96 Engine public contracts and three union bases into the type-only engine/public-contracts.ts owner, retained PatchMap, private event/state, Pixi, scheduler, and lifecycle authority in engine.ts, and moved the actual-only contract surface double into tests/patch-map/support without expected/comparator access. Evidence: Independent reviews passed; targeted 72 tests, scoped lint/typecheck, full lint/typecheck, 151 files / 1,471 unit tests, package/Lab builds, canonical 135 capability + 38 journey contract, and packed ESM/CJS/types + 38 journeys passed. Result: Reduced core.ts from 4,738 to 4,392 lines, engine.ts from 8,866 to 7,871 lines, and contract-lab-execution.test.ts from 2,401 to 1,637 lines while preserving root exports and runtime behavior. Headless Lab, memory, and performance were intentionally deferred to the final release checkpoint because this tranche changed no renderer, resource, destroy, or hot path; Windows native and qualified WebGPU remain pending.
- Batch: Final release checkpoint. Work: Removed the remaining public Core v2 Lab alias and canvas probe identity, synchronized mutable browser verification with /lab/patch-map/, and completed the refactor release gates. Evidence: Independent review PASS; typecheck/full lint, 151 files / 1,471 unit tests, package and Lab builds, canonical 38 decisions / 173 cases, packed ESM/CJS/types + 38 journeys, and headless 173 routes / 192 checks with zero console/page/network errors PASS. The prior actual-production and 2+7 ownership checkpoint remains applicable because this final naming change did not alter renderer/resource/destroy ownership. The fresh 5,000-bar 2+7 run preserved raw samples outside the repository: 1x repeated median/p95 50.9/109.1ms; one 4x sample reached 2,924.9ms and the 900ms budget honestly FAILed. Result: Public product identity is PatchMap-only, immutable evidence is unchanged, no browser/server process remains, and Windows-native plus qualified WebGPU stay pending.
