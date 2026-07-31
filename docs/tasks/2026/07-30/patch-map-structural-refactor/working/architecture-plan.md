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

The allowed corpus currently contains 420 files: 84 product, 48 Lab, 156
tests, 104 active scripts, 23 performance files, and five examples. Every file
is covered by the following rule; explicit exceptions override the directory
default.

| Area | Default | Explicit split/consolidation candidates |
| --- | --- | --- |
| `src/patch-map` | keep cohesive files in place | every file above 1,000 LOC plus mixed-owner renderer, authoring, history, asset, host, operation, accessibility, and query files |
| `lab/patch-map` | keep focused case/runtime files | `manual-workbench.ts`, `contract/main.ts`, `style.css`, executable registry/bridge, and repeated actual-only session adapters |
| `tests/patch-map` | keep all assertions and case identities | split files above 1,000 LOC by describe/domain; share setup only through narrow support modules |
| `scripts/verification` | keep small orchestrators and negative probes | split large handler/fold/browser/package files; consolidate actual-only actions, browser process I/O, and package process helpers |
| `performance/patch-map` | keep workload/protocol/result identities | split workload construction, browser harness, and report assembly; share runner/stat/result I/O |
| `examples` and root config | keep minimal examples and public manifests | correct lint/build coverage and remove only proven stale configuration |
| contract fixtures/evidence/results | frozen | no semantic edits, regeneration, rename, or deletion |

No whole production, test, verification, performance, example, or root file
is currently proven obsolete. Deletion requires a concrete unreferenced proof;
otherwise the disposition is keep, move, split, or consolidate. Exact clone
analysis found 379 groups / 4.4%; equivalence must be proven before merging.

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

### T7 — test composition

- Split test files above 1,000 LOC by semantic describe block.
- Share loaders, clocks, surface stubs, and dataset builders only; keep
  assertions and case IDs local and visible.

### T8 — verification runtime

- Split large action handlers, folds, browser runners, worker I/O, package
  verification, and release orchestration.
- Maintain independent actual generation/comparison and immutable expected
  firewalls.

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
