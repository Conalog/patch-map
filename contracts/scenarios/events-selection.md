# Events, Queries, and Selection

PatchMap may expose a new event and selection API. It must nevertheless let a host
express every flow below and observe the declared ordering and logical targets.

## EVT-001 — Pointer Callback Ordering

- **Goal:** Distinguish click from drag without duplicate callbacks.
- **Action:** Perform a stationary primary click, a threshold-crossing drag, a
  secondary click, and a touch tap.
- **Result:** A click orders down, up, then click. A drag orders down, drag-start once,
  zero or more drag updates, then drag-end once and emits no up/click. Right-click and
  tap each produce one logical completion. Payloads include logical target or null,
  global/screen position, modifiers, button, pointer identity/type, and click count.
- **Environment:** Mouse, precision trackpad, touch, pen, multi-pointer transitions,
  wheel delta modes/phases, Ctrl-click, browser/page zoom, CSS host transforms, scrolling,
  DPR changes, and pointer capture use one logical-action/coordinate normalization
  matrix. Mouse, precision trackpad, and keyboard are mandatory. Touch, pen, and
  multi-pointer require real capable Windows-device evidence for each release cell;
  simulated events cannot approve them.
- **Lab:** `events/pointer-order` prints a short ordered trace with duplicate detection.

## EVT-002 — Click, Double-Click, and Repeated Click

- **Goal:** Use single and double click as distinct user actions.
- **Action:** Click once, twice, and three or more times on nested and empty regions.
- **Result:** Count 1 emits exactly one `single`, count 2 exactly one `double`, and count
  3 or greater exactly one generic `multi-click` callback with the actual count. Empty
  space uses the same rule with a null target. A sequence continues only for the same
  logical target, compatible pointer/button, within 500ms and four CSS pixels; otherwise
  count resets. Native click/tap/PixiJS aliases for one physical gesture are deduplicated.
- **Lab:** `events/click-count` displays the selected depth and callback counts.

## EVT-003 — Hover and Pointer Exit

- **Goal:** Show the correct tooltip/highlight target.
- **Action:** Enter targets, move between overlapping targets and empty space, begin a
  drag, leave the canvas, and return.
- **Result:** Hover identifies the highest eligible visible target or null. Press/drag
  suppresses hover where configured. Leave clears transient hover, tooltip, and cursor
  state; no stale callback appears after redraw or destroy.
- **Lab:** `events/hover-exit` includes corner tooltip clamping and pinned/unpinned host
  examples.

## EVT-004 — Interrupt Any Pointer Gesture

- **Goal:** Recover from browser and device interruptions.
- **Action:** Interrupt click, box, paint, pan, move, resize, and rotate using
  pointer-cancel, pointer-up-outside, lost capture, canvas leave, window blur, redraw,
  and destroy.
- **Result:** Pointer-up, including outside, commits an owned valid gesture exactly
  once. Escape, explicit/pointer cancel, lost capture, window blur, redraw, or target
  selection/lock change restores the gesture start state and creates no history.
  Replacement/destroy terminates old ownership without stale completion. Temporary
  overlays, auto-pan, capture, listeners, and modifiers are always released.
- **Lab:** `events/gesture-interrupt` exposes every termination reason.

## EVT-005 — Bind Host Events to Surface or Logical Targets

- **Goal:** Let a consumer attach events without depending on a PixiJS object graph.
- **Action:** Bind one or several event actions to the empty canvas surface, stable IDs,
  or a current query result, then enable, disable, re-enable, and dispose them.
- **Result:** The surface can receive empty-space input and target bindings receive the
  intended logical events. Re-enable never duplicates callbacks. Disposal is
  idempotent and redraw/destroy cannot leave old bindings active.
- **Edge:** If direct and queried targets overlap, delivery is exactly once per logical
  target/action regardless of binding multiplicity.
- **Lab:** `events/bindings` shows active binding and callback counts.

## EVT-006 — Event Propagation and Host Isolation

- **Goal:** Compose canvas, selection, transformer, and application interactions.
- **Action:** Trigger a child event that may bubble to the surface; stop it at each
  layer; focus an external input and use browser shortcuts.
