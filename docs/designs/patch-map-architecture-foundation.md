# Design: PatchMap architecture and documentation foundation

Generated on 2026-08-24
Branch: `refactor/patch-map-architecture`
Status: DRAFT
Lifecycle: temporary implementation decision record; it is not a current product contract

## Objective

Refactor PatchMap into explicit, directional ownership boundaries while preserving
the shipping `@conalog/patch-map` surface, PATCH MAP v0.10 input compatibility,
aggregate PixiJS rendering, central scheduling, atomic failure, and explicit
resource cleanup. Establish a documentation foundation in which every current
contract has one canonical owner and public package documentation is clearly
separated from maintainer guidance, immutable verification input, and temporary
work records.

## Fixed product contract

- `PatchMap` remains the sole public runtime class and `PatchMap.mount()` remains
  the public construction path.
- Existing PATCH MAP v0.10 JSON is accepted directly without caller mutation.
- Stable element IDs, component identity, relation endpoints, deterministic
  interpretation, and atomic failure are preserved.
- The dense store, aggregate scene graph, root interaction authority, central
  scheduler, and explicit resource ownership remain singular.
- No per-entity display objects, listeners, tickers, or closures are added to hot
  paths.
- WebGL remains the production baseline. WebGPU remains experimental.
- Approved functional fixtures, normalized observations, review evidence, and
  retained digest-bound performance evidence are immutable.

## Current inventory and initial baseline evidence

- `src` contains 241 TypeScript/JavaScript files and 85,692 lines.
- The largest orchestration files are `engine.ts` (6,569 lines),
  `core.ts` (2,055), `renderers/pixi-renderer.ts` (1,901), and
  `core/instance-presentation-overlay.ts` (1,462). The aggregate leaf
  coordinator is now 384 lines; the image lane is 1,132 lines and the text lane
  is 958 lines. The interaction-overlay authority is 409 lines and the Core
  reconcile publication coordinator is 343 lines. These files remain cohesion
  signals rather than completed size targets.
- The initial top-level import-owner analysis placed the root modules, `engine`,
  `core`, `semantic`, `renderers`, and thirteen adjacent areas in one bidirectional
  dependency group. This is an ownership-cycle signal, not a claim that the
  runtime module graph necessarily has a JavaScript evaluation cycle. An
  independent module-level audit then confirmed two source SCCs that T2 removed:
  `core/contracts.ts -> renderers/pixi-renderer.ts -> presentation-layers.ts ->
  core/semantic-dense-planning.ts -> core/product-probe-reader.ts ->
  core/contracts.ts`, and `mesh/chunk-geometry.ts <-> mesh/viewport-culling.ts`.
- At baseline, `PatchMapEngineSurface` was a roughly 50-capability port hiding
  duplicate lifecycle, load, viewport, selection, asset, probe, and destroy
  boundaries between the product facade, Pixi surface adapter, and core runtime.
- The repository has 203 PatchMap test files: 202 regular files and one
  serialized release-readiness file. It also has project-native contract,
  package, Lab, memory, and performance gates.
- `docs/patch-map` is package-distributed and is checked by the packed-artifact
  verifier. `docs/reference/core-v2-functional-contract/evidence` is imported by
  tests, Lab routes, verification scripts, and performance tooling.

## Current truth

- This refactor runs on `refactor/patch-map-architecture`.
- `package.json` declares `1.0.0-alpha.1`; versioning is outside this structural
  refactor.
- No refactor tranche may rewrite the fixed product and evidence contracts above.

## Documentation foundation

Selected profile: **Router + owners + needed lifecycle records**.

The profile is required because the repository serves package consumers,
contributors, maintainers, contract verifiers, and release reviewers; it also has
both package-distributed and repository-internal documentation with different
lifecycles.

### Target ownership

