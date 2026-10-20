import 'field_operations.dart' show presentationEqual;

/// One stored component change; iteration reuses this entry and its raw delta.
abstract interface class ComponentChange {
  int get index;
  RecordDelta get delta;
}

/// Transaction-scoped changes keyed by the prior sorted component index.
/// The first entry is inline; extra unique indices append directly to a tail.
/// Geometry drops hints on reorder, and publications release them on handoff.
abstract class ComponentChanges extends Iterable<ComponentChange> {
  const ComponentChanges();
  const factory ComponentChanges.empty() = _EmptyComponentChanges;
  factory ComponentChanges.single(int index, RecordDelta delta) =
      _StoredComponentChanges;

  RecordDelta? operator [](int index);

  /// Admission guarantees unique indices. Append only while grouping inputs,
  /// before any geometry or rendering consumer starts iterating these changes.
  void add(int index, RecordDelta delta);
}

final class _EmptyComponentChanges extends ComponentChanges {
  const _EmptyComponentChanges();
  @override
  int get length => 0;
  @override
  bool get isEmpty => true;
  @override
  Iterator<ComponentChange> get iterator =>
      const Iterable<ComponentChange>.empty().iterator;
  @override
  RecordDelta? operator [](int index) => null;
  @override
  void add(int index, RecordDelta delta) =>
      throw UnsupportedError('empty component changes');
}

/// This collection doubles as its first entry, avoiding a singleton wrapper.
final class _StoredComponentChanges extends ComponentChanges
    implements ComponentChange {
  _StoredComponentChanges(this.index, this.delta);
  @override
  final int index;
  @override
  final RecordDelta delta;
  List<ComponentChange>? _tail;
  Map<int, RecordDelta>? _byIndex;
  @override
  int get length => 1 + (_tail?.length ?? 0);
  @override
  bool get isEmpty => false;
  @override
  ComponentChange get first => this;
  @override
  Iterator<ComponentChange> get iterator => _ComponentChangesIterator(this);
  @override
  RecordDelta? operator [](int index) {
    if (index == this.index) return delta;
    final tail = _tail;
    if (tail == null) return null;
    if (tail.length == 1) {
      final entry = tail[0];
      return entry.index == index ? entry.delta : null;
    }
    return (_byIndex ??= {
      for (final entry in tail) entry.index: entry.delta,
    })[index];
  }

  @override
  void add(int index, RecordDelta delta) {
    (_tail ??= []).add(_StoredComponentChange(index, delta));
    _byIndex?[index] = delta;
  }
}

final class _StoredComponentChange implements ComponentChange {
  const _StoredComponentChange(this.index, this.delta);
  @override
  final int index;
  @override
  final RecordDelta delta;
}

final class _ComponentChangesIterator implements Iterator<ComponentChange> {
  _ComponentChangesIterator(this.changes);
  final _StoredComponentChanges changes;
  int _position = -1;
  @override
  ComponentChange get current =>
      _position == 0 ? changes : changes._tail![_position - 1];
  @override
  bool moveNext() {
    _position++;
    return _position < changes.length;
  }
}

/// The resolved raw record and its actual changed dependency groups.
final class RecordDelta {
  const RecordDelta({
    required this.before,
    required this.after,
    required this.fields,
  });
  final Map<String, Object?> before;
  final Map<String, Object?> after;
  final int fields;
}

abstract final class RecordFields {
  static const size = 1 << 0;
  static const padding = 1 << 1;
  static const contentOrientation = 1 << 2;
  static const show = 1 << 3;
  static const locked = 1 << 4;
  static const label = 1 << 5;
  static const source = 1 << 6;
  static const tint = 1 << 7;
  static const text = 1 << 8;
  static const style = 1 << 9;
  static const split = 1 << 10;
  static const overflow = 1 << 11;
  static const placement = 1 << 12;
  static const margin = 1 << 13;
  static const animation = 1 << 14;
  static const animationDuration = 1 << 15;
  static const opacity = 1 << 16;
  static const fill = 1 << 17;
  static const stroke = 1 << 18;
  static const radius = 1 << 19;
  static const eventMode = 1 << 20;
  static const gap = 1 << 21;
  static const attrsTransform = 1 << 22;
  static const attrsAlpha = 1 << 23;
  static const attrsZIndex = 1 << 24;
  static const attrsExtension = 1 << 25;
  static const attrs =
      attrsTransform | attrsAlpha | attrsZIndex | attrsExtension;
  static const all = (1 << 26) - 1;

  static int forPath(List<String> path) => path.first == 'attrs'
      ? path.length == 1
            ? attrs
            : switch (path[1]) {
                'alpha' => attrsAlpha,
                'zIndex' => attrsZIndex,
                'x' ||
                'y' ||
                'angle' ||
                'rotation' ||
                'scale' ||
                'scaleX' ||
                'scaleY' ||
                'skew' ||
                'pivot' => attrsTransform,
                _ => attrsExtension,
              }
      : _roots[path.first] ?? 0;
}

