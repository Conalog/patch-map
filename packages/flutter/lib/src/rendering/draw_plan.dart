import 'dart:typed_data';
import 'dart:ui';

import '../geometry/affine.dart';
import '../geometry/geometry_snapshot.dart';
import '../presentation/record_delta.dart';
import '../presentation/presentation_layers.dart';
import 'bar_slices.dart';
import 'draw_objects.dart';
import 'rectangle_paint.dart';
import 'static_geometry.dart';

/// One publication's ordered draw plan. Owns its pages and shared static chunks;
/// never retains a prior plan/snapshot. Chunk size is a drawing policy only.
final class RenderPlan {
  RenderPlan._(
    this.geometry,
    this._pages,
    this._chunks,
    this._slotChunks,
    this.meshBuildCount,
    this.overlapComparisonCount,
    this.reusedChunkCount,
  );

  static RenderPlan build(
    GeometrySnapshot geometry,
    List<RenderPage> pages, {
    RenderPlan? previous,
    Iterable<int>? changedSlots,
    Map<int, ComponentChanges>? componentChanges,
    bool forceChangedProof = false,
    Map<int, Object?>? memberOverrides,
    Iterable<int>? presentationGeometryChanges,
  }) {
    if (previous?._disposed ?? false) {
      throw StateError('Previous render plan is disposed');
    }
    if (previous != null &&
        changedSlots != null &&
        identical(previous.geometry.topology, geometry.topology) &&
        identical(previous.geometry.paintSlots, geometry.paintSlots)) {
      return _updateRetained(
        geometry,
        pages,
        previous,
        changedSlots,
        componentChanges,
        forceChangedProof,
        memberOverrides,
        presentationGeometryChanges,
      );
    }
    final ownedPages = List<RenderPage>.unmodifiable(pages);
    for (final page in ownedPages) {
      page.retain();
    }
    final chunks = <_Chunk>[];
    final slots = geometry.paintSlots;
    final slotChunks = Int32List(geometry.nodes.length)
      ..fillRange(0, geometry.nodes.length, -1);
    var meshes = 0, comparisons = 0, reused = 0;
    DrawNode node(int slot) =>
        pages[slot ~/ geometry.nodes.pageSize].nodes[slot %
            geometry.nodes.pageSize];
    _Member? member(int slot) {
      if (previous != null &&
          identical(previous.geometry.topology, geometry.topology)) {
        final old = previous._chunkFor(slot);
        if (old != null && identical(node(slot), previous._node(slot))) {
          return old.members[previous._slotChunks[slot] % 100];
        }
      }
      return _Member.create(node(slot));
    }

    // Carry one look-ahead proof so incompatible boundaries are not prepared twice.
    _Member? pending;
    var hasPending = false;
    var transferred = false;
    try {
      for (var start = 0; start < slots.length;) {
        final first = hasPending ? pending : member(slots[start]);
        hasPending = false;
        final members = <_Member?>[first];
        var end = start + 1;
        if (first != null) {
          while (end < slots.length && end - start < 100) {
            final next = member(slots[end]);
            if (next == null || !_sameSkeleton(first, next)) {
              pending = next;
              hasPending = true;
              break;
            }
            members.add(next);
            end++;
          }
        }
        final group = List<int>.unmodifiable(slots.getRange(start, end));
        final old = previous?._chunkFor(group.first);
        _Chunk chunk;
        if (old != null && _sameChunk(old, group, members)) {
          chunk = old;
          reused++;
        } else {
          var safe = first != null;
          if (safe) {
            for (var i = 0; i < members.length && safe; i++) {
              for (var j = i + 1; j < members.length; j++) {
                comparisons++;
                if (boundsOverlap(members[i]!.bounds, members[j]!.bounds)) {
                  safe = false;
                  break;
                }
              }
            }
          }
          final background = _backgroundGeometry(old, members, safe);
          if (background != null && !identical(background, old?._background)) {
            meshes++;
          }
          chunk = _Chunk(group, List.unmodifiable(members), safe, background);
        }
        final chunkIndex = chunks.length;
        for (var offset = 0; offset < group.length; offset++) {
          slotChunks[group[offset]] = chunkIndex * 100 + offset;
        }
        chunk.retain();
        chunks.add(chunk);
        start = end;
      }
      final plan = RenderPlan._(
        geometry,
        ownedPages,
        List.unmodifiable(chunks),
        slotChunks,
        meshes,
        comparisons,
        reused,
      );
      plan._inheritPresentation(previous);
      transferred = true;
      return plan;
    } finally {
      if (!transferred) {
        for (final chunk in chunks) {
          chunk.release();
        }
        for (final page in ownedPages) {
          page.release();
        }
      }
    }
  }

