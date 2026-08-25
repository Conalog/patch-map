# Runtime architecture

PatchMap separates product policy, semantic state, and concrete rendering. A
change should flow through an existing owner instead of creating a parallel
publication or cleanup path.

## Runtime flow

```text
src/index.ts
  -> PatchMap Engine composition and public delegates
  -> Engine authorities and coordinators
  -> Core semantic runtime
  -> dense state and neutral renderer ports
  -> aggregate PixiJS renderer
  -> canvas, browser input, and GPU resources
```

Validation and planning happen before authoritative state changes. Accepted
state is committed once, projected to renderer inputs, and published by the
frame owner. Events and diagnostics describe that same accepted publication.

## Ownership map

| Owner | Owns | Does not own |
| --- | --- | --- |
| `src/index.ts` and developer API | package surface, public domains, construction entry | runtime state or PixiJS objects |
| `engine.ts` | dependency composition and public delegation | duplicate lifecycle, transaction, capture, or pointer state machines |
| Engine lifecycle and scene authorities | surface generation, lifecycle, accepted scene, publication revision | renderer internals or semantic planning |
| Engine coordinators | replacement, mutation, history, selection, pointer, viewport, transformer, asset, and capture ordering | a second canonical scene, revision clock, or renderer |
| Core load and reconcile authorities | candidate parsing, dense construction, semantic publication, exact rollback | public facade policy, DOM input, or frame scheduling |
| Core instance-presentation coordinator | instance presentation maps, full and height-only updates, reconcile replay, and projection-to-frame ordering | public Engine policy or a second semantic scene |
| Semantic and dense layers | normalization, identity, geometry, planning, compact state, transactions | Engine lifecycle or concrete GPU state |
| Neutral renderer ports | capabilities and immutable transfer values | concrete adapter ownership |
| PixiJS CPU publication authority | projection revision, presentation inputs, dirty ranges, flush transition, and exact publication checkpoint | GPU objects, scene submission, or renderer-loss policy |
| Aggregate PixiJS renderer | GPU resources, scene synchronization, surface rendering, aggregate interaction paint, and renderer-loss state | product mutation, history, or public API decisions |
| Surface publication authority | canvas publication, context listeners, root binding activation, rollback and teardown | renderer-loss policy or frame eligibility |
| Root interaction binding authority | fixed stage/canvas bindings, pointer capture, coordinate translation, cleanup | gesture and selection policy |
| Interaction overlay authority | stable overlay objects, paint bounds cache, dirty repaint, teardown | canonical selection or transformer sessions |
| Text and image leaf lanes | lane resources, projection, settlement, release after confirmed frames | a second store traversal or frame scheduler |
| Scheduler and frame authorities | invalidation, frame eligibility, budget, publication confirmation | semantic mutation or per-feature tickers |

## Dependency rules

1. `src/index.ts` is the public entry. Lower layers never import it.
2. Engine and Core support modules depend on neutral ports, not the concrete
   PixiJS adapter.
3. Semantic and dense modules do not import Engine, developer API, DOM, or
   concrete renderer modules.
4. Renderer modules consume committed projections; they do not decide product
   mutation, history, selection, or error policy.
5. A revision, lifecycle, queue, listener set, timer, retained resource, and
   cleanup sequence each have one owner.
6. Candidate work may be discarded before commit. After commit, failure handling
   must preserve the declared publication meaning rather than fabricate rollback.
7. Async work carries freshness and destroy checks across every settlement
   boundary.
8. The production import graph remains acyclic. Enforce this with
   `architecture-import-graph.test.ts`.

## Resource and performance invariants

- One managed frame schedule; no feature-specific RAF or ticker.
- Aggregate rendering does not add per-entity listeners or callbacks.
- Dense traversal is shared; lanes must not rescan the full store independently.
- Pending work is acquired and released on success, failure, supersession, and
  destroy.
- Listener and resource activation is reversible until publication succeeds;
  teardown is idempotent.
- Capture uses the authoritative canvas and published tuple, and defers resize
  through its owning coordinator while readback is active.
