# PATCH MAP v0.10 Public API Coverage

Status values are `verified`, `oracle-blocked`, and `incomplete`. A row is `verified` only when the full approved contract represented by that row has an automated public-boundary test. `oracle-blocked` means the known public contract is implemented and locally tested but approved evidence does not define every required observable. `incomplete` means known implementation or release evidence is still missing. Oracle fixture IDs identify approved evidence; independent evidence is implementation-authored from the public contract.

## Package exports

| Public export | Observable contract | Current evidence and remaining gap | Status |
| --- | --- | --- | --- |
| `Patchmap` | Subclassable lifecycle, map, view, event, state, history, and Level 2 properties | Exact runtime/type export and packed subclass flow pass; constructor and several nested exact ABIs remain in Q2~Q7, Q14, and Q20 | oracle-blocked |
| `Transformer` | Selection, bounds, resize, rotation, locking, snapping, and history | Selection plus all resize directions, rotation, cancellation, native gestures, and history pass; exact options/callback ABI remains Q2/Q11 | oracle-blocked |
| `State` | Subclassable state with handled events and lifecycle | Independent lifecycle and propagation tests pass; exact constructor/state payload ABI remains Q2/Q3 | oracle-blocked |
| `PROPAGATE_EVENT` | Passes an input event to the next stacked state | Independent stack propagation contract | verified |
| `Command` | Subclassable command with ID, `execute`, and `undo` | Override, grouping, and async sequencing pass; invalid input and rejection state remain Q2/Q18 | oracle-blocked |
| `UndoRedoManager` | Limit, execute/undo/redo/clear/destroy, events, and grouping | Capacity, events, grouping, and async ordering pass; exact returns/payloads/rejection state remain Q2/Q5/Q18 | oracle-blocked |
| `selector` | Standalone public JSONPath resolver | Documented successful query families pass; complete default/invalid/error ABI remains Q1 | oracle-blocked |
| `convertLegacyData` | Public legacy-map conversion helper | Current implementation only clones independent input; field-level legacy conversion remains Q1/Q13 | incomplete |
| `findIntersectObject` | Public intersection lookup helper | Topmost/empty public cases pass; complete accepted input and boundary/error ABI remains Q1 | oracle-blocked |
| `isMoved` | Public pointer-movement helper | Euclidean threshold cases pass; exact defaults/boundaries/errors remain Q1 | oracle-blocked |
| `intersectPoint` | Public point intersection helper | Rectangle inside/outside cases pass; exact edge/input/error ABI remains Q1 | oracle-blocked |
| `uid` | Public generated-ID helper | Unique 15-character safe-alphabet IDs pass; exact oracle contract remains Q1 | oracle-blocked |

The exact set of twelve documented runtime exports is independently verified in ESM, CommonJS, UMD, and strict NodeNext TypeScript consumers.

## Patchmap surface

| Surface | Required observations | Current evidence and remaining gap | Status |
| --- | --- | --- | --- |
| Construction/properties | Pre/post-init state, materialized theme, transformer replacement, history recreation, Level 2 property state | Known properties and assignment lifecycle pass; `animationContext` remains Q20 | oracle-blocked |
| `init` / `destroy` | Async idempotence, readiness, DOM/resource cleanup, re-init, pending-init cancellation | LIF-001~002, ten fresh browser sessions, and twelve lifecycle/heap cycles | verified |
| `draw` | Current and legacy input, validation transaction, immutability, defaults, replacement, async coalescing | DRW-001~006 pass for current `MapData`; legacy conversion remains Q13 | incomplete |
| `update` | Direct/path targets, merge/replace/refresh, transforms, history, silence, validation/normalization | UPD-001~006 and independent structural/history tests pass; `validateSchema`/`normalize` behavior remains Q6 | incomplete |
| `selector` | Root/direct/recursive traversal, filters, boolean/string expressions, projections, live refs | Documented Patchmap expression families and indexed live refs | verified |
| `focus` / `fit` | Default/explicit/relation targets, pruning, center/zoom, axis padding | Ordinary bounds, pruning, padding, rotation, and flip pass; relation schema and exact return/error ABI remain Q5/Q14 | oracle-blocked |
| `event` | Canvas/world paths, action lifecycle, enabled state, callback payload, draw/destroy cleanup | Registration/toggle/rebind/cleanup and real pointer dispatch pass; opaque payload ABI remains Q5 | oracle-blocked |
| `rotation` / `flip` | Controller state, returns, events, geometry, focus/fit, upright content | Geometry, reset, event count, and upright behavior pass; exact returns/payloads remain Q5 | oracle-blocked |
| `stateManager` / selection | Stack/modifiers, mouse/touch, drag modes, units, filters, callbacks | Real mouse/touch, box/paint, unit/filter, hover, and cleanup pass; defaults/callback ABI and registration timing remain Q3/Q4/Q18/Q22 | oracle-blocked |
| `transformer` | Assignment cleanup, selection payload, resize/rotate gestures, cancellation, history | Unit and real-pointer gestures pass, including eight resize directions; exact option/payload ABI remains Q2/Q11 | oracle-blocked |
| `undoRedoManager` | Command limit, grouped state transitions, returns, events, failure state | Known synchronous/async grouping and events pass; exact error/rejection semantics remain Q5/Q18 | oracle-blocked |
| `syncViewTransform()` | Public classification and observable effect | Used by public controllers internally; its public status is not established | oracle-blocked |

