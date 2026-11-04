import 'dart:async';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/foundation.dart';

import 'fixture.dart';

enum SyncReplayPhase { preparing, waiting, ready, partial, failed, closed }

enum SyncReplayCase { normal, partial, superseded, replaced }

typedef SyncPanel = ({String text, Object? height});
typedef SyncReceipt = ({int epoch, int request, PatchMapResult result});

/// Bounded consumer experiment, not a general Registry/metrics adapter.
/// One instance owns all map commands and its two map-linked app rows.
final class SyncReplay extends ChangeNotifier {
  SyncReplay(this.fixture);
  final MobileReplayFixture fixture;
  final map = PatchMapController();
  static const ids = ['panel-grid.0.0', 'panel-grid.0.1'];
  SyncReplayPhase phase = SyncReplayPhase.preparing;
  Map<String, SyncPanel> rows = {};
  Set<String> failedItems = {};
  final receipts = <SyncReceipt>[];
  final imageFailures = <PatchMapFailure>[];
  final publishedRequests = <int>[];
  int _epoch = 0, _request = 0, _pending = 0;
  bool _drawing = false, _closed = false, _unconfirmed = false;
  String? error;

  int get epoch => _epoch;
  int get latestRequest => _request;
  bool get waiting => _drawing || _pending > 0;

  static PatchMapTarget textTarget(String id) =>
      PatchMapTarget(id, componentId: 'metric-text');
  static PatchMapTarget barTarget(String id) =>
      PatchMapTarget(id, componentId: 'metric-bar');

  static List<PatchMapUpdate> values(String id, String text, int height) => [
    PatchMapUpdate(textTarget(id), {
      'show': true,
      'text': text,
      'tint': 'white',
    }),
    PatchMapUpdate(barTarget(id), {
      'show': true,
      'size': {'width': '100%', 'height': '$height%'},
      'animation': false,
      'tint': '#0C73BF',
    }),
  ];

  static bool fullSubmission(PatchMapResult result) =>
      (result.outcome == PatchMapOutcome.applied ||
          result.outcome == PatchMapOutcome.unchanged) &&
      !result.superseded &&
      result.interruption == null &&
      result.failures.isEmpty;

  /// Used only with the already validated fixture's A/B diagrams. Clear the app
  /// display at replacement intent; old callbacks cannot unlock this new epoch.
  Future<void> replace({bool alternate = false}) async {
    final epoch = ++_epoch;
    _pending = 0;
    _drawing = true;
    _unconfirmed = false;
    failedItems = {};
    rows = {};
    error = null;
    phase = SyncReplayPhase.preparing;
    _notify();
    try {
      final drawing = map.draw(fixture.scene(alternate: alternate));
      final initial = update([
        for (final id in ids)
          ...MobileReplayFixture.componentUpdates(
            id,
            fixture.panel('dataText'),
          ),
      ]);
      // Observe both futures before awaiting either (including exceptions).
      final results = await Future.wait([drawing, initial]);
      if (_current(epoch) && !fullSubmission(results.first)) {
        _unconfirmed = true;
      }
    } catch (exception) {
      if (_current(epoch)) {
        _unconfirmed = true;
        error = '$exception';
      }
      rethrow;
    } finally {
      if (_current(epoch)) {
        _drawing = false;
        _settle();
      }
    }
  }

  Future<PatchMapResult> update(
    List<PatchMapUpdate> values, {
    Future<void>? appReady,
  }) async {
    if (_closed) throw StateError('Replay is disposed');
    final epoch = _epoch, request = ++_request;
    if (_pending == 0 && !_drawing) {
      failedItems = {};
      error = null;
      _unconfirmed = false;
    }
    _pending++;
    phase = _drawing ? SyncReplayPhase.preparing : SyncReplayPhase.waiting;
    _notify();
    try {
      final results = await Future.wait<Object?>([
        map.updateValues(values),
        ?appReady,
      ]);
      final result = results.first as PatchMapResult;
      if (_closed) return result;
      receipts.add((epoch: epoch, request: request, result: result));
      if (receipts.length > 24) receipts.removeAt(0);
      if (!_current(epoch)) return result;
      failedItems.addAll(
        result.failures.map((f) => f.target?.id).whereType<String>(),
      );
      // A superseded older request is not itself a failure, nor is it a full
      // snapshot to publish. Wait for every current-epoch obligation to settle.
      if (result.outcome == PatchMapOutcome.rejected ||
          result.outcome == PatchMapOutcome.interrupted ||
          request == _request && result.superseded) {
        _unconfirmed = true;
      }
      if (result.failures.any((failure) => failure.target == null)) {
        _unconfirmed = true;
      }
      return result;
    } catch (exception) {
      if (_current(epoch)) {
        _unconfirmed = true;
        error = '$exception';
      }
      rethrow;
    } finally {
      if (_current(epoch)) {
        _pending--;
        _settle();
      }
    }
  }

  bool _current(int epoch) => !_closed && epoch == _epoch;

  void _settle() {
    if (waiting) {
      _notify();
      return;
    }
    if (_unconfirmed || map.phase != PatchMapPhase.ready) {
      phase = SyncReplayPhase.failed;
      _notify();
      return;
    }
    // Read only the two linked app rows, synchronously at the settled barrier.
    // Reading the submitted projection preserves successful companion fields
    // from superseded requests and old values of a failed item automatically.
    rows = {for (final id in ids) id: readPanel(id)};
    phase = failedItems.isEmpty
        ? SyncReplayPhase.ready
        : SyncReplayPhase.partial;
    if (phase == SyncReplayPhase.ready) publishedRequests.add(_request);
    if (publishedRequests.length > 24) publishedRequests.removeAt(0);
    _notify();
  }

  SyncPanel readPanel(String id) {
    final text = map.getValue(textTarget(id))!;
    final size = map.getValue(barTarget(id))!['size'];
    return (
      text: text['text'] as String,
      height: size is Map ? size['height'] : size,
    );
  }

  static final badSvg = Uri.dataFromString(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">'
    '<foreignObject width="20" height="20"/></svg>',
    mimeType: 'image/svg+xml',
  ).toString();

  static List<PatchMapUpdate> partialValues() => [
    ...values(ids[0], '101', 31),
    PatchMapUpdate(PatchMapTarget(ids[0], componentId: 'metric-icon'), {
      'source': badSvg,
      'show': true,
    }),
    ...values(ids[1], '202', 62),
  ];

  Future<void> run(SyncReplayCase scenario) async {
    await replace(); // independent baseline per button
    switch (scenario) {
      case SyncReplayCase.normal:
        await update([
          ...values(ids[0], '101', 31),
          ...values(ids[1], '202', 62),
        ]);
      case SyncReplayCase.partial:
        await update(partialValues());
      case SyncReplayCase.superseded:
        // A's bar survives even though B replaces A's text.
        final a = update(values(ids[0], '111', 45));
        final b = update([
          PatchMapUpdate(textTarget(ids[0]), {'text': '222'}),
        ]);
        await Future.wait([a, b]);
      case SyncReplayCase.replaced:
        final old = update(values(ids[0], '999', 99));
        final replacement = replace(alternate: true);
        await Future.wait<Object?>([old, replacement]);
    }
  }

  void _notify() {
    if (!_closed) notifyListeners();
  }

  @override
  void dispose() {
    _closed = true;
    _epoch++;
    phase = SyncReplayPhase.closed;
    super.dispose();
  }
}
