part of 'controller.dart';

class PatchMapViewportApi {
  PatchMapViewportApi._(this._c, this._width, this._height, this._pixelRatio)
    : _centerX = _width / 2,
      _centerY = _height / 2;
  final PatchMapController _c;
  double _width, _height, _pixelRatio, _centerX, _centerY, _scale = 1;
  List<double> _zoomLimits = const [0.01, 100];
  List<double> get zoomLimits => _zoomLimits;

  void _initialize(JsonMap policy, List<num> limits, Object fit) {
    if (limits.length != 2 ||
        limits.any((v) => !v.isFinite || v <= 0) ||
        limits[0] > limits[1]) {
      throw const PatchMapException('INVALID_INPUT', 'Invalid zoom limits');
    }
    _zoomLimits = List.unmodifiable(limits.map((v) => v.toDouble()));
    final wheel = policy['wheel'];
    if (wheel != null && wheel is! Map ||
        wheel is Map &&
            ![null, 'none', 'control'].contains(wheel['activationModifier'])) {
      throw const PatchMapException(
        'INVALID_INPUT',
        'Invalid wheel activation modifier',
      );
    }
    final initial = policy['initial'];
    if (policy.containsKey('initial')) {
      if (initial is! Map ||
          initial['centerWorld'] is! List ||
          (initial['centerWorld'] as List).length != 2 ||
          (initial['centerWorld'] as List).any(
            (v) => v is! num || !v.isFinite,
          ) ||
          initial['scale'] is! num ||
          !(initial['scale'] as num).isFinite ||
          (initial['scale'] as num) <= 0) {
        throw const PatchMapException(
          'INVALID_INPUT',
          'Invalid initial viewport',
        );
      }
      restore(initial.cast<String, dynamic>());
    } else if (fit == true) {
      _fitInitial();
    } else if (fit is Map) {
      _fit(fit['targets'], fit['padding'] ?? 16);
    } else if (fit != false) {
      throw const PatchMapException(
        'INVALID_INPUT',
        'fit must be bool or fit options',
      );
    }
  }

  final _listeners = <void Function(JsonMap)>{};
  Timer? _settleTimer;
  PatchMapGeometry get _geometry =>
      _c._geometryFor(_c.dataset, _c._animatedOverlays ?? _c._overlays);

  PatchMapRenderViewport get _render => PatchMapRenderViewport(
    centerX: _centerX,
    centerY: _centerY,
    scale: _scale,
    width: _width,
    height: _height,
    pixelRatio: _pixelRatio,
    rotation: _c.rotation.value,
  );
  JsonMap snapshot() => {
    'centerWorld': [_centerX, _centerY],
    'scale': _scale,
  };
  JsonMap get state => {
    ...snapshot(),
    'screenBounds': [0.0, 0.0, _width, _height],
  };
  PatchMapDisposer onSettled(void Function(JsonMap) listener) {
    _listeners.add(listener);
    return () => _listeners.remove(listener);
  }

  void _changed() {
    _c._viewRevision++;
    _c._notify();
    _settleTimer?.cancel();
    _settleTimer = Timer(const Duration(milliseconds: 100), () {
      if (!_c.destroyed) {
        for (final listener in List.of(_listeners)) {
          _c._call(() => listener(state));
        }
      }
    });
  }

  PatchMapResult _result(
    JsonMap previous,
    JsonMap stamp,
    String source,
    bool changed,
  ) => PatchMapResult({
    'changed': changed,
    'blocked': false,
    'source': source,
    'previous': previous,
    'viewport': state,
    'previousRevisions': stamp,
    'revisions': _c.revisionStamp,
  });
  PatchMapResult panBy(List<num> delta, {String source = 'pointer'}) {
    _c._assertLive();
    _c.rotation._cancel();
    if (delta.length != 2)
      throw const PatchMapException(
        'INVALID_INPUT',
        'Pan requires two coordinates',
      );
    final before = state, stamp = _c.revisionStamp;
    final dx = _number(delta[0]), dy = _number(delta[1]);
    final radians = _c.rotation.value % 360 * math.pi / 180;
    _centerX -= (dx * math.cos(radians) + dy * math.sin(radians)) / _scale;
    _centerY -= (-dx * math.sin(radians) + dy * math.cos(radians)) / _scale;
    final changed = dx != 0 || dy != 0;
    if (changed) _changed();
    return _result(before, stamp, source, changed);
  }

  List<double> screenToWorld(double x, double y) {
    final dx = (x - _width / 2) / _scale, dy = (y - _height / 2) / _scale;
    final radians = _c.rotation.value % 360 * math.pi / 180;
    return [
      _centerX + dx * math.cos(radians) + dy * math.sin(radians),
      _centerY - dx * math.sin(radians) + dy * math.cos(radians),
    ];
  }