- **Result:** Logical delivery is capture → target → bubble with stable currentTarget,
  target, phase, composed path, revision, and deterministic stop/immediate-stop.
  Transformer handles do not also start canvas selection. Map-owned shortcuts do not
  steal input, textarea, select, contenteditable, an editable target inside an open
  shadow-root path, browser navigation, or unrelated host actions; an iframe document
  owns its keyboard events.
- **Lab:** `events/propagation-focus` combines a canvas with editable host controls.

## EVT-007 — State Stack and Temporary Interaction Mode

- **Goal:** Switch between select, pan, relation paint, text edit, and other modes.
- **Action:** Replace, push, pop, pause, resume, and temporarily override an interaction
  mode with a modifier.
- **Result:** Lifecycle ordering is reset/exit before enter; only the active state owns
  input unless it explicitly propagates. Empty pop and unknown state are safe,
  observable outcomes. Cancel, blur, and destroy restore the normal mode.
- **Lab:** `events/state-modes` shows the active stack and one concise event trace.

## EVT-008 — Suppress Click After Movement or View Change

- **Goal:** Prevent a pan/zoom gesture from becoming an accidental selection.
- **Action:** Press on a target, then either move more than four screen pixels, pan or
  zoom the viewport while the pointer stays still, or release without either change.
- **Result:** Movement threshold and any viewport transform after pointer-down suppress
  the completion click/right-click. The threshold remains approximately four screen
  pixels at every zoom. A truly stationary unchanged-view action completes normally.
  The canvas suppresses the native context menu only for owned canvas secondary-click
  interaction.
- **Lab:** `events/click-suppression` shows pointer delta, view revision, and callback
  counts under several zoom levels.

## EVT-009 — Observe Specific and General Events

- **Goal:** Let a host observe one event type and an entire event family without API
  coupling.
- **Action:** Subscribe to a specific lifecycle/state/history/transform event and to a
  general observer for its family, then trigger the event.
- **Result:** The specific observer runs first and the family observer second. The
  specific payload contains the action's semantic data and source; the family payload
  additionally identifies family and concrete type. Non-record payloads remain usable
  without unsafe field injection.
- **Lab:** `events/specific-and-general` shows exact callback order and normalized
  payloads.

Host callbacks that throw, unsubscribe, re-enter, or destroy are governed by OPS-002
and the event/reentrancy rules in `engine-boundary.md`; local family ordering alone is
not sufficient evidence.

## QRY-001 — Query the Current Dataset Scene

- **Goal:** Find objects by ID, type, label, hierarchy, and host predicate.
- **Action:** Query top-level and recursive descendants, including components beneath
  elements.
- **Result:** Results are a deterministic flat logical list in scene order. The query
  root is the dataset scene rather than viewport/overlay objects. Exact ID/type/label
  and predicate equivalents are supported without exposing renderer internals. Element
  ID lookup is scene-global; component direct lookup requires owning item ID plus
  component ID, while a broad predicate may intentionally return same-ID components
  from different owners in scene order.
- **Lab:** `query/current-scene` offers representative saved queries and result IDs.

## QRY-002 — Reuse Query Results Safely

- **Goal:** Use found targets for update, event binding, selection, focus, or transform.
- **Action:** Reuse results in the same revision, then redraw and reuse the old result.
- **Result:** Same-revision use reaches the same logical targets. A result from another
  lifecycle generation or scene revision fails with exact `STALE_TARGET`; it never
  aliases a reused slot. Re-resolution is a separate explicit lookup by owner-qualified
  logical target and returns the current object or `MISSING_TARGET`.
- **Lab:** `query/result-lifetime` removes/replaces a target, proves the old handle is
  stale, then explicitly re-resolves the ID and displays both outcomes.

## SEL-001 — Point Selection Under View Transforms

- **Goal:** Select the same logical object after pan, zoom, rotation, or flip.
- **Action:** Click the same semantic position in each view.
- **Result:** Screen/world conversion produces the same target. Empty space produces
  null. Overlap chooses highest z-order, then the later rendered sibling. A relation
  path uses screen-space expansion `max(4 CSS px, visible stroke width / 2)` without
  changing its semantic geometry or multiplying the CSS radius by DPR.
- **Lab:** `selection/transformed-hit` draws the screen and world coordinates used.

## SEL-002 — Selection Unit and Drill-Down

