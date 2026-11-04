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

These checks establish read semantics. Rendering/update hot paths remain
unchanged; explicit query costs were subsequently measured below.

Flutter 3.47.6: the six focused geometry/widget/image cases, analysis and docs
checks passed. Extracted consumer import, runtime tests and pub dry run passed;
artifact evidence: `.artifacts/flutter/installed-consumer-RJHwIB/report.json`.

## Physical-device query checkpoint

SM-S936N / Android16 / Flutter3.47.6 profile AOT, product commit64b5c66b:
three alternating cached-reference/query pairs per condition, with 20,000 query
batches per arm. Both paths consume identical geometry fields. The varied
10,000-panel example supplies item and group fixtures; a single 100×100 grid
using its panel template is a separate scaling case.

| Query batch | Median of run mean (microseconds) | Paired extra process CPU per 20,000 batches (ms, median) |
| --- | ---: | ---: |
| 1 item | 0.451 | 4 (noise-sensitive: -3 to +8) |
| 3 items | 1.683 | 24 |
| 10 items | 2.997 | 42 |
| 100-item group / grid | 8.993 / 8.045 | 179 / 141 |
| 10,000-item group / grid | 5.370 / 5.901 | 106 / 112 |

Container cost depends on 128-node aggregate pages and partial edges, not only
descendant count. Continuous bulk reads trigger young GC (up to 2.892ms here).
In separate 120-step camera pans at approximately60Hz, query plus `toLocal`
averaged 0.024ms for10 items, 0.038ms for the large group and 0.041ms for the large
grid; median run p95 was0.026/0.045/0.047ms. Young GC counts were0–2 per window,
similar to cached controls, with query-arm pauses at most1.556ms. Whole-process
CPU differences during rendering varied in sign/size and do not establish a
small API-specific CPU regression or improvement. Bulk timings isolate that cost.

All60 windows completed with30 matching query/reference checksums. No query-only
window scheduled a map frame. Heap GC ran outside each window to normalize arms;
this does not predict long-session GC frequency. Natural CPU scaling remained
enabled and thermal status stayed0. No runtime optimization was applied. The
prior manual APK was restored by hash and the temporary adb forward removed.
Raw results, GC timelines, source/APK identity, methodology and limits:
`.artifacts/performance/flutter/object-geometry3476-device-20261027/REPORT.ko.md`.