```text
README.md / README_KR.md
  package entry, install, minimal example, routes only

docs/README.md
  thin repository documentation router
  ├── package consumers -> docs/patch-map/
  ├── maintainers -> docs/maintainers/
  ├── verification inputs -> docs/reference/
  └── active temporary work -> docs/tasks/ and docs/designs/

docs/patch-map/
  package-distributed public product owners

docs/maintainers/architecture.md
  module ownership, dependency direction, data flow, hot-path invariants

docs/maintainers/performance.md
  hot-path ownership to existing project-native commands and evidence rules

CONTRIBUTING.md
  setup, risk-based verification cadence, and contribution lifecycle

docs/reference/patch-map-product-policy.md
  fixed product, architecture, and publication policy

docs/reference/core-v2-functional-contract/
  immutable historical-identity verification contract and evidence input
```

Routers must not restate contracts. Budgets, sample protocols, API details, and
product behavior stay with their existing canonical implementation or document
owner and are linked rather than copied.

### Coverage map

| Reader task or surface | Canonical owner | Implementation or external contract | Targeted verification | Lifecycle |
| --- | --- | --- | --- | --- |
| Install and mount PatchMap | root README | `src/index.ts`, package exports | `verify:package` | current |
| Use API and PATCH MAP data | `docs/patch-map/api-and-dataset.md` | public declarations and parser contracts | unit + packed consumer | current |
| Integrate host ownership | `docs/patch-map/host-integration.md` | root interaction, scheduler, lifecycle authorities | Lab + package + memory | current |
| Migrate an existing host | `docs/patch-map/migration.md` | compatibility boundary | package journeys | current |
| Understand support matrix | `docs/patch-map/compatibility.md` | package manifest and renderer backends | release readiness | current |
| Contribute and select gates | `CONTRIBUTING.md` | package scripts | the selected project-native command | current |
| Understand module boundaries | `docs/maintainers/architecture.md` | `src/patch-map/**` | lint, typecheck, architecture boundary checks | current |
| Select performance checkpoint | `docs/maintainers/performance.md` | performance harnesses and verification scripts | relevant `perf:*` command | current |
| Preserve 38/173 behavior | immutable functional contract corpus | evidence manifests and handlers | `verify:contract` | current verification input |
| Preserve retained performance evidence | digest-bound result paths | release verifier | release readiness | historical evidence |
| Track this refactor | this design until replaced by current owners | working tree and review results | tranche gates | temporary |

### Brownfield migration

| Current set | Action | Gate |
| --- | --- | --- |
| Root README behavioral detail duplicated by public docs | merge into existing public owner, keep README as package entry | package documentation review |
| `docs/patch-map/**` | preserve paths initially; align competing facts only | package manifest + artifact-policy + packed consumer |
| `docs/reference/core-v2-functional-contract/**` | preserve exact verification ownership and historical identity | immutable boundary |
| retained performance evidence under `docs/tasks/2026/07-15/**` | preserve exact digest-bound paths | release verifier |
| product policy | preserve as internal canonical owner | explicit product-policy approval for semantic change |
| completed feature design records | archive or delete candidate after current facts are owned elsewhere | separate destructive approval |

Immutable verification inputs and retained digest-bound evidence remain in
place. Any later authority transfer or broad path migration still requires a
fresh manifest review.

## Target source architecture

The refactor establishes direction before renaming directories. Folder names may
change only when the responsibility boundary is proven by imports and tests.

```text
src/index.ts
    |
    v
product facade and public domains
    |
    v
runtime orchestration
    |-- mount / lifecycle / data replacement
    |-- transaction / publication / frame scheduling
    |-- interaction and resource authorities through explicit ports
    |
    +--> semantic planning --> dense state
    |
    +--> renderer contract <--- aggregate PixiJS adapter
                                  |-- surface lifecycle
                                  |-- mesh lanes
                                  |-- text leaf lane
                                  |-- image/resource leaf lane
                                  `-- interaction/presentation overlays
