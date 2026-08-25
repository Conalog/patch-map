# Updates and Animation

These scenarios define state transitions without prescribing a PatchMap method or
transaction shape. Every accepted change must update the dataset-facing state and
the next published PixiJS frame consistently.

## UPD-001 — Resolve the Current Stable Logical Target

- **Goal:** Change the intended object after any number of prior updates or scene
  replacements.
- **Setup:** Load a scene with persisted IDs, retain one older query result, and then
  replace the scene with new materialized objects that reuse some IDs.
- **Action:** Target an element by its scene-global ID or a component by owning item ID
  plus component ID, and separately try the stale result.
- **Result:** The logical target resolves to the current object. A stale result never
  aliases a different object and yields an explicit stale or missing result.
- **Lab:** `update/stable-id` shows current revision, logical target, stale outcome, and
  before/after state.

## UPD-002 — Merge a Partial Change

- **Goal:** Change only requested fields.
- **Setup:** Use nested elements and components with geometry, style, text, assets,
  metadata, and sibling properties.
- **Action:** Apply a partial change to one or many targets.
- **Result:** Requested fields change; all unmentioned fields and siblings retain
  their previous semantic values. The caller's patch object remains unchanged.
- **Edge:** An empty patch is a no-op and does not publish a false change.
- **Lab:** `update/partial-merge` offers one-field, nested-field, and multi-target
  buttons and displays a compact semantic diff.

## UPD-003 — Replace a Target

- **Goal:** Replace the editable data of an existing logical target.
- **Action:** Replace its element or component data while preserving the target ID;
  identity change is modeled explicitly as remove+add in one transaction.
- **Result:** Removed fields return to schema defaults or absence; supplied fields
  materialize exactly once; the latest hierarchy, bounds, hit target, and query
  result agree.
- **Edge:** A schema-valid same-scope discriminator change is accepted atomically as a
  new kind under the preserved ID; an invalid kind or cross-scope replacement fails
  atomically.
- **Lab:** `update/replace` compares merge and replace side by side.

## UPD-004 — Change Geometry Around an Origin

- **Goal:** Move, resize, or rotate without unexpected visual jumps.
- **Action:** Apply absolute and relative position, size, and angle changes; repeat
  with the visible center as the requested origin.
- **Result:** Absolute changes reach the supplied values. Relative changes compose
  from current state. Center-origin changes preserve the visible center while bounds,
  descendants, relations, selection outlines, and hit testing refresh together.
- **Lab:** `update/geometry-origin` overlays old/new bounds and center markers.

## UPD-005 — Publish State Now and Pixels on the Next Frame

- **Goal:** Read the new state immediately without requiring synchronous raster work.
- **Action:** Update visible geometry, text, color, or hierarchy.
- **Result:** The returned/current public state is changed before the action returns;
  the next native frame reflects the same revision. The change notification occurs
  after semantic application and identifies the changed targets.
- **Raster:** Headless macOS pixels are environment-qualified. A black or otherwise
  platform-specific frame is not a normative target.
- **Lab:** `update/publication-boundary` shows return-time state, event order, and the
  next-frame revision separately.

## UPD-006 — Missing and Empty Target Sets

- **Goal:** Keep high-frequency host updates safe when a target was removed.
- **Action:** Update one missing ID, a mixed existing/missing set, and an empty set.
- **Result:** No unrelated target changes. The outcome reports applied, missing, and
  unchanged targets deterministically. The chosen strict or permissive policy is
  declared by the action rather than inferred from target count.
- **Lab:** `update/missing-targets` exposes strict and permissive modes.

## UPD-007 — Atomic Bulk Update

- **Goal:** Change a large logical overlay as one user-visible revision.
- **Setup:** Use 100, 500, 1,000, 2,000, and 5,000 materialized objects.
- **Action:** Change bar values, text, tint, visibility, item dimensions, and padding
  across a representative subset.
- **Result:** No intermediate mixture is published. Query, event, relation, selection,
  and render state all refer to the same final revision. One action can be one history
  unit.
- **Failure:** If any strict operation is invalid, the entire transaction leaves the
  previous scene intact.
- **Lab:** `update/bulk-overlay` animates repeated random overlays and reports work
  time, maximum frame gap, changed count, and revision count.

## UPD-008 — Reconcile Component Collections

- **Goal:** Add, remove, reorder, merge, or replace item components.
- **Action:** Change background, bar, icon, and text component lists using stable
  owner-local component IDs where present.
- **Result:** Component order, unique-component rules, live identity where promised,
  geometry, and visibility match the new dataset. Removed components release their
  PixiJS resources and stop receiving events. Hidden retained components stay logical
  and queryable without a render object and rematerialize under the same owner/ID.
- **Lab:** `update/components` provides add/remove/reorder/replace controls for all four
  component kinds.

## UPD-009 — Rebuild Nested Structure Without Stale State

- **Goal:** Change group children, grid rows/columns/cells/gaps, and parent placement.
- **Action:** Perform structural updates, group/ungroup, and move objects across parents.
- **Result:** Hierarchy and display order are deterministic; group/ungroup preserves
  world geometry, relations, scene order, selection, host companion state, and one
  history action; cycles are rejected;
  stable IDs resolve to their new current objects; selection and editor state rebind
  when that ID still exists and clear when it was removed. Old descendants cannot be
  hit or queried.
