# System map

Use the first matching row. Paths name primary owners and focused checks, not
every helper involved.

| Change | Primary source | Focused checks | Additional gate |
| --- | --- | --- | --- |
| Public mount, facade, exports | `src/index.ts`, `src/composition/`, `src/public/` | `tests/integration/developer-api-workflows.test.ts` | `npm run build`, `npm run verify:package` |
| Mount, resize, renderer loss, destroy | `src/engine/surface-lifecycle-authority.ts`, `src/engine/page-lifecycle-coordinator.ts`, `src/composition/pixi-engine-surface.ts` | `tests/engine/engine-lifecycle.test.ts`, `tests/integration/page-lifecycle.test.ts` | `npm run verify:memory` |
| Dataset admission and replacement | `src/semantic/dataset/`, `src/parsing/`, `src/engine/dataset-replacement-coordinator.ts` | `tests/semantic/dataset-contract.test.ts`, `tests/semantic/incremental-parser.test.ts` | full unit suite when shared parsing changes |
| Mutation and transaction publication | `src/public/mutation-*`, `src/semantic/transaction/`, `src/engine/transaction-commit-coordinator.ts` | `tests/integration/developer-api-updates.test.ts`, `tests/semantic/semantic-transaction-mutations.test.ts`, `tests/engine/engine-update-transactions.test.ts` | update performance probe for changed hot paths |
| History | `src/history/`, `src/engine/history-application-coordinator.ts` | `tests/semantic/history.test.ts` | full unit suite when transaction ordering changes |
| Frame publication and scheduling | `src/engine/publication-authority.ts`, `src/core/frame-publication-authority.ts`, `src/scheduler/` | `tests/rendering/text-render-publication.test.ts` | benchmark smoke; full benchmark for hot-path changes |
| Geometry, layout, bounds, hit testing | `src/semantic/`, `src/geometry/`, `src/engine/surface-geometry.ts` | `tests/rendering/orientation-renderer-lanes.test.ts`, `tests/semantic/entity-hit-index.test.ts` | full unit suite |
| Pixi rendering and GPU resources | `src/rendering/`, `src/rendering-port/` | `tests/rendering/mesh-layer.test.ts`, `tests/rendering/scene-images.test.ts` | benchmark smoke and memory gate |
| Images and assets | `src/assets/`, `src/scene-images/`, `src/engine/asset-session-authority.ts` | `tests/rendering/scene-images.test.ts`, `tests/engine/engine-asset-lifecycle.test.ts` | package gate when shipped assets change |
| Text layout and rendering | `src/semantic/text-*`, `src/rendering/aggregate-text-leaf-lane.ts` | `tests/rendering/text-layout.test.ts`, `tests/rendering/text-projection.test.ts` | package gate when fonts or exports change |
| Pointer, selection, transformer | `src/pointer-gesture/`, `src/query-selection/`, `src/selection-transformer/` | `tests/semantic/pointer-gesture.test.ts`, `tests/semantic/query-selection.test.ts`, `tests/semantic/selection-transformer.test.ts` | package gate for public interaction changes |
| Editor workflows | `src/editor-workflow/`, `src/engine/editor-operations.ts`, `src/public/editor.ts` | `tests/semantic/editor-workflow.test.ts`, `tests/integration/developer-api-workflows.test.ts` | package gate |
| Viewport and orientation | `src/viewport/`, `src/engine/viewport-authority.ts` | `tests/semantic/viewport.test.ts`, `tests/engine/engine-viewport.test.ts` | benchmark for interaction hot-path changes |
| Presentation and animation | `src/public/presentation.ts`, `src/presentation/`, `src/core/presentation-layers.ts`, `src/core/instance-presentation-coordinator.ts` | `tests/integration/developer-api-targets-presentation.test.ts`, `tests/integration/developer-api-updates.test.ts`, `tests/core/core-instance-component-presentation-integration.test.ts` | matching performance probe or benchmark |
| Capture and extraction | `src/engine/capture-extraction-authority.ts`, `src/operations/extraction-security-authority.ts` | `tests/engine/engine-capture-extraction-authority.test.ts` | extraction probe and memory gate |
| Accessibility | `src/accessibility/`, `src/rendering/pixi-renderer/accessibility-overlay-authority.ts` | `tests/integration/accessibility-product.test.ts` | package gate for public output changes |
| Debug snapshots and operation failures | `src/public/index.ts`, `src/engine/product-probe-reader.ts`, `src/engine/operation-outcomes.ts`, `src/operations/` | `tests/engine/engine-lifecycle.test.ts`, `tests/engine/engine-operation-outcomes.test.ts`, `tests/integration/operations.test.ts` | package gate for public output changes |
| Package contents and installed consumers | `package.json`, `verification/package/`, `examples/` | package verifier | `npm run verify:package -- --require-audit` |
| Import and repository boundaries | all production and support roots | `tests/tooling/architecture-import-graph.test.ts` | typecheck and lint |
