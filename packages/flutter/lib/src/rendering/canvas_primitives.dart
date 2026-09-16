part of 'canvas_renderer.dart';

ui.Rect _rect(MapRect r) => ui.Rect.fromLTWH(r.x, r.y, r.width, r.height);
Float64List _matrix(MapAffine m) => Float64List.fromList([
  m.a,
  m.b,
  0,
  0,
  m.c,
  m.d,
  0,
  0,
  0,
  0,
  1,
  0,
  m.tx,
  m.ty,
  0,
  1,
]);
double _radius(Object? value) => value is num
    ? value.toDouble()
    : value is List
    ? value.whereType<num>().fold<double>(
        0,
        (a, b) => math.max(a, b.toDouble()),
      )
    : value is Map
    ? value.values.whereType<num>().fold<double>(
        0,
        (a, b) => math.max(a, b.toDouble()),
      )
    : 0;

List<double> _corners(Object? value) {
  if (value is List)
    return [
      for (var i = 0; i < 4; i++) number(i < value.length ? value[i] : 0),
    ];
  if (value is Map)
    return [
      for (final key in ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'])
        number(value[key]),
    ];
  return List.filled(4, number(value));
}

ui.RRect _rrect(MapRect rect, List<double> corners) =>
    ui.RRect.fromRectAndCorners(
      _rect(rect),
      topLeft: ui.Radius.circular(corners[0]),
      topRight: ui.Radius.circular(corners[1]),
      bottomRight: ui.Radius.circular(corners[2]),
      bottomLeft: ui.Radius.circular(corners[3]),
    );

final _unitCorners = [
  for (var corner = 0; corner < 4; corner++)
    for (var segment = 0; segment <= 4; segment++)
      (
        x: math.cos(
          -math.pi / 2 + corner * math.pi / 2 + segment * math.pi / 8,
        ),
        y: math.sin(
          -math.pi / 2 + corner * math.pi / 2 + segment * math.pi / 8,
        ),
      ),
];

void _roundedTriangles(
  MapRect r,
  MapAffine m,
  List<double> radii,
  int color,
  List<double> positions,
  List<int> colors,
  List<int> indices, {
  bool retainDegenerate = false,
}) {
  if (!retainDegenerate && (r.width <= 0 || r.height <= 0)) return;
  final base = colors.length;
  void vertex(double x, double y) {
    positions.add(m.a * x + m.c * y + m.tx);
    positions.add(m.b * x + m.d * y + m.ty);
    colors.add(color);
  }

  if (radii.every((radius) => radius <= 0)) {
    vertex(r.x, r.y);
    vertex(r.x + r.width, r.y);
    vertex(r.x + r.width, r.y + r.height);
    vertex(r.x, r.y + r.height);
    indices.addAll([base, base + 1, base + 2, base, base + 2, base + 3]);
    return;
  }
  vertex(r.x + r.width / 2, r.y + r.height / 2);
  for (var corner = 0; corner < 4; corner++) {
    final radius = radii[(corner + 1) % 4].clamp(
      0.0,
      math.min(r.width, r.height) / 2,
    );
    final cx = corner < 2 ? r.x + r.width - radius : r.x + radius;
    final cy = corner == 0 || corner == 3
        ? r.y + radius
        : r.y + r.height - radius;
    for (var segment = 0; segment <= 4; segment++) {
      final unit = _unitCorners[corner * 5 + segment];
      vertex(cx + unit.x * radius, cy + unit.y * radius);
    }
  }
  for (var i = 0; i < 20; i++) {
    indices.add(base);
    indices.add(base + 1 + i);
    indices.add(base + 1 + (i + 1) % 20);
  }
}

class _MeshChunk {
  _MeshChunk(
    this.positions,
    this.colors,
    this.indices, {
    required bool antialias,
  }) : paintStyle = ui.Paint()..isAntiAlias = antialias {
    publish();
  }
  final Float32List positions;
  final Int32List colors;
  final Uint16List indices;
  ui.Vertices? mesh;
  final ui.Paint paintStyle;
  void publish() {
    mesh?.dispose();
    mesh = ui.Vertices.raw(
      ui.VertexMode.triangles,
      positions,
      colors: colors,
      indices: indices,
    );
  }

  void paint(ui.Canvas canvas) =>
      canvas.drawVertices(mesh!, ui.BlendMode.srcOver, paintStyle);
  void dispose() {
    mesh?.dispose();
    mesh = null;
  }
}

class _MeshSlot {
  const _MeshSlot(this.chunk, this.offset, this.radius);
  final _MeshChunk chunk;
  final int offset;
  final double radius;
}

void _writeBarPositions(
  MapRect r,
  MapAffine m,
  double authoredRadius,
  Float32List positions,
  int offset,
) {
  void vertex(double x, double y) {
    positions[offset++] = m.a * x + m.c * y + m.tx;
    positions[offset++] = m.b * x + m.d * y + m.ty;
  }

  if (authoredRadius <= 0) {
    vertex(r.x, r.y);
    vertex(r.x + r.width, r.y);
    vertex(r.x + r.width, r.y + r.height);
    vertex(r.x, r.y + r.height);
    return;
  }
  vertex(r.x + r.width / 2, r.y + r.height / 2);
  final radius = authoredRadius.clamp(0.0, math.min(r.width, r.height) / 2);
  for (var corner = 0; corner < 4; corner++) {
    final cx = corner < 2 ? r.x + r.width - radius : r.x + radius,
        cy = corner == 0 || corner == 3
            ? r.y + radius
            : r.y + r.height - radius;
    for (var segment = 0; segment <= 4; segment++) {
      final unit = _unitCorners[corner * 5 + segment];
      vertex(cx + unit.x * radius, cy + unit.y * radius);
    }
  }
}
