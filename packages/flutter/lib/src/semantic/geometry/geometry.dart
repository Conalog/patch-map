import 'dart:math' as math;
import 'dart:collection';
import '../../model/dataset.dart';
import 'primitives.dart';
import 'placement.dart';
export 'primitives.dart';
export 'placement.dart';
export 'readable.dart';
export 'bar_projection.dart';
export 'text_projection.dart';
export 'icon_projection.dart';

PatchMapGeometry buildGeometry(
  PatchMapDataset dataset, {
  Map<String, JsonMap> overlays = const {},
  GeometryTextLayouter? textLayouter,
  Map<String, MapRect> imageSizes = const {},
}) => _GeometryBuilder(dataset, overlays, textLayouter, imageSizes).build();

double number(Object? value, [double fallback = 0]) =>
    value is num ? value.toDouble() : fallback;
MapAffine transformFor(JsonMap value) {
  final attrs = value['attrs'] as Map? ?? const {};
  return MapAffine.authored(
    x: number(attrs['x']),
    y: number(attrs['y']),
    angle: attrs.containsKey('angle')
        ? number(attrs['angle'])
        : number(attrs['rotation']) * 180 / math.pi,
    scaleX: number(attrs['scaleX'], 1),
    scaleY: number(attrs['scaleY'], 1),
  );
}

double resolveDimension(Object? value, double reference) {
  if (value is num) return math.max(0, value.toDouble());
  if (value is String && value.endsWith('%'))
    return math.max(
      0,
      number(num.tryParse(value.substring(0, value.length - 1))) *
          reference /
          100,
    );
  if (value is Map)
    return math.max(
      0,
      number(value['value']) * (value['unit'] == '%' ? reference / 100 : 1),
    );
  // Current normalized calc() input is preserved, but the npm parser does not
  // project it; matching that compatibility branch means zero visible length.
  return 0;
}

class _GeometryBuilder {
  _GeometryBuilder(
    this.dataset,
    this.overlays,
    this.textLayouter,
    this.imageSizes,
  );
  final PatchMapDataset dataset;
  final Map<String, JsonMap> overlays;
  final GeometryTextLayouter? textLayouter;
  final Map<String, MapRect> imageSizes;
  final targets = <String, GeometryTarget>{};
  final targetKeys = <String>[];
  final sortedLists = Map<List<dynamic>, List<JsonMap>>.identity();
  void registerTarget(String id, GeometryTarget target) {
    targets[id] = target;
    targetKeys.add(id);
  }

  final draws = <({int order, GeometryPrimitive primitive})>[];
  final pending =
      <
        ({
          int order,
          JsonMap value,
          MapAffine transform,
          double opacity,
          bool visible,
          bool locked,
        })
      >[];
  var order = 0;
  final scopeChildren = <String, List<String>>{};
  final textContexts = <String, (MapRect, MapRect, MapAffine, MapAffine)>{};
  final barContexts =
      <
        String,
        ({
          MapAffine owner,
          MapAffine attrs,
          MapRect content,
          double width,
          String placement,
          JsonMap margin,
          double ownerWidth,
          double ownerHeight,
        })
      >{};

  PatchMapGeometry build() {
    elements(dataset.roots, MapAffine.identity, true, false, 1);
    for (final relation in pending) resolveRelation(relation);
    draws.sort((a, b) {
      final order = a.order.compareTo(b.order);
      return order != 0
          ? order
          : number(
              a.primitive.value['linkIndex'],
            ).compareTo(number(b.primitive.value['linkIndex']));
    });
    MapBounds? bounds;
    for (final target in targets.values) {
      if (target.visible && target.type != 'group' && target.type != 'grid')
        bounds = bounds?.union(target.bounds) ?? target.bounds;
    }
    final primitives = draws.map((entry) => entry.primitive).toList();
    final contexts = barContexts, scopes = scopeChildren;
    return PatchMapGeometry(
      primitives: primitives,
      targets: targets,
      bounds: bounds ?? MapBounds.empty,
      textBindings: Map.unmodifiable({
        for (var slot = 0; slot < primitives.length; slot++)
          if (textContexts['${primitives[slot].ownerId}\u0000${primitives[slot].componentId}']
              case final context?)
            '${primitives[slot].ownerId}\u0000${primitives[slot].componentId}':
                TextGeometryBinding(
                  slot,
                  context.$1,
                  context.$2,
                  context.$3,
                  context.$4,
                ),
      }),
      barBindingsBuilder: () =>
          _compileBarBindings(primitives, contexts, scopes),
      scopeChildren: Map.unmodifiable(scopeChildren),
      hasRelations: pending.isNotEmpty,
    );
  }

