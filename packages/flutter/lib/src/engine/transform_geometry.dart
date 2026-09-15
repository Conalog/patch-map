part of 'controller.dart';

class _TransformGeometry {
  _TransformGeometry(
    this.node,
    this.parent,
    this.x,
    this.y,
    this.width,
    this.height,
    this.angle,
    this.locked,
  );
  final PatchMapNode node;
  final MapAffine parent;
  final double x, y, width, height, angle;
  final bool locked;
  MapPoint get center => parent.project(x + width / 2, y + height / 2);
  JsonMap operation({
    double? x,
    double? y,
    double? width,
    double? height,
    double? angle,
  }) {
    final attrs = <String, dynamic>{}, size = <String, dynamic>{};
    if (x != null && x != this.x) attrs['x'] = x;
    if (y != null && y != this.y) attrs['y'] = y;
    if (width != null && width != this.width) size['width'] = width;
    if (height != null && height != this.height) size['height'] = height;
    if (angle != null && angle != this.angle) {
      final radians =
          (node.value['attrs'] as Map?)?.containsKey('rotation') == true;
      attrs[radians ? 'rotation' : 'angle'] = radians
          ? angle * math.pi / 180
          : angle;
    }
    return {
      'type': 'update',
      'id': node.id,
      'changes': {
        if (attrs.isNotEmpty) 'attrs': attrs,
        if (size.isNotEmpty) 'size': size,
      },
    };
  }
}

double _transformInteger(double value) => (value + 0.5).floorToDouble();
double _transformSix(double value) =>
    _transformInteger(value * 1000000) / 1000000;
MapPoint _transformVector(MapAffine inverse, double x, double y) =>
    MapPoint(inverse.a * x + inverse.c * y, inverse.b * x + inverse.d * y);

extension _TransformPlanning on PatchMapTransformApi {
  _TransformGeometry? _locate(PatchMapTarget target) {
    final node = _c.dataset.nodes[target.id];
    if (node == null ||
        node.instance ||
        target.componentId != null ||
        !['grid', 'item', 'rect', 'image', 'text'].contains(node.type))
      return null;
    var parent = MapAffine.identity, locked = node.value['locked'] == true;
    final chain = <PatchMapNode>[];
    var parentId = node.parentId;
    while (parentId != null) {
      final ancestor = _c.dataset.nodes[parentId]!;
      chain.add(ancestor);
      locked |= ancestor.value['locked'] == true;
      parentId = ancestor.parentId;
    }
    for (final ancestor in chain.reversed) {
      final attrs = ancestor.value['attrs'] as Map? ?? const {};
      if (attrs.containsKey('angle') && attrs.containsKey('rotation'))
        throw const PatchMapException(
          'INVALID_INPUT',
          'Conflicting rotation channels',
        );
      parent = parent.multiply(transformFor(ancestor.value));
    }
    if (parent.inverse == null)
      throw const PatchMapException(
        'INVALID_INPUT',
        'Singular parent transform',
      );
    final attrs = node.value['attrs'] as Map? ?? const {};
    if (attrs.containsKey('angle') && attrs.containsKey('rotation'))
      throw const PatchMapException(
        'INVALID_INPUT',
        'Conflicting rotation channels',
      );
    double width, height;
    if (node.type == 'grid') {
      final cells = node.value['cells'] as List,
          item = node.value['item'] as Map;
      final size = item['size'] as Map, gap = node.value['gap'] as Map;
      final rows = cells.length;
      final columns = cells.fold<int>(
        0,
        (max, row) => math.max(max, (row as List).length),
      );
      width = columns == 0
          ? 0
          : columns * _number(size['width']) +
                (columns - 1) * _number(gap['x']);
      height = rows == 0
          ? 0
          : rows * _number(size['height']) + (rows - 1) * _number(gap['y']);
    } else {
      final size = node.value['size'];
      if (size is! Map) return null;
      width = _number(size['width']);
      height = _number(size['height']);
    }
    return _TransformGeometry(
      node,
      parent,
      _number(attrs['x']),
      _number(attrs['y']),
      width,
      height,
      attrs.containsKey('rotation')
          ? _number(attrs['rotation']) * 180 / math.pi
          : _number(attrs['angle']),
      locked,
    );
  }