  /// Stable topology/order keeps chunk boundaries and the slot lookup. A sparse
  /// update validates only affected members/chunks, never every retained item.
  static RenderPlan _updateRetained(
    GeometrySnapshot geometry,
    List<RenderPage> pages,
    RenderPlan previous,
    Iterable<int> changedSlots,
    Map<int, ComponentChanges>? componentChanges,
    bool forceChangedProof,
    Map<int, Object?>? memberOverrides,
    Iterable<int>? presentationGeometryChanges,
  ) {
    final ownedPages = List<RenderPage>.unmodifiable(pages);
    for (final page in ownedPages) {
      page.retain();
    }
    final chunks = List<_Chunk>.of(previous._chunks);
    for (final chunk in chunks) {
      chunk.retain();
    }
    var transferred = false, meshes = 0, comparisons = 0;
    var reused = chunks.length;
    try {
      final changed = changedSlots.toSet();
      final affected = <int>{};
      for (final slot in changed) {
        final index = previous._slotChunks[slot];
        if (index >= 0) affected.add(index ~/ 100);
      }
      for (final index in affected) {
        final old = chunks[index];
        List<_Member?>? replacements;
        for (var offset = 0; offset < old.slots.length; offset++) {
          final slot = old.slots[offset];
          if (!changed.contains(slot)) continue;
          final node = pages[slot ~/ geometry.nodes.pageSize]
              .nodes[slot % geometry.nodes.pageSize];
          if (!forceChangedProof &&
              _sameStaticInputs(
                previous._node(slot),
                node,
                componentChanges?[slot],
              )) {
            continue;
          }
          final next =
              memberOverrides != null && memberOverrides.containsKey(slot)
              ? memberOverrides[slot] as _Member?
              : _Member.create(node);
          if (_sameMember(old.members[offset], next)) continue;
          (replacements ??= List<_Member?>.of(old.members))[offset] = next;
        }
        if (replacements == null) continue;
        final members = replacements;
        final first = members.first;
        var safe =
            first != null &&
            members.every(
              (member) => member != null && _sameSkeleton(first, member),
            );
        if (safe) {
          for (var i = 0; i < members.length && safe; i++) {
            for (var j = i + 1; j < members.length; j++) {
              comparisons++;
              if (boundsOverlap(members[i]!.bounds, members[j]!.bounds)) {
                safe = false;
                break;
              }
            }
          }
        }
        final background = _backgroundGeometry(old, members, safe);
        if (background != null && !identical(background, old._background)) {
          meshes++;
        }
        final replacement = _Chunk(
          old.slots,
          List.unmodifiable(members),
          safe,
          background,
        )..retain();
        chunks[index] = replacement;
        old.release();
        reused--;
      }
      final plan = RenderPlan._(
        geometry,
        ownedPages,
        List.unmodifiable(chunks),
        previous._slotChunks,
        meshes,
        comparisons,
        reused,
      );
      plan._inheritPresentation(
        previous,
        geometryChanges: presentationGeometryChanges,
      );
      transferred = true;
      return plan;
    } finally {
      if (!transferred) {
        for (final chunk in chunks) {
          chunk.release();
        }
        for (final page in ownedPages) {
          page.release();
        }
      }
    }
  }

  /// Immutable static proof values are prepared before any live handle mutates.
  static Object? prepareRetainedMember(
    DrawNode node,
    Map<int, (Map<String, Object?>, Rect, Affine, DrawContent)> components,
    Rect? paintBounds,
  ) => _Member.create(node, overrides: components, paintBounds: paintBounds);

  final GeometrySnapshot geometry;
  final List<RenderPage> _pages;
  final List<_Chunk> _chunks;
  final Int32List _slotChunks;
  final _visible = Int32List(100);
  final _bars = BarSliceBatch();
  final int meshBuildCount, overlapComparisonCount, reusedChunkCount;
  bool _disposed = false;
  PresentationOpacity? _presentation;
  Map<_Chunk, _SharedGeometry?>? _presentationMeshes;

