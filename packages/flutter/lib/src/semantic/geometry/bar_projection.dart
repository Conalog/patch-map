import 'dart:math' as math;
import 'dart:typed_data';
import 'placement.dart';
import 'primitives.dart';

/// Immutable bar-only projection candidate. Unknown topology or relation scope
/// changes fall back to the complete geometry authority, preserving semantics.
PatchMapGeometry? projectBarHeights(
  PatchMapGeometry previous,
  List<String> keys,
  Float64List heights,
) {
  if (keys.length != heights.length) return null;
  for (final key in keys)
    if (!previous.barBindings.containsKey(key)) return null;
  final primitives = List<GeometryPrimitive>.of(previous.primitives);
  final changed = <int>[], scopes = <String>{};
  var boundsChanged = false;
  for (var i = 0; i < keys.length; i++) {
    final height = math.max(0.0, heights[i]);
    if (!height.isFinite) return null;
    final key = keys[i],
        binding = previous.barBindings[key]!,
        old = primitives[binding.slot];
    if (old.localRect.height == height) continue;
    final placement = resolvePlacement(
      binding.content,
      binding.width,
      height,
      binding.placement,
      binding.margin,
    );
    final transform = binding.ownerTransform
        .multiply(MapAffine(1, 0, 0, 1, placement.x, placement.y))
        .multiply(binding.attrsTransform);
    final rect = MapRect(0, 0, binding.width, height);
    primitives[binding.slot] = GeometryPrimitive(
      ownerId: old.ownerId,
      componentId: old.componentId,
      type: old.type,
      value: old.value,
      localRect: rect,
      transform: transform,
      opacity: old.opacity,
      visible: old.visible,
      contentOrientation: old.contentOrientation,
      placementAnchor: old.placementAnchor,
    );
    changed.add(binding.slot);
    if (!old.visible ||
        (height <= binding.containedHeightLimit &&
            old.localRect.height <= binding.containedHeightLimit))
      continue;
    final bounds = primitives[binding.slot].bounds,
        owner = previous.targets[old.ownerId]!.bounds;
    bool within(MapBounds b) =>
        b.left >= owner.left &&
        b.right <= owner.right &&
        b.top >= owner.top &&
        b.bottom <= owner.bottom;
    if (old.visible && (!within(old.bounds) || !within(bounds))) {
      boundsChanged = true;
      scopes.addAll(binding.scopes);
    }
  }
  if (changed.isEmpty) return previous;
  // Relations may use a changed composite center. Full lowering owns their
  // exact self-loop/endpoint dependencies until that subgraph is compiled.
  if (boundsChanged && previous.hasRelations) return null;
  var targets = BarGeometryTargets(previous, primitives);
  final scopeTargets = <String, GeometryTarget>{};
  for (final scope in previous.scopeChildren.entries) {
    if (!scopes.contains(scope.key)) continue;
    MapBounds? bounds;
    for (final key in scope.value) {
      final target = scopeTargets[key] ?? targets[key]!;
      if (target.visible)
        bounds = bounds?.union(target.bounds) ?? target.bounds;
    }
    final old = targets[scope.key]!;
    scopeTargets[scope.key] = GeometryTarget(
      id: old.id,
      type: old.type,
      bounds: bounds ?? old.bounds,
      quad: old.quad,
      transform: old.transform,
      visible: old.visible,
      locked: old.locked,
      paintOrder: old.paintOrder,
    );
  }
  targets = targets.withScopes(scopeTargets);
  var bounds = previous.bounds;
  if (boundsChanged) {
    MapBounds? next;
    for (final target in targets.values)
      if (target.visible && target.type != 'grid' && target.type != 'group')
        next = next?.union(target.bounds) ?? target.bounds;
    bounds = next ?? MapBounds.empty;
  }
  return PatchMapGeometry.barProjection(
    targets: targets,
    bounds: bounds,
    previous: previous,
    changedPrimitiveSlots: changed,
  );
}
