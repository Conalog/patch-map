part of 'controller.dart';

/// Staged authored location. Affines and the record are captured before any
/// array splice, so siblings removed during grouping cannot retarget a location.
class _Location {
  _Location(
    this.siblings,
    this.index,
    this.parentId,
    this.value,
    this.parentAffine,
    this.worldAffine,
    this.locked,
  );
  final List<dynamic> siblings;
  final int index;
  final String? parentId;
  final JsonMap value;
  final MapAffine parentAffine, worldAffine;
  final bool locked;
}

_Location? _find(
  List<dynamic> list,
  String id, [
  String? parent,
  MapAffine parentAffine = MapAffine.identity,
  bool ancestorLocked = false,
  bool withAffine = false,
]) {
  for (var i = 0; i < list.length; i++) {
    final value = list[i] as JsonMap;
    final world = withAffine
        ? parentAffine.multiply(_structuralLocal(value))
        : MapAffine.identity;
    final locked = ancestorLocked || value['locked'] == true;
    if (value['id'] == id)
      return _Location(list, i, parent, value, parentAffine, world, locked);
    if (value['type'] == 'group' && value['children'] is List) {
      final result = _find(
        value['children'] as List,
        id,
        value['id'] as String,
        world,
        locked,
        withAffine,
      );
      if (result != null) return result;
    }
  }
  return null;
}

// General authored updates need identity lookup only. Compile hierarchy
// transforms only for an operation that actually rebases a staged element.
_Location? _findStructural(List<dynamic> roots, String id) =>
    _find(roots, id, null, MapAffine.identity, false, true);

