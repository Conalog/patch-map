# Runtime architecture

PatchMap separates product policy, semantic state, and concrete rendering. A
change should flow through an existing owner instead of creating a parallel
publication or cleanup path.

Runtime and test paths below are relative to `packages/javascript/`. The
repository roots table uses paths relative to the workspace root.

## Runtime flow

```text
src/index.ts or src/image.ts
  -> composition/ (mount, public facade, Pixi runtime and surface assembly)
  -> public/ (application contracts and stateless facade factories)
  -> Engine authorities and coordinators
  -> Core semantic runtime
  -> dense state, geometry utilities, and rendering-port/ contracts
  -> aggregate PixiJS renderer
  -> canvas, browser input, and GPU resources
```

Validation and planning happen before authoritative state changes. Accepted
state is committed once, projected to renderer inputs, and published by the
frame owner. Events and diagnostics describe that same accepted publication.

Mount and image composition share `composition/session-initialization.ts` for
asset registration, required font admission, initial dataset settlement and
viewport precedence. Each entry retains its validation, interaction, frame and
failure-cleanup policy.

Image raster selection goes through the existing surface publication authority.

## Repository roots

| Root | Single owner |
| --- | --- |
| `.github/` | pull-request, release, dependency, and workflow policy automation |
| `packages/javascript/` | JavaScript runtime, editable public docs, release history, packed examples, tests, performance tools, and npm artifact verification |
| `packages/flutter/` | Flutter package foundation, generated assets, and development hosts; runtime implementation remains pending |
| `shared/assets/` | canonical package SVG/font sources, font license and native provenance; see [shared assets](shared-assets.md) |
| `docs/engineering/` | repository-internal architecture, verification, environment and release operations |
| `conformance/` | shared behavior targets and pending runtime qualification inputs |
| `verification/` | private shared asset preparation, documentation, Flutter artifact, and cross-runtime qualification tooling |
| `.artifacts/` | ignored build and measurement output |

JavaScript package-local directories retain their existing owners. Production may
import canonical raw SVG data from `shared/assets/icons/`; shared executable
modules are not a production dependency. Product imports no tooling;
verification and performance can import product code but production never
imports either. Tests may import product and explicitly owned fixtures. The
boundary test enforces these directions.

## Ownership map

| Owner | Owns | Does not own |
| --- | --- | --- |
| `src/index.ts` and `composition/` | package construction, public facade assembly, and concrete Pixi assembly | semantic or lifecycle policy |
| `public/` | application and host contracts plus stateless facade mapping | Engine state, Core types, or renderer objects |
| `engine/index.ts` | product orchestration and authority delegation | public facade construction or duplicate lifecycle, transaction, capture, or pointer state machines |
| Engine lifecycle and scene authorities | surface generation, lifecycle, accepted scene, publication revision | renderer internals or semantic planning |
| Engine coordinators | replacement, mutation, history, editor, selection, pointer, viewport, transformer, asset, and capture ordering | a second canonical scene, revision clock, or renderer |
| Core load and reconcile authorities | candidate parsing, dense construction, semantic publication, exact rollback | public facade policy, DOM input, or frame scheduling |
| Core instance-presentation coordinator | instance presentation maps, full and height-only updates, reconcile replay, and projection-to-frame ordering | public Engine policy or a second semantic scene |
| Semantic, geometry, and dense layers | normalization, identity, exact render quads, planning, compact state, transactions | Engine lifecycle or concrete GPU state |
| `rendering-port/` | backend-neutral capabilities and immutable transfer values | geometry algorithms or concrete adapter ownership |
| PixiJS CPU publication authority | projection revision, presentation inputs, dirty ranges, flush transition, and exact publication checkpoint | GPU objects, scene submission, or renderer-loss policy |
| Aggregate PixiJS renderer | GPU resources, scene synchronization, surface rendering, aggregate interaction paint, and renderer-loss state | product mutation, history, or public API decisions |
| Surface publication authority | canvas publication, context listeners, root binding activation, rollback and teardown | renderer-loss policy or frame eligibility |
| Root interaction binding authority | fixed stage/canvas bindings, pointer capture, coordinate translation, cleanup | gesture and selection policy |
| Interaction overlay authority | stable overlay objects, paint bounds cache, dirty repaint, teardown | canonical selection or transformer sessions |
| Accessibility authorities | derived logical focus order, activation, reduced motion, canvas-aligned accessibility nodes, and teardown | application-shell accessibility or a second semantic selection owner |
| Product probe and failure projection | detached public snapshots, structured operation errors, redaction, and bounded operational evidence | state transitions, persistence, or a second lifecycle owner |
| Text and image leaf lanes | lane resources, projection, settlement, release after confirmed frames | a second store traversal or frame scheduler |
| Scheduler and frame authorities | invalidation, frame eligibility, budget, publication confirmation | semantic mutation or per-feature tickers |

## Dependency rules

1. `src/index.ts` and `src/image.ts` are public entries. Lower layers never import them.
2. Engine and Core support modules depend on `rendering-port/`, not concrete
   files under `rendering/` or `composition/`.
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
9. The same test enforces forbidden one-way imports; a cycle-free edge can still
   violate ownership.
10. Verification commands live with their owner under `verification/` or
    `performance/runners/`; there is no generic script ownership layer.

## Resource and performance invariants

- One managed frame schedule; no feature-specific RAF or ticker.
- Aggregate rendering does not add per-entity listeners or callbacks.
- Hierarchical paint order is resolved during structural or geometry projection
  publication, not during view-only or animation frames. Non-overlapping compatible items keep
  the fixed aggregate lanes; exact cross-lane ordering routes the smallest
  stacking suffix from the earliest exact item through one shared scene
  container rather than a container or render group per item.
- Dense traversal is shared; lanes must not rescan the full store independently.
- Pending work is acquired and released on success, failure, supersession, and
  destroy.
- Listener and resource activation is reversible until publication succeeds;
  teardown is idempotent.
- Capture uses the authoritative canvas and defers resize while readback is active.
