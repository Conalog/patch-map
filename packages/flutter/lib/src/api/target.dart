/// A stable element or owner-local component address.
class PatchMapTarget {
  const PatchMapTarget(this.id, {this.componentId});
  final String id;
  final String? componentId;

  @override
  bool operator ==(Object other) =>
      other is PatchMapTarget &&
      id == other.id &&
      componentId == other.componentId;
  @override
  int get hashCode => Object.hash(id, componentId);
  @override
  String toString() => componentId == null ? id : '$id/$componentId';
}
