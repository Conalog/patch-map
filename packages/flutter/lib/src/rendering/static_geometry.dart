import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import '../geometry/affine.dart';
import 'rectangle_paint.dart';

/// One already ordered static draw. Chunking, clipping and inter-item overlap
/// proofs belong to the render plan, not to this primitive builder.
final class StaticRectangle {
  const StaticRectangle(this.rect, this.world, this.paint);

  final Rect rect;
  final Affine world;
  final RectanglePaint paint;
}

/// Retained fill fans and centered stroke rings, in the supplied drawing order.
///
/// The contour algorithm follows the experiment's four quarter-circle contours,
/// fill fan and paired border contours. Subdivision here bounds chord error to
/// 1/32 world unit, before the caller's Canvas/camera transform (at most 64
/// segments per quarter). Vertices do not provide native Path edge coverage,
/// even with isAntiAlias enabled. AA comparisons cover the tested scales only;
/// callers requiring native Path AA must retain the Canvas fallback.
final class StaticGeometry {
  StaticGeometry._(
    this._vertices,
    this.bounds,
    this.vertexCount,
    this.triangleCount,
    this.geometryBytes,
    this._originX,
    this._originY,
  );

  Vertices? _vertices;
  final _paint = Paint()..isAntiAlias = true;

  /// Conservative transformed outer-rectangle envelope, including the stroke.
  final Rect bounds;
  final int vertexCount, triangleCount;

  /// Typed vertex/color/index payload, not a measured native/GPU memory bound.
  final int geometryBytes;
  final double _originX, _originY;
  bool _disposed = false;
  int _drawCount = 0;

  bool get isDisposed => _disposed;
  int get drawCount => _drawCount;
  Object? get verticesIdentity => _vertices;
  Object get paintIdentity => _paint;

  /// Pure eligibility check. Nonuniform corners, non-centered strokes, sharp
  /// non-miter joins, collapsed stroke interiors, singular/oversized transforms
  /// and contours exceeding the subdivision limit require Canvas fallback.
  static bool isEligible(StaticRectangle shape) => _prepare(shape) != null;

  /// All-or-nothing construction. No native handle is created on ineligibility
  /// or when the combined mesh cannot use 16-bit indices. Does not sort shapes.
  static StaticGeometry? tryBuild(Iterable<StaticRectangle> shapes) {
    final prepared = <_Shape>[];
    var vertexCount = 0, indexCount = 0;
    Rect? bounds;
    for (final shape in shapes) {
      final value = _prepare(shape);
      if (value == null) return null;
      if (value.empty) continue;
      prepared.add(value);
      final n = value.contourCount;
      if (value.fill) {
        vertexCount += n + 1;
        indexCount += n * 3;
      }
      if (value.stroke) {
        vertexCount += n * 2;
        indexCount += n * 6;
      }
      if (vertexCount > 65535) return null;
      bounds = bounds?.expandToInclude(value.bounds) ?? value.bounds;
      if (!_float32Extent(bounds)) return null;
    }
    if (vertexCount == 0) {
      return StaticGeometry._(null, Rect.zero, 0, 0, 0, 0, 0);
    }
    // Avoid baking a large common map translation into Float32 vertices. The
    // Canvas still has its normal native matrix precision; this is not a claim
    // of arbitrary-precision camera cancellation.
    final originX = bounds!.left, originY = bounds.top;
    final positions = Float32List(vertexCount * 2);
    final colors = Int32List(vertexCount);
    final indices = Uint16List(indexCount);
    var vertex = 0, index = 0;
    void point(_Shape shape, double x, double y, int v, Color color) {
      final world = shape.input.world;
      positions[v * 2] = world.a * x + world.c * y + (world.tx - originX);
      positions[v * 2 + 1] = world.b * x + world.d * y + (world.ty - originY);
      colors[v] = color.toARGB32();
    }

    void contour(
      _Shape shape,
      Rect rect,
      double radius,
      int start,
      Color color,
    ) {
      for (var corner = 0; corner < 4; corner++) {
        final cx = corner < 2 ? rect.right - radius : rect.left + radius;
        final cy = corner == 0 || corner == 3
            ? rect.top + radius
            : rect.bottom - radius;
        for (var j = 0; j <= shape.segments; j++) {
          final angle =
              (corner - 1) * math.pi / 2 + j * math.pi / (2 * shape.segments);
          point(
            shape,
            cx + radius * math.cos(angle),
            cy + radius * math.sin(angle),
            start + corner * (shape.segments + 1) + j,
            color,
          );
        }
      }
    }

    for (final shape in prepared) {
      final input = shape.input, paint = input.paint, n = shape.contourCount;
      if (shape.fill) {
        point(
          shape,
          input.rect.center.dx,
          input.rect.center.dy,
          vertex,
          paint.fillColor,
        );
        contour(shape, input.rect, shape.radius, vertex + 1, paint.fillColor);
        for (var j = 0; j < n; j++) {
          indices[index++] = vertex;
          indices[index++] = vertex + 1 + j;
          indices[index++] = vertex + 1 + (j + 1) % n;
        }
        vertex += n + 1;
      }
      if (shape.stroke) {
        final half = paint.strokeWidth / 2;
        // Sharp miter corners are square. Inflating their radius would silently
        // change them into round joins, as the experimental implementation did.
        contour(
          shape,
          input.rect.inflate(half),
          shape.radius == 0 ? 0 : shape.radius + half,
          vertex,
          paint.strokeColor,
        );
        contour(
          shape,
          input.rect.deflate(half),
          math.max(0, shape.radius - half),
          vertex + n,
          paint.strokeColor,
        );
        for (var j = 0; j < n; j++) {
          final k = (j + 1) % n;
          indices[index++] = vertex + j;
          indices[index++] = vertex + k;
          indices[index++] = vertex + n + j;
          indices[index++] = vertex + k;
          indices[index++] = vertex + n + k;
          indices[index++] = vertex + n + j;
        }
        vertex += n * 2;
      }
    }
    return StaticGeometry._(
      Vertices.raw(
        VertexMode.triangles,
        positions,
        colors: colors,
        indices: indices,
      ),
      bounds,
      vertexCount,
      indexCount ~/ 3,
      positions.lengthInBytes + colors.lengthInBytes + indices.lengthInBytes,
      originX,
      originY,
    );
  }

