# Clean-room Renderer Architecture

This is the target architecture for the rewrite.

## Goal

Replace the current DisplayObject-first implementation with a data/model-first
engine:

```text
public API / patch-service update
  -> normalized model
  -> indexes
  -> render IR diff
  -> feature renderers
  -> scheduled GPU/scene updates
```

PixiJS remains the rendering backend. Patch-map model state becomes the source of
truth.

## Layers

### 1. Compatibility API Layer

Responsibilities:

- Keep `Patchmap`, `Transformer`, `StateManager`, `UndoRedoManager`, events,
  `draw`, `update`, `selector`, `focus`, and `fit` compatible.
- Convert selector result wrappers and legacy DisplayObject-like objects into
  model ids.
- Keep existing callback target shape.

### 2. Model Layer

Responsibilities:

- Normalize draw data into stable node records.
- Maintain parent/children relationships independent of Pixi children.
- Store element/component props, layout state, transform state, visibility,
  locked flags, generated grid cell ids, and relation endpoints.
- Support update merge/replace/refresh semantics.

Indexes:

- id -> node
- type -> nodes
- display -> nodes
- parent -> children
- selectable nodes
- relation endpoint dependencies
- dirty render features

### 3. Layout Layer

Responsibilities:

- Resolve group/grid/item geometry.
- Resolve component size, margin, placement, padding, and orientation.
- Produce render-space rectangles and oriented bounds.
- Produce hit-test bounds and focus/fit bounds.

### 4. Render IR

Render IR is a compact backend-neutral description of visible output.

Feature groups:

- item backgrounds
- bars
- icons
- item text
- standalone rects
- standalone text
- images
- relations
- transformer overlays
- selection overlays

Each IR record carries:

- logical node id
- feature type
- z/layer order
- geometry
- material/style key
- alpha/visibility
- update generation

### 5. Renderer Policy Layer

Renderer policy selects the cheapest correct renderer by workload:

- Static or mostly static rounded rect groups can use cached textures or
  aggregate particle/mesh renderers.
- Bulk bar animation can use a renderer optimized for contiguous batch updates.
- Sparse chart stream updates must avoid uploading or rewriting full buffers.
- Highlight/dim alpha changes should use group alpha/material indirection when
  possible instead of per-piece traversal.
- Text/icon/effects can fall back to Pixi objects until a specialized renderer is
  justified.

Rejected global replacement strategies must not be reintroduced without passing
all benchmark scenarios.

### 6. Scheduler

Responsibilities:

- Coalesce update bursts.
- Separate synchronous model changes from render work.
- Maintain frame budget for render uploads.
- Cancel superseded animations.
- Merge repeated updates for the same node before render flush.
- Support immediate correctness for reads/callbacks after `update()`.

### 7. Hit Test and Interaction Layer

Responsibilities:

- Use model/layout spatial indexes for selection and drag selection.
- Avoid full scene graph traversal for common pointer queries.
- Preserve selection units: entity, closestGroup, highestGroup, grid.
- Preserve drill-down and deep-select behavior.

### 8. Pixi Backend

Responsibilities:

- Own minimal Pixi containers/layers.
- Maintain viewport, world compatibility root, transformer/selection overlays.
- Upload render IR changes to Pixi objects, ParticleContainers, Meshes, or custom
  renderers.

## Migration Strategy

1. Freeze official feature docs and contract tests.
2. Add model/index layer behind existing draw/update while still rendering with
   current DisplayObjects.
3. Route selector/focus/fit through indexes where possible.
4. Introduce render IR for panel bars first, with renderer policy split for bulk
   vs sparse updates.
5. Move backgrounds and relations to feature renderers.
6. Move selection hit testing to spatial index.
7. Replace remaining DisplayObject-first paths once tests and benchmarks pass.

## Design Decisions

Confirmed for the clean-room rewrite:

- Arbitrary Pixi DisplayObject mutation is not an official compatibility goal.
- Selector results and callback targets may become compatibility wrappers rather
  than Pixi subclasses, as long as official fields and methods keep working.
- Patch-service optimized paths are first-class API contracts.

Still requires a future product/design decision before exposing publicly:

- Whether no-radius bar mode should become an opt-in performance style.
