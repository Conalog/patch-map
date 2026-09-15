part of 'controller.dart';

Object? _authoredBarHeight(Object? size) =>
    size is Map && (size.containsKey('width') || size.containsKey('height'))
    ? size['height']
    : size;

typedef _BarPlan = ({double from, double to, bool animate, double duration});

class _BarTween {
  const _BarTween(this.from, this.to, this.start, this.duration);
  final double from, to, start, duration;
  double sample(double time) {
    final t = duration <= 0 ? 1.0 : ((time - start) / duration).clamp(0.0, 1.0);
    final inverse = 1 - t, eased = 1 - inverse * inverse * inverse;
    return from * (1 - eased) + to * eased;
  }
}

/// Immutable columns compiled once per accepted batch, sampled without JSON
/// maps, target resolution, or per-bar tween allocations on animation frames.
class _BarColumns {
  _BarColumns(Map<String, _BarTween> tweens)
    : keys = List.unmodifiable(tweens.keys),
      from = Float64List(tweens.length),
      to = Float64List(tweens.length),
      start = Float64List(tweens.length),
      duration = Float64List(tweens.length) {
    var i = 0;
    for (final tween in tweens.values) {
      from[i] = tween.from;
      to[i] = tween.to;
      start[i] = tween.start;
      duration[i] = tween.duration;
      i++;
    }
  }
  final List<String> keys;
  final Float64List from, to, start, duration;
  ({Float64List heights, bool active}) sample(double time, bool reducedMotion) {
    final values = Float64List(keys.length);
    var active = false;
    for (var i = 0; i < keys.length; i++) {
      final t = reducedMotion || duration[i] <= 0
          ? 1.0
          : ((time - start[i]) / duration[i]).clamp(0.0, 1.0);
      final inverse = 1 - t, eased = 1 - inverse * inverse * inverse;
      values[i] = from[i] * (1 - eased) + to[i] * eased;
      active |= t < 1;
    }
    return (heights: values, active: active);
  }
}

/// JSON compatibility is lazy. Render projection consumes the numeric columns;
/// snapshot callers still see the same detached overlay values on demand.
class _BarHeightOverlay extends MapBase<String, JsonMap> {
  _BarHeightOverlay(
    this.base,
    this.barKeys,
    this.heights, {
    required this.incremental,
  });
  final Map<String, JsonMap> base;
  final List<String> barKeys;
  final Float64List heights;
  final bool incremental;
  late final Map<String, int> _slots = {
    for (var i = 0; i < barKeys.length; i++) barKeys[i]: i,
  };
  @override
  Iterable<String> get keys sync* {
    yield* base.keys;
    for (final key in barKeys) {
      if (!base.containsKey(key)) yield key;
    }
  }

  @override
  JsonMap? operator [](Object? key) {
    final slot = _slots[key];
    final prior = base[key];
    if (slot == null) return prior;
    return _BarPatchView(prior, heights[slot]);
  }

  @override
  void operator []=(String key, JsonMap value) =>
      throw UnsupportedError('Read-only frame');
  @override
  void clear() => throw UnsupportedError('Read-only frame');
  @override
  JsonMap? remove(Object? key) => throw UnsupportedError('Read-only frame');
}

class _PreparedBars {
  const _PreparedBars(this.tweens, this.columns, this.overlay);
  final Map<String, _BarTween> tweens;
  final _BarColumns columns;
  final _BarHeightOverlay? overlay;
}

extension _BarAnimations on PatchMapController {
  void _planBarDestination(
    PatchMapNode node,
    JsonMap operation,
    Map<String, JsonMap> overlays,
    bool? animate,
    Map<String, _BarPlan> plans,
  ) {
    if (operation['bar'] is! Map ||
        !(operation['bar'] as Map).containsKey('height'))
      return;
    final part = _map(operation['bar']);
    final bars = node.components.where(
      (v) =>
          v['type'] == 'bar' &&
          (part['componentId'] == null || v['id'] == part['componentId']),
    );
    if (bars.length != 1) return;
    final bar = bars.single, key = '${node.id}\u0000${bars.single['id']}';
    final geometry = _geometryFor(dataset, _animatedOverlays ?? _overlays);
    final size = bar['size'];
    final authored = _authoredBarHeight(size);
    final restored = geometry.resolveBarHeight(key, authored);
    final effective = overlays[key]?['size'];
    final current =
        _barTweens[key]?.sample(_clockMs) ??
        (effective is Map && effective['height'] != null
            ? geometry.resolveBarHeight(key, effective['height'])
            : restored);
    final destination = part['height'] == null
        ? restored
        : geometry.resolveBarHeight(key, part['height']);
    plans[key] = (
      from: current,
      to: destination,
      animate: !reducedMotion && (animate ?? bar['animation'] != false),
      duration: _number(bar['animationDuration'], 200),
    );
  }

