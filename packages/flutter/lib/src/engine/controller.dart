import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import '../api/values.dart';
import '../model/dataset.dart';
import '../model/theme.dart';
import '../semantic/geometry/geometry.dart';
import '../semantic/dataset/normalization.dart' show normalizeComponent;
import 'ports.dart';

part 'data_targets.dart';
part 'pointer_policy.dart';
part 'mutations.dart';
part 'text_mutations.dart';
part 'mutation_lowering.dart';
part 'structural_mutations.dart';
part 'history_selection.dart';
part 'viewport_transform.dart';
part 'viewport_fit.dart';
part 'transform_geometry.dart';
part 'editor.dart';
part 'bar_animation.dart';

/// One authority for scene, history, publication and lifecycle.
class PatchMapController {
  PatchMapController._(
    this._dataset, {
    required this.instanceId,
    required double width,
    required double height,
    required double pixelRatio,
    required int historyLimit,
    this.assetPort,
    this.textLayouter,
    required this.theme,
    required this.pointerPolicy,
    required this.selectionPolicy,
    required this.viewportPolicy,
  }) {
    data = PatchMapDataApi._(this);
    targets = PatchMapTargetsApi._(this);
    history = PatchMapHistoryApi._(this, historyLimit);
    selection = PatchMapSelectionApi._(this);
    presentation = PatchMapPresentationApi._(this);
    viewport = PatchMapViewportApi._(this, width, height, pixelRatio);
    rotation = PatchMapRotationApi._(this);
    transform = PatchMapTransformApi._(this);
    editor = PatchMapEditorApi._(this);
    pointer = PatchMapPointerApi._(this);
    assets = PatchMapAssetsApi._(this);
    debug = PatchMapDebugApi._(this);
    capture = PatchMapCaptureApi._(this);
    // Lifecycle errors may arrive before a host starts observing readiness.
    unawaited(_ready.future.then<void>((_) {}, onError: (Object _) {}));
  }

  static Future<PatchMapController> create({
    Object? data,
    double width = 360,
    double height = 640,
    double pixelRatio = 1,
    Object fit = true,
    int historyLimit = 50,
    String? instanceId,
    JsonMap? theme,
    JsonMap pointerPolicy = const {},
    JsonMap selectionPolicy = const {},
    JsonMap viewportPolicy = const {},
    List<num> zoomLimits = const [0.01, 100],
    PatchMapAssetPort? assetPort,
    GeometryTextLayouter? textLayouter,
  }) async {
    if (![width, height, pixelRatio].every((n) => n.isFinite && n > 0) ||
        historyLimit < 0) {
      throw const PatchMapException(
        'INVALID_INPUT',
        'Invalid surface dimensions or history limit',
      );
    }
    _validatePointerPolicies(pointerPolicy, selectionPolicy);
    final c = PatchMapController._(
      PatchMapDataset.parse(data ?? []),
      instanceId: instanceId,
      width: width,
      height: height,
      pixelRatio: pixelRatio,
      historyLimit: historyLimit,
      assetPort: assetPort,
      textLayouter: textLayouter,
      theme: normalizeColorTheme(theme ?? {}),
      pointerPolicy: _detachPolicy(pointerPolicy),
      selectionPolicy: _detachPolicy(selectionPolicy),
      viewportPolicy: freezeJson(viewportPolicy) as JsonMap,
    );
    c.viewport._initialize(viewportPolicy, zoomLimits, fit);
    return c;
  }

  final String? instanceId;
  final JsonMap theme;
  final JsonMap pointerPolicy;
  final JsonMap selectionPolicy;
  final JsonMap viewportPolicy;
  final PatchMapAssetPort? assetPort;
  final GeometryTextLayouter? textLayouter;
  PatchMapDataset _dataset;
  PatchMapDataset get dataset => _dataset;
  int _datasetGeneration = 0;
  int get datasetGeneration => _datasetGeneration;
  Map<String, JsonMap> _overlays = {};
  Map<String, JsonMap> get instanceOverlays => _viewOverlays(_overlays);
  Map<String, JsonMap>? _overlayViewSource, _overlayViewCache;
  Map<String, JsonMap> _viewOverlays(Map<String, JsonMap> source) {
    if (!identical(source, _overlayViewSource)) {
      _overlayViewSource = source;
      _overlayViewCache = UnmodifiableMapView(source);
    }
    return _overlayViewCache!;
  }

