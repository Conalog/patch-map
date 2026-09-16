# Pointer and selection

- Status: current
- Audience: package consumers and agents changing hover, tooltip, pointer gestures, or selection
- Source: `packages/javascript/src/engine/pointer-interaction-coordinator.ts`, `packages/javascript/src/pointer-gesture`, `packages/javascript/src/query-selection`

## Scope

This page owns root pointer projection, tooltip policy, point and box selection,
gesture arbitration, and selection paint. Viewport state and transform commands
are owned by [`viewport-and-transform.md`](viewport-and-transform.md).

## Contract

- PatchMap owns one root listener set, pointer capture, hit testing, coordinate
  conversion, gesture timing, and frame invalidation. Consumers receive detached
  logical targets and disposer-returning subscriptions, never renderer objects.
- `pointer.onHover()` publishes `hover`, `move`, and `leave` with stable target,
  CSS anchor, world position, pointer identity, and modifiers.
- `pointer.hoverDuringPress` defaults to `false`. When true, a target remains the
  hover projection during a press; real leave and cancel still clear it.
- `pointer.tooltip.pinOnContextMenu` defaults to false. When enabled, right-click
  emits a pinned tooltip; the next primary target click replaces and unpins it,
  and a blank click hides it. `preventDefault` defaults to true for a successful
  pin.
- Programmatic selection uses `set`, `add`, `remove`, `toggle`, and `clear`.
  `onChange()` observes every source. `onPointerChange()` observes only pointer
  commits and reports detached selected/added/removed targets without echoing
  programmatic calls.
- Shift point selection is multi-select when `allowMultiple` is not false.
  `resolveModifierSelection` may replace Ctrl/Command point-click semantics by
  returning the complete stable ID set for the same commit.
- `selection.box` is disabled by default. When enabled, primary drag owns the box;
  middle drag remains pan. `activationModifier` defaults to `none`, and
  `partialIntersection` defaults to true.
- Point-versus-drag uses an axis-aligned 4 CSS-pixel slop: exactly 4px is a click;
  an excursion beyond 4px activates the latched drag owner. Zoom, DPR, event
  cadence, and return movement do not alter that decision.
- `clearOnBlankClick` accepts `single`, `double`, or `never` and defaults to
  `single`. Target double-click deselection is separately opt-in and removes only
  a target selected before that modifier-free double click.
- Selection bounds are package-owned canvas paint. `displayMode` chooses `all`,
  `group-only`, `element-only`, or `hidden`; stroke alignment is `outside`,
  `center`, or `inside`. `strokeScale: viewport` shrinks from its 1x width to
  `minStrokeWidth`; fixed is the default. The transient box marquee has its own
  visual policy and otherwise inherits the selection color and width.

## Brush selection (npm and Dart)

Configure `selection.brush` at creation. The mode initially starts disabled.
Both packages expose `selection.brush.enable()`, `disable()`, `toggle()`,
`state` (`enabled`, `drawing`) and disposer-returning `onChange()`.
Dart returns `PatchMapBrushState` and `PatchMapBrushChange` objects.

```ts
selection: {
  brush: {
    longPress: { behavior: 'toggle', delayMs: 500 },
    operation: 'auto',
  },
}
```

- `longPress` defaults to `false`; enable the mode from application controls when
  no built-in trigger is wanted. A configured trigger starts on an eligible
  object with the primary pointer. `delayMs` must be positive and finite.
- `toggle` flips the current mode. Longpress ON → `disable()` → longpress ON
  works because there is one authoritative mode. `disable()` cancels a pending
  timer or current stroke, but does not remove the configured longpress trigger.
- `hold` temporarily enables brush and restores the previous mode on release or
  cancellation. Explicit API mode changes override that temporary restoration.
- With brush enabled, a primary drag beyond the existing 4px slop selects objects
  intersected by each new path segment. Without movement, an ordinary click
  retains point-selection behavior. A longpress that turns the mode OFF does not
  change selection. Starting a hold or toggling ON paints its eligible seed.
- `operation` is `auto` (default), `add`, or `remove`. Auto erases when the stroke
  starts on an already-selected object and adds otherwise. The operation stays
  fixed for that stroke; revisiting a target does not toggle it. Selections away
  from the path are preserved. Grid cells are selection units; components resolve
  to their owning element. Screen-space bounds determine path intersection,
  including after rotation. Hidden and locked objects and objects rejected by
  `isSelectable` are excluded.
- Brush requires select mode and `allowMultiple` other than `false`. It takes
  precedence over box selection, pan, and longpress tooltip for that pointer.
  Movement before a pending longpress cancels the timer and uses ordinary
  box/pan behavior if brush is disabled. A second pointer cancels brush and
  returns to the host's existing multi-pointer handling.
- Mode events contain `{state, source}` where source is `api`, `long-press`,
  `release`, or `cancel`; unchanged states do not emit. Selection changes use
  the existing selection subscriptions and pointer-change events.
- Each segment commits selection live. Cancel, lost capture, scene/camera
  invalidation, detach or destroy stops further painting; already committed
  selections remain. This differs from the box marquee, which commits at release.
  Timers and stroke indexes are released with the gesture; the mode itself stays
  enabled unless a temporary hold restores its prior mode or an API changes it.

## Failure semantics

- A throwing or invalid modifier resolver leaves selection unchanged.
- A target rejected by `isSelectable` cannot enter point or box selection. For
  point selection clearing it is treated as blank, while raw pointer hover and
  tooltip projection still report the hit target.
- Pointer cancel, lost capture, surface replacement, and destroy terminate the
  active gesture and transient paint. Box selection is not partially committed;
  brush retains segments already committed before cancellation.
- A disposer may be called once by the consumer; destroy removes any remaining
  subscriptions and root listeners.

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| coordinator lifecycle and dispatch order | `packages/javascript/src/engine/pointer-interaction-coordinator.ts` | `packages/javascript/tests/engine/pointer-interaction-coordinator.test.ts` |
| slop, capture, click/drag arbitration | `packages/javascript/src/pointer-gesture` | `packages/javascript/tests/semantic/pointer-gesture.test.ts` |
| logical selection and resolver behavior | `packages/javascript/src/query-selection` | `packages/javascript/tests/semantic/query-selection.test.ts` |
| root event integration | `packages/javascript/src/host-interaction/index.ts` | `packages/javascript/tests/integration/host-interaction.test.ts` |
| persistent and marquee paint bounds | `packages/javascript/src/rendering/pixi-renderer/interaction-overlay-authority.ts` | `packages/javascript/tests/semantic/selection-paint-bounds.test.ts` |

| brush mode, longpress, path selection and cancellation | `packages/javascript/src/engine/brush-mode-authority.ts`, `packages/flutter/lib/src/host/native_pointer.dart` | `packages/javascript/tests/engine/brush-selection.test.ts`, `packages/flutter/test/host/native_pointer_test.dart` |
