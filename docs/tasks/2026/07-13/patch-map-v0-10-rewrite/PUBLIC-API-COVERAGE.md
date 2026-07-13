# PATCH MAP v0.10 Public API Coverage

Status values are `planned`, `implemented`, and `verified`. A row is `verified` only when an automated public contract test passes. Oracle fixture IDs identify approved evidence; independent IDs identify implementation-authored tests derived from the public contract.

## Package exports

| Public export | Observable contract | Evidence | Status |
| --- | --- | --- | --- |
| `Patchmap` | Subclassable lifecycle, map, view, event, state, and history facade | LIF, DRW, UPD, ABI-003 | planned |
| `Transformer` | Selection, bounds, resize, rotation, locking, snapping, history | TRN-001~003, INT-004 | planned |
| `State` | Subclassable state with handled events and lifecycle | ABI-003, independent state tests | verified |
| `PROPAGATE_EVENT` | Passes an input event to the next stacked state | independent state tests | verified |
| `Command` | Subclassable command with ID, `execute`, and `undo` | HIS-001~002, ABI-003 | implemented |
| `UndoRedoManager` | Limit, execute/undo/redo/clear/destroy, events, grouping | HIS-001~002 | implemented |
| `selector` | Standalone public JSONPath resolver | independent selector tests | verified |
| `convertLegacyData` | Public legacy-map conversion helper | independent helper tests; details pending oracle | planned |
| `findIntersectObject` | Public intersection lookup helper | independent helper tests; details pending oracle | planned |
| `isMoved` | Public pointer-movement helper | independent helper tests; details pending oracle | planned |
| `intersectPoint` | Public point intersection helper | independent helper tests; details pending oracle | planned |
| `uid` | Public generated-ID helper | independent helper tests; exact contract pending oracle | verified |

## Patchmap surface

| Surface | Required observations | Evidence | Status |
| --- | --- | --- | --- |
| Construction/properties | Pre/post-init public state, materialized theme, transformer replacement, history recreation | LIF-001~002, ABI-001 | implemented |
| `init` / `destroy` | Async idempotence, event readiness, DOM/resource cleanup, re-init | LIF-001~002, MEM-001 | implemented |
| `draw` | Validation transaction, input immutability, defaults, replacement, async coalescing | DRW-001~006 | verified |
| `update` | Direct/path targeting, merge/replace, refresh, relative/center transform, history, silent immediate update | UPD-001~006, HIS-002 | implemented |
| `selector` | Root/direct/recursive traversal, filters, boolean/string expressions, projections, live refs | SEL-001~002, ABI-001 | verified |
| `focus` / `fit` | Default/explicit/relation targets, pruning, center/zoom, axis padding validation | VIE-001~003 | planned |
| `event` | Canvas/world paths, action lifecycle, enabled state, draw/destroy cleanup | EVT-001~002 | planned |
| `rotation` / `flip` | Controller state, events, geometry, fit/focus and upright content | VIE-003 | planned |
| `stateManager` / selection | Stack/modifier lifecycle, click variants, drag modes, units, filtering, callbacks | INT-001~004, ABI-003 | planned |
| `transformer` | Assignment cleanup, selection payload, resize/rotate gestures and history | TRN-001~003 | planned |
| `undoRedoManager` | Command limit and state/event transitions | HIS-001~002 | planned |

## Data and rendering

| Contract family | Required coverage | Evidence | Status |
| --- | --- | --- | --- |
| Seven element kinds | `group`, `grid`, `item`, `relations`, `image`, `text`, `rect`; defaults and live handles | DRW-001~003, ABI-001 | implemented |
| Four component kinds | `background`, `bar`, `icon`, `text`; defaults, placement, sizing, matching | DRW-001, UPD-002 | verified |
| Grid materialization | Cell IDs/labels/geometry and destroy/hide inactive strategies | DRW-002 | verified |
| Primitive normalization | Size, gap, margin, padding, placement, color/theme lookup | independent data contract tests | implemented |
| Assets | Alias, URL, inline descriptors, rectangle textures, stale async protection | AST-001~002 | planned |
| Observable scene facade | Parent/children, identity/type/props/transforms/dimensions/visibility/bounds/destroyed | ABI-001 | implemented |
| Rendering invariants | Geometry, text, stacking, visibility, pixels within approved tolerance | DRW-001~002 and independent visual tests | implemented |

## Cross-cutting gates

| Gate | Evidence | Status |
| --- | --- | --- |
| Fourteen approved oracle fixtures | LIF-001~002, DRW-001~006, UPD-001~006 | verified |
| Fresh-run determinism | Repeat normalized fixture runs in new browser sessions | verified |
| Input/reference/event/error edge cases | Independent contract suite | implemented |
| Build/typecheck/lint/unit | Package scripts | verified |
| ESM/CommonJS/UMD and packed consumer | `npm pack` plus isolated consumer | planned |
| Dependency audit and clean-room safety | `npm audit`, manifest/evidence invariants, forbidden-material scan | planned |
| Memory lifecycle | MEM-001 and retained-heap trend | planned |
| Native and Chromium 4x scaling | 100/500/1,000/2,000/5,000 items, 2 warmups, 7 samples | planned |

The 14 approved fixtures are necessary but do not prove full public API coverage. Every row above must reach `verified`, or an unresolved observable gap must be reported to the oracle owner and remain explicitly incomplete.
