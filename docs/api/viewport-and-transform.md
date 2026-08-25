# Viewport and transform

- Status: current
- Audience: package consumers and agents changing camera state or relative object transforms
- Source: [`viewport-authority.ts`](../../src/patch-map/engine/viewport-authority.ts), [`transformer-edit-authority.ts`](../../src/patch-map/engine/transformer-edit-authority.ts)

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

Transform APIs apply relative semantic edits to logical targets:

| API | Input |
| --- | --- |
| `transform.moveBy(targets, delta, options?)` | world-space `[dx, dy]` |
| `transform.resizeBy(targets, resize, options?)` | handle, delta, optional aspect lock and minimum size |
| `transform.rotateBy(targets, degrees, options?)` | relative degrees |

Each transform validates the complete target set and commits once. Its
`actionId` and `recordHistory` behavior follows
[`mutations-and-history.md`](mutations-and-history.md). Interactive transformer
sessions preview through package-owned presentation and commit only their final
semantic delta.

## Failure semantics

- Non-finite viewport or transform values reject without changing state.
- Invalid snapshots, unknown targets, unsupported transforms, and geometry below
  policy limits return structured rejection details; no subset commits.
- A viewport command that clamps to the current state is unchanged rather than a
  new publication.
- Cancel, target change, pointer termination, or refused surface acceptance
  removes transformer preview and does not create a history entry.

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| viewport state, clamp, persistence, settle | [`viewport-authority.ts`](../../src/patch-map/engine/viewport-authority.ts) | [`viewport-authority.test.ts`](../../tests/engine/viewport-authority.test.ts) |
| public viewport integration | [`developer-api.ts`](../../src/patch-map/developer-api.ts) | [`engine-viewport.test.ts`](../../tests/engine/engine-viewport.test.ts) |
| relative transform semantics | [`transformer-edit-authority.ts`](../../src/patch-map/engine/transformer-edit-authority.ts) | [`engine-transformer-edit.test.ts`](../../tests/engine/engine-transformer-edit.test.ts) |
| gesture ownership and preview cleanup | [`transformer-session-coordinator.ts`](../../src/patch-map/engine/transformer-session-coordinator.ts) | [`engine-transformer-edit.test.ts`](../../tests/engine/engine-transformer-edit.test.ts) |
