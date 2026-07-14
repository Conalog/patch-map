# PATCH MAP v0.10 Public API Coverage

Status values are `verified`, `oracle-partial`, and `external-pending`. `verified` means the documented public contract is implemented and connected to approved fixture evidence or an independent public-boundary test. `oracle-partial` preserves an explicit limitation in the v4 Oracle observation without inferring the missing behavior. `external-pending` requires an unavailable environment or reference-side public measurement. All v4 fixture rows remain `oracle-generated/review-pending`; local conformance success does not promote their review state.

## Package exports

| Public export | Automated public contract | Evidence | Status |
| --- | --- | --- | --- |
| `Patchmap` | Subclassable lifecycle plus draw, update, selector, view, event, state, history, assets, transformer, and Level 2 properties | LIF/DRW/UPD, API-101, CTX-101, DRX-101, EVT-101, STA-101, VIE-101, packed consumer | verified |
| `Transformer` | Constructor/default ABI, selection, bounds, handles, ratio callback, native resize/rotate, cancellation, events, and grouped history | ABI-101, TRN-101, browser and unit gesture contracts | verified |
| `State` / `PROPAGATE_EVENT` | Constructor, stack propagation, handled events, modifiers, lifecycle, and selection registration timing | ABI-101, STA-101, state/selection unit contracts | verified |
| `Command` / `UndoRedoManager` | Constructor ABI, execute/undo/redo, limit, grouping, async resolve/reject state, events, clear, and destroy | ABI-101, HIS-101, history unit contracts | verified |
| `selector` | `selector(value, path)`, omitted/reversed calls, collection flattening, and exact representative errors | API-102 and utility contracts | verified |
| `convertLegacyData` | Grouped legacy schema, current/empty/malformed inputs, exact errors, and input immutability | API-101 and utility contracts | verified |
| `findIntersectObject` / `intersectPoint` / `isMoved` | Live-handle intersection, point boundaries, movement threshold, empty/invalid inputs | API-102 and utility contracts | verified |
| `uid` | Safe 15-character IDs, uniqueness, fallback, and representative ignored arguments | API-102 and utility contracts | verified |

The exact set of twelve runtime exports is verified from a real packed tarball through ESM, CommonJS, UMD, strict NodeNext TypeScript, subclassing, declaration edges, and a minimal browser lifecycle. The UMD consumer obtains Pixi through its official ESM public API and does not open a dependency bundle.

## Patchmap surface

| Surface | Covered public observations | Evidence | Status |
| --- | --- | --- | --- |
| Construction and properties | Pre/post-init fields, theme, animation context getter-only identity, transformer replacement, history recreation | ABI-101, CTX-101, LIF-001~002 | verified |
| `init` / `destroy` | Idempotence, pending-init cancellation, readiness, DOM/listener/resource cleanup, re-init | LIF-001~002, browser lifecycle, twelve memory cycles | verified |
| `draw` | Current and legacy input, transactional validation, defaults, identity, replacement, destroy timing, event coalescing | DRW-001~006, API-101, DRX-101, SCH-101 | verified |
| `update` | Direct/path targets, duplicate ordering, merge/replace/refresh, normalization, validation, transforms, history, silence, identity | UPD-001~006, UPX-101, structural contracts | verified |
| `selector` | Root/direct/recursive traversal, filters, projections, indexed live references, pending-index flush | fixture and independent selector contracts | verified |
| `focus` / `fit` | Defaults, relation targets, filtering, center/zoom, axis padding, invalid padding, return behavior | VIE-101, REL-101 | verified |
| Canvas `event` | add/get/getAll/on/off/remove, enabled state, redraw teardown, callback payload/order, native pointer dispatch | EVT-101, browser contracts | verified |
| `rotation` / `flip` | State, returns, events, render geometry, focus/fit interaction, upright content | VIE-101 and browser contracts | verified |
| `stateManager` / selection | Stack/modifiers, entity/group/deep selection, filters, click/double/right, hover, box/paint, drag, touch, cleanup | STA-101, INT-101, browser and unit contracts | oracle-partial |
| `transformer` | Assignment cleanup, payloads, public geometry, eight resize directions, rotation, ratio callback, history | TRN-101, browser and unit contracts | verified |
| `undoRedoManager` | Returns, events, capacity, grouping, asynchronous partial-work state, destroy/recreation | HIS-101 and history contracts | verified |
| `syncViewTransform()` | Absent from the public surface before/after init, draw, and view mutations | VIE-101 | verified |