  /// Detach native variants now; the existing retirement owner releases them
  /// after submission. Only layers allocate variants, never the ordinary path.
  void Function()? setPresentation(PresentationOpacity? opacity) {
    if (identical(_presentation, opacity)) return null;
    _presentation = opacity;
    final old = _presentationMeshes;
    _presentationMeshes = null;
    if (old == null) return null;
    return () {
      for (final mesh in old.values) {
        mesh?.release();
      }
    };
  }

  int get presentationMeshCount =>
      _presentationMeshes?.values.whereType<_SharedGeometry>().length ?? 0;
  bool get hasPresentationCache => _presentationMeshes != null;
  Iterable<Object> get presentationMeshIdentities =>
      _presentationMeshes?.values.whereType<_SharedGeometry>().map(
        (v) => v.mesh,
      ) ??
      const [];

  void _inheritPresentation(
    RenderPlan? previous, {
    Iterable<int>? geometryChanges,
  }) {
    _presentation = previous?._presentation;
    final old = previous?._presentationMeshes;
    if (old == null) return;
    // Retained publication stages scalar changes before mutating live layouts.
    // A whole-item envelope can stay equal while a visible component moves
    // inside an alpha-hidden overflow envelope. Invalidate that narrower proof.
    Set<_Chunk?>? changed;
    if (geometryChanges != null) {
      for (final slot in geometryChanges) {
        (changed ??= {}).add(previous!._chunkFor(slot));
      }
    }
    Map<_Chunk, _SharedGeometry?>? shared;
    for (final chunk in _chunks) {
      if (!old.containsKey(chunk)) continue;
      if (chunk.mesh == null &&
          ((changed?.contains(chunk) ?? false) ||
              (geometryChanges == null &&
                  !_samePresentationGeometry(previous!, chunk)))) {
        continue;
      }
      final entry = old[chunk];
      entry?.retain();
      (shared ??= {})[chunk] = entry;
    }
    _presentationMeshes = shared;
  }

  bool _samePresentationGeometry(RenderPlan previous, _Chunk chunk) {
    for (final slot in chunk.slots) {
      final before = previous._node(slot).geometry.item;
      final after = _node(slot).geometry.item;
      if (!identical(before, after) &&
          (before == null || after == null || !before.sameEnvelope(after))) {
        return false;
      }
    }
    return true;
  }

  bool get isDisposed => _disposed;
  int get chunkCount => _chunks.length;
  int get staticChunkCount => _chunks.where((c) => c.mesh != null).length;
  Iterable<Object> get staticMeshIdentities =>
      _chunks.where((c) => c.mesh != null).map((c) => c.mesh!);
  int get barSubmissionCount => _bars.submissionCount;

  DrawNode _node(int slot) =>
      _pages[slot ~/ geometry.nodes.pageSize].nodes[slot %
          geometry.nodes.pageSize];
  _Chunk? _chunkFor(int slot) =>
      slot < 0 || slot >= _slotChunks.length || _slotChunks[slot] < 0
      ? null
      : _chunks[_slotChunks[slot] ~/ 100];

  /// [visibleSlots] must be unique and in GeometrySnapshot.paintSlots order.
  /// The Canvas already carries the world camera. Dynamic content is visible
  /// only; a visible safe chunk submits its retained background mesh once.
  void paint(
    Canvas canvas, {
    required List<int> visibleSlots,
    required double cameraRotation,
    required double physicalScale,
    Rect? Function(int slot, String componentId)? barRectangle,
  }) {
    if (_disposed) throw StateError('Render plan is disposed');
    final presentation = _presentation;
    if (presentation != null) {
      _paintPresented(
        canvas,
        visibleSlots,
        cameraRotation,
        physicalScale,
        barRectangle,
        presentation,
      );
      return;
    }
    try {
      var cursor = 0;
      while (cursor < visibleSlots.length) {
        final first = visibleSlots[cursor];
        final chunk = _chunkFor(first);
        if (chunk == null) {
          cursor++;
          continue;
        }
        var count = 0;
        do {
          _visible[count++] = visibleSlots[cursor++];
        } while (cursor < visibleSlots.length &&
            identical(_chunkFor(visibleSlots[cursor]), chunk));
        final mesh = chunk.mesh;
        if (mesh == null) {
          for (var i = 0; i < count; i++) {
            _paintNode(
              canvas,
              _visible[i],
              cameraRotation,
              physicalScale,
              barRectangle,
            );
          }
          continue;
        }
        _bars.flush(canvas);
        mesh.draw(canvas);
        final proof = chunk.members.first!;
        for (
          var phase = proof.backgrounds.length;
          phase < proof.skeleton.length;
          phase++
        ) {
          for (var i = 0; i < count; i++) {
            final slot = _visible[i], current = _node(slot);
            final layout = current.components[phase].layout;
            current.paintComponent(
              canvas,
              phase,
              cameraRotation: cameraRotation,
              physicalScale: physicalScale,
              bars: _bars,
              displayBox: layout.type == 'bar'
                  ? barRectangle?.call(slot, layout.id)
                  : null,
            );
          }
        }
      }
    } finally {
      _bars.flush(canvas);
    }
  }