- **Goal:** Select an entity, its grid, closest group, or highest group.
- **Action:** Change selection unit, click a deeply nested component, double-click to
  drill, and use the platform deep-select modifier.
- **Result:** Each mode resolves the declared ancestor; fallback is deterministic when
  that ancestor kind is absent. Drill-down reaches deeper eligible targets without
  changing visible hierarchy. Click count 3+ reaches only the generic `multi-click`
  host action; further drill behavior is host-chosen rather than an engine side effect.
- **Lab:** `selection/unit-drill` highlights the hit target and resolved unit.

## SEL-003 — Filtered and Locked Targets

- **Goal:** Prevent selection of prohibited or decorative objects.
- **Action:** Point, box, and paint-select targets rejected by a host predicate, locked
  directly, or nested below a locked ancestor.
- **Result:** Rejected/locked targets are absent from results. A selection overlay does
  not block targets beneath it. Filters receive stable logical data, not private Pixi
  nodes.
- **Lab:** `selection/filter-lock` toggles each constraint.

## SEL-004 — Replace, Add, Remove, Toggle, and Clear

- **Goal:** Keep canvas and external selection stores synchronized.
- **Action:** Replace the set, add unique IDs, remove present/missing IDs, toggle with a
  modifier, and clear from empty space or an external channel.
- **Result:** Selection is an ordered, duplicate-free stable-ID snapshot. Each change
  reports current, added, and removed sets after application. External missing IDs do
  not cause unrelated external state to be deleted.
- **Lab:** `selection/set-operations` provides both canvas and external controls.

## SEL-005 — Box Selection

- **Goal:** Select every eligible object intersecting a dragged rectangle.
- **Action:** Cross a screen-space movement threshold, drag across targets, then end,
  cancel, or leave.
- **Result:** Drag-start occurs once; the rectangle is visually stable across zoom and
  device-pixel ratio; partial intersection counts; results are duplicate-free. Live
  results are optional, but final results are exact. Interruption removes the box and
  transient state. Relation intersection uses the same screen-space expanded path as
  point selection.
- **Lab:** `selection/box` reports hit count and maximum frame gap while dragging.

## SEL-006 — Paint Selection

- **Goal:** Select targets along a freehand path.
- **Action:** Drag a path through nested, overlapping, filtered, and locked targets.
- **Result:** Each segment contributes newly entered eligible targets; results preserve
  first-entry order and contain no duplicates. Live callbacks occur only when the set
  changes; drag-end returns the full set. Relation intersection uses the same
  screen-space expanded path as point selection.
- **Lab:** `selection/paint` displays the path and ordered ID list.

## SEL-007 — Selection Visuals

- **Goal:** See exactly what will be transformed.
- **Action:** Select zero, one rotated target, multiple targets, and mixed eligible/
  ineligible targets; choose all, group-only, element-only, or hidden outline modes.
- **Result:** Empty selection removes visuals. A single rotated target uses an oriented
  frame; multiple targets use the union frame. Stroke and handle screen size remain
  stable across zoom/flip. Visible selected logical targets equal the semantic selection set or
  explicitly indicate the transformable subset.
- **Lab:** `selection/outlines` cycles every display mode and zoom level.

## SEL-008 — External Selection and Redraw

- **Goal:** Preserve product selection when data refreshes.
- **Action:** Select by canvas, update an external selected-ID channel, redraw with
  retained/missing IDs, and remount.
- **Result:** Canvas-to-host publication is one coherent set. Host-to-canvas selection
  resolves current targets. Redraw rebinds only explicit host-supplied IDs that still
  exist; without that input, engine-local selection clears. Missing targets never leave
  stale outlines or handles.
- **Lab:** `selection/external-redraw` shows the engine and host sets side by side.

## SEL-009 — Select Relation Endpoints

- **Goal:** Expand a selected relation into its current logical endpoint objects.
- **Action:** Select one or more relation records and request related-target selection,
  including duplicate, missing, removed, and replaced endpoint IDs.
- **Result:** Current unique endpoints are resolved by stable ID and combined with the
  selection according to replace/add/toggle policy. Missing/stale endpoints are omitted
  and never resolve to a reused target. Relation geometry and endpoint selection use
  the same source/target meaning.
- **Lab:** `selection/relation-endpoints` shows relation links, resolved IDs, and final
  selected set.
