# PatchMap Consumer Journeys

These are release-blocking product journeys. They describe what a user must be able
to accomplish; plant-domain calculation, persistence, routing, dialogs, and server
commands remain host responsibilities. PatchMap supplies the mapped engine capability.

Every row is one independently runnable Lab case. A row is not complete merely because
its lower-level capability tests pass.

Each CSM case also owns a host/engine seam fixture. The fixture lists host-supplied
dataset/envelope/predicate/ID/cascade or reversible companion state; the engine-owned
transaction/view/selection/gesture/history transition; screen/world geometry and
diagnostic output returned to host DOM UI; callback/failure/atomic-recovery ownership; and the
final canonical export plus selected/mode state. This is mandatory for creation,
grid/relation/text editing, hierarchy, duplication, clipboard, delete, compound
history, save, tooltip, context-menu, and extraction journeys. A row remains prose-only
until this seam fixture and normalized observation exist.

## Shared Runtime

| ID | User scenario and observable outcome | PatchMap capability | Lab case |
| --- | --- | --- | --- |
| CSM-001 | Enter a map screen; loading yields to exactly one complete, immutable scene with the full dataset hierarchy. | LIF-001/002, DAT-001/002 | `consumer/first-draw` |
| CSM-002 | Change blueprint/date; the old scene is replaced and no stale hit, selection, tooltip, relation, or update target remains. | LIF-003, UPD-001/009 | `consumer/scene-replacement` |
| CSM-003 | Distinguish loading, no blueprint, and an empty dataset; empty scene operations remain safe. | LIF-002, ERR-002 | `consumer/empty-states` |
| CSM-004 | Recover from base/overlay failure while preserving the last complete scene and rejecting stale asynchronous completion. | UPD-011, ERR-005 | `consumer/error-recovery` |
| CSM-005 | Apply a partial update to a persisted panel/inverter/ESS/relation ID after redraw. | UPD-001/002/006 | `consumer/stable-update` |
| CSM-006 | Project live/historical/registry/command states into bars, text, tint, icon, visibility, size, and padding without rebuilding the full scene. | UPD-007/008/013 | `consumer/live-overlay` |
| CSM-007 | Receive rapid revisions; only the newest accepted state is visible and destroy prevents late publication. | UPD-011/013 | `consumer/rapid-refresh` |
| CSM-008 | Highlight an ID set or hide relations for a view/report without modifying persisted links/data. | UPD-012 | `consumer/highlight-relations` |

## Dashboard

| ID | User scenario and observable outcome | PatchMap capability | Lab case |
| --- | --- | --- | --- |
| CSM-009 | Open a map at auto-fit or restore a valid saved center/scale; invalid saved state falls back safely. Auto-fit follows VIE-003/004 contributor rules and excludes standalone images from its default target set. | VIE-002/003/004 | `consumer/dashboard-hydrate` |
| CSM-010 | Pan, modifier-wheel/button zoom, fit, settle, save, and remount without frame freeze or duplicate persistence. | VIE-001/002/004/008, PRF-006 | `consumer/dashboard-navigation` |
| CSM-011 | Single-select, Shift-toggle, related-target select, box-select, filter targets, and clear from empty space. | SEL-001/003/004/005/009, QRY-001, REN-007 | `consumer/dashboard-selection` |
| CSM-012 | Synchronize external selected/highlight IDs with current canvas targets in both directions and across redraw. | SEL-004/008 | `consumer/dashboard-external-selection` |
| CSM-013 | Hover a panel/inverter/edge/ESS, position the host tooltip within the viewport, pin/unpin it with secondary click, and clean it on drag/redraw/destroy. | EVT-001/003/005, SEL-001 | `consumer/dashboard-tooltip` |
| CSM-014 | Switch chart/percent/number and representative data columns; text, bar, tint, and visibility update immediately and persist across remount. | UPD-007/008/013 | `consumer/dashboard-view-column` |
| CSM-015 | Use map input beside editable host UI; Shift pointer state works even if keydown was missed, cancellation resets it, and unrelated shortcuts survive. | EVT-004/006/007 | `consumer/dashboard-focus-shortcuts` |
| CSM-016 | Freeze selected device IDs as a command target, then show host-computed pending/active/released status without retargeting an open action. | SEL-004, UPD-013, DET-004 | `consumer/dashboard-command-target` |
| CSM-017 | Navigate away and back; old listener, animation, gesture, canvas, and hotkey state cannot affect the next screen. | VIE-008, PRF-007 | `consumer/dashboard-navigation-cleanup` |

## Editor