  static Map<String, BarGeometryBinding> _compileBarBindings(
    List<GeometryPrimitive> primitives,
    Map<
      String,
      ({
        MapAffine owner,
        MapAffine attrs,
        MapRect content,
        double width,
        String placement,
        JsonMap margin,
        double ownerWidth,
        double ownerHeight,
      })
    >
    contexts,
    Map<String, List<String>> scopes,
  ) {
    final scopesByBar = <String, List<String>>{};
    for (final scope in scopes.entries)
      for (final key in scope.value) {
        if (contexts.containsKey(key))
          scopesByBar.putIfAbsent(key, () => []).add(scope.key);
      }
    final bindings = <String, BarGeometryBinding>{};
    for (var slot = 0; slot < primitives.length; slot++) {
      final p = primitives[slot],
          key = '${p.ownerId}\u0000${p.componentId}',
          context = contexts[key];
      if (context == null) continue;
      bindings[key] = BarGeometryBinding(
        slot: slot,
        ownerTransform: context.owner,
        attrsTransform: context.attrs,
        content: context.content,
        width: context.width,
        placement: context.placement,
        margin: context.margin,
        scopes: List.unmodifiable(scopesByBar[key] ?? const []),
        containedHeightLimit: _containedHeightLimit(
          context.content,
          context.width,
          context.placement,
          context.margin,
          context.attrs,
          context.ownerWidth,
          context.ownerHeight,
        ),
      );
    }
    return Map.unmodifiable(bindings);
  }

  List<JsonMap> sorted(List<dynamic> values) {
    final cached = sortedLists[values];
    if (cached != null) return cached;
    final indexed = [
      for (var i = 0; i < values.length; i++) (i: i, v: values[i] as JsonMap),
    ];
    indexed.sort((a, b) {
      final z = number(
        (a.v['attrs'] as Map?)?['zIndex'],
      ).compareTo(number((b.v['attrs'] as Map?)?['zIndex']));
      return z != 0 ? z : a.i.compareTo(b.i);
    });
    return sortedLists[values] = indexed.map((entry) => entry.v).toList();
  }

  void elements(
    List<dynamic> values,
    MapAffine parent,
    bool visible,
    bool locked,
    double opacity,
  ) {
    for (final value in sorted(values))
      element(value, parent, visible, locked, opacity);
  }

  void element(
    JsonMap authored,
    MapAffine parent,
    bool parentVisible,
    bool parentLocked,
    double parentOpacity,
  ) {
    final id = authored['id'] as String;
    final value = effective(authored, overlays[id]);
    final type = value['type'] as String;
    final transform = parent.multiply(transformFor(value));
    checkTransform(transform);
    final visible = parentVisible && value['show'] != false;
    final locked = parentLocked || value['locked'] == true;
    final opacity =
        parentOpacity * number((value['attrs'] as Map?)?['alpha'], 1);
    if (type == 'group') {
      final start = targets.length;
      elements(value['children'] as List, transform, visible, locked, opacity);
      compositeTarget(id, type, start, transform, visible, locked);
    } else if (type == 'grid') {
      final start = targets.length;
      final template = value['item'] as JsonMap,
          size = template['size'] as JsonMap,
          gap = value['gap'] as JsonMap;
      final rows = value['cells'] as List;
      for (var row = 0; row < rows.length; row++) {
        final columns = rows[row] as List;
        for (var column = 0; column < columns.length; column++) {
          if (columns[column] == 0 &&
              value['inactiveCellStrategy'] == 'destroy')
            continue;
          final instanceId = '$id.$row.$column';
          final instance = effective(
            dataset.nodes[instanceId]!.value,
            overlays[instanceId],
          );
          final cellTransform = transform.multiply(
            MapAffine(
              1,
              0,
              0,
              1,
              column * (number(size['width']) + number(gap['x'])),
              row * (number(size['height']) + number(gap['y'])),
            ),
          );
          item(
            instance,
            cellTransform,
            visible && columns[column] != 0,
            locked,
            opacity,
          );
        }
      }
      compositeTarget(id, type, start, transform, visible, locked);
    } else if (type == 'item') {
      item(value, transform, visible, locked, opacity);
    } else if (type == 'relations') {
      if (transform.inverse == null)
        throw PatchMapDatasetError(
          'INVALID_VALUE',
          '\$.${value['id']}.attrs',
          'non-invertible relation transform',
        );
      pending.add((
        order: order++,
        value: value,
        transform: transform,
        opacity: opacity,
        visible: visible,
        locked: locked,
      ));
    } else {
      MapRect local;
      Object? layout;
      if (type == 'text') {
        final size = value['size'] as Map?;
        final measured = measure(
          value,
          size == null
              ? null
              : MapRect(0, 0, number(size['width']), number(size['height'])),
          value['overflow'] as String?,
          0,
        );
        local = MapRect(0, 0, measured.width, measured.height);
        layout = measured.layout;
      } else {
        final size = value['size'] as Map?;
        local = size == null
            ? imageSizes[id] ?? const MapRect(0, 0, 32, 32)
            : MapRect(0, 0, number(size['width']), number(size['height']));
      }
      addTarget(
        id,
        type,
        local,
        transform,
        visible,
        locked ||
            value['eventMode'] == 'none' ||
            value['eventMode'] == 'passive',
      );
      add(
        GeometryPrimitive(
          ownerId: id,
          componentId: null,
          type: type,
          value: value,
          localRect: local,
          transform: transform,
          opacity:
              opacity * (type == 'image' ? number(value['opacity'], 1) : 1),
          visible: visible,
          textLayout: layout,
        ),
      );
    }
  }