```

### Dependency rules

1. `src/index.ts` imports the product facade and public contracts only.
2. Public/product code may orchestrate runtime authorities; lower layers never
   import the public facade or root barrels.
3. Semantic and dense layers do not import engine, developer API, interaction,
   or PixiJS adapters.
4. Runtime code depends on renderer contracts, never on renderer implementation
   state outside the composition boundary.
5. PixiJS adapters may consume semantic projection and dense render views but do
   not own semantic mutation, history, or public API policy.
6. Shared modules contain stable primitives only; they are not a dumping ground
   for cross-layer contracts.
7. A file owns one state machine or one cohesive pure transformation. File size
   is a review signal, not a mechanical line limit.
8. Structural extraction and behavior change never share a commit.

## Implementation tranches

### T0. Truth and baseline lock

- Attach the worktree to the dedicated refactor branch.
- Record current public exports, package contents, contract results, and exact
  baseline artifact identity.
- Keep release versioning separate and remove completed-task lifecycle residue.
- Create this plan and obtain independent architecture/docs/performance reviews.

Verification: `git diff --check`, targeted documentation link/path inspection,
and no performance claim.

Current baseline at `3cfbee6` after locked dependency installation:

- typecheck: pass;
- lint: pass;
- unit: 199 files and 1,894 tests pass;
- production build: 211 modules pass;
- Lab build: 1,102 modules pass, with the existing large-chunk warning retained;
- canonical contract: 38 decisions and 173 records pass.

The historical BRIEF's ten render-text failures are not current baseline
failures and must not be carried forward as an assumed exemption.

### T1. Documentation router and architecture boundary

- Add `docs/README.md`, `docs/maintainers/architecture.md`, and
  `docs/maintainers/performance.md` without moving existing owners.
- Document the current pipeline and desired dependency direction.
- Add the smallest project-native import-boundary enforcement that can express
  the proven rules without a new dependency. Prefer existing ESLint configuration;
  add a focused import-graph test for SCC=0 and rules that ESLint cannot express
  reliably.
- Strengthen the current core-contract boundary check so type-only imports of a
  concrete Pixi implementation are also rejected.

Verification: focused architecture checks, lint, typecheck, link targets,
`git diff --check`. No hot-path performance claim.

### T2. Concrete cycle removal and surface capability ports

- Move `PatchMapPixiRendererOptions` and presentation render-update DTOs to
  neutral renderer contracts.
- Move component-target key derivation out of product probe ownership into a
  pure neutral module.
- Move aggregate viewport bounds/cull DTOs to a neutral Mesh contract owner.
- Split `PatchMapEngineSurface` into lifecycle/load, mutation/presentation,
  viewport/input, geometry/query, asset/probe, and diagnostics capability
  contracts. Keep the existing surface object as their composite; do not add a
  second surface implementation.
- First change type boundaries, then move implementations in a separate commit.

Verification: architecture SCC/boundary tests, core-contract tests,
presentation/mesh tests, lifecycle/root-interaction tests, lint, and typecheck.
Renderer flush and mutation behavior remain unchanged, so no performance claim.

Cycle-removal status: complete. Renderer construction options,
keyed-presentation render updates, component target keys, and Mesh viewport DTOs
now have neutral owners. The production static import graph is guarded at zero
strongly connected components. Capability-port splitting is also complete at
the type boundary: the existing surface remains one compatibility composite and
one implementation, while product observation consumes only its narrow ports.
Implementation movement remains part of the later facade/runtime tranches.

Engine dataset replacement movement is complete. The internal
`PatchMapDatasetReplacementCoordinator` owns direct, cooperative async, and
deferred submission freshness, surface acceptance, rollback eligibility,
authoritative scene commit, and submission release balance. It reuses the
existing scene, publication, host interaction, accessibility, editor, and
transformer authorities; `PatchMap` keeps only public delegates and composition
callbacks. Independent review found no parallel writer or contract drift, and
the full unit/build/38-decision/173-record gates passed without a performance
claim because the render and mutation hot paths did not change.

Engine history application movement is complete. The internal
`PatchMapHistoryApplicationCoordinator` owns host companion state, shortcut
routing, undo/redo surface application, clear boundaries, and restored-event
ordering while `PatchMapSemanticHistory` remains the sole stack/cursor owner.
The extraction preserves receiver-bound surface calls, stale reentrancy
recovery, terminal-failure precedence, and replace/destroy clearing order.
Focused history and reentrancy tests, the full unit/build/Lab/contract gates,
and independent review passed without a performance claim because no frame or
mutation algorithm changed.

### T3. Product facade and engine orchestration

- Reduce `engine.ts` by moving behavior into existing authorities and
  coordinators before introducing new ones.
- Keep `PatchMap` and its domain API byte-for-byte compatible at the declaration
  and packed-consumer boundary.
- Make the product facade a composition/orchestration owner rather than a second
  semantic or rendering implementation.

Verification: focused engine/facade/lifecycle tests, lint, typecheck, unit,
build, contract, packed consumer. Run performance only if a measured mutation,
mount, frame, or publication hot path changes.

### T4. Core load, transaction, and publication

- Separate load candidate preparation, atomic commit, dense publication, and
  rollback ownership using existing load/transaction/publication authorities.
- Remove root-barrel and engine back-imports from semantic/dense code.
- Preserve one transaction authority, revision sequence, history boundary, and
  publication order.
- Introduce a stable observer/helper seam before moving private load state that
  current atomicity tests model directly; do not rewrite tests around new private
  field names without first preserving observable behavior.

Verification: targeted parser/load/reconcile/transaction/history tests, full
unit/build/contract at tranche completion, `perf:quick` and the matching mutation
or contract checkpoint when hot paths change.

Core load publication movement is complete. The existing
`PatchMapLoadAuthority` now composes the published-scene swap, live runtime
installation, presentation and renderer publication, image reconciliation,
rollback, disposal, adaptive-budget reset, and final load invalidation in the
same fixed order. `PatchMapRuntime` retains parser/cooperative-load entry points
and its live field references through a constructor-stable port. Focused
atomicity tests, the full unit/build/Lab/contract gates, and independent review
passed. Matching 1,000-entity smoke checkpoints had zero browser or lifecycle
failures before and after; the single-sample run is no basis for an improvement
claim.

### T5. Pixi renderer control plane

- Keep `PatchMapPixiRenderer.flush()` and aggregate layer selection in the
  renderer coordinator.
- Extract canvas publication/context loss, root DOM binding, interaction overlay
  state, checkpoint restore, and teardown composition behind existing or focused
  control-plane owners.
- Keep the existing accessibility authority and keep surface publication,
  renderer loss, presentation overlays, and mesh update planning explicit.
- Do not add per-entity listeners, tickers, closures, or display-object ownership.

Verification: renderer/leaf/asset focused tests, Lab, memory, relevant WebGL
pixel gates, `perf:quick`, and lane-specific performance checkpoints.

Root interaction binding movement is complete. The internal
`PatchMapPixiRootInteractionBindingAuthority` owns deferred activation, the one
fixed stage/canvas listener set, pointer capture, CSS-to-backing coordinate
translation, partial-install rollback, and teardown. The aggregate renderer
retains surface publication order and delegates activation or rollback without
adding entity callbacks. Focused lifecycle tests, full unit/build/Lab/contract,
packed and installed-consumer checks, the 173-route Lab browser pass, the 2+7
memory lifecycle gate, interaction smoke, and independent review passed. This
cold control-plane extraction makes no performance-improvement claim.

First surface publication movement is complete.
`PatchMapPixiSurfacePublicationAuthority` now owns the one-shot successful-render
wrapper, canvas publication, the fixed pair of WebGL2 context listeners, root
activation, optional devtools registration, reverse-order rollback, retry, and
publication teardown. Renderer-loss policy, recovery-frame eligibility,
invalidation, steady `flush()`, and final Pixi/caller-canvas destruction order
remain with the aggregate renderer. Exact-order tests cover root-activation
rollback and retry, and a failing underlying Pixi render proves that no
publication effect occurs before rendering succeeds.

The tranche passed typecheck, targeted lint, 202 regular test files and 1,904
tests plus the serialized release test, production and Lab builds, contract
38/173, all 173 Lab routes and 192 checks, asset readiness including context-loss
publication refusal and cleanup, the 2+7 memory lifecycle and nine ownership
cycles, and an
independent re-audit. Because successful publication restores the original
render identity and the steady `flush()` path is unchanged, this cold
control-plane extraction makes no performance-improvement claim.

Interaction-overlay movement is complete.
`PatchMapPixiInteractionOverlayAuthority` owns the stable selection and
transformer Graphics identities, fixed scene-tail order, selected/visible/
transformable/resizable slot state, normalized policy, transient marquee,
projection-identity paint-bounds cache, repaint state, probes, reset, and
idempotent cleanup. The aggregate renderer retains store replacement,
dirty-range and projection revision orchestration, the stable world matrix and
slot index, and the flush schedule. The authority reads projection context
lazily only when an actual repaint is required, so unchanged frames add neither
a projection allocation nor a second store scan.

The tranche passed typecheck, full lint, 202 regular test files and 1,905 tests
plus the serialized release test, production and Lab builds, contract 38/173,
an installed packed-selection consumer, all 173 Lab routes and 192 checks, the
2+7 memory lifecycle and nine ownership cycles, and independent review. The
production build transformed 220 modules and the Lab build 1,111 modules; the
existing large-chunk warning remains.

Matched quick checkpoints compared `6f88bb2` with `0fe11f8` in both
baseline→candidate and candidate→baseline order. Each run used WebGL2 through
Chromium, DPR 1, 1,280×720, 4× CPU throttling, 100 and 1,000 scales, two warmups,
and seven measured trials. Across the pooled 14 selected-mesh samples, selection
commit/render/total medians were 0.1/1.5/1.8 ms versus 0.1/1.5/1.7 ms at scale
100, and 0.1/3.3/3.6 ms versus 0.1/3.2/3.6 ms at scale 1,000. All four retained
runs had zero console, page, or network errors.

The pooled selected scale-1,000 retained-JS-heap median was unfavorable at
44,559 versus 29,127 bytes, including substantial between-run GC variance. The
matched dedicated memory gate did not reproduce a lifecycle regression:
baseline `6f88bb2` retained 125,323 bytes and candidate `0fe11f8` retained
125,235 bytes while both released DOM, scheduler, and renderer ownership. The
identity-prefixed raw outputs are retained under
`.perf-results/patch-map/interaction-overlay/memory-6f88bb2.txt` and
`.perf-results/patch-map/interaction-overlay/memory-0fe11f8.txt`. A mistakenly
rooted duplicate baseline run carrying a candidate label was interrupted before
artifact publication and is excluded from evidence. These results support a
no-regression decision under the project gates, not a performance-improvement
or native-Windows claim.

### T6. Aggregate text and image leaf lanes

- Keep `AggregateLeafLayer` as the single aggregate coordinator.
- Extract text chunking, deferred materialization, raster resolution, and text
  publication into a text lane.
- Extract image binding generation, stale completion, slot indexing, and release
  queues into an image/resource lane.
- Keep shared projection math pure. The coordinator forwards the same confirmed
  frame revision to both lanes.

Verification: leaf/signature/style, asset and component-asset tests,
`verify:asset-readiness`, `verify:grid-text-quality`,
`verify:instance-presentation`, `verify:memory`, and only the matching packed
asset or production-presentation performance checkpoint.

Text-lane movement is complete. `AggregateLeafLayer` kept the single store scan
and cross-lane order while `AggregateTextLeafLane` took ownership of text
retention, chunk/deferred state, raster resolution, probes, and frame
confirmation; `leaf-projection.ts` owns shared pure projection math. Invalid and
reverse frame tests prove that text probes and both text and asset queues stay
atomic, while normal revisions promote and release each resource once. Focused
leaf, text, asset, component, architecture, and product-integration tests;
typecheck; lint; full unit (202 files and 1,900 tests including the serialized
release test); production and Lab builds; contract 38/173; grid text quality;
asset readiness; memory; and independent review passed.

The matched grid checkpoint compared `8cf6a8d` with `85e839e` at 5,000 and
10,000 entities using WebGL, DPR 1, 800×600, two warmups, and seven measured
trials. Mount, first overlay update, repeated update, repeated-update p95, and
RAF-gap p95 medians were lower at both scales, while long-task count remained
eight. Matching 4×-CPU quick checkpoints also completed with zero browser
errors. These runs support a no-regression decision and an improvement signal;
they do not establish a causal or native-Windows improvement claim. The initial
quick attempt whose concurrent cleanup failed is excluded from evidence rather
than hidden or reclassified.

Image/resource-lane movement is complete. `AggregateImageLeafLane` owns the
three image container identities, Sprite projection and stable ordering,
binding/slot/entity indexes, asset-session generations, stale completion,
retained images, and pending/ready release queues. `AggregateLeafLayer` owns the
only capacity loop, shared paint map and matrix, store epoch, lane combination,
and text-confirm-before-image-release order. Existing white-box tests now inspect
the real image lane state instead of compatibility getters on the coordinator.

The tranche passed typecheck, lint, 202 test files and 1,900 tests, production
and Lab builds, contract 38/173, all 173 Lab routes and 192 checks, asset
readiness, bar/icon presentation, the 2+7 memory lifecycle gate, and independent
review. The matched packed-asset checkpoint compared `85e839e` with `e9f9ec1`
in one alternating Chromium process over four 3,000/10,000-entity workloads,
two warmups, and seven measured trials. It passed with lifecycle and resource
counts unchanged; timing medians stayed within approximately ±5%, and retained
heap medians increased by 0.06–0.16%. The 4× quick checkpoint had zero browser
errors; its unfavorable observations were 100-scale destroy median 31.8 ms
versus 28.7 ms and 1,000-scale retained heap 32,347 versus 28,803 bytes. The
separate lifecycle memory gate retained 126,519 bytes and released DOM,
scheduler, and renderer ownership. This supports a no-regression decision under
the project gates, not a performance-improvement claim.

Further text/image lane subdivision must remove a cohesive state owner or pure
transformation; it must not introduce a second dense-store traversal or split a
lane solely to satisfy a line count.

### T7. Semantic ingestion and reconciliation

- Clarify the single path from PATCH MAP v0.10 input through validation,
  normalization, semantic plan, dense commit, and renderer projection.
- Consolidate only proven duplicate normalization or traversal. Preserve direct
  and incremental paths where they are distinct measured commit paths.
- Keep diagnostics descriptor-safe and caller data detached.

Verification: parser/dataset/layout/reconcile/transaction tests, contract 38/173,
and targeted parsing/update performance only when the hot path changes.

Reconcile publication movement is complete. The hidden
`sceneImageReconcileSuspended` flag was first replaced by an explicit
`ordinary | semantic-reconcile` dense-publication mode. The subsequent
`PatchMapReconcilePublicationCoordinator` extraction moved candidate refusal,
the one dense commit, ordered projection/image/presentation/hit publication,
and post-commit terminal sealing out of `PatchMapRuntime`. Direct bar, text,
angle, structural, incremental, and full candidate planners remain distinct and
unchanged. Load-replaceable spatial-hit state is read through a fresh port, and
instance-presentation state still has one canonical Runtime write.

The tranche passed typecheck, full lint, 202 regular test files and 1,907 tests,
the serialized release test, production and Lab builds, contract 38/173, exact-
commit packed packages with all 38 consumer journeys, all 173 Lab routes and
192 checks, the memory ownership gate, the acyclic import graph, and independent
review. Focused tests now prove that reconcile uses the spatial-hit authority
installed by the latest load and that a fill-only post-dense renderer failure
publishes the candidate authority before sealing terminal state exactly once.

Matched contract checkpoints compared `73ab1e3` with `d44e129` using Chromium
143 WebGL2, 4× CPU throttling, the 100/500/1,000/2,000/5,000 and production-
shaped workloads, two warmups, and seven measured trials. Both exact-commit,
package-bound reports completed with zero browser or lifecycle failures. The
200-target bar action p95 was 31.9 versus 32.7 ms, the 666-target text p95 was
173.6 versus 171.1 ms, and bulk action p95 was 895.4 versus 898.1 ms; the bulk
complexity exponent was 1.0199 versus 1.0118. Bulk medians at 500 and 5,000
targets were 334.8/881.8 versus 337.9/882.6 ms. These mixed small movements
support no regression under the project contract, not an improvement claim.

The dedicated memory gate passed 2+7 lifecycle and nine ownership cycles in
both orders with all DOM, scheduler, and renderer resources released. Its
unfavorable retained-heap observations were baseline 119,787/119,327 bytes and
candidate 124,431/122,631 bytes, so they remain explicit instead of being used
as improvement evidence. Identity-bound raw reports and memory outputs are
retained under `.perf-results/patch-map/reconcile-publication/`. An initial
baseline report attempt rejected stale protected package evidence and is
excluded; the retained rerun used newly generated exact-commit package evidence.
Chromium remains a development proxy, not native-Windows evidence.

### T8. Public documentation alignment and migration

- Align root README routes and remove duplicated current facts.
- Update public docs only for approved/current behavior and final module
  ownership; do not expose internal APIs.
- Produce the final per-path migration manifest and obtain destructive approval.
- Apply approved archive/delete/move actions, update literal inbound paths, and
  verify package inclusion.
- Extend the packed-artifact policy so every public document routed by
  `docs/patch-map/README.md`, including font provenance and the bundled license,
  is explicitly required.
- Resolve whether Korean documentation is intentionally root-quickstart-only or
  whether public product owners require Korean peers; do not create a partial
  second taxonomy by accident.

Verification: package artifact policy, packed consumer, local links,
`git diff --check`, lint/typecheck only when code/config paths change.

### T9. Completion gates

- Full unit, lint, typecheck, production build, Lab build, canonical contract,
  packed consumer, headless Lab, and memory gates.
- Run only the performance matrix owned by hot paths changed across T3-T7.
- Treat `verify:release-readiness` as a release-qualification gate only when its
  retained artifact commit identities and external-cell requirements match the
  candidate. It is not an ordinary local refactor gate.
- Preserve and report unfavorable results. Chromium remains a proxy; native
  Windows and qualified WebGPU stay pending until measured there.
- Run final independent architecture, documentation, and regression reviews.
- Finish with intent-scoped commits and a clean worktree.

## Performance evidence contract

Mode: **no-regression change**.

- Baseline and candidate must identify exact code or packed-artifact identity.
- Comparable runs use the same workload, browser/backend, cache/session state,
  viewport, CPU throttle, warmups, measured samples, and concurrency.
- Existing canonical matrices use two warmups and seven measured samples;
  targeted owners keep their own checked protocols and budgets.
- A structural change that does not touch a hot path makes no new performance
  claim and skips expensive matrices.
- A faster candidate is rejected if correctness, visual output, public API,
  lifecycle, security, or resource ownership changes.
- Unfavorable frame gaps and long tasks remain in the report.

## Independent review checkpoints

1. Before implementation: separate architecture, documentation, and
   performance/test audits.
2. After T1: independent dependency-rule and documentation-owner review.
3. After each of T2-T7: one cold review of the tranche diff and invariants before
   proceeding.
4. Before destructive documentation migration: independent route and owner audit.
5. At completion: independent full-diff architecture, API, lifecycle, and
   performance-evidence review.

## Commit and rollback strategy

- One intent per commit: foundation, facade extraction, runtime extraction,
  renderer extraction, semantic extraction, documentation alignment.
- Never combine mechanical move with behavior change.
- Keep each tranche independently testable and revertible.
- Stage only intentional files and do not change immutable evidence.
- Do not push, publish, merge, or change version without explicit lifecycle
  authority.

## Success criteria

- Public package API and PATCH MAP v0.10 behavior remain compatible.
- The dependency graph follows documented direction and lower layers no longer
  import the product facade/root barrels.
- `engine.ts`, `core.ts`, `pixi-renderer.ts`, and `leaf-layer.ts` are reduced to
  cohesive coordinators or owners; no large file is split mechanically.
- Every current documented contract has one reachable canonical owner.
- Public/package-distributed docs and internal verification/history records are
  visibly separated.
- All required functional, package, Lab, memory, and relevant performance gates
  pass with adverse results honestly retained.
- Final worktree is clean with intent-scoped commits.

## NOT in scope

- New public APIs or behavior changes unrelated to refactoring.
- Restoring legacy root, Core v1, versioned package subpaths, or versioned Lab
  routes.
- Rewriting immutable contract fixtures or digest-bound evidence.
- Claiming native Windows or qualified WebGPU performance from Chromium proxy
  measurements.
- Creating a new generic benchmark framework or replacing the existing project-
  native verification owners.
