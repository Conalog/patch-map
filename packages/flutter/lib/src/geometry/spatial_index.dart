import 'dart:math' as math;
import 'dart:ui';

import 'affine.dart';

typedef _Coverage = ({int x0, int x1, int y0, int y1});

/// Broad-phase item index. Exact geometry, filtering and paint order remain
/// responsibilities of its caller. Large objects have one overflow membership.
final class SpatialIndex {
  SpatialIndex({this.cellSize = 256}) {
    if (cellSize <= 0) throw ArgumentError.value(cellSize, 'cellSize');
  }

  final int cellSize;
  static const maxCellsPerItem = 16;
  final _buckets = <(int, int), Set<int>>{};
  final _memberships = <int, List<(int, int)>>{};
  final _overflow = <int>{};
  List<int> _all = const [];
  Rect? _envelope;

  int get bucketCount => _buckets.length;
  int get overflowCount => _overflow.length;
  int get membershipCount =>
      _memberships.values.fold(0, (n, keys) => n + keys.length);
  int get scanThreshold =>
      math.max(1, math.min(4096, (_buckets.length / 4).ceil()));

  void reset(List<Rect> bounds) {
    clear();
    _all = List<int>.unmodifiable(List.generate(bounds.length, (i) => i));
    for (var i = 0; i < bounds.length; i++) {
      _add(i, bounds[i]);
    }
  }

  void update(int slot, Rect bounds) {
    if (slot < 0 || slot >= _all.length) throw RangeError.index(slot, _all);
    _validateBounds(bounds);
    _overflow.remove(slot);
    final old = _memberships.remove(slot);
    if (old != null) {
      for (final key in old) {
        final bucket = _buckets[key]!;
        bucket.remove(slot);
        if (bucket.isEmpty) _buckets.remove(key);
      }
    }
    _add(slot, bounds);
  }

  void _add(int slot, Rect bounds) {
    _validateBounds(bounds);
    // Conservative until the next reset. Shrink does not require a whole-scene
    // rescan; this envelope is never used for exact fit/visible bounds.
    _envelope = _envelope?.expandToInclude(bounds) ?? bounds;
    final coverage = _coverage(bounds, maxCellsPerItem);
    if (coverage == null) {
      _overflow.add(slot);
      return;
    }
    final keys = <(int, int)>[];
    for (var y = coverage.y0; y <= coverage.y1; y++) {
      for (var x = coverage.x0; x <= coverage.x1; x++) {
        final key = (x, y);
        (_buckets[key] ??= <int>{}).add(slot);
        keys.add(key);
      }
    }
    _memberships[slot] = keys;
  }

  Iterable<int> candidates(Rect query) {
    final bounds = _envelope;
    if (!query.isFinite || query.width < 0 || query.height < 0) {
      throw ArgumentError.value(query, 'query', 'must be finite and ordered');
    }
    if (bounds == null || !boundsOverlap(bounds, query)) return const [];
    if (query.left <= bounds.left &&
        query.top <= bounds.top &&
        query.right >= bounds.right &&
        query.bottom >= bounds.bottom) {
      return _all;
    }
    final clipped = Rect.fromLTRB(
      math.max(query.left, bounds.left),
      math.max(query.top, bounds.top),
      math.min(query.right, bounds.right),
      math.min(query.bottom, bounds.bottom),
    );
    // A coverage of T or larger takes the scan directly, without first
    // allocating candidates or enumerating T cells.
    final coverage = _coverage(clipped, scanThreshold - 1);
    if (coverage == null) return _all;
    final result = <int>{..._overflow};
    for (var y = coverage.y0; y <= coverage.y1; y++) {
      for (var x = coverage.x0; x <= coverage.x1; x++) {
        final bucket = _buckets[(x, y)];
        if (bucket != null) result.addAll(bucket);
      }
    }
    return result;
  }

  _Coverage? _coverage(Rect bounds, int limit) {
    // Preserve the experiment's checked arithmetic boundary. Large but valid
    // coordinates use overflow/scan instead of unsafe conversion or allocation.
    if (bounds.left.abs() >= 9e15 ||
        bounds.top.abs() >= 9e15 ||
        bounds.right.abs() >= 9e15 ||
        bounds.bottom.abs() >= 9e15) {
      return null;
    }
    final x0 = (bounds.left / cellSize).floor(),
        x1 = (bounds.right / cellSize).floor();
    final y0 = (bounds.top / cellSize).floor(),
        y1 = (bounds.bottom / cellSize).floor();
    final cols = x1 - x0 + 1, rows = y1 - y0 + 1;
    if (limit < 1 || cols > limit || rows > limit ~/ cols) return null;
    return (x0: x0, x1: x1, y0: y0, y1: y1);
  }

  void clear() {
    _buckets.clear();
    _memberships.clear();
    _overflow.clear();
    _all = const [];
    _envelope = null;
  }

  void _validateBounds(Rect bounds) {
    if (!bounds.isFinite || bounds.width < 0 || bounds.height < 0) {
      throw ArgumentError.value(bounds, 'bounds', 'must be finite and ordered');
    }
  }
}