  void item(
    JsonMap value,
    MapAffine transform,
    bool visible,
    bool locked,
    double opacity,
  ) {
    final id = value['id'] as String,
        size = value['size'] as JsonMap,
        padding = value['padding'] as JsonMap;
    final width = number(size['width']), height = number(size['height']);
    addTarget(
      id,
      value['type'] as String,
      MapRect(0, 0, width, height),
      transform,
      visible,
      locked,
    );
    final content = MapRect(
      number(padding['left']),
      number(padding['top']),
      math.max(0, width - number(padding['left']) - number(padding['right'])),
      math.max(0, height - number(padding['top']) - number(padding['bottom'])),
    );
    for (final authored in sorted(value['components'] as List)) {
      final component = effective(
        authored,
        overlays['$id\u0000${authored['id']}'],
      );
      final type = component['type'] as String,
          componentId = component['id'] as String;
      MapRect local;
      Object? textLayout;
      if (type == 'background') {
        local = MapRect(0, 0, width, height);
      } else {
        final margin = component['margin'] as JsonMap;
        double w, h;
        if (type == 'text') {
          final frame = MapRect(
            0,
            0,
            math.max(
              0,
              content.width - number(margin['left']) - number(margin['right']),
            ),
            math.max(
              0,
              content.height - number(margin['top']) - number(margin['bottom']),
            ),
          );
          textContexts['$id\u0000$componentId'] = (
            content,
            frame,
            transform,
            transformFor(component),
          );
          final measured = measure(
            component,
            frame,
            (component['style'] as JsonMap)['overflow'] as String?,
            (component['split'] as num).toInt(),
          );
          w = measured.width;
          h = measured.height;
          textLayout = measured.layout;
        } else {
          final size = component['size'];
          // A concrete height overlay owns only that axis. Scalar authored
          // sizes still supply the width, including percentage dimensions;
          // resolve against the current template rather than storing a width
          // in the overlay that would hide a later template update.
          final widthSize =
              type == 'bar' &&
                  size is Map &&
                  size.containsKey('height') &&
                  !size.containsKey('width')
              ? authored['size']
              : size;
          w = resolveDimension(
            widthSize is Map && widthSize.containsKey('width')
                ? widthSize['width']
                : widthSize,
            content.width,
          );
          h = resolveDimension(
            size is Map && size.containsKey('height') ? size['height'] : size,
            content.height,
          );
          if (component.containsKey('height') && type == 'bar')
            h = resolveDimension(component['height'], content.height);
        }
        local = resolvePlacement(
          content,
          w,
          h,
          component['placement'] as String,
          margin,
        );
      }
      final attrsTransform = transformFor(component);
      final componentTransform = transform
          .multiply(MapAffine.authored(x: local.x, y: local.y))
          .multiply(attrsTransform);
      checkTransform(componentTransform);
      final rect = MapRect(0, 0, local.width, local.height);
      if (type == 'bar')
        barContexts['$id\u0000$componentId'] = (
          owner: transform,
          attrs: attrsTransform,
          content: content,
          width: local.width,
          placement: component['placement'] as String,
          margin: component['margin'] as JsonMap,
          ownerWidth: width,
          ownerHeight: height,
        );
      final quad = componentTransform.quad(rect);
      registerTarget(
        '$id\u0000$componentId',
        GeometryTarget(
          id: '$id\u0000$componentId',
          ownerId: id,
          componentId: componentId,
          type: type,
          bounds: MapBounds.points(quad),
          quad: quad,
          transform: componentTransform,
          visible: visible && component['show'] != false,
          locked: locked,
          paintOrder: order,
        ),
      );
      add(
        GeometryPrimitive(
          ownerId: id,
          componentId: componentId,
          type: type,
          value: component,
          localRect: rect,
          transform: componentTransform,
          opacity: opacity * number((component['attrs'] as Map?)?['alpha'], 1),
          visible: visible && component['show'] != false,
          contentOrientation: type == 'background'
              ? 'follow-item'
              : value['contentOrientation'] as String,
          textLayout: textLayout,
          placementAnchor: type == 'bar'
              ? transform.project(width / 2, height / 2)
              : null,
        ),
      );
    }
  }

