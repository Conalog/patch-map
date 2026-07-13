# PATCH MAP v0.10 Observable Questions

These questions request public inputs and observable outputs only. They must not be answered with reference source, private symbols, algorithms, bundles, source maps, or original tests.

1. For each standalone export (`selector`, `convertLegacyData`, `findIntersectObject`, `isMoved`, `intersectPoint`, `uid`), what are the accepted arguments, defaults, return value, mutation behavior, and thrown errors for representative valid, empty, and invalid inputs?
2. What are the documented constructor arguments and return/error behavior for `Patchmap`, `Transformer`, `State`, `Command`, and `UndoRedoManager` when omitted or invalid options are supplied?
3. Which public methods, arguments, defaults, return values, event payloads, and no-op/error cases belong to `stateManager`, including modifier activation and deactivation?
4. What exact arguments and ordering do all selection callbacks receive, and what are the defaults for `draggable`, `paintSelection`, `drillDown`, `deepSelect`, filters, and selection units?
5. What do the rotation, flip, canvas-event, focus, fit, and undo/redo methods return, and what exact event payloads and errors do they produce?
6. How are duplicate targets ordered or deduplicated when `update` receives overlapping `path` and `elements`, and what are the exact observable effects of `validateSchema` and `normalize`?
7. What are the complete public schema/style defaults beyond those captured in the approved fixtures, including exact validation error classes/messages and invalid fit-padding behavior?
8. For component updates without IDs, what are the exact label/type/order matching rules in ambiguous cases beyond the approved UPD-002 rows?
9. In DRW-001's default animated-bar probe, why does the returned/scene materialized component ID differ from the live handle found by the fixture-provided ID, and which cross-surface identity relationships are normative?
10. Does DRW-006 require prior managed and unmanaged world children to be destroyed before the replacement `draw` returns, or only by the documented async observation boundary?
11. What exact option keys/defaults and callback arguments apply to transformer wireframes, bounds, resize/rotate handles, ratio decisions, and gesture history?
12. Which additional visual geometry, text-layout, and raster tolerances are normative outside DRW-001/002, while UPD-005 pixels remain non-normative and Windows native remains pending?
13. What is the field-level legacy object schema accepted by `draw`/`convertLegacyData`, and what current `MapData` and errors should representative legacy, empty, and malformed inputs produce?
14. What is the public relation-link endpoint schema, including direction, duplicate identity, missing endpoints, path geometry, and the exact relation behavior used by `focus`, `fit`, rendering, refresh, and merge updates?
15. Which built-in asset aliases are available after default initialization, what public images/fonts do they resolve to, and what natural-size, loading, failure, and teardown observations are normative when no `assets` option is supplied?
16. For structural updates, what identity matching applies to group children without explicit IDs, duplicate IDs, children moved between parents, and grid template/component IDs beyond documented label/type/order matching?
17. Is changing an element or component `type` discriminator through `update` supported? If so, what happens to the original live handle, children, index position, events, and history; if not, what exact error is required?
18. Does drill-down maintain a selected-path/time window beyond the native click `detail`, and what history/event state is required when an asynchronous `Command.execute` or grouped undo/redo rejects after partial work?
19. For element `text` and item text components, what are the exact materialized props, geometry, raster observations, update/refresh behavior, and invalid-input errors for `split`, `style.autoFont`, overflow, wrapping/newlines, constrained size, and placement?
20. What is the Level 2 `animationContext` contract before and after initialization, including its default, accepted values and ownership, draw/update/animation observations, assignment behavior, destroy/re-init reset, and invalid values?
21. Can the oracle owner provide a clean-room-safe S2 fixture, the reference backend primitive counting definition and normalized counts, and headed Windows native S1/S3/S4 evidence without exposing implementation material?
22. The approved prose disagrees on when the default `selection` state is registered. What must be observable immediately after `init`, before the first `draw`, after draw/redraw, and after destroy/re-init?
23. Is `syncViewTransform()` a v0.10 public observable surface or a Level 3 internal helper? If public, what are its return value, effects, no-op cases, and errors?