  _PreparedBars _prepareBars(
    Map<String, _BarPlan> plans,
    PatchMapDataset candidate,
    Map<String, JsonMap> overlays, {
    List<String> changedKeys = const [],
    Float64List? changedHeights,
    bool incremental = false,
  }) {
    final tweens = Map<String, _BarTween>.of(_barTweens);
    for (final entry in plans.entries) {
      final plan = entry.value;
      if (plan.animate && plan.from != plan.to && plan.duration > 0) {
        tweens[entry.key] = _BarTween(
          plan.from,
          plan.to,
          _clockMs,
          plan.duration,
        );
      } else {
        tweens.remove(entry.key);
      }
    }
    // Reconcile only live tweens at the publication boundary. Authored edits
    // and history may remove a component or change its effective destination.
    // Sampling frames still use the compiled numeric columns exclusively.
    PatchMapGeometry? candidateGeometry;
    tweens.removeWhere((key, value) {
      final split = key.indexOf('\u0000');
      final node = candidate.nodes[key.substring(0, split)];
      if (node == null || _clockMs - value.start >= value.duration) return true;
      if (incremental || plans.containsKey(key)) return false;
      final componentId = key.substring(split + 1);
      final bars = node.components.where(
        (v) => v['id'] == componentId && v['type'] == 'bar',
      );
      if (bars.isEmpty) return true;
      final bar = bars.single;
      final size = bar['size'];
      final authored = _authoredBarHeight(size);
      final overlaySize = overlays[key]?['size'];
      final height = overlaySize is Map
          ? overlaySize['height'] ?? authored
          : authored;
      candidateGeometry ??= _geometryFor(candidate, overlays);
      return candidateGeometry!.resolveBarHeight(key, height) != value.to;
    });
    final columns = _BarColumns(tweens);
    final sampled = columns.sample(_clockMs, reducedMotion);
    _BarHeightOverlay? overlay;
    if (changedKeys.isNotEmpty && columns.keys.isEmpty) {
      overlay = _BarHeightOverlay(
        overlays,
        changedKeys,
        changedHeights!,
        incremental: incremental,
      );
    } else if (changedKeys.length == columns.keys.length &&
        Iterable<int>.generate(
          changedKeys.length,
        ).every((i) => changedKeys[i] == columns.keys[i])) {
      if (columns.keys.isNotEmpty)
        overlay = _BarHeightOverlay(
          overlays,
          columns.keys,
          sampled.heights,
          incremental: incremental,
        );
    } else if (changedKeys.isNotEmpty) {
      final merged = <String, double>{
        for (var i = 0; i < changedKeys.length; i++)
          changedKeys[i]: changedHeights![i],
        for (var i = 0; i < columns.keys.length; i++)
          columns.keys[i]: sampled.heights[i],
      };
      overlay = _BarHeightOverlay(
        overlays,
        List.unmodifiable(merged.keys),
        Float64List.fromList(merged.values.toList()),
        incremental: incremental,
      );
    } else if (columns.keys.isNotEmpty) {
      overlay = _BarHeightOverlay(
        overlays,
        columns.keys,
        sampled.heights,
        incremental: incremental,
      );
    }
    return _PreparedBars(tweens, columns, overlay);
  }

  void _installBars(_PreparedBars prepared) {
    _barTweens = prepared.tweens;
    _barColumns = prepared.columns;
    _animatedOverlays = prepared.overlay;
  }

  void _settleBars() {
    if (_barTweens.isEmpty) return;
    final sampled = _barColumns!.sample(_clockMs, true);
    _animatedOverlays = _BarHeightOverlay(
      _overlays,
      _barColumns!.keys,
      sampled.heights,
      incremental: true,
    );
    _barTweens = {};
  }

  bool _advanceBars(double time) {
    if (_barTweens.isEmpty) return false;
    final sampled = _barColumns!.sample(time, reducedMotion);
    _animatedOverlays = _BarHeightOverlay(
      _overlays,
      _barColumns!.keys,
      sampled.heights,
      incremental: true,
    );
    if (!sampled.active) _barTweens = {};
    return sampled.active;
  }
}

