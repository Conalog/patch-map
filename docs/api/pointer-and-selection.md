# Pointer and selection

- Status: current
- Audience: package consumers and agents changing hover, tooltip, pointer gestures, or selection
- Source: `src/engine/pointer-interaction-coordinator.ts`, `src/pointer-gesture`, `src/query-selection`

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

## Failure semantics

- A throwing or invalid modifier resolver leaves selection unchanged.
- A target rejected by `isSelectable` cannot enter point or box selection.
- Pointer cancel, lost capture, surface replacement, and destroy terminate the
  active gesture and transient paint without publishing a partial selection.
- A disposer may be called once by the consumer; destroy removes any remaining
  subscriptions and root listeners.

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| coordinator lifecycle and dispatch order | `src/engine/pointer-interaction-coordinator.ts` | `tests/engine/pointer-interaction-coordinator.test.ts` |
| slop, capture, click/drag arbitration | `src/pointer-gesture` | `tests/semantic/pointer-gesture.test.ts` |
| logical selection and resolver behavior | `src/query-selection` | `tests/semantic/query-selection.test.ts` |
| root event integration | `src/host-interaction/index.ts` | `tests/integration/host-interaction.test.ts` |
| persistent and marquee paint bounds | `src/rendering/pixi-renderer/interaction-overlay-authority.ts` | `tests/semantic/selection-paint-bounds.test.ts` |
