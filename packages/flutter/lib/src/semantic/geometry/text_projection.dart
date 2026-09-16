import '../../model/dataset.dart';
import 'primitives.dart';
import 'placement.dart';

/// Text-only immutable projection. Scope growth stays with full lowering.
PatchMapGeometry? projectTextValues(
  PatchMapGeometry previous,
  Map<String, String> texts,
  GeometryTextLayouter? layouter,
) {
  if (previous.hasRelations ||
      layouter == null ||
      texts.keys.any((key) => !previous.textBindings.containsKey(key)))
    return null;
  final primitives = List<GeometryPrimitive>.of(previous.primitives);
  final targets = Map<String, GeometryTarget>.of(previous.targets);
  final changed = <int>[];
  for (final entry in texts.entries) {
    final binding = previous.textBindings[entry.key]!,
        old = primitives[binding.slot];
    if (old.value['text'] == entry.value) continue;
    final value = Map<String, dynamic>.unmodifiable({
      ...old.value,
      'text': entry.value,
    });
    final style = value['style'] as JsonMap;
    final layout = layouter(
      entry.value,
      style,
      frame: binding.frame,
      overflow: style['overflow'] as String?,
      split: (value['split'] as num).toInt(),
    );
    final local = resolvePlacement(
      binding.content,
      layout.width,
      layout.height,
      value['placement'] as String,
      value['margin'] as JsonMap,
    );
    final rect = MapRect(0, 0, local.width, local.height);
    final transform = binding.owner
        .multiply(MapAffine(1, 0, 0, 1, local.x, local.y))
        .multiply(binding.attrs);
    final next = GeometryPrimitive(
      ownerId: old.ownerId,
      componentId: old.componentId,
      type: old.type,
      value: value,
      localRect: rect,
      transform: transform,
      opacity: old.opacity,
      visible: old.visible,
      contentOrientation: old.contentOrientation,
      textLayout: layout.layout,
    );
    if (![
      next.bounds.left,
      next.bounds.top,
      next.bounds.right,
      next.bounds.bottom,
    ].every((v) => v.isFinite))
      return null;
    final owner = targets[old.ownerId]!.bounds;
    bool within(MapBounds b) =>
        b.left >= owner.left &&
        b.right <= owner.right &&
        b.top >= owner.top &&
        b.bottom <= owner.bottom;
    if (old.visible && (!within(old.bounds) || !within(next.bounds)))
      return null;
    primitives[binding.slot] = next;
    final prior = targets[entry.key]!;
    targets[entry.key] = GeometryTarget(
      id: prior.id,
      type: prior.type,
      localRect: rect,
      transform: transform,
      visible: prior.visible,
      locked: prior.locked,
      ownerId: prior.ownerId,
      componentId: prior.componentId,
      paintOrder: prior.paintOrder,
    );
    changed.add(binding.slot);
  }
  if (changed.isEmpty) return previous;
  return PatchMapGeometry(
    primitives: primitives,
    targets: targets,
    bounds: previous.bounds,
    textBindings: previous.textBindings,
    barBindings: previous.barBindings,
    scopeChildren: previous.scopeChildren,
    hasRelations: previous.hasRelations,
    topology: previous.topology,
    baseProjection: previous.projectionIdentity,
    changedPrimitiveSlots: changed,
  );
}
