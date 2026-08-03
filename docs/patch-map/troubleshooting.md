# Troubleshooting and support ownership

## Initialization fails

- Await `PatchMap.mount()` before reading state.
- Keep the default WebGL2 backend for production.
- Mount one engine per host slot and give its host a non-zero CSS size (or pass
  explicit `width` and `height`).
- A `RENDERER_LOST` or `UNSUPPORTED_RUNTIME` diagnostic is actionable; do not
  retry in an unbounded loop.

## A change is not visible

`PatchMap.mount()` owns the normal frame loop and invalidates it after domain
updates. Do not add a second host RAF/ticker. Deterministic publication seams
belong to package-internal verification and are not part of the consumer API.

## Lookup or update is rejected

Queried target sets are detached and revision-bound. Run `targets.query()`
again after replacing data. Public domain APIs use one shape: element `{ id }` or
component `{ id, componentId }`. `PatchMapError.hint` and rejected update
results explain missing IDs without partially applying the batch.

## Assets remain live

Release every acquisition or destroy its engine. Shared assets unload only
after the final lease is released. Do not clear global Pixi caches from one
instance. Inspect `assets.status()` for pending, lease, and cleanup counts.

## Capture is stale

Use `await patchMap.capture.png()`. It publishes through the owned frame loop
and prevents resize or another capture from replacing the exact tuple before
extraction finishes.

## Support ownership

The integrating application owns host layout, persistence, command routing,
accessibility DOM, and adapter disposal. The PatchMap package owns parsing,
scene state, Pixi rendering, resources, interactions, history, diagnostics,
and cleanup. File package defects with the package version, opaque artifact
SHA-256, runtime/toolchain profile, structured diagnostic, and minimal PATCH
MAP JSON. Keep private data and restricted evidence out of reports.