  GeometryTextLayout measure(
    JsonMap value,
    MapRect? frame,
    String? overflow,
    int split,
  ) {
    final layouter = textLayouter;
    if (layouter == null)
      throw StateError(
        'Text geometry requires the semantic text layout adapter',
      );
    return layouter(
      value['text'] as String,
      value['style'] as JsonMap,
      frame: frame,
      overflow: overflow,
      split: split,
    );
  }

  void add(GeometryPrimitive primitive) =>
      draws.add((order: order++, primitive: primitive));
  void addTarget(
    String id,
    String type,
    MapRect rect,
    MapAffine transform,
    bool visible,
    bool locked,
  ) {
    final quad = transform.quad(rect);
    final bounds = MapBounds.points(quad);
    if (!bounds.left.isFinite ||
        !bounds.right.isFinite ||
        !bounds.top.isFinite ||
        !bounds.bottom.isFinite)
      throw const PatchMapDatasetError(
        'INVALID_VALUE',
        r'$.geometry',
        'non-finite bounds',
      );
    registerTarget(
      id,
      GeometryTarget(
        id: id,
        type: type,
        bounds: bounds,
        quad: quad,
        transform: transform,
        visible: visible,
        locked: locked,
        paintOrder: order++,
      ),
    );
  }

  void compositeTarget(
    String id,
    String type,
    int start,
    MapAffine transform,
    bool visible,
    bool locked,
  ) {
    MapBounds? bounds;
    scopeChildren[id] = List.unmodifiable(targetKeys.sublist(start));
    for (var index = start; index < targetKeys.length; index++) {
      final child = targets[targetKeys[index]]!;
      if (child.visible) bounds = bounds?.union(child.bounds) ?? child.bounds;
    }
    final b = bounds ?? MapBounds.points([transform.project(0, 0)]);
    registerTarget(
      id,
      GeometryTarget(
        id: id,
        type: type,
        bounds: b,
        quad: const [],
        transform: transform,
        visible: visible,
        locked: locked,
      ),
    );
  }

