import 'dart:typed_data';
import 'dart:ui';

import '../geometry/affine.dart';
import '../resources/bars/bar_masks.dart';
import 'rectangle_paint.dart';

enum BarSliceRepresentation { three, nine }

/// Fixed-capacity scratch for consecutive compatible bar draws. Never sorts
/// bars: changing mask/representation or falling back submits the previous run.
/// The caller must flush before any intervening draw, clip, Canvas transform or
/// Canvas switch, and retain mask leases through flush. World transforms are
/// applied here; the Canvas may still carry the shared camera/item clip.
final class BarSliceBatch {
  BarSliceBatch({this.capacity = 100}) {
    if (capacity < 1 || capacity > 100) {
      throw RangeError.range(capacity, 1, 100, 'capacity');
    }
    _positions = Float32List(capacity * 16 * 2);
    _uv = Float32List(capacity * 16 * 2);
    _colors = Int32List(capacity * 16);
    _threeIndices = Uint16List(capacity * 18);
    _nineIndices = Uint16List(capacity * 54);
    for (var q = 0; q < capacity * 3; q++) {
      final v = q * 4, k = q * 6;
      _threeIndices[k] = v;
      _threeIndices[k + 1] = v + 1;
      _threeIndices[k + 2] = v + 2;
      _threeIndices[k + 3] = v;
      _threeIndices[k + 4] = v + 2;
      _threeIndices[k + 5] = v + 3;
    }
    for (var item = 0; item < capacity; item++) {
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 3; col++) {
          final v = item * 16 + row * 4 + col;
          final k = item * 54 + (row * 3 + col) * 6;
          _nineIndices[k] = v;
          _nineIndices[k + 1] = v + 1;
          _nineIndices[k + 2] = v + 5;
          _nineIndices[k + 3] = v;
          _nineIndices[k + 4] = v + 5;
          _nineIndices[k + 5] = v + 4;
        }
      }
    }
  }

  final int capacity;
  late final Float32List _positions, _uv;
  late final Int32List _colors;
  late final Uint16List _threeIndices, _nineIndices;
  final _paint = Paint()..isAntiAlias = true;
  BarMasks? _masks;
  BarSliceRepresentation? _representation;
  var _count = 0, _submissions = 0, _verticesCreated = 0, _verticesDisposed = 0;
  var _disposed = false;
  double _originX = 0, _originY = 0;

  int get queuedBarCount => _count;
  int get submissionCount => _submissions;
  int get verticesCreated => _verticesCreated;
  int get verticesDisposed => _verticesDisposed;
  bool get isDisposed => _disposed;
  BarSliceRepresentation? get representation => _representation;
  int get scratchBytes =>
      _positions.lengthInBytes +
      _uv.lengthInBytes +
      _colors.lengthInBytes +
      _threeIndices.lengthInBytes +
      _nineIndices.lengthInBytes;

  /// Stable allocation identity for allocation/retention diagnostics.
  Object get scratchIdentity => _positions;

  /// Returns false after flushing the previous run when Canvas fallback is
  /// required. The caller then paints [paint] at [local] using [world]. A zero
  /// dimension is a successful no-op, without requiring a prepared mask.
  bool add(
    Canvas canvas,
    BarMasks? masks,
    Rect local,
    Affine world,
    RectanglePaint paint, {
    double alphaMultiplier = 1,
  }) {
    _requireOpen();
    final width = local.width, height = local.height;
    if (!local.isFinite ||
        !width.isFinite ||
        !height.isFinite ||
        width < 0 ||
        height < 0) {
      flush(canvas);
      return false;
    }
    if (width == 0 || height == 0 || alphaMultiplier == 0) return true;
    final radius = paint.uniformRadius;
    if (masks == null ||
        masks.isDisposed ||
        !world.isFinite ||
        radius == null ||
        radius != masks.plan.radius ||
        radius < 0 ||
        !radius.isFinite ||
        width < 2 * radius ||
        height < 2 * radius ||
        paint.strokeWidth != 0) {
      flush(canvas);
      return false;
    }
    if (paint.fillColor.a == 0) return true;
    final mode = width == masks.plan.representativeWidth
        ? BarSliceRepresentation.three
        : BarSliceRepresentation.nine;
    if (mode == BarSliceRepresentation.three && !masks.plan.threeSliceUsable) {
      flush(canvas);
      return false;
    }
    // Rebase around the run's world translation before Float32 conversion.
    // Native Canvas/camera matrix precision still applies to that translation.
    if (_count > 0 &&
        (!identical(_masks, masks) ||
            mode != _representation ||
            _count == capacity)) {
      flush(canvas);
    }
    final originX = _count == 0 ? world.tx : _originX;
    final originY = _count == 0 ? world.ty : _originY;
    final dx =
        world.a * local.left + world.c * local.top + (world.tx - originX);
    final dy =
        world.b * local.left + world.d * local.top + (world.ty - originY);
    final pad = BarMaskPlan.pad;
    // All interior vertices are affine combinations of the padded corners.
    // Reject unrepresentable Float32 coordinates rather than submit infinities.
    if (!_finiteCorner(world, -pad, -pad, dx, dy) ||
        !_finiteCorner(world, width + pad, -pad, dx, dy) ||
        !_finiteCorner(world, width + pad, height + pad, dx, dy) ||
        !_finiteCorner(world, -pad, height + pad, dx, dy)) {
      flush(canvas);
      return false;
    }
    if (_count == 0) {
      _masks = masks;
      _representation = mode;
      _originX = originX;
      _originY = originY;
    }
    final color = alphaMultiplier == 1
        ? paint.fillColor.toARGB32()
        : paint.fillColor
              .withValues(alpha: paint.fillColor.a * alphaMultiplier)
              .toARGB32();
    if (mode == BarSliceRepresentation.three) {
      final density = BarMaskPlan.density;
      final center = (pad + radius + 1) * density;
      final boundary = (pad + radius) * density;
      var quad = _count * 3;
      _quad(
        quad++,
        world,
        dx,
        dy,
        -pad,
        -pad,
        width + pad,
        radius,
        0,
        boundary,
        masks.plan.threeSourceRight,
        color,
      );
      _quad(
        quad++,
        world,
        dx,
        dy,
        -pad,
        radius,
        width + pad,
        height - radius,
        center,
        center,
        masks.plan.threeSourceRight,
        color,
      );
      _quad(
        quad,
        world,
        dx,
        dy,
        -pad,
        height - radius,
        width + pad,
        height + pad,
        (pad + radius + 2) * density,
        masks.plan.sourceAxis[3],
        masks.plan.threeSourceRight,
        color,
      );
    } else {
      final axis = masks.plan.sourceAxis;
      for (var row = 0; row < 4; row++) {
        final y = _axis(row, height, radius);
        for (var col = 0; col < 4; col++) {
          final v = _count * 16 + row * 4 + col;
          _vertex(
            v,
            world,
            _axis(col, width, radius),
            y,
            dx,
            dy,
            axis[col],
            axis[row],
            color,
          );
        }
      }
    }
    _count++;
    return true;
  }

  void _quad(
    int quad,
    Affine world,
    double dx,
    double dy,
    double left,
    double top,
    double right,
    double bottom,
    double srcTop,
    double srcBottom,
    double srcRight,
    int color,
  ) {
    final v = quad * 4;
    _vertex(v, world, left, top, dx, dy, 0, srcTop, color);
    _vertex(v + 1, world, right, top, dx, dy, srcRight, srcTop, color);
    _vertex(v + 2, world, right, bottom, dx, dy, srcRight, srcBottom, color);
    _vertex(v + 3, world, left, bottom, dx, dy, 0, srcBottom, color);
  }

  void _vertex(
    int vertex,
    Affine world,
    double x,
    double y,
    double dx,
    double dy,
    double u,
    double v,
    int color,
  ) {
    final k = vertex * 2;
    _positions[k] = world.a * x + world.c * y + dx;
    _positions[k + 1] = world.b * x + world.d * y + dy;
    _uv[k] = u;
    _uv[k + 1] = v;
    _colors[vertex] = color;
  }

  /// Submits the current run in input order. Canvas records the native vertex
  /// data; the temporary Dart Vertices handle is disposed even if drawing fails.
  /// Images/shaders remain borrowed and are never disposed by this helper.
  void flush(Canvas canvas) {
    _requireOpen();
    if (_count == 0) return;
    Vertices? vertices;
    var saved = false;
    try {
      if (_masks!.isDisposed) {
        throw StateError('Bar mask lease was released before flush');
      }
      final nine = _representation == BarSliceRepresentation.nine;
      final vertexCount = _count * (nine ? 16 : 12);
      final indexCount = _count * (nine ? 54 : 18);
      vertices = Vertices.raw(
        VertexMode.triangles,
        Float32List.sublistView(_positions, 0, vertexCount * 2),
        textureCoordinates: Float32List.sublistView(_uv, 0, vertexCount * 2),
        colors: Int32List.sublistView(_colors, 0, vertexCount),
        indices: Uint16List.sublistView(
          nine ? _nineIndices : _threeIndices,
          0,
          indexCount,
        ),
      );
      _verticesCreated++;
      _paint.shader = nine ? _masks!.nineShader : _masks!.threeShader;
      canvas.save();
      saved = true;
      canvas.translate(_originX, _originY);
      canvas.drawVertices(vertices, BlendMode.modulate, _paint);
      _submissions++;
    } finally {
      if (saved) canvas.restore();
      if (vertices != null) {
        vertices.dispose();
        _verticesDisposed++;
      }
      _paint.shader = null;
      _masks = null;
      _representation = null;
      _count = 0;
    }
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _masks = null;
    _representation = null;
    _paint.shader = null;
    _count = 0;
  }

  void _requireOpen() {
    if (_disposed) throw StateError('Bar slice batch is disposed');
  }
}

double _axis(int index, double size, double radius) => switch (index) {
  0 => -BarMaskPlan.pad,
  1 => radius,
  2 => size - radius,
  _ => size + BarMaskPlan.pad,
};
bool _finiteCorner(Affine world, double x, double y, double dx, double dy) {
  const maximumFloat32 = 3.4028234663852886e38;
  final px = world.a * x + world.c * y + dx;
  final py = world.b * x + world.d * y + dy;
  return px.isFinite &&
      py.isFinite &&
      px.abs() <= maximumFloat32 &&
      py.abs() <= maximumFloat32;
}