  // Separate entry keeps the ordinary loop free of per-item layer lookups.
  void _paintPresented(
    Canvas canvas,
    List<int> visibleSlots,
    double rotation,
    double scale,
    Rect? Function(int, String)? rectangle,
    PresentationOpacity presentation,
  ) {
    try {
      var cursor = 0;
      while (cursor < visibleSlots.length) {
        final chunk = _chunkFor(visibleSlots[cursor]);
        if (chunk == null) {
          cursor++;
          continue;
        }
        var count = 0;
        do {
          _visible[count++] = visibleSlots[cursor++];
        } while (cursor < visibleSlots.length &&
            identical(_chunkFor(visibleSlots[cursor]), chunk));
        final mesh = _presentedMesh(chunk, presentation);
        if (mesh == null) {
          for (var i = 0; i < count; i++) {
            _paintNode(
              canvas,
              _visible[i],
              rotation,
              scale,
              rectangle,
              presentation: presentation,
            );
          }
          continue;
        }
        _bars.flush(canvas);
        mesh.draw(canvas);
        final proof = chunk.members.first!;
        for (
          var phase = proof.backgrounds.length;
          phase < proof.skeleton.length;
          phase++
        ) {
          for (var i = 0; i < count; i++) {
            final slot = _visible[i], node = _node(slot);
            final layout = node.components[phase].layout;
            node.paintComponent(
              canvas,
              phase,
              cameraRotation: rotation,
              physicalScale: scale,
              bars: _bars,
              displayBox: layout.type == 'bar'
                  ? rectangle?.call(slot, layout.id)
                  : null,
              alphaMultiplier: presentation.alpha(node.geometry.id, layout.id),
            );
          }
        }
      }
    } finally {
      _bars.flush(canvas);
    }
  }