/// Structural edit on the transaction's detached tree. A returned selection is
/// the npm structural planner's proposed selection; the transaction owns whether
/// an explicit selectedIds option overrides it and when it is published.
List<String>? _structural(
  List<JsonMap> roots,
  JsonMap op, {
  String operationPath = r'$.operations[0]',
}) {
  Never fail(String code, String field, String message) =>
      throw PatchMapDatasetError(code, '$operationPath.$field', message);
  String id(Object? input, String field) {
    if (input is! String || input.isEmpty)
      fail('INVALID_VALUE', field, 'Expected nonempty identity');
    return input;
  }

  void unlocked(_Location location, [String field = 'target']) {
    if (location.locked)
      fail('CONFLICT', field, 'Hierarchy target or ancestor is locked');
  }

  ({List<dynamic> children, MapAffine affine}) destination(Object? parentId) {
    if (parentId == null) return (children: roots, affine: MapAffine.identity);
    final key = id(parentId, 'parent'), owner = _findStructural(roots, key);
    if (owner == null) throw _MissingTarget(key);
    unlocked(owner);
    if (owner.value['type'] != 'group' || owner.value['children'] is! List)
      fail('INVALID_MUTATION', 'parent', 'Parent must resolve to a group');
    return (
      children: owner.value['children'] as List,
      affine: owner.worldAffine,
    );
  }

  int insertion(Object? input, int length) {
    if (input is! num ||
        !input.isFinite ||
        input < 0 ||
        input > 9007199254740991 ||
        input != input.roundToDouble() ||
        input > length)
      fail('INVALID_VALUE', 'index', 'Invalid destination insertion index');
    return input.toInt();
  }

  final type = op['type'];
  if (type == 'add') {
    final value = _cloneMap(op['value']), key = id(value['id'], 'value.id');
    if (_find(roots, key) != null)
      fail('DUPLICATE_ID', 'value.id', 'Added identity already exists');
    final dest = destination(op['parentId']);
    dest.children.insert(insertion(op['index'], dest.children.length), value);
    return [key];
  }
  if (type == 'group') {
    if (op['ids'] is! List || (op['ids'] as List).isEmpty)
      fail('INVALID_VALUE', 'targets', 'Group needs nonempty ordered targets');
    final ids = [for (final value in op['ids'] as List) id(value, 'targets')];
    if (ids.toSet().length != ids.length)
      fail('CONFLICTING_FIELDS', 'targets', 'Group targets must be unique');
    final locations = <_Location>[];
    for (final key in ids) {
      final location = _findStructural(roots, key);
      if (location == null) throw _MissingTarget(key);
      unlocked(location);
      locations.add(location);
    }
    final parent = locations.first.siblings;
    if (locations.any((location) => !identical(location.siblings, parent)))
      fail('CONFLICT', 'targets', 'Group targets must share a current parent');
    final value = _cloneMap(op['value']);
    if (value['type'] != 'group')
      fail('INVALID_RECORD_KIND', 'value.type', 'Group value must be a group');
    final key = id(value['id'], 'value.id');
    if (value.containsKey('children'))
      fail(
        'CONFLICTING_FIELDS',
        'value.children',
        'Group value cannot supply children',
      );
    if (_find(roots, key) != null)
      fail('DUPLICATE_ID', 'value.id', 'Group identity already exists');
    final sorted = [...locations]..sort((a, b) => a.index.compareTo(b.index));
    final groupWorld = sorted.first.parentAffine.multiply(
      _structuralLocal(value),
    );
    for (final location in sorted) {
      _rebaseStructural(
        location.value,
        location.worldAffine,
        groupWorld,
        operationPath,
      );
    }
    value['children'] = [for (final location in sorted) location.value];
    for (final location in sorted.reversed) parent.removeAt(location.index);
    parent.insert(sorted.first.index, value);
    return [key];
  }

  final key = id(op['id'], 'target'),
      location = type == 'move' || type == 'ungroup'
          ? _findStructural(roots, key)
          : _find(roots, key);
  if (location == null) throw _MissingTarget(key);
  if (op['componentId'] != null) {
    final owner = location.value['type'] == 'grid'
        ? _map(location.value['item'])
        : location.value;
    final components = owner['components'] as List?;
    final at =
        components?.indexWhere((v) => v['id'] == op['componentId']) ?? -1;
    if (at < 0) throw _MissingTarget('$key/${op['componentId']}');
    if (type == 'remove') {
      components!.removeAt(at);
    } else if (type == 'replace') {
      components![at] = _cloneMap(op['value']);
    } else {
      fail('INVALID_MUTATION', 'target', 'Hierarchy target must be an element');
    }
    if (location.value['type'] == 'grid') location.value['item'] = owner;
    return null;
  }
  if (type == 'replace') {
    location.siblings[location.index] = _cloneMap(op['value']);
    return null;
  }
  if (type == 'remove') {
    final cascade = op['cascade'] ?? 'subtree';
    if (cascade != 'subtree' && cascade != 'reject')
      fail('INVALID_VALUE', 'cascade', 'Cascade must be reject or subtree');
    if (location.value['type'] == 'group' &&
        (location.value['children'] as List).isNotEmpty &&
        cascade == 'reject')
      fail(
        'CONFLICTING_FIELDS',
        'cascade',
        'Cascade reject cannot remove a nonempty group',
      );
    location.siblings.removeAt(location.index);
    return null;
  }
  if (type == 'move') {
    unlocked(location);
    final dest = destination(op['parentId']);
    if (op['parentId'] == key ||
        op['parentId'] != null &&
            _find([location.value], op['parentId'] as String) != null)
      fail('CONFLICT', 'parent', 'Move parent cannot be a target descendant');
    var at = insertion(op['index'], dest.children.length);
    final same = identical(location.siblings, dest.children);
    if (same && location.index < at) at--;
    if (same && location.index == at) return null;
    _rebaseStructural(
      location.value,
      location.worldAffine,
      dest.affine,
      operationPath,
    );
    location.siblings.removeAt(location.index);
    dest.children.insert(at, location.value);
    return null;
  }
  if (type == 'ungroup') {
    unlocked(location);
    final policy = op['relationPolicy'] ?? 'reject';
    if (policy != 'reject' && policy != 'remove')
      fail(
        'INVALID_VALUE',
        'relationPolicy',
        'Relation policy must be reject or remove',
      );
    if (location.value['type'] != 'group' ||
        location.value['children'] is! List)
      fail('INVALID_MUTATION', 'target', 'Ungroup target must be a group');
    final relations = <JsonMap>[];
    void visit(List<dynamic> values) {
      for (final value in values.cast<JsonMap>()) {
        if (value['type'] == 'relations') relations.add(value);
        if (value['type'] == 'group') visit(value['children'] as List);
      }
    }

    visit(roots);
    bool dependent(Object? value) =>
        value is Map && (value['source'] == key || value['target'] == key);
    final linked = relations.any((r) => (r['links'] as List).any(dependent));
    if (linked && policy == 'reject')
      fail(
        'CONFLICT',
        'relationPolicy',
        'Ungroup target is a relation endpoint',
      );
    if (linked) {
      for (final relation in relations) {
        relation['links'] = (relation['links'] as List)
            .where((link) => !dependent(link))
            .toList();
      }
    }
    final children = (location.value['children'] as List).cast<JsonMap>();
    for (final child in children) {
      _rebaseStructural(
        child,
        location.worldAffine.multiply(_structuralLocal(child)),
        location.parentAffine,
        operationPath,
      );
    }
    location.siblings.removeAt(location.index);
    location.siblings.insertAll(location.index, children);
    return [for (final child in children) child['id'] as String];
  }
  fail('INVALID_MUTATION', 'type', 'Unknown structural operation');
}