  Map<String, _BarTween> _barTweens = {};
  _BarColumns? _barColumns;
  Map<String, JsonMap>? _animatedOverlays;
  double _clockMs = 0;
  // Sample once per command, never once per bar. A host without a live clock
  // retains the explicit advanceFrame timeline used by deterministic drivers.
  void _syncAnimationClock() {
    if (_capturing) return;
    final surface = _surface;
    if (surface is PatchMapClock)
      _clockMs = math.max(_clockMs, (surface as PatchMapClock).milliseconds);
  }

  bool _reducedMotion = false, _surfaceVisible = true;
  bool get reducedMotion => _reducedMotion;
  set reducedMotion(bool value) {
    if (_destroyed || value == _reducedMotion) return;
    _reducedMotion = value;
    if (value) _settleBars();
    _dirty = false;
    _notify();
  }

  void surfaceVisibilityChanged(bool visible, double milliseconds) {
    if (_destroyed || _surfaceVisible == visible) return;
    _clockMs = math.max(_clockMs, milliseconds);
    _surfaceVisible = visible;
    _settleBars();
    rotation._visibilityChanged(visible, _clockMs);
    if (!visible) {
      final active = transform._active;
      if (active != null && !active._ended) active.cancel();
      viewport._settleTimer?.cancel();
    }
    _dirty = false;
    _notify();
  }

  late final PatchMapDataApi data;
  late final PatchMapTargetsApi targets;
  late final PatchMapHistoryApi history;
  late final PatchMapSelectionApi selection;
  late final PatchMapPresentationApi presentation;
  late final PatchMapViewportApi viewport;
  late final PatchMapRotationApi rotation;
  late final PatchMapTransformApi transform;
  late final PatchMapEditorApi editor;
  late final PatchMapPointerApi pointer;
  late final PatchMapAssetsApi assets;
  late final PatchMapDebugApi debug;
  late final PatchMapCaptureApi capture;

  final _ready = Completer<void>();
  Future<void> get ready => _ready.future;
  final Set<void Function()> _listeners = {};
  PatchMapSurfacePort? _surface;
  bool _destroyed = false;
  bool get destroyed => _destroyed;
  bool get attached => _surface != null;
  bool _dirty = true;
  int _sceneRevision = 1,
      _viewRevision = 0,
      _interactionRevision = 0,
      _generation = 1,
      _frameRevision = 0;
  int _replaceRequest = 0;
  PatchMapRevisionTuple? _published;
  Object? _companion;
  String? _datasetRef;
  bool _capturing = false;
  double _captureClockMs = 0;
  List<double>? _deferredResize;
  Future<void> _captureQueue = Future.value();
  final Map<PatchMapRevisionTuple, List<Completer<void>>> _frameWaiters = {};

  PatchMapRevisionTuple get revisions => PatchMapRevisionTuple(
    _sceneRevision,
    _viewRevision,
    _interactionRevision,
  );
  JsonMap get revisionStamp => {
    'lifecycleGeneration': _generation,
    'sceneRevision': _sceneRevision,
    'viewRevision': _viewRevision,
    'interactionRevision': _interactionRevision,
  };
  PatchMapRenderSnapshot get renderSnapshot => _snapshot();
  PatchMapDataset? _geometryDataset;
  Map<String, JsonMap>? _geometryOverlays;
  PatchMapGeometry? _geometryCache;
  int _projectionRevision = 0;
  PatchMapGeometry _geometryFor(
    PatchMapDataset dataset,
    Map<String, JsonMap> overlays,
  ) {
    if (!identical(_geometryDataset, dataset) ||
        !identical(_geometryOverlays, overlays)) {
      final projected =
          overlays is _BarHeightOverlay &&
              overlays.incremental &&
              identical(_geometryDataset, dataset) &&
              _geometryCache != null
          ? projectBarHeights(
              _geometryCache!,
              overlays.barKeys,
              overlays.heights,
            )
          : overlays is _TextValueOverlay &&
                identical(_geometryDataset, dataset) &&
                identical(_geometryOverlays, overlays.previous) &&
                _geometryCache != null
          ? projectTextValues(
              _geometryCache!,
              overlays.textValues,
              textLayouter,
            )
          : null;
      _geometryCache =
          projected ??
          buildGeometry(
            dataset,
            overlays: overlays,
            textLayouter: textLayouter,
            imageSizes: assetPort?.imageSizes ?? const {},
          );
      _geometryDataset = dataset;
      _geometryOverlays = overlays;
      _projectionRevision++;
    }
    return _geometryCache!;
  }

