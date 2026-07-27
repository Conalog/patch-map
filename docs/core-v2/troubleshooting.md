# Troubleshooting and support ownership

## Initialization fails

- Await `initialize()` before reading the canvas or renderer snapshot.
- Request `preference: 'webgl'`; WebGL2 is mandatory for production.
- Mount one engine per host slot and provide finite positive dimensions.
- A `RENDERER_LOST` or `UNSUPPORTED_RUNTIME` diagnostic is actionable; do not
  retry in an unbounded loop.

## A change is not visible

State commits and visible frames are separate. Inspect the revision tuple,
then call `publishFrame()` from the host's invalidation loop. Do not add one
ticker or closure per entity.

## Lookup or update is rejected

Query results are detached and revision-bound. Re-query after scene
replacement. Use element `{ kind: 'element', id }` or component
`{ kind: 'component', ownerId, id }` targets and keep transactions atomic.

## Assets remain live

Release every acquisition or destroy its engine. Shared assets unload only
after the final lease is released. Do not clear global Pixi caches from one
instance. Inspect `assetProbe()` for pending, lease, and cleanup counts.

## Capture is stale

Publish first and pass the exact current `publishedTuple` and CSS size to
`extractPublishedScene()`. A stale tuple rejects rather than capturing a
different frame.

## Support ownership

The integrating application owns host layout, persistence, command routing,
accessibility DOM, and adapter disposal. The Core v2 package owns parsing,
scene state, Pixi rendering, resources, interactions, history, diagnostics,
and cleanup. File package defects with the package version, opaque artifact
SHA-256, runtime/toolchain profile, structured diagnostic, and minimal PATCH
MAP JSON. Keep private data and restricted evidence out of reports.
