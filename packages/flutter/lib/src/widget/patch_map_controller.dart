import 'dart:ui';

import 'package:flutter/foundation.dart' show internal;
import 'package:flutter/painting.dart' show EdgeInsets;

import '../api/result.dart';
import '../api/presentation.dart';
import '../api/events.dart';
import '../api/target.dart';
import '../api/update.dart';

/// One reusable command facade. The attached widget owns every resource; this
/// controller never queues commands or retains a renderer while disconnected.
final class PatchMapController {
  PatchMapBinding? _binding;
  bool get isAttached => _binding != null;
  PatchMapPhase get phase => _binding?.phase ?? PatchMapPhase.empty;
  Future<PatchMapResult> draw(Object? data) =>
      _binding?.draw(data) ?? _detached();
  Future<PatchMapResult> updateValues(Iterable<PatchMapUpdate> updates) =>
      _binding?.update(updates) ?? _detached();

  /// Replace one captured alpha layer. Acceptance is synchronous; the next
  /// ordinary frame displays it. Authored/live values and selection stay intact.
  PatchMapPresentationResult setPresentation(
    String key,
    PatchMapPresentationLayer layer,
  ) => _binding?.setPresentation(key, layer) ?? _presentationDenial();
  PatchMapPresentationResult clearPresentation(String key) =>
      _binding?.clearPresentation(key) ?? _presentationDenial();
  Map<String, Object?>? getValue(PatchMapTarget target) =>
      _binding?.value(target);
  PatchMapResult fit({
    Iterable<String>? targets,
    EdgeInsets padding = EdgeInsets.zero,
  }) => _binding?.fit(targets, padding) ?? _denial();
  PatchMapResult focus(
    Iterable<String> targets, {
    EdgeInsets padding = EdgeInsets.zero,
  }) => _binding?.focus(targets, padding) ?? _denial();
  PatchMapResult setCamera({Offset? center, double? scale, double? rotation}) =>
      _binding?.setCamera(center, scale, rotation) ?? _denial();
  List<PatchMapObject> get selected => _binding?.selected ?? const [];
  PatchMapResult select(Iterable<String> ids) =>
      _binding?.select(ids, 'set') ?? _denial();
  PatchMapResult addSelection(Iterable<String> ids) =>
      _binding?.select(ids, 'add') ?? _denial();
  PatchMapResult removeSelection(Iterable<String> ids) =>
      _binding?.select(ids, 'remove') ?? _denial();
  PatchMapResult toggleSelection(Iterable<String> ids) =>
      _binding?.select(ids, 'toggle') ?? _denial();
  PatchMapResult clearSelection() => select(const []);
  Offset? toWorld(Offset local) => _binding?.toWorld(local);
  Offset? toLocal(Offset world) => _binding?.toLocal(world);

  @internal
  void attach(PatchMapBinding binding) {
    if (_binding != null && !identical(_binding, binding)) {
      throw StateError(
        'PatchMapController is already attached to a live widget',
      );
    }
    _binding = binding;
  }

  @internal
  void detach(PatchMapBinding binding) {
    if (identical(_binding, binding)) _binding = null;
  }
}

/// Internal attachment port; public types carry no native renderer handles.
@internal
abstract class PatchMapBinding {
  PatchMapPhase get phase;
  Future<PatchMapResult> draw(Object? data);
  Future<PatchMapResult> update(Iterable<PatchMapUpdate> updates);
  PatchMapPresentationResult setPresentation(
    String key,
    PatchMapPresentationLayer layer,
  );
  PatchMapPresentationResult clearPresentation(String key);
  Map<String, Object?>? value(PatchMapTarget target);
  PatchMapResult fit(Iterable<String>? targets, EdgeInsets padding);
  PatchMapResult focus(Iterable<String> targets, EdgeInsets padding);
  PatchMapResult setCamera(Offset? center, double? scale, double? rotation);
  List<PatchMapObject> get selected;
  PatchMapResult select(Iterable<String> ids, String mode);
  Offset toWorld(Offset local);
  Offset toLocal(Offset world);
}

PatchMapResult _denial() => PatchMapResult(
  PatchMapOutcome.rejected,
  failures: const [PatchMapFailure('DETACHED', 'No map widget is attached')],
);
Future<PatchMapResult> _detached() => Future.value(_denial());

PatchMapPresentationResult _presentationDenial() => PatchMapPresentationResult(
  PatchMapOutcome.rejected,
  failures: const [PatchMapFailure('DETACHED', 'No map widget is attached')],
);
