import 'primitives.dart';

/// Icon aliases affect paint/resources, never component placement or hit bounds.
PatchMapGeometry? projectIconSources(
  PatchMapGeometry previous,
  Map<String, String> sources,
) {
  final primitives = List<GeometryPrimitive>.of(previous.primitives);
  final changed = <int>[];
  var resolved = 0;
  for (var i = 0; i < primitives.length; i++) {
    final old = primitives[i];
    if (old.type != 'icon') continue;
    final source = sources['${old.ownerId}\u0000${old.componentId}'];
    if (source == null) continue;
    resolved++;
    if (source == old.value['source']) continue;
    primitives[i] = GeometryPrimitive(
      ownerId: old.ownerId,
      componentId: old.componentId,
      type: old.type,
      value: Map.unmodifiable({...old.value, 'source': source}),
      localRect: old.localRect,
      transform: old.transform,
      opacity: old.opacity,
      visible: old.visible,
      contentOrientation: old.contentOrientation,
      placementAnchor: old.placementAnchor,
    );
    changed.add(i);
  }
  if (resolved != sources.length) return null;
  if (changed.isEmpty) return previous;
  return PatchMapGeometry(
    primitives: primitives,
    targets: previous.targets,
    bounds: previous.bounds,
    textBindings: previous.textBindings,
    barBindings: previous.barBindings,
    scopeChildren: previous.scopeChildren,
    hasRelations: previous.hasRelations,
    // New topology deliberately re-enters host asset admission. Geometry targets
    // are unchanged, but the existing host uses this token for asset dependencies.
    baseProjection: previous.projectionIdentity,
    changedPrimitiveSlots: changed,
  );
}