/// Copy-on-write instance bar column. It flattens earlier columns instead of
/// retaining a chain of batches; unchanged slot indexes are shared by snapshots.
class _BarOverlayStore extends MapBase<String, JsonMap> {
  _BarOverlayStore._(this.base, this.slots, this.rawValues);
  factory _BarOverlayStore.apply(
    Map<String, JsonMap> previous,
    List<String> keys,
    Float64List heights,
  ) {
    final old = previous is _BarOverlayStore ? previous : null;
    Map<String, int> slots = old?.slots ?? const {};
    var copiedSlots = false;
    for (final key in keys) {
      if (!slots.containsKey(key)) {
        if (!copiedSlots) {
          slots = Map.of(slots);
          copiedSlots = true;
        }
        slots[key] = slots.length;
      }
    }
    final rawValues = Float64List(slots.length)
      ..fillRange(0, slots.length, double.nan);
    if (old != null) rawValues.setRange(0, old.rawValues.length, old.rawValues);
    for (var i = 0; i < keys.length; i++)
      rawValues[slots[keys[i]]!] = heights[i];
    return _BarOverlayStore._(
      old?.base ?? previous,
      copiedSlots ? Map.unmodifiable(slots) : slots,
      rawValues,
    );
  }
  final Map<String, JsonMap> base;
  final Map<String, int> slots;
  final Float64List rawValues;
  Object? rawHeight(String key) {
    final slot = slots[key];
    if (slot != null) return rawValues[slot].isNaN ? null : rawValues[slot];
    return (base[key]?['size'] as Map?)?['height'];
  }

  @override
  JsonMap? operator [](Object? key) {
    final slot = slots[key], prior = base[key];
    if (slot == null) return prior;
    final result = _BarPatchView(prior, rawValues[slot]);
    return result.isEmpty ? null : result;
  }

  @override
  Iterable<String> get keys sync* {
    for (final key in base.keys) {
      if (this[key] != null) yield key;
    }
    for (final key in slots.keys) {
      if (!base.containsKey(key) && !rawValues[slots[key]!].isNaN) yield key;
    }
  }

  @override
  bool containsKey(Object? key) {
    final slot = slots[key];
    return slot == null
        ? base.containsKey(key)
        : !rawValues[slot].isNaN || this[key] != null;
  }

  @override
  void operator []=(String key, JsonMap value) =>
      throw UnsupportedError('Read-only bar column');
  @override
  void clear() => throw UnsupportedError('Read-only bar column');
  @override
  JsonMap? remove(Object? key) =>
      throw UnsupportedError('Read-only bar column');
}

/// Immutable JSON access to one typed height, without materializing copies of
/// its authored patch and nested size. Frame overlays flatten destination views
/// so repeated reads retain no chain of intermediate patches.
class _BarPatchView extends MapBase<String, dynamic> {
  factory _BarPatchView(JsonMap? prior, double height) =>
      _BarPatchView._(prior is _BarPatchView ? prior.prior : prior, height);
  _BarPatchView._(this.prior, this.height);
  final JsonMap? prior;
  final double height;
  late final _BarSizeView _size = _BarSizeView(
    prior?['size'] is JsonMap ? prior!['size'] as JsonMap : const {},
    height,
  );
  @override
  dynamic operator [](Object? key) =>
      key == 'size' ? (_size.isEmpty ? null : _size) : prior?[key];
  @override
  bool containsKey(Object? key) =>
      key == 'size' ? !_size.isEmpty : (prior?.containsKey(key) ?? false);
  @override
  int get length =>
      (prior?.length ?? 0) -
      ((prior?.containsKey('size') ?? false) ? 1 : 0) +
      (_size.isEmpty ? 0 : 1);
  @override
  bool get isEmpty => length == 0;
  @override
  Iterable<String> get keys sync* {
    if (prior != null) {
      for (final key in prior!.keys) {
        if (key != 'size' || !_size.isEmpty) yield key;
      }
    }
    if (!(prior?.containsKey('size') ?? false) && !_size.isEmpty) yield 'size';
  }

  @override
  void operator []=(String key, dynamic value) =>
      throw UnsupportedError('Read-only bar patch');
  @override
  void clear() => throw UnsupportedError('Read-only bar patch');
  @override
  dynamic remove(Object? key) => throw UnsupportedError('Read-only bar patch');
}

class _BarSizeView extends MapBase<String, dynamic> {
  _BarSizeView(this.prior, this.height);
  final JsonMap prior;
  final double height;
  @override
  dynamic operator [](Object? key) =>
      key == 'height' ? (height.isNaN ? null : height) : prior[key];
  @override
  bool containsKey(Object? key) =>
      key == 'height' ? !height.isNaN : prior.containsKey(key);
  @override
  int get length =>
      prior.length -
      (prior.containsKey('height') ? 1 : 0) +
      (height.isNaN ? 0 : 1);
  @override
  bool get isEmpty => length == 0;
  @override
  Iterable<String> get keys sync* {
    for (final key in prior.keys) {
      if (key != 'height' || !height.isNaN) yield key;
    }
    if (!prior.containsKey('height') && !height.isNaN) yield 'height';
  }

  @override
  void operator []=(String key, dynamic value) =>
      throw UnsupportedError('Read-only bar size');
  @override
  void clear() => throw UnsupportedError('Read-only bar size');
  @override
  dynamic remove(Object? key) => throw UnsupportedError('Read-only bar size');
}
