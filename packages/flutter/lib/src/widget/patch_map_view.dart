import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';

import '../api/result.dart';
import '../api/camera.dart';
import '../api/object_geometry.dart';
import '../api/gesture_options.dart';
import '../api/selection_style.dart';
import '../api/rotation_animation.dart';
import '../api/presentation.dart';
import '../api/events.dart';
import '../interaction/input_coordinator.dart';
import '../interaction/input_query.dart';
import '../interaction/touch_camera_gesture.dart';
import '../api/target.dart';
import '../api/update.dart';
import '../dataset/colors.dart';
import '../frame/frame_coordinator.dart';
import '../rendering/selection_overlay.dart' as selection;
import '../geometry/scene_geometry.dart' show unionBounds;
import '../geometry/object_geometry.dart';
import '../geometry/item_data.dart';
import '../resources/asset_registry.dart';
import '../presentation/field_operations.dart' show presentationEqual;
import '../session/map_session.dart';
import '../viewport/camera.dart';
import 'map_backend.dart';
import 'map_gesture_detector.dart';
import 'patch_map_controller.dart';

/// Native retained diagram surface. Domain data fetching and actions belong to
/// the host. Removing this widget closes its session; its controller may attach
/// to another widget later without replaying old commands.
class PatchMapView extends StatefulWidget {
  const PatchMapView({
    super.key,
    required this.controller,
    this.initialData,
    this.active = true,
    this.colors = const {},
    this.symbols = const {},
    this.onPhaseChanged,
    this.onImageFailure,
    this.onAttached,
    this.onEvent,
    this.onCameraChanged,
    this.onGestureRotation,
    this.eventFilter,
    this.dragMode = PatchMapDragMode.pan,
    this.gestures = const PatchMapGestureOptions(),
    this.zoomLimits = const PatchMapZoomLimits(),
    this.selectionStyle = const PatchMapSelectionStyle(),
    this.rotationAnimation = const PatchMapRotationAnimationOptions(),
    this.loadingBuilder,
    this.errorBuilder,
  });
  final PatchMapController controller;
  final Object? initialData;
  final bool active;
  final Map<String, Object?> colors, symbols;
  final void Function(PatchMapPhase phase, PatchMapFailure? failure)?
  onPhaseChanged;
  final void Function(List<PatchMapFailure> failures)? onImageFailure;
  final void Function(PatchMapController controller)? onAttached;
  final void Function(PatchMapInputEvent event)? onEvent;
  final ValueChanged<PatchMapCameraChange>? onCameraChanged;

  /// Reports each angle actually applied by a touch rotation, in clockwise
  /// radians, during input dispatch before the frame's camera notification.
  final ValueChanged<double>? onGestureRotation;
  final bool Function(PatchMapObject object)? eventFilter;
  final PatchMapDragMode dragMode;
  final PatchMapGestureOptions gestures;
  final PatchMapZoomLimits zoomLimits;
  final PatchMapSelectionStyle selectionStyle;
  final PatchMapRotationAnimationOptions rotationAnimation;
  final WidgetBuilder? loadingBuilder;
  final Widget Function(BuildContext context, PatchMapFailure? failure)?
  errorBuilder;
  @override
  State<PatchMapView> createState() => _PatchMapViewState();
}

