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

## Current evidence

- `src/patch-map` contains 226 TypeScript/JavaScript files and approximately
  84,000 lines.
- The largest orchestration files are `engine.ts` (7,071 lines),
  `renderers/pixi-renderer.ts` (2,498), `core.ts` (2,394), and
  `renderers/leaf-layer.ts` (2,185).
- A top-level import-owner analysis places the root modules, `engine`, `core`,
  `semantic`, `renderers`, and thirteen adjacent areas in one bidirectional
  dependency group. This is an ownership-cycle signal, not a claim that the
  runtime module graph necessarily has a JavaScript evaluation cycle. An
  independent module-level audit then confirmed two concrete source SCCs:
  `core/contracts.ts -> renderers/pixi-renderer.ts -> presentation-layers.ts ->
  core/semantic-dense-planning.ts -> core/product-probe-reader.ts ->
  core/contracts.ts`, and `mesh/chunk-geometry.ts <-> mesh/viewport-culling.ts`.
- `PatchMapEngineSurface` is a roughly 50-capability port. It hides duplicate
  lifecycle, load, viewport, selection, asset, probe, and destroy boundaries
  between the product facade, Pixi surface adapter, and core runtime.
- The repository has 199 PatchMap test files and project-native unit, contract,
  package, Lab, memory, and performance gates.
- `docs/patch-map` is package-distributed and is checked by the packed-artifact
  verifier. `docs/reference/core-v2-functional-contract/evidence` is imported by
  tests, Lab routes, verification scripts, and performance tooling.

## Current truth

- This refactor runs on `refactor/patch-map-architecture` without
  branch-specific agent instructions or completed task records.
- `package.json` declares `1.0.0-alpha.1`, while both root READMEs still mention
  `0.10.0`. That documentation drift is resolved through the release/document
  alignment work; this structural refactor does not infer a new package version.
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
| Understand module boundaries | `docs/maintainers/architecture.md` | `src/patch-map/**` | lint, typecheck, architecture boundary checks | coverage gap until created |
| Select performance checkpoint | `docs/maintainers/performance.md` | performance harnesses and verification scripts | relevant `perf:*` command | coverage gap until created |
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

The user approved removal of merge-era agent instructions and completed task or
design records. Immutable verification inputs and retained digest-bound evidence
remain in place. Any later authority transfer or broad path migration still
requires a fresh manifest review.

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

### T7. Semantic ingestion and reconciliation

- Clarify the single path from PATCH MAP v0.10 input through validation,
  normalization, semantic plan, dense commit, and renderer projection.
- Consolidate only proven duplicate normalization or traversal. Preserve direct
  and incremental paths where they are distinct measured commit paths.
- Keep diagnostics descriptor-safe and caller data detached.

Verification: parser/dataset/layout/reconcile/transaction tests, contract 38/173,
and targeted parsing/update performance only when the hot path changes.

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
