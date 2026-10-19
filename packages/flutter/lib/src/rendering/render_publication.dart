import '../api/target.dart';
import '../geometry/geometry_snapshot.dart';
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
    Map<(String, int), int>? counts,
    Map<DrawAsset, List<PatchMapTarget>>? targets,
    RenderPlan? previousPlan,
  }) : assetCounts = counts ?? _countAssets(pages),
       assetTargets = targets ?? _assetTargets(pages),
       plan = RenderPlan.build(
         geometry,
         pages,
         previous: previousPlan,
         changedSlots: changed,
       ) {
    resources.retain();
  }
  final GeometrySnapshot geometry;
  final List<RenderPage> pages;
  final RenderResources resources;
  final RenderPlan plan;
  final List<int> changed;
  final bool animate;
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
    plan.dispose();
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