  void invalidateAssets() {
    if (_destroyed) return;
    _geometryDataset = null;
    _dirty = false;
    _notify();
  }

  PatchMapRenderSnapshot _snapshot({
    PatchMapDataset? dataset,
    Map<String, JsonMap>? overlays,
    List<String>? selectedIds,
    PatchMapRevisionTuple? tuple,
  }) {
    final resolvedDataset = dataset ?? _dataset;
    final resolvedOverlays = overlays ?? _animatedOverlays ?? _overlays;
    final geometry = _geometryFor(resolvedDataset, resolvedOverlays);
    return PatchMapRenderSnapshot(
      dataset: resolvedDataset,
      overlays: _viewOverlays(resolvedOverlays),
      selectedIds: List.unmodifiable(selectedIds ?? selection._ids),
      viewport: viewport._render,
      revisions: tuple ?? revisions,
      presentationAlpha: presentation._alpha,
      geometry: geometry,
      theme: theme,
      selectionPolicy: selectionPolicy,
      projectionRevision: _projectionRevision,
    );
  }

  void attach(PatchMapSurfacePort surface) {
    _assertLive();
    if (_surface != null && !identical(_surface, surface))
      throw const PatchMapException(
        'CONFLICT',
        'Controller already has an attached surface',
      );
    if (!surface.prepare(renderSnapshot))
      throw const PatchMapException(
        'RENDERER_LOST',
        'Surface refused initial scene',
      );
    _surface = surface;
    _published = null;
    _dirty = false;
    _schedule();
  }

  void detach(PatchMapSurfacePort surface) {
    if (!identical(_surface, surface)) return;
    _surface = null;
    _published = null;
    _dirty = true;
    _failFrames(const PatchMapException('NOT_READY', 'Surface detached'));
  }

  /// Host reports failed visible readiness without publishing a partial scene.
  void surfaceFailed(Object error) {
    if (_destroyed) return;
    if (!_ready.isCompleted) _ready.completeError(error);
    _failFrames(error);
    rotation._cancel(status: 'failed');
  }

  void frameConfirmed(PatchMapRevisionTuple tuple) {
    if (_destroyed || _surface == null || tuple != revisions) return;
    _published = tuple;
    rotation._completeFrame();
    _frameRevision++;
    _dirty = false;
    if (!_ready.isCompleted) _ready.complete();
    for (final stale
        in _frameWaiters.keys.where((key) => key != tuple).toList()) {
      for (final waiter in _frameWaiters.remove(stale)!) {
        waiter.completeError(
          const PatchMapException(
            'EXTRACTION_FAILURE',
            'Publication superseded',
          ),
        );
      }
    }
    final waiters = _frameWaiters.remove(tuple);
    for (final waiter in waiters ?? <Completer<void>>[]) {
      if (!waiter.isCompleted) waiter.complete();
    }
  }

  /// Host advances the single animation timeline immediately before a frame.
  bool advanceFrame(double milliseconds) {
    if (_destroyed || !_surfaceVisible) return false;
    if (_capturing) {
      _captureClockMs = math.max(_captureClockMs, milliseconds);
      return false;
    }
    _clockMs = math.max(_clockMs, milliseconds);
    final bars = _advanceBars(_clockMs);
    final turning = rotation._advance(_clockMs);
    return bars || turning;
  }

  PatchMapDisposer onChanged(void Function() listener) {
    _assertLive();
    _listeners.add(listener);
    return () => _listeners.remove(listener);
  }

  void _schedule() {
    if (_destroyed || !_surfaceVisible) return;
    if (!_dirty) {
      _dirty = true;
      _surface?.requestFrame();
    } else if (_surface != null && _published == null) {
      _surface!.requestFrame();
    }
  }

  void _notify() {
    _schedule();
    for (final listener in List.of(_listeners)) {
      if (_listeners.contains(listener)) {
        _call(() {
          if (_listeners.contains(listener)) listener();
        });
      }
    }
  }

  int _notificationDepth = 0;
  final List<void Function()> _notificationQueue = [];
  void _call(void Function() action) {
    if (_notificationDepth > 0) {
      _notificationQueue.add(action);
      return;
    }
    _invoke(action);
  }

  void _invoke(void Function() action) {
    try {
      action();
    } catch (_) {
      _lastCallbackFailure = _diagnostic(
        'HOST_CALLBACK_FAILURE',
        'event:callback',
      );
    }
  }