## Data and rendering

| Contract family | Covered public observations | Evidence | Status |
| --- | --- | --- | --- |
| Seven element kinds | `group`, `grid`, `item`, `relations`, `image`, `text`, `rect`; minimal defaults, errors, hierarchy, identity, and updates | SCH-101, REL-101, TXT-101, UPX-101 | verified |
| Four component kinds | `background`, `bar`, `icon`, `text`; IDs, matching, placement, sizing, split, auto-font, overflow, wrapping, update | SCH-101, TXT-101, UPD-002, UPX-101 | verified |
| Grid materialization | Cell/template IDs, labels, geometry, handle reuse, append/move semantics, inactive destruction | DRW-002, UPX-101, structural contracts | verified |
| Primitive normalization | Size/gap/margin/padding/placement/source/color defaults and representative exact failures | SCH-101, TXT-101, validation contracts | verified |
| Relations | source/target schema, direction, duplicates, missing endpoints, geometry, focus/fit, refresh/merge, returns/events | REL-101 | verified |
| Assets | Defaults, aliases, URL/descriptor/rect sources, natural size, cache/failure/stale completion, teardown | AST-101 and browser contracts | verified |
| Observable scene facade | Live identity, parent/children, props, transforms, dimensions, bounds, visibility, destruction, type-change rejection | DRW/UPD, DRX-101, UPX-101 | verified |
| Geometry/text/raster | Public geometry and text are normative; approved macOS headless pixel fields remain explicitly non-normative | DRW raster, TXT-101, REL-101, S2-101, TRN-101 | oracle-partial |

## Cross-cutting gates

| Gate | Current evidence | Status |
| --- | --- | --- |
| Approved conformance | 31 fixtures, 62/62 comparisons in two fresh sessions; INT callback-open fields use a fixture-scoped projection while raw actual traces remain deterministic | verified |
| Fresh-run event determinism | EVT-101, TRN-101, and INT-101 pass 30/30 additional fresh sessions | verified |
| Independent contracts | 21 unit files / 162 tests plus ten fresh browser-contract sessions | verified |
| Build, typecheck, lint | Pinned scripts pass against the committed implementation | verified |
| Package consumer | 12 exports, 7 entry targets, 37 declaration edges, ESM/CommonJS/NodeNext/UMD, subclass lifecycle | verified |
| Clean-room safety and audit | v4 manifest digest exact; 71 immutable payloads exact with implementation-mutable `package.json`; source maps/evidence packaged: 0; vulnerabilities: 0 | verified |
| Memory lifecycle | Twelve cycles, nine measured post-warmup samples, finite retained heap, growth within gate | verified |
| S1 scaling | Native and 4× reports cover 100/500/1,000/2,000/5,000 with two warmups and seven samples | verified |
| S2 maintained fixture | Public descendants 65, renderable 62, managed 64; macOS pixels non-normative | S2-101 | oracle-partial |
| S3/S4 interaction | Native and 4× reports cover 1,000/2,000; 364/364 compatibility assertions pass in each report | verified |
| Render primitives | One aggregate backend primitive before/after update through 5,000 objects; no reference backend count is publicly available | oracle-partial |
| Headed Windows | Native raster and S1/S3/S4 performance approval | external-pending |

## Explicitly open Oracle boundaries

- Q4: the authored headless drag sequence did not expose drag callbacks; functional drag/paint behavior is independently tested, but no missing reference callback ABI is inferred.
- Q7: representative defaults/errors cover every documented kind, but the finite Oracle matrix does not claim every possible schema/style combination.
- Q12: environment-qualified pixels remain non-normative outside approved headed Windows evidence.
- Q18: detail-2 drill behavior and async history are captured; an exact elapsed drill wall-clock window was not observed.
- Q21: public S2 counts are captured; a reference backend primitive count is unavailable through public API, and headed Windows remains pending.

These limitations and the analysis-owner review state remain visible even though the implementation and all currently executable completion gates pass.
