# PatchMap architecture

This document owns maintainer-facing module boundaries and dependency direction.
The [product policy](../reference/patch-map-product-policy.md) owns the public and
runtime invariants; public API behavior remains in
[`docs/patch-map/`](../patch-map/README.md).

## Runtime flow

```text
package entry
  -> PatchMap facade and public domains
  -> engine orchestration
  -> load / mutation / publication authorities
  -> semantic planning and dense state
  -> renderer contracts
  -> aggregate PixiJS adapter and central frame scheduler
```

Input validation and planning finish before an atomic state commit. A committed
revision is projected into dense renderer views, then published by the single
frame authority. Interaction, assets, history, accessibility, and diagnostics
join this flow through explicit capability contracts; they do not bypass the
transaction or publication owners.

## Ownership boundaries

| Boundary | Owns | Must not own |
| --- | --- | --- |
| package entry and facade | public construction, domains, orchestration | dense storage or Pixi implementation state |
| engine/runtime | authority composition, lifecycle, atomic publication | duplicated semantic planners or renderer internals |
| dataset replacement coordinator | sync, async, and submitted-load freshness; surface acceptance; authoritative replacement commit | semantic storage, surface implementation, or a second publication revision |
| history application coordinator | host companion state; undo/redo surface application; history publication ordering | history stack/cursor storage, semantic storage, or renderer state |
| Core load authority | cooperative load freshness; reversible scene/runtime/renderer/image publication and rollback order | Engine lifecycle, parser policy, or a second scene/runtime state |
| semantic and dense core | interpretation, planning, identity, compact state | public facade policy, input events, or PixiJS objects |
| renderer contracts | neutral render views, updates, lifecycle capabilities | concrete PixiJS state |
| PixiJS adapter | aggregate GPU resources, frame execution, surface lifecycle | semantic mutation, history, or public API policy |
| Pixi root interaction binding authority | the fixed stage/canvas listener set, pointer capture, coordinate translation, activation rollback, and listener cleanup | gesture policy, selection, viewport mutation, or per-entity callbacks |
| interaction and resources | their singular state machines and cleanup | independent tickers, per-entity listeners, or hidden publication paths |

## Dependency rules

1. `src/index.ts` imports only public contracts and the product facade.
2. Lower layers never import the package entry, public facade, or root barrels.
3. Semantic and dense modules do not import engine, interaction, developer API,
   or concrete renderer implementations.
4. Runtime orchestration depends on renderer contracts. Concrete PixiJS state
   is reachable only at the composition boundary.
5. PixiJS modules may consume semantic projection and dense render views but do
   not own semantic mutation, history, or public policy.
6. Shared modules contain stable primitives or neutral DTOs, not mixed-layer
   convenience contracts.
7. One file owns one cohesive state machine or pure transformation. File size
   is a review signal; extraction must follow responsibility, not a line quota.
8. Structural movement and behavior changes are reviewed and committed
   separately.

## Enforced boundaries and next debt

`tests/patch-map/architecture-import-graph.test.ts` keeps the production
TypeScript import graph acyclic. Renderer options, keyed-presentation render
updates, component target keys, and Mesh viewport DTOs have neutral contract
owners instead of being owned by concrete adapters or product-probe readers.

`PatchMapEngineSurface` is now a compatibility composite over lifecycle,
mutation/presentation, viewport/input, geometry/query, product observation, and
diagnostic capability ports. `PixiEngineSurface` remains the single
implementation and runtime authority. New consumers depend on the narrow port
they use; existing injected surfaces may continue implementing the composite.

`PatchMapDatasetReplacementCoordinator` owns Engine-level replacement
freshness across direct, cooperative async, and deferred submissions. It plans
through `PatchMapSceneStateAuthority`, advances revisions through
`PatchMapPublicationAuthority`, and asks the existing surface to accept a
candidate before committing authoritative Engine state. `engine.ts` remains the
composition boundary and public delegate; it does not keep a parallel load
sequence or replacement commit path.

`PatchMapHistoryApplicationCoordinator` bridges the pure
`PatchMapSemanticHistory` stack to the aggregate surface and Engine authorities.
It owns the detached host companion and the exact reconcile, scene commit,
revision, and event sequence for undo and redo. The semantic history remains the
only stack/cursor owner; the coordinator does not retain a second dataset or
renderer state.

`PatchMapLoadAuthority` owns the complete Core load publication transaction:
private candidate preparation, published-scene swap, runtime installation,
renderer and image side effects, rollback, disposal, and final frame
invalidation. `PatchMapRuntime` still owns its live field references and parser
entry points, but delegates the atomic publication order through a constructor-
stable port instead of implementing a second load commit path.

`PatchMapPixiRootInteractionBindingAuthority` owns the Pixi stage and canvas DOM
binding lifecycle behind the aggregate renderer. It installs five federated
pointer listeners and three root canvas listeners only after surface publication,
rolls back partial installation, releases pointer capture during deactivation,
and reports zero per-entity callbacks. Gesture, selection, and viewport policy
remain with the Core root interaction authority.

## Verification

Use the risk-based gates in [CONTRIBUTING.md](../../CONTRIBUTING.md). Boundary
changes require focused architecture tests plus lint and typecheck. A completed
runtime tranche additionally runs unit, build, Lab build, and the canonical
contract gate. Packaging, browser, memory, and performance gates are selected
only when their ownership or hot path changed.
