import 'dart:ui';

import '../api/object_geometry.dart';
import 'geometry_snapshot.dart';

/// Explicit read only: reuse published bounds/transforms and existing container
/// aggregates. Never prepare layout, resolve resources or retain mutable nodes.
PatchMapObjectGeometry? readObjectGeometry(
  GeometrySnapshot snapshot,
  String id,
) {
  final node = snapshot[id];
  if (node == null) return null;
  final box = node.localBounds;
  final quad = box == null ? null : node.world.projectRect(box);
  return PatchMapObjectGeometry(
    origin: Offset(node.world.tx, node.world.ty),
    bounds: node.isContainer
        ? snapshot.boundsFor(id, paint: false)
        : node.bounds,
    paintBounds: !node.visible
        ? null
        : node.isContainer
        ? snapshot.boundsFor(id)
        : node.paintBounds,
    corners: quad == null
        ? null
        : PatchMapObjectCorners(
            topLeft: quad.p0,
            topRight: quad.p1,
            bottomRight: quad.p2,
            bottomLeft: quad.p3,
          ),
  );
}
