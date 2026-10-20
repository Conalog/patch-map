import 'dart:collection';

import '../api/target.dart';
import 'field_operations.dart';

/// Composes one pending batch without losing an ancestor reset/assignment.
class PresentationComposer {
  const PresentationComposer();
  PresentationPlan compose(PresentationPlan earlier, PresentationPlan later) {
    if (earlier.patches.isEmpty) return PresentationPlan(later.patches);
    if (later.patches.isEmpty) return earlier;
    return PresentationPlan(_composePatches(earlier, later).values);
  }

  /// The session borrows this index rather than rebuilding the composed map.
  /// Only a read-only view escapes; the mutable map reference stays local.
  ({PresentationPlan plan, Map<PatchMapTarget, PresentationPatch> index})
  composeIndexed(PresentationPlan earlier, PresentationPlan later) {
    final patches = _composePatches(earlier, later);
    return (
      plan: later.patches.isEmpty ? earlier : PresentationPlan(patches.values),
      index: UnmodifiableMapView(patches),
    );
  }
}

Map<PatchMapTarget, PresentationPatch> _composePatches(
  PresentationPlan earlier,
  PresentationPlan later,
) {
  if (earlier.patches.isEmpty) {
    return {for (final patch in later.patches) patch.target: patch};
  }
  final patches = <PatchMapTarget, PresentationPatch>{
    for (final patch in earlier.patches) patch.target: patch,
  };
  for (final patch in later.patches) {
    final previous = patches[patch.target];
    if (previous == null) {
      patches[patch.target] = patch;
      continue;
    }
    final operations = [...previous.operations];
    for (final next in patch.operations) {
      operations.removeWhere((previous) => _covers(next.path, previous.path));
      operations.add(next);
    }
    patches[patch.target] = PresentationPatch(patch.target, operations);
  }
  return patches;
}

bool _covers(List<String> ancestor, List<String> descendant) {
  if (ancestor.length > descendant.length) return false;
  for (var i = 0; i < ancestor.length; i++) {
    if (ancestor[i] != descendant[i]) return false;
  }
  return true;
}