| ID | User scenario and observable outcome | PatchMap capability | Lab case |
| --- | --- | --- | --- |
| CSM-018 | Enter an editable session with a complete scene, hidden inactive cells, selection mode, navigation, edge-pan, and transformer; blocked plants show no canvas. | LIF-001/002, EVT-007, VIE-008 | `consumer/editor-session` |
| CSM-019 | Create each supported element at viewport center with unique descendant/component IDs; selection/mode and history are one action. | DAT-001/008, HIS-003/006 | `consumer/editor-create` |
| CSM-020 | Use click, Shift, box, drill-down, right-click, locked filtering, and blank-space behavior to choose editable targets and open a context menu. | EVT-001/002, SEL-002–006 | `consumer/editor-canvas-selection` |
| CSM-021 | Keep layer/wiring sidebar selection, range, lock, rename, reveal, and blank-space rules synchronized with the canvas. | SEL-004/008, TRN-003 | `consumer/editor-sidebar-selection` |
| CSM-022 | Drag or nudge movable targets with integer deltas, axis lock, edge auto-pan, and one history step; mixed non-movable sets do not partially move. | TRN-008/009 | `consumer/editor-move` |
| CSM-023 | Resize from eight directions and rotate, with ratio/snap modifiers, immediate visuals, interruption recovery, and one undo/redo step. | TRN-002–007/009/010 | `consumer/editor-transformer` |
| CSM-024 | Use middle, Space, or move-tool pan and modifier wheel zoom; transformed hit testing stays exact and temporary policy cleans up. | VIE-001/008, SEL-001 | `consumer/editor-navigation` |
| CSM-025 | Enter grid edit, reveal/select inactive cells, change rows/columns/gaps, enable/disable eligible cells, reject linked-cell disable, exit, and undo. | DAT-005, UPD-009, HIS-006 | `consumer/editor-grid` |
| CSM-026 | Enter relation edit and add/remove/paint stable endpoint IDs, reject conflicts, delete an empty relation on exit, and preserve results through redraw/undo. | UPD-010, SEL-006, HIS-006 | `consumer/editor-relation` |
| CSM-027 | Edit or create multiline text in a viewport-following overlay, preserve style/geometry, recover a replaced target by ID, ignore no-change, delete empty, or cancel. | REN-006/011, UPD-001/002, HIS-006 | `consumer/editor-text` |
| CSM-028 | Edit x/y/angle, align multiple targets, and distribute three or more mixed-size targets deterministically and idempotently. | UPD-004/007, HIS-003 | `consumer/editor-position-distribute` |
| CSM-029 | Edit size/ratio, alpha, fill, stroke, corner radius, and advanced text styles; reject invalid values without partial state. | REN-004/006/011, UPD-002, ERR-001 | `consumer/editor-style` |
| CSM-030 | Move targets inside/before/after parents and through z-order while preserving relative order, rejecting cycles, and restoring selection by ID. | UPD-009, SEL-008, HIS-006 | `consumer/editor-hierarchy` |
| CSM-031 | Group/ungroup as atomic Core actions and duplicate/copy-paste trees with new IDs, rewritten internal references, preserved external references, offset, selection, and one history step. | DAT-008, UPD-009/010, HIS-006 | `consumer/editor-duplicate` |
| CSM-032 | Paste external text with line endings intact or paste/drop one or many images; host compression/decode failure is isolated and active editors/outside drops are not stolen. | AST-001–003, EVT-006, ERR-003 | `consumer/editor-clipboard-assets` |
| CSM-033 | Delete selected data only after host cascade confirmation; relation/parent-linked targets update, active edit exits, registry loading is safe, and undo restores the complete action. | UPD-009/010, HIS-006 | `consumer/editor-delete` |
| CSM-034 | Undo/redo every editor mutation as one human action, restoring selection/mode/transform targets and host-staged metadata by current ID. | HIS-001–006 | `consumer/editor-history` |
| CSM-035 | Export deterministic schema-valid current state for host validation/upload/save, excluding transient overlays and renderer state; retry cannot duplicate scene mutation. | DET-004, ERR-005 | `consumer/editor-save-snapshot` |
| CSM-036 | Leave or remount an editor; host guards navigation while PatchMap removes every canvas, texture, ticker, listener, observer, gesture, and hotkey scope. | ERR-006, PRF-007 | `consumer/editor-cleanup` |

## Report

| ID | User scenario and observable outcome | PatchMap capability | Lab case |
| --- | --- | --- | --- |
| CSM-037 | Switch report dates, replace the scene, hide relation presentation, apply host-computed panel colors, and fit the result. | LIF-003, UPD-007/012, VIE-004 | `consumer/report-date-performance` |
| CSM-038 | Extract the current PixiJS scene at the canvas visual size, temporarily show the image, restore the same canvas, and repeat without stale/black frames or leaks. | PIX-004, PRF-008, ERR-003 | `consumer/report-extract` |

## Host Boundary

PatchMap must not hardcode plant wiring, registry/latest/time-series merge rules,
interpolation, device/command eligibility, tooltip content, editor forms, save order,
navigation, dialogs, storage keys, or dashboard layout persistence. The host supplies
datasets, stable IDs, update payloads, predicates, companion history state, and event
callbacks. PatchMap guarantees deterministic execution, rendering, interaction,
snapshot/export, PixiJS extraction, and cleanup.

The production integration gate installs the packed artifact in the real host adapter
and executes all 38 rows. A mock host remains a pull-request aid and cannot substitute
for this digest-bound integration result. Save guards and release qualification follow
`production-readiness.md`.

All consumer product choices and seam contract records are resolved. The production
fixture digest/counts and canonical group/ungroup/history expectations are frozen.
Packed-host execution of every journey remains integration evidence, not permission to
change the decided behavior.