MapAffine _structuralLocal(JsonMap record) {
  final attrs = record['attrs'] as Map? ?? const {};
  double finite(Object? value, double fallback) =>
      value is num && value.isFinite ? value.toDouble() : fallback;
  return MapAffine.authored(
    x: finite(attrs['x'], 0),
    y: finite(attrs['y'], 0),
    angle: attrs['angle'] is num && (attrs['angle'] as num).isFinite
        ? finite(attrs['angle'], 0)
        : finite(attrs['rotation'], 0) * 180 / math.pi,
    scaleX: finite(attrs['scaleX'], 1),
    scaleY: finite(attrs['scaleY'], 1),
  );
}

void _rebaseStructural(
  JsonMap record,
  MapAffine world,
  MapAffine parent,
  String path,
) {
  Never conflict(String message) =>
      throw PatchMapDatasetError('CONFLICT', '$path.target', message);
  bool finite(MapAffine matrix) => [
    matrix.a,
    matrix.b,
    matrix.c,
    matrix.d,
    matrix.tx,
    matrix.ty,
  ].every((v) => v.isFinite);
  final determinant = parent.a * parent.d - parent.b * parent.c;
  // Pinned semantic invertPatchMapAffine uses Number.EPSILON, not the looser
  // geometric picking inverse threshold.
  if (!finite(parent) ||
      !finite(world) ||
      !determinant.isFinite ||
      determinant.abs() <= 2.220446049250313e-16)
    conflict('Hierarchy transform cannot be rebased through a singular parent');
  final inverse = 1 / determinant;
  final local = MapAffine(
    parent.d * inverse,
    -parent.b * inverse,
    -parent.c * inverse,
    parent.a * inverse,
    (parent.c * parent.ty - parent.d * parent.tx) * inverse,
    (parent.b * parent.tx - parent.a * parent.ty) * inverse,
  ).multiply(world);
  if (!finite(local)) conflict('Hierarchy rebase is not finite');
  final largest = math.max(local.a.abs(), local.b.abs());
  final scaleX = largest == 0
      ? 0.0
      : largest *
            math.sqrt(
              (local.a / largest) * (local.a / largest) +
                  (local.b / largest) * (local.b / largest),
            );
  final det = local.a * local.d - local.b * local.c;
  if (!(scaleX > 1e-12) || !det.isFinite)
    conflict('Hierarchy transform is not representable');
  final scaleY = det / scaleX, skew = local.a * local.c + local.b * local.d;
  final tolerance = 1e-8 * math.max(1, scaleX * scaleY.abs());
  if (!scaleY.isFinite || scaleY.abs() <= 1e-12 || skew.abs() > tolerance)
    conflict('Hierarchy rebase would require skew or singular scale');
  double normalized(double value) => value.abs() <= 1e-12 ? 0 : value;
  final angle = normalized(math.atan2(local.b, local.a) * 180 / math.pi);
  final attrs = _map(record['attrs'] ?? {});
  attrs['x'] = normalized(local.tx);
  attrs['y'] = normalized(local.ty);
  if (attrs.containsKey('rotation') && !attrs.containsKey('angle')) {
    attrs['rotation'] = normalized(angle * math.pi / 180);
  } else if (angle != 0 || attrs.containsKey('angle')) {
    attrs['angle'] = angle;
    attrs.remove('rotation');
  } else {
    attrs.remove('angle');
    attrs.remove('rotation');
  }
  void scale(String key, double value) {
    final next = normalized((value - 1).abs() <= 1e-12 ? 1 : value);
    if (next == 1 && !attrs.containsKey(key)) return;
    attrs[key] = next;
  }

  scale('scaleX', scaleX);
  scale('scaleY', scaleY);
  record['attrs'] = attrs;
}
