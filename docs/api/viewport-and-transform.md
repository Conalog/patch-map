# Viewport and transform

- Status: current
- Audience: package consumers and agents changing camera state or relative object transforms
- Source: `src/engine/viewport-authority.ts`, `src/engine/transformer-edit-authority.ts`

## Scope

This page owns viewport commands, persisted absolute viewport state, wheel
activation, settled notifications, and relative move/resize/rotate commands.
Pointer selection policy is owned by
[`pointer-and-selection.md`](pointer-and-selection.md).

## Contract

Viewport APIs:

| API | Effect |
| --- | --- |
| `fit({ padding, targets })` | fit the scene or selected logical targets |
| `reset(options?)` | restore the fitted baseline |
| `panBy([dx, dy])` | apply a relative screen-space pan |
| `zoomBy(factor, anchor?)` | scale at an optional CSS-space anchor |
| `resize(width, height, pixelRatio?)` | update a manually sized surface |
| `snapshot()` / `restore(snapshot)` | persist and atomically restore absolute world center and scale |
| `onSettled(listener)` | notify once 100ms after a viewport-change burst |

- Mount-time `viewport.initial` is validated after data load and takes precedence
  over mount-time `fit`. Scale always passes through configured zoom limits.
- A snapshot is detached and consists only of `centerWorld: [x, y]` plus `scale`.
  Resize preserves that absolute center and scale.
- `onSettled()` coalesces pointer pan, wheel, fit, reset, restore, programmatic
  pan/zoom, and resize. It returns a disposer; destroy removes remaining listeners.
- Wheel activation defaults to `none`. `control` accepts `ctrlKey || metaKey` from
  the current wheel event. A rejected wheel is neither prevented nor stopped. An
  accepted wheel is prevented only when it changes scale and retains cursor
  anchoring. The option does not gate `zoomBy`, pan, or box selection.

Whole-map rotation is exposed separately as `patchmap.rotation`:

```ts
patchmap.rotation.set(90);       // absolute clockwise degrees
patchmap.rotation.rotateBy(-15); // relative degrees; now 75
patchmap.rotation.value = 45;    // the same operation as set(45)
const angle = patchmap.rotation.value;
patchmap.rotation.reset();      // set the angle to zero
```

- The initial angle is zero. Methods return the resulting angle; negative and
  multi-turn angles are retained without wrapping into 0–360.
- Rotation keeps the world point at the viewport center and the current scale
  fixed. It changes the whole scene's view, without editing dataset geometry,
  selection, or history. `transform.rotateBy()` instead edits logical targets.
- Pan remains screen-relative, zoom retains its cursor anchor, fit accounts for
  the rotated bounds, and resize preserves the center, scale, and angle.
- Changed rotations use the existing viewport publication and `onSettled()`
  notification path. Read `rotation.value` in the listener for the angle;
  its viewport state argument still contains only center, scale, and screen bounds.
- `viewport.snapshot()` and `viewport.initial` still contain only center and
  scale. Save the angle separately and restore it with `rotation.set(angle)`.
  Viewport fit, reset, and restore retain rotation; `rotation.reset()` clears it.
- Angles and deltas must be finite numbers. Invalid input, including relative
  addition that overflows, throws `RangeError` before any change. Setting the
  current angle does not publish a change. Rotation commands after destroy fail.

Transform APIs apply relative semantic edits to logical targets:

| API | Input |
| --- | --- |
| `transform.moveBy(targets, delta, options?)` | world-space `[dx, dy]` |
| `transform.resizeBy(targets, resize, options?)` | handle, delta, optional aspect lock and minimum size |
| `transform.rotateBy(targets, degrees, options?)` | relative degrees |
| `transform.beginSession(input)` | one move, resize, or rotate preview session |

Each transform validates the complete target set and commits once. Its
`actionId` and `recordHistory` behavior follows
[`mutations-and-history.md`](mutations-and-history.md). Interactive transformer
sessions preview through package-owned presentation and commit only their final
semantic delta. A session exposes `preview()`, `edgePan()`, `commit()`, and
`cancel()`. Only one session may be active per mounted instance; move uses the
frame handle, rotate uses the rotate handle, and resize requires an explicit
resize handle.

## Failure semantics

- Non-finite viewport or transform values reject without changing state.
- Invalid snapshots, unknown targets, unsupported transforms, and geometry below
  policy limits return a rejected or refused status; no subset commits.
- A viewport command that clamps to the current state is unchanged rather than a
  new publication.
- Cancel, target change, pointer termination, or refused surface acceptance
  removes transformer preview and does not create a history entry.

Runnable selection, transform, and history reference:
[`examples/editor.ts`](../../examples/editor.ts).

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| viewport state, clamp, persistence, settle | `src/engine/viewport-authority.ts` | `tests/engine/viewport-authority.test.ts` |
| public viewport integration | `src/public/index.ts` | `tests/engine/engine-viewport.test.ts` |
| whole-map rotation facade and navigation | `src/public/index.ts`, `src/engine/viewport-runtime-coordinator.ts` | `tests/engine/engine-viewport.test.ts` |
| relative transform semantics | `src/engine/transformer-edit-authority.ts` | `tests/engine/engine-transformer-edit.test.ts` |
| gesture ownership and preview cleanup | `src/engine/transformer-session-coordinator.ts` | `tests/engine/engine-transformer-edit.test.ts` |
