part of 'controller.dart';

class _ViewportFit {
  const _ViewportFit(this.bounds, this.scale, this.facts);
  final MapBounds? bounds;
  final double scale;
  final JsonMap facts;
}

extension _ViewportFitPlanning on PatchMapViewportApi {
  // Admission and geometry resolution are side effect free, so replacement can
  // validate its entire fit against the candidate before publishing the scene.
  _ViewportFit _planFit(
    Object? targets,
    Object padding, {
    PatchMapDataset? candidate,
  }) {
    final values = padding is List ? padding : [padding, padding];
    if (values.length != 2) {
      throw const PatchMapException(
        'INVALID_INPUT',
        'Padding requires two values',
      );
    }
    final px = _number(values[0]), py = _number(values[1]);
    if (px < 0 || py < 0) {
      throw const PatchMapException(
        'INVALID_INPUT',
        'Padding must be nonnegative',
      );
    }
    final requested = targets == null
        ? null
        : _c.targets._resolve(targets, duplicates: true);
    final dataset = candidate ?? _c.dataset;
    final geometry = candidate == null
        ? _geometry
        : _c._geometryFor(candidate, const {});
    final components = <String, List<GeometryPrimitive>>{};
    final relations = <String, List<GeometryPrimitive>>{};
    for (final primitive in geometry.primitives) {
      if (primitive.componentId != null) {
        (components[primitive.ownerId] ??= []).add(primitive);
      } else if (primitive.type == 'relation') {
        (relations[primitive.ownerId] ??= []).add(primitive);
      }
    }
    final entities = <String, ({MapBounds bounds, bool visible})>{};
    for (final node in dataset.nodes.values) {
      if (['group', 'grid', 'relations'].contains(node.type)) continue;
      final owner = geometry.targets[node.id];
      if (owner != null)
        entities[node.id] = (bounds: owner.bounds, visible: owner.visible);
      for (final primitive
          in components[node.id] ?? const <GeometryPrimitive>[]) {
        final id = '${node.id}::${primitive.type}:${primitive.componentId}';
        entities[id] = (
          bounds: MapBounds.points(
            readableTransform(
              primitive,
              worldRotation: _c.rotation.value,
            ).quad(primitive.localRect),
          ),
          visible: primitive.visible,
        );
      }
    }
    final contributors = <JsonMap>[],
        applied = <String>[],
        missing = <String>[];
    final excluded = <String>{}, seen = <String>{};
    MapBounds? union;
    var duplicates = 0;
    List<double> xywh(MapBounds bounds) => [
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
    ];
    void add(String id, MapBounds bounds) {
      if (!seen.add(id)) {
        duplicates++;
        return;
      }
      contributors.add({'id': id, 'worldBounds': xywh(bounds)});
      union = union == null ? bounds : union!.union(bounds);
    }

    bool addEntity(String id) {
      final entity = entities[id];
      if (entity == null || !entity.visible) return false;
      add(id, entity.bounds);
      return true;
    }

    bool visit(JsonMap element, bool defaultSelection) {
      final id = element['id'] as String;
      if (element['show'] == false) {
        excluded.add(id);
        return false;
      }
      switch (element['type']) {
        case 'group':
          var found = false;
          for (final child in element['children'] as List) {
            found = visit(child as JsonMap, false) || found;
          }
          return found;
        case 'grid':
          var found = false;
          for (final entry in entities.entries) {
            if (entry.key.startsWith('$id.') && entry.value.visible) {
              add(entry.key, entry.value.bounds);
              found = true;
            }
          }
          return found;
        case 'relations':
          if (defaultSelection) {
            excluded.add(id);
            return false;
          }
          final paths = relations[id] ?? const <GeometryPrimitive>[];
          var found = false;
          for (final path in paths) {
            final link = path.value['link'] as Map;
            found = addEntity(link['source'] as String) || found;
            found = addEntity(link['target'] as String) || found;
          }
          if (found) return true;
          MapBounds? own;
          for (final path in paths) {
            if (!path.visible) continue;
            final bounds = MapBounds.points(path.points);
            own = own == null ? bounds : own.union(bounds);
          }
          if (own == null) return false;
          add(id, own);
          return true;
        case 'image':
          if (defaultSelection) {
            excluded.add(id);
            return false;
          }
          return addEntity(id);
        default:
          return addEntity(id);
      }
    }

    if (requested == null) {
      for (final root in dataset.roots) {
        if (visit(root, true)) applied.add(root['id'] as String);
      }
    } else {
      for (final target in requested) {
        final node = dataset.nodes[target.id];
        final found = node != null && !node.instance
            ? visit(node.value, false)
            : addEntity(target.id);
        (found ? applied : missing).add(target.id);
      }
    }
    final bounds = union;
    var scale = _scale;
    if (bounds != null) {
      if (_width <= 2 * px || _height <= 2 * py) {
        throw const PatchMapException(
          'INVALID_INPUT',
          'Padding leaves no visible area',
        );
      }
      final rad = _c.rotation.value % 360 * math.pi / 180;
      final rw =
          bounds.width * math.cos(rad).abs() +
          bounds.height * math.sin(rad).abs();
      final rh =
          bounds.width * math.sin(rad).abs() +
          bounds.height * math.cos(rad).abs();
      _number(bounds.centerX);
      _number(bounds.centerY);
      scale = math
          .min(
            rw > 0 ? (_width - 2 * px) / rw : double.infinity,
            rh > 0 ? (_height - 2 * py) / rh : double.infinity,
          )
          .clamp(zoomLimits[0], zoomLimits[1]);
    }
    return _ViewportFit(bounds, scale, {
      'status': bounds == null ? 'empty' : 'applied',
      'paddingCssPx': [px, py],
      'contributors': contributors,
      'applied': applied,
      'missing': missing,
      'excluded': excluded.toList(),
      'duplicateCount': duplicates,
      'worldBounds': bounds == null ? null : xywh(bounds),
    });
  }
}
