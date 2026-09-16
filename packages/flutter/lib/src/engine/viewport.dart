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
    _queueSettled();
  }

  void _queueSettled() {
    _settleTimer?.cancel();
    if (_c.destroyed || !_c._surfaceVisible || _c.rotation._animation != null)
      return;
    _settleTimer = Timer(const Duration(milliseconds: 100), () {
      if (!_c.destroyed && _c.rotation._animation == null) {
        for (final listener in List.of(_listeners)) {
          _c._call(() {
            if (_listeners.contains(listener)) listener(state);
          });
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
    if (delta.length != 2)
      throw const PatchMapException(
        'INVALID_INPUT',
        'Pan requires two coordinates',
      );
    final before = state, stamp = _c.revisionStamp;
    final dx = _number(delta[0]), dy = _number(delta[1]);
    final radians = _c.rotation.value % 360 * math.pi / 180;
    final x = _number(
      _centerX - (dx * math.cos(radians) + dy * math.sin(radians)) / _scale,
    );
    final y = _number(
      _centerY - (-dx * math.sin(radians) + dy * math.cos(radians)) / _scale,
    );
    _c.rotation._cancel();
    _centerX = x;
    _centerY = y;
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
    final f = _number(factor);
    if (f <= 0 || anchor != null && anchor.length != 2)
      throw const PatchMapException('INVALID_INPUT', 'Invalid zoom');
    final before = state, stamp = _c.revisionStamp;
    final ax = anchor == null ? _width / 2 : _number(anchor[0]),
        ay = anchor == null ? _height / 2 : _number(anchor[1]);
    final point = screenToWorld(ax, ay);
    final next = (_scale * f).clamp(zoomLimits[0], zoomLimits[1]);
    final changed = next != _scale;
    final radians = _c.rotation.value % 360 * math.pi / 180;
    final dx = ax - _width / 2, dy = ay - _height / 2;
    final x = _number(
      point[0] - (dx * math.cos(radians) + dy * math.sin(radians)) / next,
    );
    final y = _number(
      point[1] - (-dx * math.sin(radians) + dy * math.cos(radians)) / next,
    );
    _c.rotation._cancel();
    _scale = next;
    _centerX = x;
    _centerY = y;
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
    return _fit(targets, padding);
  }

  PatchMapResult _fit(Object? targets, Object padding) =>
      _applyFit(_planFit(targets, padding));

  PatchMapResult _applyFit(_ViewportFit plan) {
    final before = snapshot();
    if (plan.bounds != null) {
      _c.rotation._cancel();
      _centerX = plan.bounds!.centerX;
      _centerY = plan.bounds!.centerY;
      _scale = plan.scale;
    }
    final changed = !_equal(before, snapshot());
    if (changed) _changed();
    return PatchMapResult({
      ...plan.facts,
      'changed': changed,
      'viewport': state,
    });
  }

  PatchMapResult restore(JsonMap value) {
    _c._assertLive();
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
    _c.rotation._cancel();
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