class _PatchMapViewState extends State<PatchMapView>
    with WidgetsBindingObserver
    implements PatchMapBinding {
  late final MapBackend backend;
  late final MapSession session;
  late final FrameCoordinator frame;
  late final InputCoordinator input;
  PatchMapController? _attachedController;
  PatchMapFailure? _failure;
  bool _foreground = true, _disposed = false;
  final _relationHits = Expando<InputHitGeometry>();
  bool _deferInput = false;
  int? _recognitionEpoch, _gestureGeneration;
  final _admittedPointers = <int>{};
  final _gestureArena = MapGestureArena();
  bool _pinchFromDoubleTap = false;
  ({double scale, double angle})? _pinchOrigin;
  Offset _gestureFocal = Offset.zero;
  final _touchGesture = TouchCameraGesture();
  late PatchMapGestureOptions _gestureOptions;
  @override
  void initState() {
    super.initState();
    // A failed initState is not disposed by Flutter. Reject duplicate ownership
    // before allocating a backend or registering any lifecycle observer.
    if (widget.controller.isAttached) {
      throw StateError(
        'PatchMapController is already attached to a live widget',
      );
    }
    MapCamera.validateZoomLimits(widget.zoomLimits);
    TouchCameraGesture.validateOptions(widget.gestures);
    selection.SelectionOverlay.validateStyle(widget.selectionStyle);
    MapCamera.validateRotationAnimation(widget.rotationAnimation);
    _gestureOptions = widget.gestures;
    _foreground =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    backend = MapBackend(
      zoomLimits: widget.zoomLimits,
      rotationAnimation: widget.rotationAnimation,
      palette: ColorResolver(colors: widget.colors),
      registry: AssetRegistry(symbols: widget.symbols),
      invalidate: () => frame.invalidate(),
      onReplacement: _resetInput,
      onResourceRefresh: () => session.refreshResources(),
      onUnexpectedAssetFailure: (error, stack) => session.fail(error, stack),
      onAssetFailure: (failures) =>
          session.notify(() => widget.onImageFailure?.call(failures)),
    );
    backend.selectionOverlay.configure(widget.selectionStyle);
    WidgetsBinding.instance.addObserver(this);
    backend.camera.observe(widget.onCameraChanged != null);
    frame = FrameCoordinator(
      onFrame: (time) {
        input.onFrame();
        return backend.onFrame(time);
      },
      onSubmitted: (stamp) {
        session.didSubmit(stamp);
        backend.retirement.flush();
        if (!_disposed &&
            session.active &&
            phase == PatchMapPhase.ready &&
            stamp.generation == session.generation) {
          final change = backend.camera.takeChange();
          if (change != null) {
            session.notify(() => widget.onCameraChanged?.call(change));
          }
        }
      },
      onError: (error, stack) => session.fail(error, stack),
    );
    session = MapSession(
      backend: backend,
      invalidate: frame.invalidate,
      onPhase: (phase, failure) {
        if (_disposed) return;
        setState(() => _failure = failure);
        widget.onPhaseChanged?.call(phase, failure);
      },
      onCallbackError: _report,
    );
    input = InputCoordinator(
      currentGeometry: () => backend.current?.geometry,
      camera: backend.camera,
      getSpatialCandidates: (_, bounds) => backend.spatial.candidates(bounds),
      exactGeometry: (snapshot, node) {
        final geometry = snapshot.relationFor(node.id);
        if (geometry == null) return null;
        return _relationHits[geometry] ??= InputHitGeometry(
          contains: geometry.contains,
          segmentEntry: geometry.segmentEntry,
          intersects: geometry.intersects,
        );
      },
      notify: _onInput,
      onNeedFrame: frame.invalidate,
      onNeedNotification: frame.requestNotification,
      claimDoubleTapZoom: _gestureArena.claimZoom,
      filter: (object) =>
          session.filter(() => widget.eventFilter?.call(object) ?? true),
    );
    _configureInput();
    widget.controller.attach(this);
    _attachedController = widget.controller;
    _activity();
    if (widget.initialData != null) {
      _observe(session.replace(widget.initialData));
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_disposed) {
        session.notify(() => widget.onAttached?.call(widget.controller));
      }
    });
  }

  void _onInput(PatchMapInputEvent event) {
    if (_disposed) return;
    if (_deferInput) {
      final generation = session.generation;
      scheduleMicrotask(() {
        if (!_disposed && session.generation == generation) {
          session.notify(() => widget.onEvent?.call(event));
        }
      });
    } else {
      session.notify(() => widget.onEvent?.call(event));
    }
  }

  void _resetInput() {
    if (_disposed) return;
    _clearAdmittedPointers();
    _deferInput = true;
    try {
      input.reset();
      _gestureArena.resetDoubleTap();
    } finally {
      _deferInput = false;
    }
  }

  void _observe(Future<PatchMapResult> future) {
    unawaited(
      future.catchError((Object error, StackTrace stack) {
        _report(error, stack);
        return PatchMapResult(PatchMapOutcome.rejected);
      }),
    );
  }

  void _report(Object error, StackTrace stack) => FlutterError.reportError(
    FlutterErrorDetails(
      exception: error,
      stack: stack,
      library: 'conalog_patch_map',
    ),
  );

  void _reportConfigurationError(Object error, StackTrace stack) {
    // A host error reporter is terminal; it must not interrupt widget rebuilds.
    try {
      _report(error, stack);
    } catch (_) {
      // Do not report a reporter failure recursively.
    }
  }

  @override
  void didUpdateWidget(PatchMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    try {
      if (backend.camera.setRotationAnimation(widget.rotationAnimation)) {
        frame.invalidate();
      }
    } on ArgumentError catch (error, stack) {
      _reportConfigurationError(error, stack);
    }
    try {
      if (backend.selectionOverlay.configure(widget.selectionStyle)) {
        frame.invalidate();
      }
    } on ArgumentError catch (error, stack) {
      // Keep the last valid decoration; selection and pending updates survive.
      _reportConfigurationError(error, stack);
    }
    try {
      TouchCameraGesture.validateOptions(widget.gestures);
      _gestureOptions = widget.gestures;
    } on ArgumentError catch (error, stack) {
      _reportConfigurationError(error, stack);
    }
    var zoomChanged = false;
    try {
      zoomChanged = backend.camera.setZoomLimits(widget.zoomLimits);
    } on ArgumentError catch (error, stack) {
      // Keep the prior valid camera/limits without aborting Flutter's element
      // update and leaving its inherited-widget dependencies half updated.
      _reportConfigurationError(error, stack);
    }
    backend.camera.observe(widget.onCameraChanged != null);
    if (!identical(oldWidget.controller, widget.controller)) {
      widget.controller.attach(this);
      _attachedController?.detach(this);
      _attachedController = widget.controller;
      input.endDoubleTapZoom();
    }
    if (!presentationEqual(oldWidget.colors, widget.colors) ||
        !presentationEqual(oldWidget.symbols, widget.symbols)) {
      // Registries are attachment configuration, not an implicit data update.
      throw FlutterError(
        'Changing PatchMap colors/symbols requires a new widget key',
      );
    }
    if (!identical(oldWidget.initialData, widget.initialData) &&
        widget.initialData != null) {
      _observe(session.replace(widget.initialData));
    }
    if (zoomChanged) frame.invalidate();
    _configureInput();
    _activity();
  }

  bool get _doubleTapZoomEnabled =>
      _gestureOptions.doubleTapDragZoomEnabled && _gestureOptions.zoomEnabled;

  bool get _canStartInput => phase == PatchMapPhase.ready && session.active;

  void _configureInput() {
    input.dragMode = widget.dragMode;
    input.configureDoubleTapZoom(_doubleTapZoomEnabled);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _activity();
  }

  void _activity() {
    final active = widget.active && _foreground;
    input.setActive(active);
    if (!active) {
      _clearAdmittedPointers();
      _gestureArena.resetDoubleTap();
    }
    session.setActive(active);
    frame.setActive(active);
  }

  void _clearAdmittedPointers() {
    _admittedPointers.clear();
    _gestureGeneration = null;
    _pinchFromDoubleTap = false;
    _pinchOrigin = null;
    _gestureArena.trackZoomCandidate(null);
  }

  void _pointerDown(PointerDownEvent event) {
    if (!_canStartInput) return;
    backend.camera.cancelRotation();
    if (input.isDoubleTapZooming && event.buttons == kPrimaryButton) {
      _pinchFromDoubleTap = true;
    }
    _admittedPointers.add(event.pointer);
    final touch =
        _doubleTapZoomEnabled && event.kind == PointerDeviceKind.touch;
    input.pointerDown(
      event.pointer,
      event.localPosition,
      event.position,
      buttons: event.buttons,
      touch: touch,
      firstTap: touch ? _gestureArena.firstTapFor(event.pointer) : null,
    );
    if (touch && !_canStartInput) input.endDoubleTapZoom();
    _gestureArena.trackZoomCandidate(input.zoomCandidatePointer);
    _recognitionEpoch = input.inputEpoch;
  }

  void _pointerMove(PointerMoveEvent event) {
    // An accepted replacement can enter preparing before its deferred input
    // reset. Do not apply a zoom sample to the outgoing camera in that gap.
    if (_doubleTapZoomEnabled && !_canStartInput) {
      input.endDoubleTapZoom();
      return;
    }
    input.pointerMove(event.pointer, event.localPosition, event.position);
  }

  void _releasePointer(int pointer) {
    _admittedPointers.remove(pointer);
    if (_admittedPointers.isEmpty) {
      _pinchFromDoubleTap = false;
      _pinchOrigin = null;
      _gestureArena.trackZoomCandidate(null);
    }
  }

  void _scaleStart(ScaleStartDetails details) {
    _touchGesture.start(
      _gestureOptions,
      cameraScale: backend.camera.scale,
      cameraRotation: backend.camera.rotation,
    );
    _gestureGeneration = session.generation;
    _gestureFocal = details.localFocalPoint;
    _pinchOrigin = null;
  }

  void _scaleUpdate(ScaleUpdateDetails details) {
    if (_admittedPointers.length < 2 ||
        _gestureGeneration != session.generation ||
        details.pointerCount < 2 ||
        !_canStartInput) {
      return;
    }
    var factor = details.scale, angle = details.rotation;
    if (_pinchFromDoubleTap) {
      final origin = _pinchOrigin;
      if (origin == null) {
        if (factor.isFinite && factor > 0 && angle.isFinite) {
          _pinchOrigin = (scale: factor, angle: angle);
          _gestureFocal = details.localFocalPoint;
        }
        return;
      }
      factor /= origin.scale;
      angle -= origin.angle;
    }
    if (_touchGesture.enabled) {
      final currentRotation = backend.camera.rotation;
      _touchGesture.update(
        factor: factor,
        angle: angle,
        currentScale: backend.camera.scale,
        currentRotation: currentRotation,
      );
      final rotation = _touchGesture.rotation;
      final appliedRotation = input.cameraGesture(
        pointerCount: details.pointerCount,
        localAnchor: _gestureFocal,
        scale: _touchGesture.scale,
        rotation: rotation == currentRotation ? null : rotation,
      );
      final onGestureRotation = widget.onGestureRotation;
      if (appliedRotation != null && onGestureRotation != null) {
        session.notify(() => onGestureRotation(appliedRotation));
      }
    }
    if (!_canStartInput || _gestureGeneration != session.generation) return;
    final moved = backend.camera.pan(details.localFocalPoint - _gestureFocal);
    _gestureFocal = details.localFocalPoint;
    if (moved) frame.invalidate();
  }

  @override
  void dispose() {
    _disposed = true;
    _attachedController?.detach(this);
    _attachedController = null;
    WidgetsBinding.instance.removeObserver(this);
    input.dispose();
    session.close();
    frame.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        if (!size.isFinite) {
          throw FlutterError('PatchMapView requires bounded width and height');
        }
        if (size != backend.camera.size) input.endDoubleTapZoom();
        backend.resize(size);
        final pixelRatio = MediaQuery.devicePixelRatioOf(context);
        return MouseRegion(
          onExit: (e) => input.leave(e.pointer, e.localPosition, e.position),
          child: Listener(
            behavior: HitTestBehavior.opaque,
            onPointerDown: _pointerDown,
            onPointerMove: _pointerMove,
            onPointerUp: (e) {
              _releasePointer(e.pointer);
              input.pointerUp(e.pointer, e.localPosition, e.position);
            },
            onPointerCancel: (e) {
              _releasePointer(e.pointer);
              input.pointerCancel(e.pointer);
            },
            onPointerHover: (e) {
              if (phase == PatchMapPhase.ready && session.active) {
                input.hover(e.pointer, e.localPosition, e.position);
              }
            },
            onPointerSignal: (event) {
              if (event is PointerScrollEvent &&
                  _gestureOptions.zoomEnabled &&
                  phase == PatchMapPhase.ready &&
                  session.active) {
                GestureBinding.instance.pointerSignalResolver.register(event, (
                  resolved,
                ) {
                  final scroll = resolved as PointerScrollEvent;
                  backend.camera.cancelRotation();
                  input.wheel(
                    localAnchor: scroll.localPosition,
                    scaleFactor: (1 - scroll.scrollDelta.dy / 500).clamp(
                      .01,
                      100,
                    ),
                  );
                });
              }
            },
            child: MapGestureDetector(
              arena: _gestureArena,
              canStart: () => _canStartInput,
              longPressDuration: _gestureOptions.longPressDuration,
              onTap: () => input.recognizedTap(epoch: _recognitionEpoch),
              onDoubleTap: (pointer) => input.recognizedDoubleTap(
                epoch: _recognitionEpoch,
                pointer: pointer,
              ),
              onSecondaryTap: () =>
                  input.recognizedSecondaryTap(epoch: _recognitionEpoch),
              onLongPress: () =>
                  input.recognizedLongPress(epoch: _recognitionEpoch),
              onScaleStart: _scaleStart,
              onScaleUpdate: _scaleUpdate,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  RepaintBoundary(
                    child: ClipRect(
                      child: CustomPaint(
                        painter: _MapPainter(backend, frame, pixelRatio, (
                          generation,
                          error,
                          stack,
                        ) {
                          if (!_disposed && session.generation == generation) {
                            session.fail(error, stack);
                          }
                        }, () => input.selection.ids),
                      ),
                    ),
                  ),
                  if (phase == PatchMapPhase.preparing &&
                      widget.loadingBuilder != null)
                    widget.loadingBuilder!(context),
                  if (phase == PatchMapPhase.failed &&
                      widget.errorBuilder != null)
                    widget.errorBuilder!(context, _failure),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  PatchMapPhase get phase => session.phase;
  @override
  PatchMapCameraState? get camera =>
      phase == PatchMapPhase.ready ? backend.camera.snapshot : null;
  @override
  Future<PatchMapResult> draw(Object? data) => session.replace(data);
  @override
  PatchMapPresentationResult setPresentation(
    String key,
    PatchMapPresentationLayer layer,
  ) => session.setPresentation(key, layer);
  @override
  PatchMapPresentationResult clearPresentation(String key) =>
      session.clearPresentation(key);
  @override
  Future<PatchMapResult> update(Iterable<PatchMapUpdate> updates) =>
      session.update(updates);
  @override
  Map<String, Object?>? value(PatchMapTarget target) {
    if (target.componentId == null && phase == PatchMapPhase.ready) {
      final node = backend.current?.geometry[target.id];
      if (node?.target.type == 'item') return exportItemData(node!.data);
    }
    // Admission keeps its raw record lookup; only public item reads project
    // current component records, using the same immutable view as events.
    return session.current(target);
  }

  @override
  PatchMapObjectGeometry? geometry(String id) {
    if (phase != PatchMapPhase.ready) return null;
    final published = backend.current;
    return published == null
        ? null
        : readObjectGeometry(published.geometry, id);
  }

  PatchMapResult _cameraCommand(void Function() action) {
    if (!session.commandsAllowed ||
        phase != PatchMapPhase.ready ||
        !session.active) {
      return PatchMapResult(
        PatchMapOutcome.rejected,
        failures: const [
          PatchMapFailure(
            'NOT_READY',
            'A submitted active diagram is required',
          ),
        ],
      );
    }
    try {
      final center = backend.camera.center, scale = backend.camera.scale;
      action();
      if (center != backend.camera.center || scale != backend.camera.scale) {
        input.endDoubleTapZoom();
      }
      frame.invalidate();
      return PatchMapResult(PatchMapOutcome.applied);
    } on ArgumentError catch (error) {
      return PatchMapResult(
        PatchMapOutcome.rejected,
        failures: [PatchMapFailure('INVALID_CAMERA', error.toString())],
      );
    }
  }

  PatchMapResult _locate(
    Iterable<String>? ids,
    EdgeInsets padding, {
    required bool fit,
  }) {
    Rect? bounds;
    final failures = <PatchMapFailure>[];
    if (ids == null) {
      bounds = backend.current?.geometry.bounds;
    } else {
      for (final id in ids.toSet()) {
        final value = backend.current?.geometry.boundsFor(id);
        if (value == null) {
          failures.add(
            PatchMapFailure(
              'MISSING_TARGET',
              'Target has no visible bounds',
              target: PatchMapTarget(id),
            ),
          );
        } else {
          bounds = unionBounds(bounds, value);
        }
      }
    }
    if (bounds == null) {
      return PatchMapResult(
        PatchMapOutcome.rejected,
        failures: [
          ...failures,
          const PatchMapFailure('EMPTY_TARGETS', 'No visible bounds'),
        ],
      );
    }
    final result = _cameraCommand(
      () => fit
          ? backend.camera.fit(bounds!, padding: padding)
          : backend.camera.focus(bounds!, padding: padding),
    );
    return result.outcome == PatchMapOutcome.applied && failures.isNotEmpty
        ? PatchMapResult(PatchMapOutcome.partialFailure, failures: failures)
        : result;
  }

  @override
  PatchMapResult fit(Iterable<String>? targets, EdgeInsets padding) =>
      _locate(targets, padding, fit: true);
  @override
  PatchMapResult focus(Iterable<String> targets, EdgeInsets padding) =>
      _locate(targets, padding, fit: false);
  @override
  PatchMapResult setCamera(Offset? center, double? scale, double? rotation) =>
      _cameraCommand(
        () => backend.camera.set(
          center: center,
          scale: scale,
          rotation: rotation,
        ),
      );
  @override
  PatchMapResult rotateTo(double rotation) =>
      _cameraCommand(() => backend.camera.rotateTo(rotation));
  @override
  List<PatchMapObject> get selected => input.selection.selected;
  @override
  PatchMapResult select(Iterable<String> ids, String mode) {
    if (!session.commandsAllowed ||
        phase != PatchMapPhase.ready ||
        !session.active) {
      return PatchMapResult(
        PatchMapOutcome.rejected,
        failures: const [
          PatchMapFailure(
            'NOT_READY',
            'An active submitted diagram outside a filter is required',
          ),
        ],
      );
    }
    final result = switch (mode) {
      'set' => input.selection.set(ids),
      'add' => input.selection.add(ids),
      'remove' => input.selection.remove(ids),
      'toggle' => input.selection.toggle(ids),
      _ => throw StateError('unknown selection command'),
    };
    return PatchMapResult(
      result.missing.isEmpty
          ? PatchMapOutcome.applied
          : PatchMapOutcome.partialFailure,
      failures: [
        for (final id in result.missing)
          PatchMapFailure(
            'MISSING_TARGET',
            'Selection target is missing or a container',
            target: PatchMapTarget(id),
          ),
      ],
    );
  }

  @override
  Offset toWorld(Offset local) => backend.camera.localToWorld(local);
  @override
  Offset toLocal(Offset world) => backend.camera.worldToLocal(world);
}

class _MapPainter extends CustomPainter {
  _MapPainter(
    this.backend,
    this.frame,
    this.pixelRatio,
    this.fail,
    this.selectedIds,
  ) : super(repaint: frame);
  final MapBackend backend;
  final FrameCoordinator frame;
  final double pixelRatio;
  final void Function(int, Object, StackTrace) fail;
  final Iterable<String> Function() selectedIds;
  @override
  void paint(Canvas canvas, Size size) {
    if (backend.current == null || !frame.active) return;
    final generation = backend.generation, revision = backend.revision;
    try {
      backend.paint(canvas, pixelRatio, selectedIds: selectedIds());
      frame.didPaint(generation, revision);
    } catch (error, stack) {
      // A post-frame callback may accept a replacement before this continuation.
      // The widget checks the accepted generation, not the still-old backend.
      scheduleMicrotask(() => fail(generation, error, stack));
    }
  }

  @override
  bool shouldRepaint(_MapPainter old) =>
      old.pixelRatio != pixelRatio || !identical(old.backend, backend);
}
