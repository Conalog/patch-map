# Host integration

- Status: current
- Audience: application integrators
- Owner: the boundary between a host application and one PatchMap instance

Read when: wiring PatchMap into a page, editor, dashboard, report, persistence
layer, or application lifecycle.

## Ownership

| Host owns | PatchMap owns |
| --- | --- |
| Layout slot and route lifecycle | Canvas and Pixi surface lifecycle |
| Application commands and persistence | Normalized scene state and history |
| Application-shell accessibility and authored semantic labels | Canvas-aligned accessibility tree, focus and activation lifecycle |
| Business relation graph and selection extension callback | Pointer capture, gesture arbitration, and coordinate conversion |
| Release qualification and package selection | Frame cadence, animation, assets, and capture readiness |

The host mounts one instance, calls public domains, owns only returned
subscription disposers, and awaits destruction. It must not import renderer
internals, retain display objects, rebuild geometry, add per-entity listeners,
or publish a second RAF loop.

PatchMap derives its accessible buttons from visible logical targets and their
renderer-aligned bounds. The host supplies meaningful dataset `label` or text
values and owns accessibility outside the map; it must not add a parallel
per-entity DOM overlay over the canvas.

Document-captured pointer movement over a host-owned DOM overlay does not
become idle canvas hover. A pointer sequence that starts on the canvas remains
owned through capture, so pan and selection drags continue across host overlays.

## Adapter shape

The packaged `examples/host-adapter.ts` is the integration reference:

| Host task | Public owner |
| --- | --- |
| Load canonical input | `data.replace()` |
| Validate and serialize persistence data | `data.serialize()` |
| Address or reuse targets | `targets.get()` and `targets.query()` |
| Apply state | `update()`, `updateBatch()`, or `transaction()` |
| Observe pointer intent | `pointer`, `selection`, and their returned disposers |
| Persist viewport | `viewport.snapshot()`, `restore()`, and `onSettled()` |
| Capture or diagnose | `capture.png()` and `debug.snapshot()` |
| Unmount | dispose host subscriptions, then `destroy()` |

## Diagnostics and errors

`debug.snapshot()` synchronously returns a detached current product snapshot:
lifecycle and revisions, published scene tuple, dataset identity, viewport,
selection, presentation, pending work, and bounded renderer, asset, canvas, and
subscription counts. Use it for support evidence and invariant checks, not as
persistence data, telemetry, asset readiness, or a frame-settlement barrier.

Public mutation and history decisions report `status` and, when applicable, a
structured `diagnostic` without partial publication. Invalid call envelopes may
throw `TypeError` or `RangeError` before an operation starts. Async lifecycle,
renderer, asset, and capture failures may reject with the exported
`PatchMapError`; inspect its `code`, `operation`, `hint`, `recoverable`, and
frozen `diagnostic` instead of parsing its message. Preserve the diagnostic when
reporting a non-recoverable failure.

## State and ordering

1. Create the host slot and load application data.
2. Pass canonical dataset arrays to mount or `data.replace()`.
3. Await `PatchMap.mount()`; do not poll canvas or asset state.
4. Attach public subscriptions and retain their disposers.
5. Persist detached dataset and viewport snapshots, never Pixi state.
6. On unmount, release host subscriptions and await `destroy()`.

## Failure decisions

| Symptom | Meaning | Action and evidence |
| --- | --- | --- |
| Duplicate canvases, listeners, or frames | The adapter owns package resources | Remove the duplicate owner and capture lifecycle probes |
| Save validation rejects | The detached data is not a strict semantic round trip | Fix the reported path; do not rewrite normalized output |
| A host callback fails | Package state remains authoritative and reports a callback diagnostic | Fix the callback and attach the bounded diagnostic |

## Verification map

| Claim | Code | Focused evidence |
| --- | --- | --- |
| Public adapter boundary | `examples/host-adapter.ts`, `src/index.ts` | package integration and public example compilation |
| Instance resource ownership | `src/engine/index.ts`, `src/assets/index.ts` | engine lifecycle and asset lifecycle tests |
| Canvas-aligned accessibility | `src/accessibility`, `src/rendering/pixi-renderer/accessibility-overlay-authority.ts` | `tests/integration/accessibility-product.test.ts` |
| Canvas pointer ownership | `src/rendering/pixi-renderer/root-interaction-binding-authority.ts` | `tests/rendering/pixi-root-interaction-binding-authority.test.ts` |
| public debug snapshot | `src/public/index.ts`, `src/engine/product-probe-reader.ts` | `tests/engine/engine-lifecycle.test.ts` |
| public failure projection | `src/engine/operation-outcomes.ts` | `tests/engine/engine-operation-outcomes.test.ts` |
| Persistence guards | `src/semantic/persistence.ts` | `tests/semantic/persistence.test.ts` |
