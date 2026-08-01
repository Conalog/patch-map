# PatchMap structural refactor plan

## Intent and invariants

Make the product's primary flow readable without creating parallel writers or
moving hot state across artificial layers.

The following remain invariant:

- root package and primary class: `@conalog/patch-map` / `PatchMap`
- PATCH MAP v0.10 direct input, immutable caller data, stable IDs and component
  identity, deterministic interpretation, and atomic failure
- aggregate PixiJS rendering, one root interaction authority, one managed
  frame loop, and explicit asset/Application cleanup
- WebGL production semantics and all approved 173-case actual observations
- immutable expected fixtures, reviews, and digest-bound historical evidence

## Current primary flow

```text
public index
  -> PatchMap
     -> initialize surface/assets/root inputs
     -> materialize dataset
        -> PatchMapRuntime
           -> parser -> dense scene -> projection
           -> aggregate Pixi renderer
     -> semantic transaction -> atomic reconcile
     -> central frame loop -> publish -> flush
     -> destroy inputs/frame/assets/surface
```

## Target ownership tree

```text
src/patch-map/
├── index.ts                         # public export manifest
├── engine.ts                        # PatchMap facade and atomic coordinator
├── engine/
│   ├── public-contracts.ts          # compatibility contract barrel
│   ├── contracts/                   # lifecycle/viewport/mutation/etc. contracts
│   ├── surface-contract.ts          # facade <-> surface port
│   ├── pixi-surface.ts              # PatchMapRuntime surface adapter/factory
│   ├── surface-geometry.ts          # geometry snapshots/relation hit index
│   ├── semantic-index.ts            # component/text index atoms
│   ├── asset-session-authority.ts    # session/required lease lifetime
│   ├── managed-frame-loop-authority.ts # one loop/visibility pause reason
│   ├── viewport-authority.ts        # view/policy/motion/persistence writer
│   ├── transformer-edit-authority.ts
│   ├── publication-authority.ts     # revisions/frame/visible ledgers
│   └── scene-state-authority.ts     # dataset/index/selection single writer
├── core.ts                          # Core facade and atomic coordinator
├── core/
│   ├── published-scene-state.ts     # one published semantic/dense reference
│   ├── spatial-hit-authority.ts     # exact/animated spatial index lifetime
│   ├── product-probe-reader.ts      # read-only semantic/renderer correlation
│   ├── root-interaction-authority.ts # one root binding and gesture state
│   ├── bar-presentation-authority.ts
│   └── load-authority.ts            # private candidate + rollback checkpoint
├── parser.ts                        # v0.10 lowering facade
├── parser/
│   ├── color.ts
│   ├── image-source.ts
│   └── lowering/                    # element/grid/component/relation lowering
├── shared/
│   ├── stable-hash.ts               # exact stable hash primitive
│   └── json-values.ts               # proven JSON predicates/equality only
├── dense/                           # dense store and atomic transaction
├── semantic/
│   ├── transaction.ts               # transaction facade
│   ├── transaction/                 # contracts/diagnostics/JSON/staging
│   ├── dataset.ts                   # dataset facade
│   ├── dataset/
│   │   ├── contracts.ts             # import-free dataset contracts/errors
│   │   ├── value-normalization.ts   # exact values/JSON detachment
│   │   └── semantic-hash.ts
│   └── ...                          # normalized domain decisions
└── renderers/
    ├── pixi-renderer.ts             # Application and aggregate coordinator
    ├── leaf-layer.ts                # leaf facade/resource coordinator
    ├── particle-layer.ts            # particle/graphics coordinator
    ├── mesh-layer.ts                # retained mesh owner
    ├── mesh/
    │   ├── chunk-geometry.ts        # CPU geometry planning
    │   ├── chunk-store.ts           # retained buffers/bounds/uploads
    │   └── chunk-planner.ts         # deterministic topology/chunk planning
    └── relation-endpoint-geometry.ts

lab/patch-map/
├── contract/
│   ├── main.ts                      # mount/composition
│   ├── executable-runtime.ts        # compatibility facade
│   └── executable-runtime/
│       ├── registry.ts              # ordered shard composition
│       ├── descriptors/             # capability-family declarations
│       ├── script-modules.ts        # sole handler/fold ESM boundary
│       └── case-routing.ts
└── interactive/
    ├── manual-workbench.ts          # session/action controller
    └── manual-workbench-view.ts     # pure markup/panels

tests/patch-map/support/
├── contract-runtime-harness.ts      # loader/clock/catalog atoms
└── surface-stub.ts                  # minimum capability-specific surface
```

Compatibility facades remain only where current internal tests or consumers
import a path directly. The package still publishes only `"."`.

## File inventory disposition

The current allowed corpus contains 647 files / 486,968 LOC: 203 product, 69
Lab, 203 tests, 137 active verification scripts, 23 performance files, five
examples, and seven root configuration files. Performance result JSON accounts
for 224,708 LOC and is evidence rather than refactorable code. Every file is
covered by the following rule; explicit exceptions override the directory
default.

| Area | Default | Explicit split/consolidation candidates |
| --- | --- | --- |
| `src/patch-map` | 203 reviewed files keep | the `pixi-renderer` type cycle is removed; keep large atomic writers and GPU resource owners intact |
| `lab/patch-map` | 65 reviewed files keep | presentation, CSS, pointer, and executable live-session boundaries are split; retain the remaining orchestration facades |
| `tests/patch-map` | 203 reviewed files keep with assertions and case identities | mixed Lab/foundation suites are split; the cohesive transaction assertion suite retains its lifecycle owner above a surface harness |
| `scripts/verification` | 137 reviewed files keep | all eight mixed action/fold/browser/package roots now compose focused owned modules without sharing actual/fold case registries |
| `performance/patch-map` | 19 files keep plus immutable results | split/consolidate four workload/harness runners only after exact equivalence proof |
| `examples` and root config | keep minimal examples and public manifests | correct lint/build coverage and remove only proven stale configuration |
| contract fixtures/evidence/results | frozen | no semantic edits, regeneration, rename, or deletion |