  List<_TransformGeometry> _eligible(
    Object targets, {
    bool resize = false,
    bool rotate = false,
  }) {
    final resolved = _c.targets._resolve(targets, duplicates: true);
    final seen = <String>{}, geometries = <_TransformGeometry>[];
    for (final target in resolved) {
      if (!seen.add(target.key)) continue;
      final geometry = _locate(target);
      if (geometry == null ||
          resize && !['rect', 'image'].contains(geometry.node.type)) {
        if (rotate) continue;
        throw const PatchMapException(
          'INELIGIBLE_TARGET',
          'Ineligible transform target',
        );
      }
      if (!rotate && geometry.locked)
        throw const PatchMapException(
          'LOCKED_TARGET',
          'Locked transform target',
        );
      geometries.add(geometry);
    }
    return geometries;
  }

  List<JsonMap> _movePlan(
    Object targets,
    List<num> delta, {
    bool axisLock = false,
  }) {
    if (delta.length != 2 || delta.any((n) => !n.isFinite))
      throw const PatchMapException('INVALID_INPUT', 'Invalid move delta');
    var dx = delta[0].toDouble(), dy = delta[1].toDouble();
    if (axisLock) {
      if (dx.abs() >= dy.abs()) {
        dy = 0;
      } else {
        dx = 0;
      }
    }
    return _eligible(targets).map((g) {
      final local = _transformVector(g.parent.inverse!, dx, dy);
      return g.operation(
        x: _transformInteger(g.x + local.x),
        y: _transformInteger(g.y + local.y),
      );
    }).toList();
  }

  MapRect _union(List<_TransformGeometry> values) {
    var left = double.infinity,
        top = double.infinity,
        right = double.negativeInfinity,
        bottom = double.negativeInfinity;
    for (final g in values) {
      final center = g.center;
      left = math.min(left, center.x - g.width / 2);
      top = math.min(top, center.y - g.height / 2);
      right = math.max(right, center.x + g.width / 2);
      bottom = math.max(bottom, center.y + g.height / 2);
    }
    return MapRect(left, top, right - left, bottom - top);
  }

  List<JsonMap> _rotatePlan(Object targets, num degrees, {List<num>? center}) {
    if (!degrees.isFinite ||
        center != null &&
            (center.length != 2 || center.any((n) => !n.isFinite)))
      throw const PatchMapException('INVALID_INPUT', 'Invalid rotation');
    final all = _eligible(targets, rotate: true),
        eligible = all.where((g) => !g.locked).toList();
    if (eligible.isEmpty)
      throw const PatchMapException(
        'INELIGIBLE_TARGET',
        'No eligible rotation target',
      );
    final bounds = _union(all),
        cx = center?[0].toDouble() ?? bounds.x + bounds.width / 2,
        cy = center?[1].toDouble() ?? bounds.y + bounds.height / 2;
    final radians = degrees * math.pi / 180,
        cos = math.cos(radians),
        sin = math.sin(radians);
    final count = _c.targets
        ._resolve(targets, duplicates: true)
        .map((t) => t.key)
        .toSet()
        .length;
    return eligible.map((g) {
      final c = g.center;
      final rotated = eligible.length == 1 && count == 1
          ? c
          : MapPoint(
              _transformSix(cx + (c.x - cx) * cos - (c.y - cy) * sin),
              _transformSix(cy + (c.x - cx) * sin + (c.y - cy) * cos),
            );
      final local = g.parent.inverse!.project(rotated.x, rotated.y);
      return g.operation(
        x: _transformSix(local.x - g.width / 2),
        y: _transformSix(local.y - g.height / 2),
        angle: _transformSix((g.angle + degrees) % 360),
      );
    }).toList();
  }

