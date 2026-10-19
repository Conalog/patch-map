import '../api/target.dart';
import 'field_operations.dart';

/// Composes one pending batch without losing an ancestor reset/assignment.
class PresentationComposer {
  const PresentationComposer();
  PresentationPlan compose(PresentationPlan earlier, PresentationPlan later) {
    final patches = <PatchMapTarget, List<FieldOperation>>{
      for (final patch in earlier.patches) patch.target: [...patch.operations],
    };
    for (final patch in later.patches) {
      final operations = patches.putIfAbsent(patch.target, () => []);
      for (final next in patch.operations) {
        operations.removeWhere((previous) => _covers(next.path, previous.path));
        operations.add(next);
      }
    }
    return PresentationPlan([
      for (final entry in patches.entries)
        PresentationPatch(entry.key, entry.value),
    ]);
  }
}

bool _covers(List<String> ancestor, List<String> descendant) {
  if (ancestor.length > descendant.length) return false;
  for (var i = 0; i < ancestor.length; i++) {
    if (ancestor[i] != descendant[i]) return false;
  }
  return true;
}
