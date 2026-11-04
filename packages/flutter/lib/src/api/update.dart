import 'target.dart';

/// A sparse presentation input. Admission detaches caller-owned values.
class PatchMapUpdate {
  const PatchMapUpdate(this.target, this.values);
  final PatchMapTarget target;
  final Map<String, Object?> values;
}