  void _endNotifications() {
    _notificationDepth--;
    if (_notificationDepth > 0) return;
    // Snapshot each publication. A nested public mutation delivers synchronously
    // before the remaining listeners of its outer publication, as in v1 EventHub.
    while (_notificationQueue.isNotEmpty && !_destroyed) {
      final batch = List<void Function()>.of(_notificationQueue);
      _notificationQueue.clear();
      for (final action in batch) {
        if (!_destroyed) _invoke(action);
      }
    }
  }

  void _publish({bool selectionChanged = false, bool historyChanged = false}) {
    _notificationDepth++;
    try {
      _notify();
      if (selectionChanged) selection._emit();
      if (historyChanged) history._emit();
    } finally {
      _endNotifications();
    }
  }

  JsonMap? _lastCallbackFailure;
  JsonMap _diagnostic(
    String code,
    String operation, {
    bool recoverable = true,
    String? datasetPath,
    int missingCount = 0,
  }) => {
    'code': code,
    'category':
        [
          'DESTROYED',
          'NOT_READY',
          'MISSING_TARGET',
          'CONFLICT',
          'ASSET_FAILURE',
          'EXTRACTION_FAILURE',
          'UNSUPPORTED_RUNTIME',
          'RENDERER_LOST',
          'HOST_CALLBACK_FAILURE',
          'INTERNAL_FAILURE',
        ].contains(code)
        ? code
        : 'INVALID_INPUT',
    'operation': operation,
    'lifecycleGeneration': _generation,
    'sceneRevision': _sceneRevision,
    'revisionStamp': revisionStamp,
    'recoverable': recoverable,
    'retryable': recoverable,
    'appliedCount': 0,
    'missingCount': missingCount,
    'unchangedCount': 0,
    if (datasetPath != null) 'datasetPath': datasetPath,
  };
  void _assertLive([String operation = 'access']) {
    if (_destroyed)
      throw PatchMapException.fromDiagnostic(
        _diagnostic('DESTROYED', operation, recoverable: false),
      );
  }

  bool get _canCommit => !_destroyed && _surface != null;
  PatchMapResult _failure(
    String status,
    String code,
    String message, {
    List<PatchMapTarget> missing = const [],
    int? diagnosticMissingCount,
    String? datasetPath,
  }) => PatchMapResult({
    'status': status,
    'changed': false,
    'appliedCount': 0,
    'missing': missing.map((t) => t.toJson()).toList(),
    'diagnostic': _diagnostic(
      code,
      'transact',
      recoverable: !_destroyed,
      datasetPath: datasetPath,
      missingCount: diagnosticMissingCount ?? missing.length,
    ),
  });