  MapRect _resizeBounds(
    MapRect g,
    String handle,
    double dx,
    double dy,
    double min,
    bool lock,
  ) {
    final startRight = g.x + g.width, startBottom = g.y + g.height;
    var left = handle.contains('w') ? g.x + dx : g.x,
        right = handle.contains('e') ? startRight + dx : startRight;
    var top = handle.contains('n') ? g.y + dy : g.y,
        bottom = handle.contains('s') ? startBottom + dy : startBottom;
    if (lock) {
      final ratio = g.width / g.height;
      if (handle == 'e' || handle == 'w') {
        final w = math.max(min, right - left), h = math.max(min, w / ratio);
        top = g.y + (g.height - h) / 2;
        bottom = top + h;
        if (handle == 'w') {
          left = startRight - w;
        } else {
          right = g.x + w;
        }
      } else if (handle == 'n' || handle == 's') {
        final h = math.max(min, bottom - top), w = math.max(min, h * ratio);
        left = g.x + (g.width - w) / 2;
        right = left + w;
        if (handle == 'n') {
          top = startBottom - h;
        } else {
          bottom = g.y + h;
        }
      } else {
        final scale = [
          min / g.width,
          min / g.height,
          math.max(min, right - left) / g.width,
          math.max(min, bottom - top) / g.height,
        ].reduce(math.max);
        final w = g.width * scale, h = g.height * scale;
        left = handle.contains('w') ? startRight - w : g.x;
        right = handle.contains('e') ? g.x + w : startRight;
        top = handle.contains('n') ? startBottom - h : g.y;
        bottom = handle.contains('s') ? g.y + h : startBottom;
      }
    }
    if (right - left < min) {
      if (handle.contains('w')) {
        left = right - min;
      } else {
        right = left + min;
      }
    }
    if (bottom - top < min) {
      if (handle.contains('n')) {
        top = bottom - min;
      } else {
        bottom = top + min;
      }
    }
    return MapRect(
      _transformInteger(left),
      _transformInteger(top),
      math.max(min, _transformInteger(right - left)),
      math.max(min, _transformInteger(bottom - top)),
    );
  }

  List<JsonMap> _resizePlan(
    Object targets,
    String handle,
    List<num> delta,
    bool lock,
    num min,
  ) {
    if (!['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].contains(handle) ||
        delta.length != 2 ||
        delta.any((n) => !n.isFinite) ||
        !min.isFinite ||
        min <= 0)
      throw const PatchMapException('INVALID_INPUT', 'Invalid resize');
    final values = _eligible(targets, resize: true);
    if (values.isEmpty)
      throw const PatchMapException('INELIGIBLE_TARGET', 'Empty resize');
    if (values.length == 1) {
      final g = values.single,
          local = _transformVector(
            g.parent.inverse!,
            delta[0].toDouble(),
            delta[1].toDouble(),
          );
      final r = _resizeBounds(
        MapRect(g.x, g.y, g.width, g.height),
        handle,
        local.x,
        local.y,
        min.toDouble(),
        lock,
      );
      return [g.operation(x: r.x, y: r.y, width: r.width, height: r.height)];
    }
    final frame = _union(values),
        r = _resizeBounds(
          frame,
          handle,
          delta[0].toDouble(),
          delta[1].toDouble(),
          min.toDouble(),
          lock,
        );
    final sx = r.width / frame.width, sy = r.height / frame.height;
    return values.map((g) {
      final topLeft = g.parent.project(g.x, g.y),
          local = g.parent.inverse!.project(
            r.x + (topLeft.x - frame.x) * sx,
            r.y + (topLeft.y - frame.y) * sy,
          );
      return g.operation(
        x: _transformInteger(local.x),
        y: _transformInteger(local.y),
        width: math.max(min.toDouble(), _transformInteger(g.width * sx)),
        height: math.max(min.toDouble(), _transformInteger(g.height * sy)),
      );
    }).toList();
  }
}
