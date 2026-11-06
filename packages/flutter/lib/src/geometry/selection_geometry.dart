import 'dart:ui';

import '../dataset/colors.dart';
import 'affine.dart';
import 'scene_geometry.dart';

/// Release selection geometry: semantic quad plus visible owned paint quads,
/// enclosed in the semantic owner's affine frame. Hidden selected owners keep
/// their semantic outline; their hidden paint does not expand it.
///
/// This is deliberately not the camera-independent conservative [TargetGeometry.paintBounds]
/// envelope: upright components must use the same readable transform as drawing.
/// Background/rect centered-stroke outset follows the release overlay policy,
/// including its half-width rule for ignored authored stroke options.
Quad? selectionQuad(
  TargetGeometry target, {
  required ColorResolver palette,
  required double cameraRotation,
}) {
  if (target.isContainer) return null;
  final local = target.localBounds;
  if (local == null) {
    // Relation paths already publish world-space logical bounds. No alternate
    // relation path/bounds computation or child traversal belongs here.
    final bounds = target.bounds;
    return bounds == null || bounds.isEmpty
        ? null
        : Affine.identity.projectRect(bounds);
  }
  if (local.isEmpty ||
      vectorLength(target.world.a, target.world.b) == 0 ||
      vectorLength(target.world.c, target.world.d) == 0) {
    return null;
  }
  final inverse = target.world.inverse;
  var envelope = local;
  final reference = target.world.projectRect(local);
  var worldEnvelope = reference.bounds;
  var hasPaint = false;
  void include(Quad quad) {
    hasPaint = true;
    if (inverse == null) {
      worldEnvelope = worldEnvelope.expandToInclude(quad.bounds);
    } else {
      for (var i = 0; i < 4; i++) {
        final point = inverse.project(quad.vertex(i));
        envelope = envelope.expandToInclude(Rect.fromPoints(point, point));
      }
    }
  }

  if (target.visible && target.opacity > 0) {
    if (target.target.type == 'rect') {
      final stroke = target.data['stroke'] as Map?;
      final width = (stroke?['width'] as num?)?.toDouble() ?? 0;
      if (width > 0 && palette.resolve(stroke?['color'] ?? '#1a1a1a').a > 0) {
        include(target.world.projectRect(local.inflate(width / 2)));
      }
    }
    final item = target.item;
    if (item != null) {
      for (final component in item.components) {
        final alpha =
            ((component.data['attrs'] as Map?)?['alpha'] as num?)?.toDouble() ??
            1;
        if (!component.visible || alpha <= 0 || component.box.isEmpty) continue;
        var paint = Offset.zero & component.box.size;
        final source = component.data['source'];
        if (component.type == 'background' &&
            source is Map &&
            source['type'] == 'rect') {
          final width = (source['borderWidth'] as num?)?.toDouble() ?? 0;
          if (width > 0 &&
              palette.resolve(source['borderColor'] ?? '#1a1a1a').a > 0 &&
              palette.resolve(component.data['tint'] ?? '#ffffff').a > 0) {
            paint = paint.inflate(width / 2);
          }
        }
        include(
          component
              .worldTransform(target.world, cameraRotation, item.content)
              .projectRect(paint),
        );
      }
    }
  }
  if (inverse == null) {
    return hasPaint ? Affine.identity.projectRect(worldEnvelope) : reference;
  }
  return target.world.projectRect(envelope);
}

/// Parallel offset of an affine rectangle in world units. Positive expands;
/// negative contracts. A collapsed interior has no contour. This preserves
/// perpendicular border width under rotation, reflection and ancestor shear.
Quad? offsetSelectionQuad(Quad quad, double distance) {
  if (distance == 0) return quad;
  final u = quad.p1 - quad.p0, v = quad.p3 - quad.p0;
  final ul = vectorLength(u.dx, u.dy), vl = vectorLength(v.dx, v.dy);
  if (ul == 0 || vl == 0) return null;
  final sine = cross(u / ul, v / vl).abs();
  if (sine == 0) return null;
  final du = distance / (ul * sine), dv = distance / (vl * sine);
  if (!du.isFinite || !dv.isFinite || du <= -.5 || dv <= -.5) return null;
  final a = u * du, b = v * dv;
  final result = Quad(
    quad.p0 - a - b,
    quad.p1 + a - b,
    quad.p2 + a + b,
    quad.p3 - a + b,
  );
  for (var i = 0; i < 4; i++) {
    final point = result.vertex(i);
    if (!point.dx.isFinite || !point.dy.isFinite) return null;
  }
  return result;
}