  List<double> worldToScreen(double x, double y) {
    final dx = x - _centerX, dy = y - _centerY;
    final radians = _c.rotation.value % 360 * math.pi / 180;
    return [
      _width / 2 + _scale * (dx * math.cos(radians) - dy * math.sin(radians)),
      _height / 2 + _scale * (dx * math.sin(radians) + dy * math.cos(radians)),
    ];
  }

  PatchMapResult zoomBy(num factor, [List<num>? anchor]) {
    _c._assertLive();
    _c.rotation._cancel();
    final f = _number(factor);
    if (f <= 0 || anchor != null && anchor.length != 2)
      throw const PatchMapException('INVALID_INPUT', 'Invalid zoom');
    final before = state, stamp = _c.revisionStamp;
    final ax = anchor == null ? _width / 2 : _number(anchor[0]),
        ay = anchor == null ? _height / 2 : _number(anchor[1]);
    final point = screenToWorld(ax, ay);
    final next = (_scale * f).clamp(zoomLimits[0], zoomLimits[1]);
    final changed = next != _scale;
    _scale = next;
    final afterPoint = screenToWorld(ax, ay);
    _centerX += point[0] - afterPoint[0];
    _centerY += point[1] - afterPoint[1];
    if (changed) _changed();
    return _result(before, stamp, 'programmatic', changed);
  }

  bool resize(num width, num height, [num? pixelRatio]) {
    _c._assertLive();
    final w = _number(width),
        h = _number(height),
        dpr = pixelRatio == null ? _pixelRatio : _number(pixelRatio);
    if (w <= 0 || h <= 0 || dpr <= 0)
      throw const PatchMapException('INVALID_INPUT', 'Invalid viewport size');
    if (_c._capturing) {
      _c._deferredResize = [w, h, dpr];
      return false;
    }
    if (w == _width && h == _height && dpr == _pixelRatio) return false;
    _width = w;
    _height = h;
    _pixelRatio = dpr;
    _changed();
    return true;
  }

  void _fitInitial() {
    _fit(null, 24);
  }

  PatchMapResult fit({Object? targets, Object padding = 16}) {
    _c._assertLive();
    _c.rotation._cancel();
    return _fit(targets, padding);
  }

  PatchMapResult _fit(Object? targets, Object padding) {
    final values = padding is List ? padding : [padding, padding];
    if (values.length != 2)
      throw const PatchMapException(
        'INVALID_INPUT',
        'Padding requires two values',
      );
    final px = _number(values[0]), py = _number(values[1]);
    if (px < 0 || py < 0)
      throw const PatchMapException(
        'INVALID_INPUT',
        'Padding must be nonnegative',
      );
    final addresses = targets == null
        ? _c.dataset.roots
              .map((v) => PatchMapTarget(v['id'] as String))
              .toList()
        : _c.targets._resolve(targets, duplicates: true);
    final contributors = <JsonMap>[],
        missing = <String>[],
        excluded = <String>[];
    final seen = <String>{};
    var duplicate = 0;
    double? left, top, right, bottom;
    for (final target in addresses) {
      if (!seen.add(target.key)) {
        duplicate++;
        continue;
      }
      final bounds = _geometry.worldBounds(target.key);
      if (bounds == null) {
        if (_c.targets.get(target) == null) {
          missing.add(target.id);
        } else {
          excluded.add(target.id);
        }
        continue;
      }
      left = left == null ? bounds.left : math.min(left, bounds.left);
      top = top == null ? bounds.top : math.min(top, bounds.top);
      right = right == null ? bounds.right : math.max(right, bounds.right);
      bottom = bottom == null ? bounds.bottom : math.max(bottom, bounds.bottom);
      contributors.add({
        'id': target.id,
        'worldBounds': [bounds.left, bounds.top, bounds.right, bounds.bottom],
      });
    }
    final before = snapshot();
    if (left != null) {
      _centerX = (left + right!) / 2;
      _centerY = (top! + bottom!) / 2;
      final rad = _c.rotation.value % 360 * math.pi / 180;
      final w = (right - left).abs(), h = (bottom - top).abs();
      final rw = w * math.cos(rad).abs() + h * math.sin(rad).abs(),
          rh = w * math.sin(rad).abs() + h * math.cos(rad).abs();
      _scale = math
          .min(
            (_width - 2 * px).clamp(1, double.infinity) / math.max(rw, 1),
            (_height - 2 * py).clamp(1, double.infinity) / math.max(rh, 1),
          )
          .clamp(zoomLimits[0], zoomLimits[1]);
    }
    final changed = !_equal(before, snapshot());
    if (changed) _changed();
    return PatchMapResult({
      'status': left == null ? 'empty' : 'applied',
      'changed': changed,
      'paddingCssPx': [px, py],
      'viewport': state,
      'contributors': contributors,
      'applied': contributors.map((e) => e['id']).toList(),
      'missing': missing,
      'excluded': excluded,
      'duplicateCount': duplicate,
      'worldBounds': left == null ? null : [left, top, right, bottom],
    });
  }

