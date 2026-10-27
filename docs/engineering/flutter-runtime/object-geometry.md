# Object geometry queries

Status: implemented, unreleased. F34 adds `controller.getGeometry(String id)`
without changing schema, rendering, camera or update completion. Consumer usage
is in the [Flutter README](../../../packages/flutter/README.md).

## Snapshot contract

The result is `PatchMapObjectGeometry`, containing world `origin`, nullable
`bounds`, `paintBounds`, `center` and `corners`. It contains no mutable node,
matrix, scene or native resource. Held results never change with future updates.
Grid cells use concrete IDs. Item components remain internal layout, not separate
query objects. An unknown ID returns null.

- `origin`: the local origin transformed by grid placement and all ancestors.
- `bounds`: the existing axis-aligned logical bounds. Item bounds describe the
  item size, not text/SVG overflow or the current animated bar height. Groups/grids
  aggregate visible descendant bounds. Relations use resolved path bounds.
- `center`: `bounds.center`, null when no logical bounds exist.
- `paintBounds`: the existing conservative culling/fit envelope. It can exceed
  exact drawn pixels, notably for upright content. No new pixel/stroke/animation
  measurement is performed. Hidden leaves return null paint bounds but retain
  their logical box; empty containers can have neither kind of bounds. Alpha,
  presentation layers, camera visibility and viewport clipping do not trim it.
- `corners`: immutable `PatchMapObjectCorners` for item/rect/text/image local
  boxes, projected with the existing affine transform. Corner names refer to
  the original local box, so rotation/reflection do not rename them. Containers
  and relation paths have no single local box and return null corners.

Use `controller.toLocal` on each world point for widget-relative logical pixels.
Projecting only an axis-aligned bounds rectangle's diagonal is insufficient to
find a screen bounding box under camera rotation; project all four corners.

The getter is available only while the session is ready, including inactivity.
Detached, empty, preparing and failed sessions return null. Accepted replacement
hides the old geometry until the new diagram is ready; invalid replacement
preserves it. Pending updates are not visible until backend publication. The
getter itself does not wait for engine submission, animation end or physical
display. Inactive updates remain queued, so reads retain prior geometry until
resume/publication. Intrinsic image readiness follows existing resource refresh
publication. Reattachment starts empty.

## Ownership and cost

`PatchMapView` gates lifetime/phase and reads `backend.current.geometry`.
`geometry/object_geometry.dart` projects the immutable public result; it does
not read staged session values or become another geometry authority.

Leaf lookup uses the existing ID slot map and retained bounds; only the requested
box's four corners are projected. No parsing, text layout, inverse transform,
image preparation, renderer matrix preparation or scene traversal is performed.
Container bounds reuse the existing paged aggregates and partial page edges;
their explicit query cost depends on the requested subtree. Repeated reads
allocate small snapshots, not a persistent per-object cache. Consumers should
query only anchors they need, rather than all objects on each camera frame.
Without a query there is no added work on draw, update, input or paint.

## Focused verification

- `test/geometry/object_geometry_test.dart`: independent nested rotated/scaled/
  reflected grid coordinates, logical versus overflow bounds, reused bound
  identity without text measurement, hidden/empty containers and relation paths.
- `test/widget/object_geometry_test.dart`: public query, offscreen update,
  immutable held values, unchanged selection/camera, no read-triggered frame,
  invalid input, inactive pending values, replacement and reattachment.
- `test/widget/image_readiness_test.dart`: late intrinsic image size is visible
  through the public query without a new readiness phase.
- Extracted installed consumer: exported types/query, box coordinates and
  detached behavior, alongside existing asset/draw/update smoke.

These checks establish read semantics, not new native performance claims. The
rendering/update hot paths remain unchanged, so no device benchmark is required
for this additive explicit read API.

Flutter 3.47.6: the six focused geometry/widget/image cases, analysis and docs
checks passed. Extracted consumer import, runtime tests and pub dry run passed;
artifact evidence: `.artifacts/flutter/installed-consumer-RJHwIB/report.json`.
