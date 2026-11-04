import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/painting.dart';

import 'fixture.dart';

/// Example-owned bridge replacement: business policy does not enter PatchMap.
/// This replays resolved renderer inputs, not network/Registry implementations.
final class MobileReplay {
  MobileReplay(this.fixture) {
    _reindex();
  }
  final MobileReplayFixture fixture;
  final map = PatchMapController();
  final log = <String>[];
  final imageFailures = <PatchMapFailure>[];
  final visibleTypes = {'device', 'inverter', 'edge', 'router'};
  Set<String> highlighted = {};
  bool highlightedOnly = false, alternate = false;
  int generation = 0;
  List<String>? _pendingSelection;
  List<String> _selectionIntent = [];

  late Map<String, String> _kinds;
  Map<String, String> get kinds => _kinds;
  void _reindex() {
    _kinds = {
      for (var r = 0; r < 2; r++)
        for (var c = 0; c < (alternate ? 5 : 4); c++)
          'panel-grid.$r.$c': 'device',
      'inverter-map-1': 'inverter',
      'router-map-1': 'router',
      alternate ? 'edge-map-2' : 'edge-map-1': 'edge',
    };
  }

  void record(String message) {
    log.add(message);
    if (log.length > 30) log.removeAt(0);
  }

  int beginDateChange() {
    record('DATE_CHANGE → TIME_CHANGE: generation ${generation + 1}');
    return ++generation;
  }

  Future<bool> replace(int token, {bool next = false}) async {
    if (token != generation) {
      record('stale blueprint ignored: $token');
      return false;
    }
    alternate = next;
    _reindex();
    record('draw: ${next ? 'B' : 'A'} → updateValues while preparing');
    final drawing = map.draw(fixture.scene(alternate: next));
    final values = map.updateValues(fixture.panelUpdates(alternate: next));
    final results = await Future.wait([drawing, values]);
    if (token != generation) return false;
    for (final result in results) {
      check(result);
    }
    restorePresentation();
    final pending = _pendingSelection;
    _pendingSelection = null;
    // Native draw resets selection; the mobile host explicitly reselects
    // surviving IDs. A pending external request wins over the old selection.
    select(pending ?? _selectionIntent);
    record('submitted: diagram ${next ? 'B' : 'A'}');
    return true;
  }

  Future<bool> metrics(int token, String state) async {
    if (token != generation) {
      record('stale metrics ignored: $token');
      return false;
    }
    final result = await map.updateValues(
      fixture.panelUpdates(state: state, alternate: alternate),
    );
    if (token != generation || result.superseded) return false;
    check(result);
    record('METRICS_REFRESH applied: $state');
    return true;
  }

  static void check(PatchMapResult result) {
    if (result.failures.isNotEmpty ||
        result.superseded ||
        result.interruption != null ||
        (result.outcome != PatchMapOutcome.applied &&
            result.outcome != PatchMapOutcome.unchanged)) {
      throw StateError(
        '${result.outcome.name}, superseded=${result.superseded}, '
        'interruption=${result.interruption?.name}: '
        '${result.failures.map((e) => '${e.path}: ${e.message}').join('\n')}',
      );
    }
  }

  bool allows(PatchMapObject object) => _allowsId(object.id);

  bool _allowsId(String id) =>
      visibleTypes.contains(kinds[id]) &&
      (!highlightedOnly || highlighted.isEmpty || highlighted.contains(id));

  // Mobile allows multiple panels, but only one inverter/Edge/Router. The
  // package intentionally offers generic selection; the host enforces this.
  bool select(List<String> ids) {
    if (map.phase == PatchMapPhase.preparing) {
      _pendingSelection = List.of(ids);
      record('external selection deferred');
      return true;
    }
    final existing = ids.toSet().where(kinds.containsKey).toList();
    if (existing.length > 1 && existing.any((id) => kinds[id] != 'device')) {
      record('selection rejected: mixed_types / single_only');
      return false;
    }
    if (existing.any((id) => !_allowsId(id))) {
      return false;
    }
    check(map.select(existing));
    _selectionIntent = existing;
    record('MAP_SELECT: $existing');
    return true;
  }

  void onEvent(PatchMapInputEvent event) {
    if (event.kind != PatchMapInputKind.tap || event.target == null) return;
    _pendingSelection = null;
    final id = event.target!.id;
    select(
      map.selected.length == 1 && map.selected.single.id == id ? [] : [id],
    );
  }

  void highlight(Iterable<String> ids, {bool? restricted}) {
    // Filter and memo replace the same channel, rather than multiply each other.
    highlighted = ids.where(kinds.containsKey).toSet();
    if (restricted != null) highlightedOnly = restricted;
    _reconcileHighlightSelection();
    restorePresentation();
    record('MAP_HIGHLIGHT_SET: $highlighted (restricted=$highlightedOnly)');
  }

  void setSelectionScope(bool restricted) {
    if (highlighted.isEmpty) return;
    highlightedOnly = restricted;
    _reconcileHighlightSelection();
    record(
      'selectionScope: ${restricted ? 'highlightedOnly' : 'unrestricted'}',
    );
  }

  void _reconcileHighlightSelection() {
    if (!highlightedOnly || highlighted.isEmpty) return;
    select(_selectionIntent.where(highlighted.contains).toList());
  }

  void setVisible(String type, bool visible) {
    if (!visible && visibleTypes.length == 1 && visibleTypes.contains(type)) {
      return;
    }
    if (visible) {
      visibleTypes.add(type);
    } else {
      visibleTypes.remove(type);
    }
    restorePresentation();
  }

  void restorePresentation() {
    for (final type in ['device', 'inverter', 'edge', 'router']) {
      final ids = kinds.entries.where((e) => e.value == type).map((e) => e.key);
      final visible = visibleTypes.contains(type);
      // Actual consumer caps dimmed alpha; don't stack .08 × .28. Captured
      // item base alpha is 1. Arbitrary authored alpha still needs qualification.
      final result = map.setPresentation(
        'mobile:$type',
        PatchMapPresentationLayer(
          scope: ids.map(PatchMapTarget.new),
          targets: highlighted.map(PatchMapTarget.new),
          matchedAlpha: visible ? 1 : .08,
          unmatchedAlpha: !visible
              ? .08
              : highlighted.isEmpty
              ? 1
              : .28,
        ),
      );
      if (result.failures.isNotEmpty) {
        throw StateError(result.failures.first.message);
      }
    }
  }

  void focusSelection({double bottomInset = 160}) {
    check(
      map.focus(
        map.selected.map((e) => e.id),
        padding: EdgeInsets.only(bottom: bottomInset),
      ),
    );
    record('PANEL_SELECTION_FOCUS bottomInset=$bottomInset');
  }

  /// Additional native UI example; current mobile bridge has no geometry RPC.
  Rect? screenBounds(String id) {
    final corners = map.getGeometry(id)?.corners;
    if (corners == null) return null;
    final points = [
      corners.topLeft,
      corners.topRight,
      corners.bottomRight,
      corners.bottomLeft,
    ].map(map.toLocal).whereType<Offset>().toList();
    if (points.length != 4) return null;
    var bounds = Rect.fromPoints(points.first, points.first);
    for (final p in points.skip(1)) {
      bounds = bounds.expandToInclude(Rect.fromPoints(p, p));
    }
    return bounds;
  }
}
