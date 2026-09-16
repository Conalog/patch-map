part of 'controller.dart';

class PatchMapTransformApi {
  PatchMapTransformApi._(this._c);
  final PatchMapController _c;
  PatchMapTransformSession? _active;
  int _staleCount = 0;
  bool _committing = false;
  List<JsonMap> _moves(Object targets, List<num> delta) =>
      _movePlan(targets, delta);

  PatchMapResult _run(List<JsonMap> ops, String? actionId, bool recordHistory) {
    final before = _c.history._cursor;
    final result = _c.transaction(
      ops,
      actionId: actionId,
      recordHistory: recordHistory,
    );
    return PatchMapResult({
      'status': result.status,
      'changed': result.changed,
      'historyDepthDelta': _c.history._cursor - before,
    });
  }

  PatchMapResult moveBy(
    Object targets,
    List<num> delta, {
    String? actionId,
    bool recordHistory = true,
  }) {
    try {
      return _run(_moves(targets, delta), actionId, recordHistory);
    } catch (error) {
      return PatchMapResult({
        'status': 'rejected',
        'changed': false,
        'historyDepthDelta': 0,
      });
    }
  }

  PatchMapResult rotateBy(
    Object targets,
    num degrees, {
    String? actionId,
    bool recordHistory = true,
  }) {
    try {
      final ops = _rotatePlan(targets, degrees);
      return _run(ops, actionId, recordHistory);
    } catch (error) {
      return PatchMapResult({
        'status': 'rejected',
        'changed': false,
        'historyDepthDelta': 0,
      });
    }
  }

  PatchMapResult resizeBy(
    Object targets, {
    required String handle,
    required List<num> delta,
    bool lockAspectRatio = false,
    num minSize = 1,
    String? actionId,
    bool recordHistory = true,
  }) {
    try {
      return _run(
        _resizes(targets, handle, delta, lockAspectRatio, minSize),
        actionId,
        recordHistory,
      );
    } catch (error) {
      return PatchMapResult({
        'status': 'rejected',
        'changed': false,
        'historyDepthDelta': 0,
      });
    }
  }

  List<JsonMap> _resizes(
    Object targets,
    String handle,
    List<num> delta,
    bool lock,
    num minSize,
  ) => _resizePlan(targets, handle, delta, lock, minSize);