No whole production, test, verification, performance, example, or root file
is currently proven obsolete. Deletion requires a concrete unreferenced proof;
otherwise the disposition is keep, move, split, or consolidate. The product
runtime and all-import TypeScript graphs have no SCC.
Equivalence must be proven before consolidating repeated verification atoms.

## Migration tranches

### T0 — restore green and close active ownership gaps

- Finish published scene/spatial hit/viewport/transaction/Lab runtime
  extractions.
- Remove the transaction helper cycle through a downward contracts module.
- Repair atomic load rollback for every published side authority.
- Keep each commit buildable and preserve current facades.

Gate: focused tests, scoped lint, source/full typecheck. At tranche completion,
full unit/lint/typecheck/build/contract; headless and memory only because load,
renderer, or destroy ownership changed.

### T1 — contracts and exact shared atoms

- Split large public contract barrels by product domain behind compatibility
  exports.
- Consolidate only proven stable-hash, JSON, relation endpoint, spatial-grid,
  and reconcile-result atoms.
- Remove local cycles; never create a generic utility dump.

### T2 — Core and Engine state authorities

- Extract root interaction, transformer session, frame publication, and bar
  presentation writers while Core/Engine retain atomic orchestration.
- Do not move transaction application, scheduler ownership, or callbacks into
  a second writer.

### T3 — parser, dataset, transaction, reconcile, and text substrate

- Split lowering/normalization/hash/staging/text-layout by data ownership.
- Preserve exact diagnostic order, semantic hash, immutable objects, and flat
  fast paths.

### T4 — renderer, image, asset, and lifecycle ownership

- Split Pixi Application/root interaction/loss/accessibility coordination from
  aggregate layer planning.
- Separate leaf binding/text/image probes and retained mesh/particle resource
  owners without adding per-entity Pixi objects.
- Treat fallback `Text` fidelity as a separate product fix: the current route
  accepts advanced v0.10 style intent but omits several Pixi-owned raster
  fields and tints the whole fallback texture. Map semantic-owned versus
  Pixi-owned fields explicitly and measure re-raster/upload cost before any
  observable change; never alter immutable expected evidence to hide it.

Gate: renderer tests, headless browser, 2+7 memory, and paired
5,000/10,000/actual-production WebGL performance.

### T5 — authoring, editor, history, host, accessibility, and operations

- Extract state authorities only where there is one writer and a private
  prepare/commit boundary.
- Share exact command/result atoms without hiding case-specific semantics.

### T6 — Lab runtime and UI composition

- Shard the declarative registry, split executable bridge/session lifecycle,
  manual workbench controller/view, contract composition, and CSS layers.
- Keep all 173 cases manually operable and expected-blind.

Completed with separate presentation, CSS, pointer, trusted-input session, and
cleanup owners below the unchanged manual and executable orchestration facades.

### T7 — test composition

- Split test files above 1,000 LOC by semantic describe block.
- Share loaders, clocks, surface stubs, and dataset builders only; keep
  assertions and case IDs local and visible.

Completed with comparable/runtime blocks, fake executor ownership, and the
transaction surface extracted while assertions remain in semantic suites.

### T8 — verification runtime

- Split large action handlers, folds, browser runners, worker I/O, package
  verification, and release orchestration.
- Maintain independent actual generation/comparison and immutable expected
  firewalls.
- Completed the update/pointer action-handler and update/pointer/layout-fold
  boundaries behind a recursive owned-module firewall; browser and package
  orchestration now retain only process, I/O, browser, comparison, and cleanup
  composition above focused owned modules.

### T9 — performance tooling, examples, root config, and durable docs

- Separate workload construction, harness lifecycle, and report assembly.
- Keep examples minimal, make lint/build coverage complete, and record the
  final per-area disposition.

### T10 — release checkpoint

- Run full contract/release gates, packed consumer, headless 173 routes,
  actual-production/10,000, 2+7 memory, and hot-path performance checkpoints.
- Complete independent review, intent commits, and a clean worktree.

## Measurement and rollback

Before T3/T4, capture a fresh baseline without overwriting immutable evidence:

- 5,000 bars: existing 2+7, 1×/4× repeated retarget and animation+pan
- 10,000 bars: paired load, animate-all+pan, settle, and cleanup
- actual production: parse/load/first publish/image settle/fit/pan/destroy,
  plus 309 rounded bars where the fixture permits animation

Add diagnostic stage timing only behind existing probes. Do not make
observation allocation part of the normal hot path.

Immediate rollback conditions:

- semantic hash, visual/paint-order, identity, immutability, pointer, history,
  lifecycle, package, or cleanup regression
- a new per-entity DisplayObject/listener/ticker/closure
- a second scheduler, publication writer, or asset owner
- the performance thresholds listed for T3/T4

## Review cadence

Use one independent review after each complete tranche. Give reviewers narrow
scope: API/contract, lifecycle/resource ownership, or hot-path allocation.
Validate every finding against the diff and targeted tests; apply only findings
with concrete evidence. Re-run expensive gates only if the fix changes the
path that justified them.
