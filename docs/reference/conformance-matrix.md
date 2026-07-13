# PATCH MAP Clean-room Conformance Matrix

Status: active  
Evidence status values: `oracle-pending`, `captured`, `replacement-pass`

This matrix is the work queue for independently authored black-box fixtures.
Every row must reach `replacement-pass` before the corresponding compatibility
area is complete.

| ID | Level | Observable contract | Required evidence | Status |
| --- | --- | --- | --- | --- |
| LIF-001 | 1 | Init is async, idempotent, and emits initialized after public state is ready. | return/event trace | oracle-pending |
| LIF-002 | 1 | Destroy is safe before init, cleans resources once, and permits re-init. | lifecycle trace and DOM snapshot | oracle-pending |
| DRW-001 | 1 | All seven element kinds and four component kinds render with defaults. | data, scene, pixel snapshots | oracle-pending |
| DRW-002 | 1 | Grid cell IDs, labels, positions, destroy/hide behavior are deterministic. | scene and geometry snapshots | oracle-pending |
| DRW-003 | 1 | Draw does not mutate input and returns materialized data. | before/after and return snapshot | oracle-pending |
| DRW-004 | 1 | Invalid draw throws without corrupting the latest successful pending event. | error and event trace | oracle-pending |
| DRW-005 | 1 | Consecutive successful draws emit only the latest pending draw event. | ordered event trace | oracle-pending |
| DRW-006 | 1 | Redraw removes prior managed and unmanaged world children. | scene/lifecycle snapshot | oracle-pending |
| AST-001 | 1 | Asset alias, URL, inline descriptor, and rectangle texture sources render. | settled pixel and texture snapshot | oracle-pending |
| AST-002 | 1 | Stale async loads cannot overwrite newer source or destroyed objects. | controlled async trace | oracle-pending |
| UPD-001 | 1 | Direct reference and JSONPath updates target equivalent elements. | return and scene snapshot | oracle-pending |
| UPD-002 | 1 | Merge and replace preserve their documented nested/array semantics. | table-driven data snapshots | oracle-pending |
| UPD-003 | 1 | Refresh re-applies observable behavior for equal values. | renderer/event trace | oracle-pending |
| UPD-004 | 1 | Relative transform and center-origin rotation preserve expected geometry. | geometry snapshots | oracle-pending |
| UPD-005 | 2 | Trusted silent bulk updates mutate immediately and render next frame. | return-time and frame snapshot | oracle-pending |
| UPD-006 | 1 | Missing targets return an empty result without failure. | return/event snapshot | oracle-pending |
| SEL-001 | 1 | Root, recursive ID/type, and child projection queries match. | normalized query results | oracle-pending |
| SEL-002 | 2 | Parent filters, boolean filters, and maintained string expressions match. | normalized query results | oracle-pending |
| EVT-001 | 1 | Event path `$` targets viewport; traversing paths target world descendants. | target trace | oracle-pending |
| EVT-002 | 1 | Event add/on/off/remove/removeAll/get/getAll lifecycle matches. | ordered event trace | oracle-pending |
| VIE-001 | 1 | Focus and fit default/explicit/filter target bounds match. | viewport and bounds snapshot | oracle-pending |
| VIE-002 | 1 | Fit padding defaults, axis overrides, and invalid edge keys match. | viewport/error snapshot | oracle-pending |
| VIE-003 | 1 | Rotation and flip preserve focus/fit and upright-content behavior. | geometry and pixel snapshots | oracle-pending |
| INT-001 | 1 | Click, double-click, right-click, tap, and hover callbacks match. | pointer callback trace | oracle-pending |
| INT-002 | 1 | Box and paint selection return identical ordered IDs and visuals. | interaction trace and pixels | oracle-pending |
| INT-003 | 1 | Drill-down, deep-select, unit selection, and filters match. | interaction trace | oracle-pending |
| INT-004 | 1 | Locked elements preserve selection but block prohibited transforms. | interaction and geometry trace | oracle-pending |
| TRN-001 | 1 | Transformer selection setters/model and update event payload match. | ordered selection trace | oracle-pending |
| TRN-002 | 1 | Resize handles, oriented frames, ratio rules, and history grouping match. | pointer, geometry, history trace | oracle-pending |
| TRN-003 | 1 | Rotation handles, mixed selection, snapping, and history grouping match. | pointer, geometry, history trace | oracle-pending |
| HIS-001 | 1 | Execute/undo/redo/clear, redo invalidation, limits, and events match. | state and event trace | oracle-pending |
| HIS-002 | 1 | Equal history IDs yield one user-visible undo step. | history and scene snapshot | oracle-pending |
| ABI-001 | 2 | Maintained consumers can traverse world and element handle properties. | adapter contract tests | oracle-pending |
| ABI-002 | 2 | Maintained viewport zoom/center/conversion/plugin/event calls match. | integration trace | oracle-pending |
| ABI-003 | 2 | Patchmap, State, and Command subclassing remains usable. | consumer-shaped tests | oracle-pending |
| MEM-001 | 1 | Repeated init/draw/destroy does not retain instance-owned resources. | heap and listener trend | oracle-pending |

Performance acceptance is defined separately in
`docs/reference/performance-contract.md`. A faster result cannot waive a failed
behavior row.