  bool _accept(
    PatchMapDataset candidate,
    Map<String, JsonMap> overlays,
    List<String> selectedIds,
    PatchMapRevisionTuple tuple,
  ) {
    if (!_canCommit) return false;
    final before = revisions;
    final surface = _surface!;
    try {
      final accepted = surface.prepare(
        _snapshot(
          dataset: candidate,
          overlays: overlays,
          selectedIds: selectedIds,
          tuple: tuple,
        ),
      );
      if (!accepted ||
          _destroyed ||
          before != revisions ||
          !identical(surface, _surface)) {
        if (!_destroyed && identical(surface, _surface))
          surface.prepare(renderSnapshot);
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _awaitFrame(PatchMapRevisionTuple tuple) {
    if (_published == tuple) return Future.value();
    final waiter = Completer<void>();
    (_frameWaiters[tuple] ??= []).add(waiter);
    _schedule();
    return waiter.future;
  }

  void _failFrames(Object error) {
    for (final list in _frameWaiters.values) {
      for (final waiter in list) {
        if (!waiter.isCompleted) waiter.completeError(error);
      }
    }
    _frameWaiters.clear();
  }

  Future<bool>? _destroying;
  PatchMapSurfacePort? _destroySurface;
  bool _surfaceDisposed = false, _assetsDisposed = false;

  Future<bool> destroy() {
    final pending = _destroying;
    if (pending != null) return pending;
    if (_destroyed && _surfaceDisposed && _assetsDisposed)
      return Future.value(false);
    if (!_destroyed) {
      _destroyed = true;
      _generation++;
      _replaceRequest++;
      rotation._cancel();
      transform._active?._end();
      final error = const PatchMapException(
        'DESTROYED',
        'Controller was destroyed',
      );
      if (!_ready.isCompleted) _ready.completeError(error);
      _failFrames(error);
      _destroySurface = _surface;
      _surface = null;
      _listeners.clear();
      _notificationQueue.clear();
      selection._listeners.clear();
      selection._pointerListeners.clear();
      history._listeners.clear();
      viewport._listeners.clear();
      viewport._settleTimer?.cancel();
      _barTweens.clear();
      _barColumns = null;
      _animatedOverlays = null;
      pointer._hover.clear();
      pointer._tooltip.clear();
      history._entries.clear();
      history._cursor = 0;
      _overlays = {};
    }
    final completion = Completer<bool>();
    _destroying = completion.future;
    unawaited(() async {
      Object? failure;
      StackTrace? stack;
      if (!_surfaceDisposed) {
        try {
          await _destroySurface?.dispose();
          _surfaceDisposed = true;
          _destroySurface = null;
        } catch (error, trace) {
          failure = error;
          stack = trace;
        }
      }
      if (!_assetsDisposed) {
        try {
          await assetPort?.dispose();
          _assetsDisposed = true;
        } catch (error, trace) {
          failure ??= error;
          stack ??= trace;
        }
      }
      _destroying = null;
      if (failure == null)
        completion.complete(true);
      else
        completion.completeError(failure, stack);
    }());
    return completion.future;
  }
}

JsonMap _map(Object? input) {
  if (input is! Map || input.keys.any((k) => k is! String))
    throw const PatchMapException(
      'INVALID_INPUT',
      'Expected a string-keyed record',
    );
  return Map<String, dynamic>.from(input);
}

JsonMap _cloneMap(Object? input) => cloneJson(_map(input)) as JsonMap;
double _number(Object? value, [double fallback = 0]) {
  if (value == null) return fallback;
  if (value is! num || !value.isFinite)
    throw const PatchMapException('INVALID_INPUT', 'Expected finite number');
  return value.toDouble();
}

bool _equal(Object? a, Object? b) => jsonEncode(a) == jsonEncode(b);

class PatchMapAssetsApi {
  PatchMapAssetsApi._(this._c);
  final PatchMapController _c;
  PatchMapResult register(Object registrations) {
    _c._assertLive();
    final port = _c.assetPort;
    if (port == null)
      throw const PatchMapException(
        'ASSET_FAILURE',
        'No asset backend configured',
      );
    final list = registrations is List ? registrations : [registrations];
    return port.register(list.map(_cloneMap).toList());
  }

  JsonMap status([String? alias]) =>
      _c.assetPort?.status(alias) ?? {'session': null, 'runtime': null};
}

class PatchMapDebugApi {
  PatchMapDebugApi._(this._c);
  final PatchMapController _c;
  JsonMap publication() => {
    'frameRevision': _c._frameRevision,
    'publishedTuple':
        _c._published?.toJson() ?? {'scene': 0, 'view': 0, 'interaction': 0},
  };
  JsonMap snapshot() {
    final surface = _c._surface;
    final host = surface is PatchMapSurfaceProbePort
        ? (surface as PatchMapSurfaceProbePort).debugResources
        : <String, dynamic>{};
    final subscriptions =
        _c._listeners.length +
        _c.selection._listeners.length +
        _c.selection._pointerListeners.length +
        _c.history._listeners.length +
        _c.viewport._listeners.length +
        _c.pointer._hover.length +
        _c.pointer._tooltip.length;
    return {
      'lifecycle': _c.destroyed
          ? 'destroyed'
          : surface == null
          ? 'initializing'
          : _c.dataset.roots.isEmpty
          ? 'ready-empty'
          : 'scene-ready',
      'instanceId': _c.instanceId,
      'revisions': _c.revisionStamp,
      'publishedTuple':
          _c._published?.toJson() ?? {'scene': 0, 'view': 0, 'interaction': 0},
      'frameRevision': _c._frameRevision,
      'datasetRef': _c._datasetRef,
      'semanticHash': _c.dataset.semanticHash,
      'rootIds': _c.dataset.roots.map((v) => v['id']).toList(),
      'historyDepth': _c.history.state['undoDepth'],
      'pendingWork':
          (_c._dirty && _c._surfaceVisible ? 1 : 0) + (_c._capturing ? 1 : 0),
      'zoomLimits': _c.viewport.zoomLimits,
      'viewport': _c.viewport.state,
      'selectionIds': _c.selection.ids,
      'presentation': {
        'revision': _c.presentation._revision,
        'layerCount': _c.presentation._layers.length,
      },
      'interaction': {
        'mode': (host['interaction'] as Map?)?['mode'] ?? 'select',
        'staleGestureCount':
            (host['interaction'] as Map?)?['staleGestureCount'] ??
            _c.transform._staleCount,
      },
      'facilities': [
        'renderer',
        'viewport',
        'world',
        'state',
        'history',
        'resize',
        'assets',
      ],
      'resources': {
        'canvasCount': host['canvasCount'],
        'canvas': host['canvas'],
        'renderer': host['renderer'],
        'rendering':
            host['rendering'] ??
            {'commandCount': null, 'visiblePrimitiveCount': null},
        'subscriptions': {
          'active':
              subscriptions +
              ((host['subscriptions'] as Map?)?['active'] as int? ?? 0),
          'duplicates': 0,
        },
        'assets': _c.assets.status()['session'],
      },
      if (_c._lastCallbackFailure != null)
        'lastCallbackFailure': _c._lastCallbackFailure,
    };
  }
}

class PatchMapCaptureApi {
  PatchMapCaptureApi._(this._c);
  final PatchMapController _c;
  Future<PatchMapCaptureResult> png() {
    final result = Completer<PatchMapCaptureResult>();
    _c._captureQueue = _c._captureQueue.then((_) async {
      try {
        _c._assertLive();
        await _c.ready;
        _c._assertLive();
        final surface = _c._surface;
        if (surface == null)
          throw const PatchMapException('NOT_READY', 'No attached surface');
        _c._captureClockMs = _c._clockMs;
        _c._capturing = true;
        final snapshot = _c.renderSnapshot;
        await _c.assetPort?.ready(snapshot);
        if (_c.destroyed || snapshot.revisions != _c.revisions)
          throw const PatchMapException(
            'EXTRACTION_FAILURE',
            'Capture scene became stale',
          );
        await _c._awaitFrame(snapshot.revisions);
        if (_c.destroyed ||
            snapshot.revisions != _c.revisions ||
            !identical(surface, _c._surface))
          throw const PatchMapException(
            'EXTRACTION_FAILURE',
            'Capture scene became stale',
          );
        final captured = await surface.capture(snapshot);
        if (_c.destroyed || snapshot.revisions != _c.revisions)
          throw const PatchMapException(
            'EXTRACTION_FAILURE',
            'Capture publication changed',
          );
        result.complete(captured);
      } catch (error, stack) {
        result.completeError(error, stack);
      } finally {
        final pausedAt = _c._clockMs;
        _c._capturing = false;
        _c._syncAnimationClock();
        _c._clockMs = math.max(_c._clockMs, _c._captureClockMs);
        final pausedMs = _c._clockMs - pausedAt;
        if (!_c.destroyed && pausedMs > 0) {
          if (_c._barTweens.isNotEmpty) {
            _c._barTweens = _c._barTweens.map(
              (key, tween) => MapEntry(
                key,
                _BarTween(
                  tween.from,
                  tween.to,
                  tween.start + pausedMs,
                  tween.duration,
                ),
              ),
            );
            _c._barColumns = _BarColumns(_c._barTweens);
          }
          final rotation = _c.rotation._animation;
          if (rotation != null) {
            rotation.start = rotation.start! + pausedMs;
            if (rotation.hiddenAt != null)
              rotation.hiddenAt = rotation.hiddenAt! + pausedMs;
          }
        }
        if (!_c.destroyed &&
            (_c._barTweens.isNotEmpty || _c.rotation._animation != null)) {
          _c._dirty = false;
          _c._schedule();
        }
        final resize = _c._deferredResize;
        _c._deferredResize = null;
        if (resize != null && !_c.destroyed)
          _c.viewport.resize(resize[0], resize[1], resize[2]);
      }
    });
    return result.future;
  }
}

// Policies contain host callbacks as well as JSON values. Own all mutable
// containers while preserving callback identity; do not invoke callbacks here.
JsonMap _detachPolicy(JsonMap value) {
  final active = HashSet<Object>.identity();
  Object? visit(Object? input) {
    if (input is Function) return input;
    if (input is Map || input is List) {
      if (!active.add(input!)) {
        throw const PatchMapException('INVALID_INPUT', 'Cyclic policy input');
      }
      try {
        if (input is Map) {
          return Map<String, dynamic>.unmodifiable(
            input.map((key, value) => MapEntry(key as String, visit(value))),
          );
        }
        return List<Object?>.unmodifiable((input as List).map(visit));
      } finally {
        active.remove(input);
      }
    }
    return freezeJson(input);
  }

  return visit(value) as JsonMap;
}