- **Lab:** `update/structure` covers grid rebuild, cross-parent move, order change, and
  cycle rejection.

## UPD-010 — Refresh Relation Geometry

- **Goal:** Keep relation paths attached to current endpoints.
- **Action:** Move, resize, rotate, replace, hide, remove, or animate an endpoint; then
  change the relation link/style itself.
- **Result:** Only affected relation geometry is refreshed, with no stale segment at
  the old endpoint. Missing endpoints follow the declared validation/fallback policy
  and never connect to an unrelated object. Hidden retained cells suppress their
  segments until shown. Self-links are finite; duplicate ordered pairs keep the first
  authored link while reverse pairs remain distinct.
- **Lab:** `update/relations` animates endpoints and shows the relation bounds and hit
  target on every frame.

## UPD-011 — Latest Asynchronous Result Wins

- **Goal:** Prevent slow data or asset work from overwriting newer state.
- **Action:** Start delayed A, then B and C; complete them in a different order and
  destroy or replace the scene before one completion.
- **Result:** Only the latest active revision may publish. Superseded and post-destroy
  completions release temporary resources and produce no event or frame.
- **Lab:** `update/stale-async` has deterministic delay and completion-order controls.

## UPD-012 — Host-Defined Highlight and Visibility

- **Goal:** Apply dashboard/report presentation policies without changing persisted
  data.
- **Action:** Highlight empty, single, and multiple ID sets; hide/show relations or
  other host-selected layers.
- **Result:** Highlighted targets use full emphasis and non-highlighted targets use
  the requested de-emphasis. Clearing the policy restores normal presentation.
  Persisted relation links and element data remain unchanged.
- **Lab:** `update/highlight-visibility` repeats the policy across redraw.

## ANI-001 — Animated Bar Value and Height

- **Goal:** See bars transition rather than jump when the dataset enables animation.
- **Setup:** Use randomly generated bar values, dimensions, placement, min/max, and
  colors; animation is enabled with a declared duration.
- **Action:** Press **Bar height update** repeatedly.
- **Result:** Every targeted bar interpolates from its current visible value to the
  new random value with `easeOutCubic` over the dataset duration, default `200ms`.
  Geometry remains within its track, final state at `t >= duration` is exact, one settled
  outcome is emitted, and a newer update continues from the current visible state
  without a backward jump.
- **Edge:** Zero-duration or disabled animation publishes the final state immediately.
- **Lab:** `animation/bar-height` reports requested duration, actual completion,
  maximum frame gap, interrupted count, and final-value assertions.

## ANI-002 — Deterministic Animation Time

- **Goal:** Make animation testable and independent of frame rate.
- **Action:** Advance the same animation with equivalent monotonic timestamps under
  different frame schedules.
- **Result:** The same timestamp yields the same semantic value. Time never moves
  backward; completion removes active work; destroy cancels all future publication.
- **Lab:** `animation/deterministic-time` provides 60 Hz, sparse, and manual-step modes.

## ANI-003 — Animation, History, and Replacement Boundary

- **Goal:** Keep transient motion from corrupting editable state.
- **Action:** Start animations, perform an explicitly history-recorded data change,
  then undo/redo, replace the scene, and destroy it.
- **Result:** Destination dataset state is committed immediately; animation scheduling
  and intermediate presentation are not separate history. Undo/redo restores declared
  dataset destinations exactly; replacement and destroy cancel old presentation work
  and callbacks. Presentation uses `easeOutCubic`, dataset duration/default `200ms`,
  current-visible retargeting, bounded track geometry, and exact terminal destination.
- **Lab:** `animation/history-lifecycle` exposes active animation and history depth.

## UPD-013 — Rapid Live Overlay

- **Goal:** Continuously project latest, historical, registry, or command status.
- **Action:** Send 30–60 Hz revisions that change text, bars, tints, icons, visibility,
  size, and padding.
- **Result:** The final visual and semantic state equals the newest payload. Work may
  be coalesced, but accepted revisions preserve ordering guarantees. Semantic events
  may identify `publication: pending`; only publication events claim the represented
  tuple is visible, following `engine-boundary.md` exactly.
- **Lab:** `runtime/live-overlay` cycles loading, no-device, no-data, connectivity, and
  command states with random values.

## UPD-014 — Force a Semantic Refresh

- **Goal:** Re-run asset, text layout, bounds, relation, and render invalidation when
  accepted data values are unchanged but an external dependency changed.
- **Action:** Request a refresh for selected or all current targets without changing
  their dataset snapshot.
- **Result:** Dependent semantic geometry and the next frame recompute exactly once;
  stable IDs, data values, selection, and history remain unchanged unless the host
  explicitly records the refresh. A missing target follows UPD-006.
- **Lab:** `update/force-refresh` swaps a font/asset measurement fixture, requests
  refresh, and verifies bounds, relations, and revision without a false data diff.
