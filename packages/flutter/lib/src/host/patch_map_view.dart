import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/foundation.dart' show mapEquals, listEquals;
import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter/services.dart';

import '../api/values.dart';
import '../engine/controller.dart';
import '../engine/ports.dart';
import '../rendering/canvas_renderer.dart';
import '../semantic/geometry/geometry.dart';
import 'native_assets.dart';
import 'native_pointer.dart';
import 'map_gesture_recognizer.dart';

part 'native_map_surface.dart';

enum PatchMapResizeMode { observe, manual }

/// One native Canvas surface. Its owner controls the controller lifetime.
class PatchMapView extends StatefulWidget {
  const PatchMapView({
    super.key,
    required this.controller,
    this.background = const ui.Color(0xfffafafa),
    this.resizeMode = PatchMapResizeMode.observe,
    this.antialias = true,
    this.onError,
  });
  final PatchMapController controller;
  final ui.Color background;
  final PatchMapResizeMode resizeMode;
  final bool antialias;
  final void Function(Object error)? onError;
  @override
  State<PatchMapView> createState() => _PatchMapViewState();
}

class _PatchMapViewState extends State<PatchMapView>
    with WidgetsBindingObserver {
  late final _HostSurface _surface = _HostSurface(this);
  final _repaint = ValueNotifier<int>(0);
  final _semantics = ValueNotifier<int>(0);
  bool _hasSnapshot = false,
      _hasPointer = false,
      _hasRenderer = false,
      _ownsAssetCallback = false;
  final _boundary = GlobalKey();
  late PatchMapCanvasRenderer _renderer;
  late PatchMapRenderSnapshot _snapshot;
  bool _scheduled = false, _closed = false, _assetsReady = false;
  int? _frameId;
  Object? _error;
  late NativePointerBinding _pointer;
  final _focus = FocusNode();
  NativeMapGestureRecognizer? _gestureRecognizer;
  int _assetGeneration = 0;
  bool _visible = true;
  double _lastFrameMs = 0;
  // The frame timestamp stops changing while the map is idle. A monotonic
  // stopwatch fills that gap without scheduling frames; the test binding
  // supplies the same fake clock used by pump/elapseBlocking.
  late final Stopwatch _frameAge =
      GestureBinding.instance.samplingClock.stopwatch()..start();
  double get _animationTimeMs =>
      _lastFrameMs + _frameAge.elapsedMicroseconds / (1000 * timeDilation);
  Object? _assetTopology;
  Map<String, double>? _assetAlpha;
  Future<void>? _assetFuture;
  PatchMapController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _visible =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    _attach();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncHostPolicy();
  }

  void _syncHostPolicy() {
    if (_closed || controller.destroyed) return;
    final reduced =
        MediaQuery.maybeOf(context)?.disableAnimations ??
        WidgetsBinding
            .instance
            .platformDispatcher
            .accessibilityFeatures
            .disableAnimations;
    if (controller.reducedMotion != reduced) {
      controller.reducedMotion = reduced;
      requestFrame();
    }
    if (!_visible) controller.surfaceVisibilityChanged(false, _lastFrameMs);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final visible = state == AppLifecycleState.resumed;
    if (_visible == visible || _closed || controller.destroyed) return;
    _visible = visible;
    if (!visible) {
      if (_frameId != null)
        SchedulerBinding.instance.cancelFrameCallbackWithId(_frameId!);
      _frameId = null;
      _scheduled = false;
      _gestureRecognizer?.cancelAll();
      _pointer.blur();
    }
    controller.surfaceVisibilityChanged(visible, _animationTimeMs);
    if (visible) requestFrame();
  }

  void _attach() {
    _closed = false;
    _lastFrameMs =
        SchedulerBinding.instance.currentFrameTimeStamp.inMicroseconds / 1000;
    _frameAge
      ..reset()
      ..start();
    _assetTopology = null;
    _assetAlpha = null;
    _assetFuture = null;
    final session = controller.assetPort;
    var attachedHere = false;
    try {
      if (controller.attached)
        throw const PatchMapException(
          'CONFLICT',
          'Controller already has an attached surface',
        );
      _renderer = PatchMapCanvasRenderer(
        session is NativeAssetSession ? session : null,
        antialias: widget.antialias,
      );
      _hasRenderer = true;
      _snapshot = controller.renderSnapshot;
      _hasSnapshot = true;
      _pointer = NativePointerBinding(
        controller,
        (world) => _renderer.hitTestTarget(world),
        requestFrame,
        onError: widget.onError,
      )..claimGesture = () => _gestureRecognizer?.acceptAll();
      _hasPointer = true;
      if (session is NativeAssetSession) {
        _ownsAssetCallback = true;
        session.invalidate = () {
          if (_closed || !mounted) return;
          controller.invalidateAssets();
          final refreshed = controller.renderSnapshot;
          _loadAssets(refreshed, force: true);
          _renderer.refreshAssets(refreshed);
          requestFrame();
        };
      }
      controller.attach(_surface);
      attachedHere = true;
      _loadAssets(_snapshot);
    } catch (error) {
      if (!controller.attached || attachedHere)
        _failSurface(error);
      else
        widget.onError?.call(error);
      controller.detach(_surface);
      _close();
    }
  }

  void _loadAssets(PatchMapRenderSnapshot snapshot, {bool force = false}) {
    // Only the proven bar-height projection preserves topology. It cannot
    // change image/font dependencies; general scene edits take the ready path.
    if (!force &&
        _assetsReady &&
        controller.assetPort is NativeAssetSession &&
        identical(_assetTopology, snapshot.geometry.topology) &&
        mapEquals(_assetAlpha, snapshot.presentationAlpha))
      return;
    final future =
        controller.assetPort?.ready(snapshot) ?? Future<void>.value();
    _assetTopology = snapshot.geometry.topology;
    _assetAlpha = snapshot.presentationAlpha;
    if (identical(_assetFuture, future)) return;
    _assetFuture = future;
    _assetsReady = false;
    final generation = ++_assetGeneration;
    unawaited(
      future.then(
        (_) {
          if (_closed || !mounted || generation != _assetGeneration) return;
          _assetsReady = true;
          _error = null;
          // Resource completion invalidates through NativeAssetSession's owner.
          requestFrame();
        },
        onError: (Object error) {
          if (_closed || !mounted || generation != _assetGeneration) return;
          _failSurface(error);
          requestFrame();
        },
      ),
    );
  }

  @override
  void didUpdateWidget(PatchMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != controller) {
      oldWidget.controller.detach(_surface);
      if (_hasPointer) _pointer.dispose();
      if (_ownsAssetCallback &&
          oldWidget.controller.assetPort is NativeAssetSession)
        (oldWidget.controller.assetPort as NativeAssetSession).invalidate =
            null;
      if (_hasRenderer) _renderer.dispose();
      _hasSnapshot = _hasPointer = _hasRenderer = _ownsAssetCallback = false;
      _assetsReady = false;
      _attach();
      _syncHostPolicy();
    } else {
      if (oldWidget.antialias != widget.antialias) {
        _renderer.dispose();
        final session = controller.assetPort;
        _renderer = PatchMapCanvasRenderer(
          session is NativeAssetSession ? session : null,
          antialias: widget.antialias,
        );
        _renderer.prepare(controller.renderSnapshot);
      }
      if (oldWidget.background != widget.background ||
          oldWidget.antialias != widget.antialias)
        requestFrame();
    }
  }

  bool prepare(PatchMapRenderSnapshot snapshot) {
    if (_closed) return false;
    try {
      _renderer.prepare(snapshot);
      return true;
    } catch (error) {
      widget.onError?.call(error);
      return false;
    }
  }

  void requestFrame() {
    if (_closed || !_visible || _scheduled || !mounted) return;
    _scheduled = true;
    _frameId = SchedulerBinding.instance.scheduleFrameCallback((time) {
      _scheduled = false;
      _frameId = null;
      if (_closed || !mounted || controller.destroyed) return;
      try {
        _lastFrameMs = time.inMicroseconds / 1000;
        _frameAge.reset();
        final activeAnimation = controller.advanceFrame(_lastFrameMs);
        _pointer.syncDataset();
        final snapshot = controller.renderSnapshot;
        if (_snapshot.revisions.scene != snapshot.revisions.scene ||
            _snapshot.revisions.interaction != snapshot.revisions.interaction ||
            !mapEquals(_snapshot.presentationAlpha, snapshot.presentationAlpha))
          _loadAssets(snapshot);
        final manualSizeChanged =
            widget.resizeMode == PatchMapResizeMode.manual &&
            (_snapshot.viewport.width != snapshot.viewport.width ||
                _snapshot.viewport.height != snapshot.viewport.height);
        final semanticsChanged =
            !identical(_snapshot.geometry, snapshot.geometry) ||
            _snapshot.revisions.view != snapshot.revisions.view ||
            !listEquals(_snapshot.selectedIds, snapshot.selectedIds);
        _snapshot = snapshot;
        if (semanticsChanged) _semantics.value++;
        if (manualSizeChanged) setState(() {});
        _renderer.prepare(snapshot);
        _repaint.value++;
        if (activeAnimation) requestFrame();
      } catch (error) {
        _failSurface(error);
      }
    });
  }

  void _failSurface(Object error) {
    if (_closed || !mounted || controller.destroyed) return;
    _error = error;
    controller.surfaceFailed(error);
    widget.onError?.call(error);
  }

  void _paintFailed(Object error) {
    SchedulerBinding.instance.addPostFrameCallback((_) => _failSurface(error));
  }

  void _painted(PatchMapRenderSnapshot snapshot) {
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (!_closed && _visible && mounted && _assetsReady && _error == null)
        controller.frameConfirmed(snapshot.revisions);
    });
  }

  Future<PatchMapCaptureResult> capture(PatchMapRenderSnapshot snapshot) async {
    if (_closed || !mounted || snapshot.revisions != controller.revisions)
      throw const PatchMapException('STALE_TARGET', 'Capture surface changed');
    if (_error != null) throw _error!;
    await (controller.assetPort?.ready(snapshot) ?? Future<void>.value());
    if (_closed || snapshot.revisions != controller.revisions)
      throw const PatchMapException('STALE_TARGET', 'Capture tuple changed');
    final boundary =
        _boundary.currentContext?.findRenderObject() as _CaptureRenderBoundary?;
    if (boundary == null || !boundary.paintReady)
      throw const PatchMapException('NOT_READY', 'Surface has not painted');
    final image = await boundary.toImage(
      pixelRatio: snapshot.viewport.pixelRatio,
    );
    try {
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null ||
          _closed ||
          snapshot.revisions != controller.revisions)
        throw const PatchMapException(
          'EXTRACTION_FAILURE',
          'Capture invalidated',
        );
      return PatchMapCaptureResult(
        dataUrl:
            'data:image/png;base64,${base64Encode(bytes.buffer.asUint8List())}',
        size: [snapshot.viewport.width, snapshot.viewport.height],
      );
    } finally {
      image.dispose();
    }
  }

  void _input(void Function() callback) {
    if (_closed || controller.destroyed) return;
    try {
      callback();
    } catch (error) {
      widget.onError?.call(error);
    }
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      if (_closed || !_hasSnapshot) return const SizedBox.expand();
      final width = constraints.maxWidth, height = constraints.maxHeight;
      final dpr = MediaQuery.devicePixelRatioOf(context);
      if (widget.resizeMode == PatchMapResizeMode.observe &&
          width.isFinite &&
          height.isFinite &&
          width > 0 &&
          height > 0 &&
          (width != _snapshot.viewport.width ||
              height != _snapshot.viewport.height ||
              dpr != _snapshot.viewport.pixelRatio)) {
        SchedulerBinding.instance.addPostFrameCallback((_) {
          if (mounted && !_closed && !controller.destroyed)
            controller.viewport.resize(width, height, dpr);
        });
      }
      Widget paint = _CaptureBoundary(
        key: _boundary,
        child: _SemanticCustomPaint(
          semanticsUpdates: _semantics,
          painter: _MapPainter(
            _repaint,
            () => _snapshot,
            _renderer,
            widget.background,
            _painted,
            _paintFailed,
            (id) => _input(() => controller.selection.set([id])),
            () => _pointer.marquee,
          ),
          size: Size.infinite,
        ),
      );
      if (widget.resizeMode == PatchMapResizeMode.manual) {
        final v = _snapshot.viewport;
        paint = OverflowBox(
          alignment: Alignment.topLeft,
          minWidth: v.width,
          maxWidth: v.width,
          minHeight: v.height,
          maxHeight: v.height,
          child: paint,
        );
      }
      return Focus(
        focusNode: _focus,
        onFocusChange: (focused) {
          if (!focused) _pointer.blur();
        },
        onKeyEvent: (_, event) {
          if (event is KeyDownEvent &&
              event.logicalKey == LogicalKeyboardKey.escape) {
            _pointer.cancel();
            return KeyEventResult.handled;
          }
          return KeyEventResult.ignored;
        },
        child: MouseRegion(
          onExit: (event) => _input(() => _pointer.leave(event)),
          child: Listener(
            behavior: HitTestBehavior.opaque,
            onPointerHover: (event) => _input(() => _pointer.hover(event)),

            onPointerSignal: (event) {
              final modifier =
                  (controller.viewportPolicy['wheel']
                      as Map?)?['activationModifier'];
              if (modifier == 'control' &&
                  !HardwareKeyboard.instance.isControlPressed &&
                  !HardwareKeyboard.instance.isMetaPressed)
                return;
              if (event is PointerScrollEvent)
                GestureBinding.instance.pointerSignalResolver.register(
                  event,
                  (_) => _input(() {
                    controller.viewport.zoomBy(
                      math.exp(-event.scrollDelta.dy * 0.001),
                      [event.localPosition.dx, event.localPosition.dy],
                    );
                  }),
                );
            },
            child: RawGestureDetector(
              behavior: HitTestBehavior.opaque,
              gestures: {
                NativeMapGestureRecognizer:
                    GestureRecognizerFactoryWithHandlers<
                      NativeMapGestureRecognizer
                    >(NativeMapGestureRecognizer.new, (recognizer) {
                      _gestureRecognizer = recognizer;
                      recognizer.onEvent = (event) => _input(() {
                        if (event is PointerDownEvent) {
                          _focus.requestFocus();
                          _pointer.down(event);
                        } else if (event is PointerMoveEvent) {
                          _pointer.move(event);
                        } else if (event is PointerUpEvent) {
                          _pointer.up(event);
                        } else if (event is PointerPanZoomStartEvent) {
                          _pointer.panZoomStart(event);
                        } else if (event is PointerPanZoomUpdateEvent) {
                          _pointer.panZoomUpdate(event);
                        } else if (event is PointerPanZoomEndEvent) {
                          _pointer.cancel();
                        } else if (event is PointerCancelEvent) {
                          _pointer.cancel(event);
                        }
                      });
                    }),
              },
              child: paint,
            ),
          ),
        ),
      );
    },
  );

  void _close() {
    if (_closed) return;
    _closed = true;
    _frameAge.stop();
    _assetGeneration++;
    if (_frameId != null)
      SchedulerBinding.instance.cancelFrameCallbackWithId(_frameId!);
    _frameId = null;
    if (_hasPointer) _pointer.dispose();
    if (_hasRenderer) _renderer.dispose();
    final assets = controller.assetPort;
    if (_ownsAssetCallback && assets is NativeAssetSession)
      assets.invalidate = null;
    _ownsAssetCallback = false;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    controller.detach(_surface);
    _close();
    _repaint.dispose();
    _semantics.dispose();
    _focus.dispose();
    super.dispose();
  }
}
