import 'dart:ui';

/// Public logical object data: renderer/component identities never escape.
/// Both maps are immutable owned records; unchanged data may be shared.
final class PatchMapObject {
  const PatchMapObject({
    required this.id,
    required this.type,
    required this.authoredData,
    required this.effectiveData,
    this.gridId,
    this.row,
    this.column,
  });
  final String id, type;
  final String? gridId;
  final int? row, column;
  final Map<String, Object?> authoredData, effectiveData;
}

enum PatchMapDragMode { pan, range, paint }

enum PatchMapInputKind {
  down,
  up,
  hover,
  leave,
  tap,
  doubleTap,
  secondaryTap,
  longPress,
  dragStart,
  dragMove,
  dragEnd,
  selectionChange,
}

enum PatchMapEndReason {
  completed,
  cancelled,
  multitouch,
  replaced,
  inactive,
  detached,
}

final class PatchMapPosition {
  const PatchMapPosition({
    required this.world,
    required this.local,
    required this.global,
  });
  final Offset world, local, global;
}

final class PatchMapInputEvent {
  PatchMapInputEvent({
    required this.kind,
    this.position,
    this.pointer,
    this.target,
    this.mode,
    this.reason,
    this.range,
    Iterable<PatchMapObject> objects = const [],
    Iterable<PatchMapObject> added = const [],
    Iterable<PatchMapObject> removed = const [],
  }) : objects = List.unmodifiable(objects),
       added = List.unmodifiable(added),
       removed = List.unmodifiable(removed);
  final PatchMapInputKind kind;
  final PatchMapPosition? position;
  final int? pointer;
  final PatchMapObject? target;
  final PatchMapDragMode? mode;
  final PatchMapEndReason? reason;
  final Rect? range;
  final List<PatchMapObject> objects, added, removed;
}
