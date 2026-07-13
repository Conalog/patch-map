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