## Data and rendering

| Contract family | Required coverage | Current evidence and remaining gap | Status |
| --- | --- | --- | --- |
| Seven element kinds | `group`, `grid`, `item`, `relations`, `image`, `text`, `rect`; defaults and handles | Known kinds materialize and render; relation schema and fixture-external defaults/errors remain Q7/Q14 | oracle-blocked |
| Four component kinds | `background`, `bar`, `icon`, `text`; defaults, placement, sizing, matching | Fixture behavior and matching pass; advanced text split/auto-font/overflow/wrapping remains Q19 | incomplete |
| Grid materialization | Cell IDs/labels/geometry and destroy/hide inactive strategies | DRW-002 plus structural update and identity contracts | verified |
| Primitive normalization | Size, gap, margin, padding, placement, source, color, invalid inputs | Approved rows and selected independent cases pass; complete matrix/default/error coverage remains Q7 | incomplete |
| Assets | Alias, URL, inline descriptors, rectangle textures, stale async protection, defaults | Explicit source forms, caching, failure, stale completion, and teardown pass; default built-in assets remain Q15 | incomplete |
| Observable scene facade | Parent/children, identity/type/props/transforms/dimensions/visibility/bounds/destroyed | Packed type/ABI and live-handle tests pass; cross-surface and structural identity remain Q8~Q10/Q16/Q17 | oracle-blocked |
| Rendering invariants | Geometry, text, relations, stacking, visibility, animation, pixels/tolerance | DRW raster, aggregate layers, assets, stacking, and animation pass; relation/text and additional normative tolerances remain Q12/Q14/Q19 | incomplete |

## Cross-cutting gates

| Gate | Current evidence and remaining gap | Status |
| --- | --- | --- |
| Fourteen approved oracle fixtures | LIF-001~002, DRW-001~006, and UPD-001~006 match immutable expected output | verified |
| Fresh-run determinism | 28/28 repeated normalized comparisons in fresh browser sessions | verified |
| Known independent contracts | 20 unit files / 131 tests plus ten fresh browser-contract sessions | verified |
| Fixture-external input/reference/event/error cases | Known cases pass; exact oracle ABIs listed above remain unresolved | oracle-blocked |
| Build/typecheck/lint/unit | Pinned package scripts and independent tests | verified |
| ESM/CommonJS/UMD and packed consumer | Actual tarball installed in an isolated consumer; exact twelve exports and declarations checked | verified |
| Dependency audit and clean-room package safety | Zero known vulnerabilities, approved payload checks, and release-file allowlist | verified |
| Memory lifecycle | Twelve init/draw/update/destroy cycles and forced-GC retained-heap trend | verified |
| S1 object scaling | Canonical 100/500/1,000/2,000/5,000 × seven-sample 4× proxy and provisional developer-native reports pass the approved local thresholds; headed Windows native remains separately pending | verified |
| S2 maintained-product fixture | No implementation-safe maintained-product fixture has been approved | oracle-blocked |
| S3/S4 throughput and interaction | Canonical 1,000/2,000 × seven-sample reports cover bulk/sequential updates, highlight, relation refresh, view, hit, hover, box/paint selection, resize, and rotation with 364/364 compatibility assertions passing in both 4× proxy and provisional developer-native runs | verified |
| Primitive and Windows comparison | The implementation submits one aggregate backend primitive at 100/500/1,000/2,000/5,000 before and after update; a reference counting definition/count and headed Windows native S1/S3/S4 evidence remain Q21/pending | oracle-blocked |

The fourteen approved fixtures are necessary but do not prove full public API coverage. Completion cannot be declared while any row is `incomplete` or `oracle-blocked`; unresolved behavior must stay visible to the oracle owner rather than being inferred.