  PatchMapResult restore(JsonMap value) {
    _c._assertLive();
    _c.rotation._cancel();
    final center = value['centerWorld'];
    if (center is! List || center.length != 2)
      throw const PatchMapException(
        'INVALID_INPUT',
        'Invalid viewport snapshot',
      );
    final x = _number(center[0]),
        y = _number(center[1]),
        scale = _number(value['scale']);
    if (scale <= 0)
      throw const PatchMapException('INVALID_INPUT', 'Invalid viewport scale');
    final before = state, stamp = _c.revisionStamp;
    _centerX = x;
    _centerY = y;
    _scale = scale.clamp(zoomLimits[0], zoomLimits[1]);
    final changed = !_equal(before, state);
    if (changed) _changed();
    return _result(before, stamp, 'restore', changed);
  }

  PatchMapResult reset({Object padding = 16, Object? targets}) {
    final result = fit(padding: padding, targets: targets);
    return PatchMapResult({
      'status': 'fallback:auto-fit',
      'changed': result.changed,
      'viewport': state,
      'fit': result.toJson(),
    });
  }
}

class PatchMapRotationAnimation {
  final _completer = Completer<PatchMapResult>();
  late bool Function() _cancel;
  Future<PatchMapResult> get finished => _completer.future;
  bool cancel() => _cancel();
}

class _RotationPlan {
  _RotationPlan(this.handle, this.from, this.to, this.completed, this.duration);
  final PatchMapRotationAnimation handle;
  final double from, to, completed, duration;
  double? start;
  bool awaitingFrame = false;
}

class PatchMapRotationApi {
  PatchMapRotationApi._(this._c);
  final PatchMapController _c;
  double _value = 0;
  double get value => _value;
  set value(num angle) {
    set(angle);
  }

  _RotationPlan? _animation;
  double set(num angle) {
    _c._assertLive();
    final next = _number(angle);
    _cancel();
    _assign(next);
    return _value;
  }

  void _assign(double value) {
    if (_value == value) return;
    _value = value;
    _c.viewport._changed();
  }

  double rotateBy(num delta) => set(_value + _number(delta));
  double reset() => set(0);
  PatchMapRotationAnimation animateTo(
    num angle, {
    num durationMs = 250,
    String path = 'raw',
    bool normalizeOnComplete = false,
  }) {
    _c._assertLive();
    final target = _number(angle), duration = _number(durationMs);
    if (duration < 0 ||
        !['raw', 'clockwise', 'counterclockwise', 'shortest'].contains(path))
      throw const PatchMapException(
        'INVALID_INPUT',
        'Invalid rotation animation',
      );
    var to = target;
    if (path != 'raw') {
      final clockwise = (target % 360 - _value % 360) % 360;
      final delta =
          clockwise == 0 ||
              path == 'clockwise' ||
              path == 'shortest' && clockwise <= 180
          ? clockwise
          : clockwise - 360;
      to = _value + delta;
      if (_value.abs() > 9007199254740991 || to.abs() > 9007199254740991)
        throw const PatchMapException(
          'INVALID_INPUT',
          'Directed angle cannot represent target',
        );
    }
    _cancel();
    final handle = PatchMapRotationAnimation();
    final plan = _RotationPlan(
      handle,
      _value,
      to,
      normalizeOnComplete ? target % 360 : to,
      duration,
    );
    handle._cancel = () => identical(_animation, plan) ? _cancel() : false;
    _c._syncAnimationClock();
    plan.start = _c._clockMs;
    _animation = plan;
    if (duration == 0 || to == _value || _c.reducedMotion) {
      _assign(plan.completed);
      _animation = null;
      handle._completer.complete(
        PatchMapResult({'status': 'completed', 'angle': _value}),
      );
    } else {
      _c._dirty = false;
      _c._schedule();
    }
    return handle;
  }

  bool _cancel({String status = 'cancelled'}) {
    final animation = _animation;
    if (animation == null) return false;
    _animation = null;
    animation.handle._completer.complete(
      PatchMapResult({'status': status, 'angle': _value}),
    );
    return true;
  }

  void _completeFrame() {
    final animation = _animation;
    if (animation == null || !animation.awaitingFrame) return;
    _value = animation.completed;
    _animation = null;
    animation.handle._completer.complete(
      PatchMapResult({'status': 'completed', 'angle': _value}),
    );
  }

  bool _advance(double milliseconds) {
    final animation = _animation;
    if (animation == null || animation.awaitingFrame) return false;
    final t = _c.reducedMotion
        ? 1.0
        : ((milliseconds - animation.start!) / animation.duration).clamp(
            0.0,
            1.0,
          );
    final inverse = 1 - t, eased = 1 - inverse * inverse * inverse;
    _assign(
      t >= 1
          ? animation.to
          : animation.from * (1 - eased) + animation.to * eased,
    );
    if (t >= 1) {
      animation.awaitingFrame = true;
      return false;
    }
    return true;
  }
}

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