  PatchMapTransformSession beginSession({
    required Object targets,
    required String kind,
    required String actionId,
    String? handle,
  }) {
    _c._assertLive();
    if (actionId.trim().isEmpty ||
        kind != 'resize' && handle != null ||
        kind == 'resize' &&
            !['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].contains(handle))
      throw const PatchMapException(
        'INVALID_INPUT',
        'Invalid transform session handle or action',
      );
    if (_active != null || !['move', 'resize', 'rotate'].contains(kind))
      throw const PatchMapException(
        'CONFLICT',
        'An edit is already active or invalid',
      );
    final resolved = _c.targets._resolve(targets);
    if (resolved.any((t) => _c.targets.get(t) == null))
      throw const PatchMapException(
        'MISSING_TARGET',
        'Unknown transform target',
      );
    _c.selection.set(resolved);
    return _active = PatchMapTransformSession._(
      this,
      resolved,
      kind,
      actionId,
      handle,
    );
  }
}

class PatchMapTransformSession {
  PatchMapTransformSession._(
    this._owner,
    this.targets,
    this.kind,
    this.actionId,
    this.handle,
  ) : _baseRevision = _owner._c._sceneRevision;
  final PatchMapTransformApi _owner;
  final List<PatchMapTarget> targets;
  final String kind, actionId;
  final String? handle;
  final int _baseRevision;
  bool _ended = false;
  List<JsonMap> _operations = [];
  Map<String, JsonMap>? _savedOverlays;
  bool get _stale => _ended || _owner._c._sceneRevision != _baseRevision;
  PatchMapResult preview(JsonMap change) {
    if (_ended) throw StateError('transform session is already settled');
    if (change['kind'] != kind)
      throw const PatchMapException(
        'INVALID_INPUT',
        'Preview kind differs from session',
      );
    if (_stale) {
      _owner._staleCount++;
      return PatchMapResult({'status': 'refused', 'changed': false});
    }
    final previousOperations = _operations;
    try {
      final c = _owner._c;
      if (kind == 'move') {
        _operations = _owner._movePlan(
          targets,
          (change['delta'] as List).cast<num>(),
          axisLock: change['axisLock'] == true,
        );
      } else if (kind == 'resize') {
        _operations = _owner._resizes(
          targets,
          handle ?? 'se',
          (change['delta'] as List).cast<num>(),
          change['lockAspectRatio'] == true,
          change['minSize'] as num? ?? 1,
        );
      } else {
        _operations = _owner._rotatePlan(
          targets,
          change['degrees'] as num,
          center: (change['center'] as List?)?.cast<num>(),
        );
      }
      _savedOverlays ??= c._overlays;
      final overlays = Map<String, JsonMap>.of(_savedOverlays!);
      for (final op in _operations) {
        final patch = _map(op['changes']);
        if (patch.isNotEmpty)
          overlays[op['id'] as String] = _merge(
            overlays[op['id']] ?? {},
            patch,
          );
      }
      final prepared = c._prepareBars({}, c.dataset, overlays);
      final tuple = PatchMapRevisionTuple(
        c._sceneRevision,
        c._viewRevision,
        c._interactionRevision + 1,
      );
      if (!c._accept(
        c.dataset,
        prepared.overlay ?? overlays,
        c.selection._ids,
        tuple,
      )) {
        _operations = previousOperations;
        return PatchMapResult({'status': 'refused', 'changed': false});
      }
      c._overlays = overlays;
      c._installBars(prepared);
      c._interactionRevision++;
      c._notify();
      final changed = _operations.any(
        (op) => (op['changes'] as Map).isNotEmpty,
      );
      return PatchMapResult({
        'status': changed ? 'previewed' : 'unchanged',
        'changed': changed,
      });
    } catch (error) {
      _operations = previousOperations;
      return PatchMapResult({'status': 'rejected', 'changed': false});
    }
  }

  PatchMapResult edgePan(List<num> pointerScreen, List<num> deltaCss) {
    if (_ended) throw StateError('transform session is already settled');
    if (_stale)
      throw const PatchMapException(
        'CONFLICT',
        'Transform session became stale',
      );
    if (pointerScreen.length != 2 ||
        deltaCss.length != 2 ||
        [...pointerScreen, ...deltaCss].any((n) => !n.isFinite))
      throw const PatchMapException('INVALID_INPUT', 'Invalid edge pan points');
    final v = _owner._c.viewport, scale = v._scale;
    final before = [
      _transformSix(v._centerX + (pointerScreen[0] - v._width / 2) / scale),
      _transformSix(v._centerY + (pointerScreen[1] - v._height / 2) / scale),
    ];
    final center = [
      v._centerX + deltaCss[0] / scale,
      v._centerY + deltaCss[1] / scale,
    ];
    final adjusted = [
      pointerScreen[0] - deltaCss[0],
      pointerScreen[1] - deltaCss[1],
    ];
    final after = [
      _transformSix(center[0] + (adjusted[0] - v._width / 2) / scale),
      _transformSix(center[1] + (adjusted[1] - v._height / 2) / scale),
    ];
    v.restore({'centerWorld': center, 'scale': scale});
    return PatchMapResult({
      'pointerWorldBefore': before,
      'pointerWorldAfter': after,
      'adjustedPointerScreen': adjusted,
      'centerWorld': center,
    });
  }

  PatchMapResult commit() {
    if (_ended) throw StateError('transform session is already settled');
    if (_stale) {
      _owner._staleCount++;
      _end();
      return PatchMapResult({
        'status': 'stale',
        'changed': false,
        'mutationCount': 0,
        'historyDepthDelta': 0,
      });
    }
    final c = _owner._c;
    _restore(publish: false);
    final before = c.history._cursor;
    // Invalidate the public token before transaction change callbacks.
    _end();
    late PatchMapResult result;
    _owner._committing = true;
    try {
      result = c.transaction(_operations, actionId: actionId);
    } finally {
      _owner._committing = false;
    }
    return PatchMapResult({
      'status': result.status,
      'changed': result.changed,
      'mutationCount': result.changed ? 1 : 0,
      'historyDepthDelta': c.history._cursor - before,
    });
  }

  PatchMapResult cancel() {
    if (_ended) throw StateError('transform session is already settled');
    final stale = _stale;
    _restore();
    _end();
    return PatchMapResult({
      'status': stale ? 'stale' : 'cancelled',
      'cancelled': !stale,
      'historyDepthDelta': 0,
    });
  }

  void _restore({bool publish = true}) {
    final c = _owner._c;
    if (_savedOverlays != null && !c.destroyed) {
      c._overlays = _savedOverlays!;
      c._installBars(c._prepareBars({}, c.dataset, c._overlays));
      _savedOverlays = null;
      if (publish) {
        c._interactionRevision++;
        c._notify();
      }
    }
  }

  void _end() {
    _ended = true;
    if (identical(_owner._active, this)) _owner._active = null;
  }
}
