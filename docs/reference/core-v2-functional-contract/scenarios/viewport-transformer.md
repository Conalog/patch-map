# Viewport and Transformer

These scenarios require PixiJS-backed view and overlay behavior, but they do not
require the Original viewport or transformer API.

## VIE-001 — Pan, Wheel Zoom, Pinch, and Deceleration

- **Goal:** Navigate a large map smoothly.
- **Action:** Drag or middle-drag to pan, zoom at the cursor with wheel/pinch, and
  release a decelerating gesture.
- **Result:** The world root moves as one GPU transform; cursor-centered zoom keeps the
  cursor's world point fixed; scale stays within declared limits; hit testing uses the
  current transform. Host policy may enable or disable each gesture or require a
  modifier.
- **Lab:** `viewport/navigation` reports scale, center, frame gaps, and transformed hit.

## VIE-002 — Save and Restore a View

- **Goal:** Return to the same map area after remount.
- **Action:** Pan/zoom, wait for motion to settle, serialize center/scale, remount, and
  restore it.
- **Result:** Settled state is published once per completed motion and equivalent
  values are not redundantly saved. Finite valid state restores before auto-fit;
  invalid state falls back safely.
- **Lab:** `viewport/persist` compares before/after world points.

## VIE-003 — Focus Targets

- **Goal:** Center selected content without changing zoom.
- **Action:** Focus explicit IDs, a relation, a group, a grid, a filtered subtree, and
  the default scene target set.
- **Result:** The visible bounds center moves to viewport center and current scale is
  retained. Default focus uses top-level managed elements and excludes standalone image
  and relation elements. A group contributes eligible managed descendants rather than
  its container bounds; a grid contributes its whole bounds and is not descended into.
  The filter evaluates a container before descendants and a rejected container prunes
  its subtree. Repeated contributors are deduplicated. Explicit relation focus uses
  unique endpoint bounds when available and the relation's own finite bounds as
  fallback. No targets means no movement and an explicit empty result.
- **Lab:** `viewport/focus` overlays contributors and final center.

## VIE-004 — Fit Targets with Padding

- **Goal:** Show all requested content.
- **Action:** Fit the same target cases with zero, scalar, and per-axis padding.
- **Result:** Content is centered and scaled within the viewport; default padding is
  16 screen-space units on both axes. Rotation/flip and resize preserve finite positive
  scale and stable content coverage. It uses the same group/grid/filter/deduplication/
  relation-fallback contributor rules as VIE-003. Invalid options fail before moving
  the view.
- **Lab:** `viewport/fit` draws the padded viewport frame.

## VIE-005 — Rotate the World Around View Center

- **Goal:** Change map orientation without losing the current point of interest.
- **Action:** Set, add, and reset finite degree values, including negative and values
  above 360.
- **Result:** The semantic content at viewport center stays fixed, the resulting angle
  is observable, and resize re-centers around the new viewport center. Non-finite input
  leaves state unchanged.
- **Lab:** `viewport/world-rotation` verifies center invariance and transformed hit.

## VIE-006 — Flip the World Around View Center

- **Goal:** Mirror horizontal or vertical orientation.
- **Action:** Set/toggle/reset each axis and combine flip with rotation.
- **Result:** The center point stays fixed; both final axis states are observable;
  relation endpoints, focus/fit, text orientation, selection, and transformer geometry
  remain semantically correct.
- **Lab:** `viewport/world-flip` runs x, y, xy, and rotation combinations.

## VIE-007 — Resize the Host Surface

- **Goal:** Keep the map usable when its container changes size.
- **Action:** Resize repeatedly during idle, animation, pan, transform, and report
  capture.
- **Result:** Renderer resolution and CSS size match the host without duplicate canvas;
  the declared center/fit policy is applied once; no stale pointer transform or black
  frame persists.
- **Lab:** `viewport/resize` cycles fixed and responsive dimensions.

## VIE-008 — Viewport Gesture Policy and Cleanup

- **Goal:** Let dashboard and editor use different navigation policies.
- **Action:** Add/start/stop/remove pan, wheel, pinch, deceleration, or edge-pan policy;
  then cancel, redraw, destroy, and remount.
- **Result:** Disabled policies do no work; re-enable does not duplicate input. A
  temporary gesture restores the prior policy state exactly. Cleanup leaves no active
  ticker, listener, cursor, capture, or motion.
- **Lab:** `viewport/policy-cleanup` switches dashboard/editor presets.

## TRN-001 — Programmatic Transform Selection

- **Goal:** Set transform targets from canvas, sidebar, or external state.
- **Action:** Replace, add, remove, and clear stable IDs.
- **Result:** Targets are unique and current; selection change reports current/added/
  removed after application; overlay refresh occurs on the next frame. Redraw rebinds
  only explicit host-supplied IDs that still exist; otherwise selection clears.
- **Lab:** `transformer/targets` provides both canvas and external controls.

## TRN-002 — Handle Geometry and Hit Priority