  /// No tessellation, typed-buffer creation or native resource creation here.
  /// Canvas owns recording references; the owner can retire after submission.
  void draw(Canvas canvas) {
    if (_disposed) throw StateError('Static geometry is disposed');
    final vertices = _vertices;
    if (vertices == null) return;
    canvas.save();
    try {
      canvas.translate(_originX, _originY);
      canvas.drawVertices(vertices, BlendMode.dst, _paint);
      _drawCount++;
    } finally {
      canvas.restore();
    }
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _vertices?.dispose();
    _vertices = null;
  }
}

final class _Shape {
  const _Shape(
    this.input,
    this.radius,
    this.segments,
    this.fill,
    this.stroke,
    this.bounds,
  );
  final StaticRectangle input;
  final double radius;
  final int segments;
  final bool fill, stroke;
  final Rect bounds;
  int get contourCount => 4 * (segments + 1);
  bool get empty => !fill && !stroke;
}

_Shape? _prepare(StaticRectangle shape) {
  final rect = shape.rect, world = shape.world, paint = shape.paint;
  final radius = paint.uniformRadius;
  final width = paint.strokeWidth;
  if (!rect.isFinite ||
      rect.width < 0 ||
      rect.height < 0 ||
      !rect.width.isFinite ||
      !rect.height.isFinite ||
      !world.isFinite ||
      radius == null ||
      !radius.isFinite ||
      radius < 0 ||
      !width.isFinite ||
      width < 0) {
    return null;
  }
  final determinant = world.a * world.d - world.b * world.c;
  if (!determinant.isFinite || determinant == 0) return null;
  final fill = !rect.isEmpty && paint.fillColor.a > 0;
  final stroke = !rect.isEmpty && width > 0 && paint.strokeColor.a > 0;
  final fitted = math.min(radius, math.min(rect.width, rect.height) / 2);
  if (stroke &&
      (paint.strokeAlignment != .5 ||
          width >= math.min(rect.width, rect.height) ||
          (fitted > 0 && fitted < width / 2) ||
          (fitted == 0 &&
              (paint.strokeJoin != StrokeJoin.miter ||
                  paint.strokeMiterLimit < math.sqrt2)))) {
    return null;
  }
  // Frobenius norm bounds affine amplification, including shear/reflection.
  final scale = math.sqrt(
    world.a * world.a +
        world.b * world.b +
        world.c * world.c +
        world.d * world.d,
  );
  final outerRadius = fitted == 0 ? 0 : fitted + (stroke ? width / 2 : 0);
  final scaledRadius = outerRadius * scale;
  if (!scaledRadius.isFinite) return null;
  // Guard before acos: for huge inputs 1 - error/radius rounds to exactly one,
  // and converting the resulting infinite subdivision count would throw.
  final maximumRadius = (1 / 32) / (1 - math.cos(math.pi / (4 * 64)));
  if (scaledRadius > maximumRadius) return null;
  final segments = scaledRadius <= 1 / 32
      ? 1
      : (math.pi / (4 * math.acos(1 - (1 / 32) / scaledRadius))).ceil();
  if (segments > 64) return null;
  final outer = stroke ? rect.inflate(width / 2) : rect;
  var left = double.infinity, top = double.infinity;
  var right = double.negativeInfinity, bottom = double.negativeInfinity;
  const maximumFloat32 = 3.4028234663852886e38;
  for (final x in [outer.left, outer.right]) {
    for (final y in [outer.top, outer.bottom]) {
      final px = world.a * x + world.c * y + world.tx;
      final py = world.b * x + world.d * y + world.ty;
      if (!px.isFinite ||
          !py.isFinite ||
          px.abs() > maximumFloat32 ||
          py.abs() > maximumFloat32) {
        return null;
      }
      left = math.min(left, px);
      top = math.min(top, py);
      right = math.max(right, px);
      bottom = math.max(bottom, py);
    }
  }
  final bounds = Rect.fromLTRB(left, top, right, bottom);
  if (!_float32Extent(bounds)) return null;
  return _Shape(shape, fitted, segments, fill, stroke, bounds);
}

bool _float32Extent(Rect bounds) =>
    bounds.width <= 3.4028234663852886e38 &&
    bounds.height <= 3.4028234663852886e38;