  void resolveRelation(
    ({
      int order,
      JsonMap value,
      MapAffine transform,
      double opacity,
      bool visible,
      bool locked,
    })
    relation,
  ) {
    final id = relation.value['id'] as String;
    MapBounds? bounds;
    var offset = 0;
    final visiblePaths = <List<MapPoint>>[];
    var widestStroke = 0.0;
    for (final link in relation.value['links'] as List) {
      final source = targets[link['source']], target = targets[link['target']];
      if (source == null || target == null) continue;
      final points = source.id == target.id
          ? selfRelation(source.bounds)
          : [
              MapPoint(source.bounds.centerX, source.bounds.centerY),
              MapPoint(target.bounds.centerX, target.bounds.centerY),
            ];
      final b = MapBounds.points(points);
      bounds = bounds?.union(b) ?? b;
      final localPoints = points
          .map((p) => relation.transform.inverse!.project(p.x, p.y))
          .toList();
      final strokeWidth = number((relation.value['style'] as Map)['width'], 1);
      final strokeWidths = <double>[];
      for (var i = 1; i < localPoints.length; i++) {
        final dx = localPoints[i].x - localPoints[i - 1].x,
            dy = localPoints[i].y - localPoints[i - 1].y,
            length = math.sqrt(dx * dx + dy * dy);
        final nx = length == 0 ? 0 : -dy / length,
            ny = length == 0 ? 0 : dx / length;
        final wx = relation.transform.a * nx + relation.transform.c * ny,
            wy = relation.transform.b * nx + relation.transform.d * ny;
        strokeWidths.add(
          length == 0
              ? strokeWidth
              : strokeWidth * math.sqrt(wx * wx + wy * wy),
        );
      }
      if (relation.visible && source.visible && target.visible) {
        visiblePaths.add(List.unmodifiable(points));
        for (final width in strokeWidths) {
          widestStroke = math.max(widestStroke, width);
        }
      }
      draws.add((
        order: relation.order,
        primitive: GeometryPrimitive(
          ownerId: id,
          componentId: null,
          type: 'relation',
          value: {...relation.value, 'link': link, 'linkIndex': offset++},
          localRect: const MapRect(0, 0, 0, 0),
          transform: relation.transform,
          opacity:
              relation.opacity *
              number((relation.value['style'] as Map)['alpha'], 1),
          visible: relation.visible && source.visible && target.visible,
          points: List.unmodifiable(points),
          strokeWidths: List.unmodifiable(strokeWidths),
        ),
      ));
    }
    registerTarget(
      id,
      GeometryTarget(
        id: id,
        type: 'relations',
        bounds: bounds ?? MapBounds.empty,
        quad: const [],
        transform: relation.transform,
        visible: relation.visible && visiblePaths.isNotEmpty,
        locked: relation.locked,
        paths: List.unmodifiable(visiblePaths),
        strokeWidth: widestStroke,
        paintOrder: relation.order,
      ),
    );
  }
}

double _containedHeightLimit(
  MapRect content,
  double width,
  String placement,
  JsonMap margin,
  MapAffine attrs,
  double ownerWidth,
  double ownerHeight,
) {
  if (attrs.a != 1 || attrs.b != 0 || attrs.c != 0 || attrs.d != 1) return -1;
  final zero = resolvePlacement(content, width, 0, placement, margin);
  final x = zero.x + attrs.tx, y = zero.y + attrs.ty;
  final slope =
      placement == 'none' || placement == 'top' || placement.endsWith('-top')
      ? 0.0
      : placement == 'bottom' || placement.endsWith('-bottom')
      ? -1.0
      : -0.5;
  if (x < 0 || x + width > ownerWidth || y < 0 || y > ownerHeight) return -1;
  var limit = double.infinity;
  if (slope < 0) limit = math.min(limit, y / -slope);
  if (slope + 1 > 0) limit = math.min(limit, (ownerHeight - y) / (slope + 1));
  return limit;
}

JsonMap effective(JsonMap authored, JsonMap? patch) {
  if (patch == null || patch.isEmpty) return authored;
  return _EffectiveMap(authored, patch);
}

/// Immutable projection view: a height overlay does not copy every authored
/// component field into another JSON object during general scene lowering.
class _EffectiveMap extends MapBase<String, dynamic> {
  _EffectiveMap(this.authored, this.patch);
  final JsonMap authored, patch;
  @override
  dynamic operator [](Object? key) {
    final value = patch[key];
    if (value == null) return authored[key];
    final base = authored[key];
    return base is JsonMap && value is JsonMap ? effective(base, value) : value;
  }

  @override
  bool containsKey(Object? key) =>
      authored.containsKey(key) || patch[key] != null;
  @override
  Iterable<String> get keys sync* {
    yield* authored.keys;
    for (final key in patch.keys)
      if (!authored.containsKey(key) && patch[key] != null) yield key;
  }

  @override
  void operator []=(String key, dynamic value) =>
      throw UnsupportedError('Immutable geometry value');
  @override
  void clear() => throw UnsupportedError('Immutable geometry value');
  @override
  dynamic remove(Object? key) =>
      throw UnsupportedError('Immutable geometry value');
}

List<MapPoint> selfRelation(MapBounds b) {
  final padding = math.max(10.0, math.max(b.width / 2, b.height / 2));
  return [
    MapPoint(b.centerX, b.top),
    MapPoint(b.right + padding, b.top - padding),
    MapPoint(b.right + padding * 2, b.centerY),
    MapPoint(b.right + padding, b.bottom + padding),
    MapPoint(b.centerX, b.bottom),
  ];
}

void checkTransform(MapAffine t) {
  if (![t.a, t.b, t.c, t.d, t.tx, t.ty].every((value) => value.isFinite))
    throw const PatchMapDatasetError(
      'INVALID_VALUE',
      r'$.geometry',
      'non-finite affine',
    );
}