const _roots = <String, int>{
  'size': RecordFields.size,
  'padding': RecordFields.padding,
  'contentOrientation': RecordFields.contentOrientation,
  'show': RecordFields.show,
  'locked': RecordFields.locked,
  'label': RecordFields.label,
  'source': RecordFields.source,
  'tint': RecordFields.tint,
  'text': RecordFields.text,
  'style': RecordFields.style,
  'split': RecordFields.split,
  'overflow': RecordFields.overflow,
  'placement': RecordFields.placement,
  'margin': RecordFields.margin,
  'animation': RecordFields.animation,
  'animationDuration': RecordFields.animationDuration,
  'opacity': RecordFields.opacity,
  'fill': RecordFields.fill,
  'stroke': RecordFields.stroke,
  'radius': RecordFields.radius,
  'eventMode': RecordFields.eventMode,
  'gap': RecordFields.gap,
};
final _rootNames = _roots.keys.toList(growable: false);
const _transforms = [
  'x',
  'y',
  'angle',
  'rotation',
  'scale',
  'scaleX',
  'scaleY',
  'skew',
  'pivot',
];

/// Compare only dependencies touched by the resolved operations. The comparison
/// does not normalize or replace the raw maps consumed by presentation queries.
int recordChangedFields(
  Map<String, Object?> before,
  Map<String, Object?> after,
  int requestedFields,
) {
  if (identical(before, after)) return 0;
  var changed = 0;
  var roots = requestedFields & (RecordFields.attrsTransform - 1);
  while (roots != 0) {
    final bit = roots & -roots;
    roots ^= bit;
    final key = _rootNames[bit.bitLength - 1];
    final equal = key == 'size'
        ? _sizeEqual(before[key], after[key])
        : presentationEqual(before[key], after[key]);
    if (before.containsKey(key) != after.containsKey(key) || !equal) {
      changed |= bit;
    }
  }
  if (requestedFields & RecordFields.attrs == 0) return changed;
  final oldAttrs = before['attrs'], newAttrs = after['attrs'];
  if (identical(oldAttrs, newAttrs)) return changed;
  final old = oldAttrs is Map ? oldAttrs : const {};
  final next = newAttrs is Map ? newAttrs : const {};
  if (requestedFields & RecordFields.attrsTransform != 0 &&
      _transforms.any((key) => !_entryEqual(old, next, key))) {
    changed |= RecordFields.attrsTransform;
  }
  if (requestedFields & RecordFields.attrsAlpha != 0 &&
      !_entryEqual(old, next, 'alpha')) {
    changed |= RecordFields.attrsAlpha;
  }
  if (requestedFields & RecordFields.attrsZIndex != 0 &&
      !_entryEqual(old, next, 'zIndex')) {
    changed |= RecordFields.attrsZIndex;
  }
  if (requestedFields & RecordFields.attrsExtension != 0) {
    bool extension(Object? key) =>
        key != 'alpha' && key != 'zIndex' && !_transforms.contains(key);
    for (final key in old.keys) {
      if (extension(key) && !_entryEqual(old, next, key)) {
        return changed | RecordFields.attrsExtension;
      }
    }
    for (final key in next.keys) {
      if (extension(key) && !old.containsKey(key)) {
        return changed | RecordFields.attrsExtension;
      }
    }
  }
  return changed;
}

bool _entryEqual(Map before, Map after, Object? key) =>
    before.containsKey(key) == after.containsKey(key) &&
    presentationEqual(before[key], after[key]);

bool _sizeEqual(Object? before, Object? after) {
  // Axis comparison already handles dimension equality and representation
  // equivalence; avoid traversing the whole size record before those checks.
  if (identical(before, after) || before == after) return true;
  Object? axis(Object? size, String key) =>
      size is Map && !size.containsKey('value') ? size[key] : size;
  return _dimensionEqual(axis(before, 'width'), axis(after, 'width')) &&
      _dimensionEqual(axis(before, 'height'), axis(after, 'height'));
}

bool _dimensionEqual(Object? before, Object? after) {
  if (presentationEqual(before, after)) return true;
  Object? value(Object? dimension) => dimension is Map
      ? dimension['value']
      : dimension is String && dimension.endsWith('%')
      ? num.tryParse(dimension.substring(0, dimension.length - 1))
      : dimension;
  Object? unit(Object? dimension) => dimension is Map
      ? dimension['unit']
      : dimension is String && dimension.endsWith('%')
      ? '%'
      : 'px';
  return value(before) == value(after) && unit(before) == unit(after);
}