  StaticGeometry? _presentedMesh(_Chunk chunk, PresentationOpacity opacity) {
    final cache = _presentationMeshes ??= {};
    if (cache.containsKey(chunk)) return cache[chunk]?.mesh ?? chunk.mesh;
    if (chunk.mesh == null && !_disjointPresented(chunk, opacity)) {
      cache[chunk] = null;
      return null;
    }
    var changed = false;
    for (final member in chunk.members) {
      for (var i = 0; i < member!.backgrounds.length; i++) {
        if (opacity.alpha(member.id, member.skeleton[i].$1) != 1) {
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
    if (!changed) {
      // Geometry does not depend on the overlap proof. A text reveal can make
      // batching unsafe without invalidating the unchanged background vertices.
      final background = chunk._background ??= _buildBackground(chunk.members);
      if (chunk.mesh != null) {
        cache[chunk] = null;
      } else {
        background?.retain();
        cache[chunk] = background;
      }
      return background?.mesh;
    }
    final shapes = <StaticRectangle>[];
    for (final member in chunk.members) {
      for (var i = 0; i < member!.backgrounds.length; i++) {
        final shape = member.backgrounds[i];
        final alpha = opacity.alpha(member.id, member.skeleton[i].$1);
        shapes.add(
          alpha == 1
              ? shape
              : StaticRectangle(
                  shape.rect,
                  shape.world,
                  shape.paint.multipliedAlpha(alpha),
                ),
        );
      }
    }
    final mesh = StaticGeometry.tryBuild(shapes);
    cache[chunk] = mesh == null ? null : _SharedGeometry(mesh);
    return mesh;
  }

  bool _disjointPresented(_Chunk chunk, PresentationOpacity opacity) {
    final first = chunk.members.first;
    if (first == null) return false;
    final bounds = <Rect>[];
    for (var i = 0; i < chunk.members.length; i++) {
      final member = chunk.members[i];
      if (member == null || !_sameSkeleton(first, member)) return false;
      final node = _node(chunk.slots[i]).geometry;
      final bound = opacity.affects(member.id)
          ? node.item!.paintBounds(
              node.world,
              includeComponent: (id) => opacity.alpha(member.id, id) != 0,
            )
          : member.bounds;
      for (final other in bounds) {
        if (boundsOverlap(bound, other)) return false;
      }
      bounds.add(bound);
    }
    return true;
  }

  void _paintNode(
    Canvas canvas,
    int slot,
    double rotation,
    double scale,
    Rect? Function(int, String)? rectangle, {
    PresentationOpacity? presentation,
  }) {
    final node = _node(slot);
    if (!node.geometry.visible || node.geometry.opacity == 0) return;
    if (node.geometry.item == null) {
      node.paint(
        canvas,
        cameraRotation: rotation,
        physicalScale: scale,
        bars: _bars,
        alphaMultiplier: presentation?.alpha(node.geometry.id) ?? 1,
      );
      return;
    }
    for (var i = 0; i < node.components.length; i++) {
      final layout = node.components[i].layout;
      node.paintComponent(
        canvas,
        i,
        cameraRotation: rotation,
        physicalScale: scale,
        bars: _bars,
        alphaMultiplier: presentation?.alpha(node.geometry.id, layout.id) ?? 1,
        displayBox: layout.type == 'bar'
            ? rectangle?.call(slot, layout.id)
            : null,
      );
    }
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _bars.dispose();
    setPresentation(null)?.call();
    for (final chunk in _chunks) {
      chunk.release();
    }
    for (final page in _pages) {
      page.release();
    }
  }
}

// Chunks and current presentation variants share immutable background vertices.
// The lease owns no old plan, node, or dynamic resource.
final class _SharedGeometry {
  _SharedGeometry(this.mesh);
  final StaticGeometry mesh;
  int _references = 1;
  void retain() => _references++;
  void release() {
    if (--_references == 0) mesh.dispose();
    if (_references < 0) {
      throw StateError('Unbalanced presentation mesh reference');
    }
  }
}

final class _Chunk {
  _Chunk(this.slots, this.members, this._batchSafe, this._background);
  final List<int> slots;
  final List<_Member?> members;
  final bool _batchSafe;
  _SharedGeometry? _background;
  StaticGeometry? get mesh => _batchSafe ? _background?.mesh : null;
  int _references = 0;
  void retain() => _references++;
  void release() {
    if (--_references == 0) _background?.release();
    if (_references < 0) throw StateError('Unbalanced static chunk reference');
  }
}

_SharedGeometry? _buildBackground(List<_Member?> members) {
  final mesh = StaticGeometry.tryBuild([
    for (final member in members) ...member!.backgrounds,
  ]);
  return mesh == null ? null : _SharedGeometry(mesh);
}

_SharedGeometry? _backgroundGeometry(
  _Chunk? previous,
  List<_Member?> members,
  bool safe,
) {
  final existing = previous?._background;
  if (existing != null && previous!.members.length == members.length) {
    var same = true;
    for (var i = 0; i < members.length; i++) {
      if (!_sameBackground(previous.members[i], members[i])) {
        same = false;
        break;
      }
    }
    if (same) {
      existing.retain();
      return existing;
    }
  }
  return safe ? _buildBackground(members) : null;
}

// Contains only static proof values, never the old DrawNode/dynamic resources.
final class _Member {
  _Member(this.id, this.skeleton, this.backgrounds, this.bounds, this.world);
  final String id;
  final List<(String, String, bool, bool)> skeleton;
  final List<StaticRectangle> backgrounds;
  final Rect bounds;
  final Affine world;

  static _Member? create(
    DrawNode node, {
    Map<int, (Map<String, Object?>, Rect, Affine, DrawContent)>? overrides,
    Rect? paintBounds,
  }) {
    final geometry = node.geometry, item = geometry.item;
    if (item == null ||
        !geometry.visible ||
        geometry.opacity == 0 ||
        geometry.paintBounds == null) {
      return null;
    }
    final backgrounds = <StaticRectangle>[];
    final skeleton = <(String, String, bool, bool)>[];
    var prefix = true;
    final bounds = paintBounds ?? geometry.paintBounds!;
    var index = 0;
    for (final component in node.components) {
      final layout = component.layout, override = overrides?[index++];
      final data = override?.$1 ?? layout.data;
      final box = override?.$2 ?? layout.box;
      final transform = override?.$3 ?? layout.transform;
      final content = override?.$4 ?? component.content;
      final visible = data['show'] != false;
      skeleton.add((layout.id, layout.type, visible, layout.upright));
      if (layout.type != 'background') {
        prefix = false;
        continue;
      }
      if (!prefix || content is! RectangleContent || layout.upright) {
        return null;
      }
      final paint = content.style;
      // Keep the full authored rectangle; the centered border extends outside.
      final rect = Offset.zero & box.size;
      final shape = StaticRectangle(
        rect,
        geometry.world.multiply(transform),
        paint,
      );
      if (!StaticGeometry.isEligible(shape)) return null;
      backgrounds.add(shape);
    }
    if (backgrounds.isEmpty) return null;
    // Invisible prefix slots use the exact path, preserving their phase index.
    if (skeleton.take(backgrounds.length).any((c) => !c.$3)) {
      return null;
    }
    return _Member(
      geometry.id,
      List.unmodifiable(skeleton),
      List.unmodifiable(backgrounds),
      bounds,
      geometry.world,
    );
  }
}

// This is exactly the input boundary of _Member.create: dynamic paint content
// does not enter a static proof, while its final conservative envelope does.
// Inspect the two live publications; the proof stores no previous node/resource.
bool _sameStaticInputs(
  DrawNode before,
  DrawNode after,
  ComponentChanges? changed,
) {
  if (identical(before, after)) return true;
  final a = before.geometry, b = after.geometry;
  if (a.item == null ||
      b.item == null ||
      a.id != b.id ||
      a.visible != b.visible ||
      a.opacity != b.opacity ||
      !identical(a.world, b.world) ||
      a.paintBounds != b.paintBounds ||
      before.components.length != after.components.length) {
    return false;
  }
  if (changed != null && !identical(a.item!.indices, b.item!.indices)) {
    return false;
  }
  if (changed != null) {
    for (final entry in changed) {
      final index = entry.index;
      if (!_sameStaticComponent(
        before.components[index],
        after.components[index],
      )) {
        return false;
      }
    }
  } else {
    for (var i = 0; i < before.components.length; i++) {
      if (!_sameStaticComponent(before.components[i], after.components[i])) {
        return false;
      }
    }
  }
  return true;
}

bool _sameStaticComponent(DrawComponent old, DrawComponent next) {
  if (identical(old, next)) return true;
  final x = old.layout, y = next.layout;
  if (x.id != y.id ||
      x.type != y.type ||
      x.visible != y.visible ||
      x.upright != y.upright) {
    return false;
  }
  if (x.type == 'background' &&
      (!identical(old.content, next.content) ||
          !identical(x.transform, y.transform) ||
          x.box.width != y.box.width ||
          x.box.height != y.box.height)) {
    return false;
  }
  return true;
}

bool _sameSkeleton(_Member a, _Member b) {
  if (a.backgrounds.length != b.backgrounds.length ||
      a.skeleton.length != b.skeleton.length) {
    return false;
  }
  for (var i = 0; i < a.skeleton.length; i++) {
    if (a.skeleton[i] != b.skeleton[i]) return false;
  }
  return true;
}

bool _sameChunk(_Chunk old, List<int> slots, List<_Member?> members) {
  if (old.slots.length != slots.length) return false;
  for (var i = 0; i < slots.length; i++) {
    if (old.slots[i] != slots[i] || !_sameMember(old.members[i], members[i])) {
      return false;
    }
  }
  return true;
}

bool _sameMember(_Member? a, _Member? b) {
  if (identical(a, b)) return true;
  if (a == null ||
      b == null ||
      a.id != b.id ||
      a.bounds != b.bounds ||
      !a.world.sameTransform(b.world) ||
      !_sameSkeleton(a, b)) {
    return false;
  }
  return _sameBackground(a, b);
}

bool _sameBackground(_Member? a, _Member? b) {
  if (identical(a, b)) return true;
  if (a == null || b == null || a.backgrounds.length != b.backgrounds.length) {
    return false;
  }
  for (var i = 0; i < a.backgrounds.length; i++) {
    final x = a.backgrounds[i], y = b.backgrounds[i];
    if (x.rect != y.rect ||
        !x.world.sameTransform(y.world) ||
        !_samePaint(x.paint, y.paint)) {
      return false;
    }
  }
  return true;
}

bool _samePaint(RectanglePaint a, RectanglePaint b) =>
    identical(a, b) ||
    (a.fillColor == b.fillColor &&
        a.strokeColor == b.strokeColor &&
        a.strokeWidth == b.strokeWidth &&
        a.uniformRadius == b.uniformRadius);
