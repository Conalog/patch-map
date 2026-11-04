import 'dart:ui';

import 'retained_update.dart';
import 'bar_transitions.dart';
import '../api/target.dart';
import '../geometry/geometry_snapshot.dart';
import '../presentation/record_delta.dart';
import '../session/session_backend.dart';
import 'draw_objects.dart';
import 'draw_plan.dart';
import 'render_resources.dart';

final class RenderPublication extends SessionPublication {
  RenderPublication(
    this.geometry,
    this.pages,
    this.resources, {
    this.changed = const [],
    this.animate = false,
    Map<int, ComponentChanges> componentChanges = const {},
    Map<(String, int), int>? counts,
    Map<DrawAsset, List<PatchMapTarget>>? targets,
    RenderPlan? previousPlan,
  }) : _componentChanges = componentChanges,
       assetCounts = counts ?? _countAssets(pages),
       assetTargets = targets ?? _assetTargets(pages),
       _plan = RenderPlan.build(
         geometry,
         pages,
         previous: previousPlan,
         changedSlots: changed,
         componentChanges: componentChanges,
       ) {
    resources.retain();
  }
  final GeometrySnapshot geometry;
  final List<RenderPage> pages;
  final RenderResources resources;
  RenderPlan? _plan;
  RenderPlan get plan =>
      _plan ?? (throw StateError('Unpublished retained candidate'));
  RetainedUpdate? _retained;
  Map<int, Rect?>? get retainedOldBounds => _retained?.oldBounds;

  RenderPublication.retained(
    RenderPublication previous,
    RetainedUpdate update, {
    required this.animate,
  }) : geometry = update.geometry,
       pages = previous.pages,
       resources = previous.resources,
       changed = List.unmodifiable(update.slots),
       _componentChanges = const {},
       assetCounts = previous.assetCounts,
       assetTargets = previous.assetTargets,
       _retained = update {
    resources.retain();
    try {
      _plan = RenderPlan.build(
        geometry,
        pages,
        previous: previous.plan,
        changedSlots: update.staticProofs.keys,
        forceChangedProof: true,
        memberOverrides: update.staticProofs,
        presentationGeometryChanges: update.presentationGeometryChanges,
      );
    } catch (_) {
      update.dispose();
      resources.release();
      rethrow;
    }
  }

  bool commitRetained(
    BarTransitions transitions,
    void Function(void Function()) retire,
  ) {
    final staged = _retained;
    if (staged == null) return false;
    staged.commit(transitions, animate, retire);
    staged.dispose();
    return true;
  }

  void finishRetained() {
    _retained = null;
  }

  final List<int> changed;
  final bool animate;
  Map<int, ComponentChanges> _componentChanges;

  /// Preparation metadata lives only through the publication handoff. Keeping
  /// per-item hints in the painted scene promotes transient allocations to old
  /// space, although neither painting nor later resource refresh uses them.
  Map<int, ComponentChanges> takeComponentChanges() {
    final changes = _componentChanges;
    _componentChanges = const {};
    return changes;
  }

  final Map<(String, int), int> assetCounts;
  final Map<DrawAsset, List<PatchMapTarget>> assetTargets;
  int references = 1;
  bool _disposed = false;
  DrawNode node(int slot) =>
      pages[slot ~/ geometry.nodes.pageSize].nodes[slot %
          geometry.nodes.pageSize];
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _componentChanges = const {};
    _retained?.dispose();
    _retained = null;
    _plan?.dispose();
    resources.text.trimUnused();
    resources.release();
  }
}

Map<(String, int), int> _countAssets(List<RenderPage> pages) {
  final counts = <(String, int), int>{};
  for (final page in pages) {
    for (final node in page.nodes) {
      for (final asset in node.assets) {
        final key = asset.creationKey;
        if (key != null) counts.update(key, (n) => n + 1, ifAbsent: () => 1);
      }
    }
  }
  return Map.unmodifiable(counts);
}

Map<DrawAsset, List<PatchMapTarget>> _assetTargets(List<RenderPage> pages) {
  final result = <DrawAsset, List<PatchMapTarget>>{};
  for (final page in pages) {
    for (final node in page.nodes) {
      for (final (asset, target) in node.assetTargets) {
        (result[asset] ??= []).add(target);
      }
    }
  }
  return Map.unmodifiable({
    for (final entry in result.entries)
      entry.key: List<PatchMapTarget>.unmodifiable(entry.value),
  });
}
