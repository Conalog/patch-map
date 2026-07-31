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
├── engine.ts                        # compatibility re-export facade
├── engine/
│   ├── contracts.ts                 # public PatchMap I/O/result contracts
│   ├── surface-contract.ts          # facade <-> surface port
│   ├── patch-map.ts                 # product primary flow and authorities
│   ├── pixi-surface.ts              # PatchMapRuntime surface adapter/factory
│   ├── surface-geometry.ts          # geometry snapshots/relation hit index
│   └── semantic-index.ts            # component/text index atoms
├── shared/
│   ├── stable-hash.ts               # exact stable hash primitive
│   └── json-values.ts               # proven JSON predicates/equality only
├── core.ts                          # central runtime owner; retain initially
├── parser.ts                        # v0.10 lowering pipeline; retain initially
├── dense/                           # dense store and atomic transaction
├── semantic/                        # normalized domain decisions
└── renderers/
    ├── pixi-renderer.ts             # Application and aggregate coordinator
    ├── mesh-layer.ts                # compatibility facade
    ├── mesh/
    │   ├── geometry.ts              # CPU geometry planning
    │   ├── chunk-store.ts           # retained buffers/bounds/uploads
    │   └── layer.ts                 # stateful lane owner
    ├── relation-endpoint-geometry.ts
    ├── particle-layer.ts
    └── leaf-layer.ts

lab/patch-map/
├── contract/
│   ├── main.ts                      # mount/composition
│   ├── runtime-values.ts            # exact browser-safe value helpers
│   └── runtime-journal.ts           # shared bounded journal
└── interactive/
    ├── manual-workbench.ts           # session/actions/composition
    └── manual-workbench-view.ts      # pure markup/panels

tests/patch-map/support/
├── contract-runtime-harness.ts      # loader/clock/catalog atoms
└── surface-stub.ts                  # minimum capability-specific surface
```

Compatibility facades remain only where current internal tests or consumers
import a path directly. The package still publishes only `"."`.

## Migration tranches

### T1 — exact utilities and contract direction

- Share the identical stable-hash implementation and spatial-grid atoms.
- Share relation endpoint geometry used by mesh and particle strategies.
- Move surface geometry types below the facade to eliminate the type-only
  `engine -> core -> renderer -> accessibility -> engine` cycle.
- Point Lab code at the root public entry where it uses only public symbols.

Gate: affected unit tests, scoped lint, typecheck. No browser/package/memory or
performance run unless a runtime owner changes.

### T2 — engine surface and geometry extraction

- Move `PixiEngineSurface` and its factory behind `engine/pixi-surface.ts`.
- Move pure geometry snapshot, screen projection, and relation hit-index atoms
  to `engine/surface-geometry.ts`.
- Move component/text indexing atoms to `engine/semantic-index.ts`.
- Keep `PatchMap` as the single lifecycle, publication, transaction, viewport,
  history, and interaction coordinator.

Gate: engine/core/geometry tests, full product unit/lint/typecheck/build and
canonical contract. Because surface/destroy ownership moves, also run
headless Lab, actual-production, packed consumer, and 2+7 memory.

### T3 — mesh planning and retained storage

- Separate pure geometry planning from Pixi resource ownership.
- First move code without algorithm changes.
- Then remove per-primitive temporary arrays/closures and retain rounded-bar
  topology so height changes update positions instead of rebuilding chunks.
- Preserve precise paint order and relation endpoint semantics.

Gate: renderer tests and build first. Then paired 5,000/10,000/actual-production
WebGL measurements, browser, contract, and memory. Roll back any change that
increases draw calls/render objects by 10%, uploaded bytes by 5%, or action,
frame, rAF p95, or retained heap by 10%.

### T4 — presentation/reconcile work buffer

- Replace internal per-entity frozen update objects with a reusable typed
  work buffer owned by presentation.
- Materialize public immutable probes only at observation boundaries.
- Batch slot/generation validation and projection application.
- Skip leaf/overlay/cull work only when revision and dirty-domain proofs allow.

Gate: atomic transaction/presentation/hit-test tests plus the same paired
performance matrix. Keep the change only if the target stage improves by at
least 15% without any contract regression.

### T5 — Lab and test composition

- Extract pure Lab view markup from session ownership.
- Consolidate exact `deepFreeze` and journal clones only.
- Add narrow contract runtime test atoms; keep browser-isolated handlers/folds
  standalone and keep unsupported-capability fakes minimal.

Gate: Lab/catalog/executor targeted tests, full unit/lint/typecheck, Lab build,
canonical verifier, and 173-route headless browser. Package/memory/performance
only if product or ownership code changes in the same checkpoint.

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