- **Goal:** Grab the intended resize or rotate control.
- **Action:** Inspect and hit-test corner handles, edge strips, frame, and rotate zones
  on normal and rotated selections.
- **Result:** Four visible square corners and full-edge resize hit strips follow the
  selection frame. Corners win over edges and resize wins over overlapping rotate
  zones. Screen-space hit sizes and cursor direction remain usable across zoom/flip.
- **Lab:** `transformer/handles` visualizes hit regions on demand.

## TRN-003 — Transformable Subset

- **Goal:** Understand mixed selections.
- **Action:** Select resizable, rotatable, non-transformable, and locked targets.
- **Result:** The overlay makes the transformable subset unambiguous. Locked targets
  and locked descendants never mutate. Rotation supports grid, item, rect, image, and
  standalone text; relation and group do not rotate directly. Only standalone rect and
  image elements expose resize handles. An empty eligible subset has no active handle;
  ordinary schema-valid size transactions remain available independently.
- **Lab:** `transformer/mixed-selection` cycles all kinds and locks.

## TRN-004 — Eight-Direction Resize

- **Goal:** Resize one or many objects from every edge/corner.
- **Action:** Drag left/right/top/bottom and four corners on rect/image targets,
  including a rotated single target and mixed-size eligible multi-selection.
- **Result:** Opposite edge/corner anchors remain fixed; edge resize changes one axis;
  corner changes both; multi-target position/size follows one group scale; rotated
  single target follows its oriented axes. Minimum size is 1 and resulting dataset
  size uses integer units.
- **Lab:** `transformer/resize-eight` exposes eight focused controls plus direct drag.

## TRN-005 — Aspect-Ratio Resize

- **Goal:** Preserve proportions when requested.
- **Action:** Resize eligible rect/image targets with Shift, an always-lock option, and
  a host predicate; toggle Shift during the gesture.
- **Result:** Corner and edge behavior preserve the starting selection-frame ratio.
  Edge ratio resize expands/contracts the other axis symmetrically. Releasing the
  temporary modifier recomputes from the same current pointer without drift.
- **Lab:** `transformer/resize-ratio` shows ratio and anchor invariants.

## TRN-006 — Group Rotation

- **Goal:** Rotate one or multiple eligible objects around a visible center.
- **Action:** Rotate a single target and mixed multi-selection through ordinary and
  0/360-crossing paths.
- **Result:** Eligible objects orbit the selection center and add the same angular
  delta to their own orientation. Single selection uses an oriented frame; multi uses
  an axis-aligned union. For mixed selection, locked and non-rotatable selected objects
  contribute to the visible frame and rotation center but do not mutate; only unlocked
  grid/item/rect/image/text targets orbit and rotate. Positions are written in the
  correct parent coordinate space while visible centers remain consistent.
- **Lab:** `transformer/rotate` overlays centers and before/after angles.

## TRN-007 — Rotation Snap

- **Goal:** Align rotation precisely.
- **Action:** Press and release Shift while rotating.
- **Result:** The final object angle—not merely raw pointer delta—snaps to 15-degree
  increments. Releasing Shift restores the unsnapped result at the same pointer;
  crossing 0/360 uses the shortest continuous delta.
- **Lab:** `transformer/rotate-snap` reports pointer, raw, and applied angles.

## TRN-008 — Move and Keyboard Nudge

- **Goal:** Reposition selected editable objects.
- **Action:** Drag in world coordinates, Shift-lock to the first dominant axis, and use
  Arrow or Shift+Arrow repeatedly.
- **Result:** Drag and nudge write integer deltas; Arrow moves 1 unit and Shift+Arrow
  10. Non-movable mixed selections do not partially move. Transformer visuals hide or
  follow without lag and edge auto-pan preserves world-coordinate accuracy.
- **Lab:** `transformer/move-nudge` measures pointer-to-frame latency.

## TRN-009 — Gesture Completion and History

- **Goal:** Treat one human gesture as one reversible edit.
- **Action:** Produce many pointer moves in resize, rotate, or move; end normally or
  outside, or interrupt by Escape/cancel, lost capture, blur, redraw, selection/lock
  change, replacement, or destroy.
- **Result:** Normal pointer-up, including outside, commits once and creates one history
  action. Escape/cancel/lost-capture/blur/redraw/selection-or-lock change restores the
  start state and creates none. Replacement/destroy permits no stale completion. Undo/
  redo restores exact committed geometry and selection. Temporary edge-pan always
  returns to its pre-gesture state.
- **Lab:** `transformer/gesture-history` shows mutation count versus history depth.

## TRN-010 — Prevent Gesture Cross-Talk

- **Goal:** Avoid selection, pan, tooltip, or context-menu actions during transform.
- **Action:** Start a handle gesture above an otherwise selectable target and move out
  of the canvas.
- **Result:** Transformer input does not also initiate canvas click, box select, pan,
  hover, or right-click. Normal interactions resume immediately after completion.
- **Lab:** `transformer/cross-talk` counts each interaction family.
