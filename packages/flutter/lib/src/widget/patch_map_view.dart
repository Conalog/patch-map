import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';

import '../api/result.dart';
import '../api/camera.dart';
import '../api/gesture_options.dart';
import '../api/presentation.dart';
import '../api/events.dart';
import '../interaction/input_coordinator.dart';
import '../interaction/input_query.dart';
import '../api/target.dart';
import '../api/update.dart';
import '../dataset/colors.dart';
import '../frame/frame_coordinator.dart';
import '../geometry/scene_geometry.dart' show unionBounds;
import '../resources/asset_registry.dart';
import '../presentation/field_operations.dart' show presentationEqual;
import '../session/map_session.dart';
import '../viewport/camera.dart';
import 'map_backend.dart';
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
    this.eventFilter,
    this.dragMode = PatchMapDragMode.pan,
    this.gestures = const PatchMapGestureOptions(),
    this.zoomLimits = const PatchMapZoomLimits(),
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
  final bool Function(PatchMapObject object)? eventFilter;
  final PatchMapDragMode dragMode;
  final PatchMapGestureOptions gestures;
  final PatchMapZoomLimits zoomLimits;
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
  Offset _recognitionLocal = Offset.zero, _recognitionGlobal = Offset.zero;
  double _gestureScale = 1, _gestureRotation = 0;
  Offset _gestureFocal = Offset.zero;
  PatchMapGestureOptions _gestureOptions = const PatchMapGestureOptions();
  @override
  void initState() {
    super.initState();
    MapCamera.validateZoomLimits(widget.zoomLimits);
    _foreground =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    backend = MapBackend(
      zoomLimits: widget.zoomLimits,
      palette: ColorResolver(colors: widget.colors),
      registry: AssetRegistry(symbols: widget.symbols),
      invalidate: () => frame.invalidate(),
      onReplacement: _resetInput,
      onResourceRefresh: () => session.refreshResources(),
      onUnexpectedAssetFailure: (error, stack) => session.fail(error, stack),
      onAssetFailure: (failures) =>
          session.notify(() => widget.onImageFailure?.call(failures)),
    );
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
      filter: (object) =>
          session.filter(() => widget.eventFilter?.call(object) ?? true),
    )..dragMode = widget.dragMode;
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
    if (event.kind == PatchMapInputKind.selectionChange) frame.invalidate();
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
    _admittedPointers.clear();
    _gestureGeneration = null;
    _deferInput = true;
    try {
      input.reset();
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
  @override
  void didUpdateWidget(PatchMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    var zoomChanged = false;
    try {
      zoomChanged = backend.camera.setZoomLimits(widget.zoomLimits);
    } on ArgumentError catch (error, stack) {
      // Keep the prior valid camera/limits without aborting Flutter's element
      // update and leaving its inherited-widget dependencies half updated.
      try {
        _report(error, stack);
      } catch (_) {
        // A host error reporter is terminal; do not report it recursively.
      }
    }
    backend.camera.observe(widget.onCameraChanged != null);
    if (!identical(oldWidget.controller, widget.controller)) {
      widget.controller.attach(this);
      _attachedController?.detach(this);
      _attachedController = widget.controller;
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
    input.dragMode = widget.dragMode;
    _activity();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _activity();
  }

  void _activity() {
    final active = widget.active && _foreground;
    if (!active) {
      _admittedPointers.clear();
      _gestureGeneration = null;
    }
    input.setActive(active);
    session.setActive(active);
    frame.setActive(active);
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
        backend.resize(size);
        final pixelRatio = MediaQuery.devicePixelRatioOf(context);
        return MouseRegion(
          onExit: (e) => input.leave(e.pointer, e.localPosition, e.position),
          child: Listener(
            behavior: HitTestBehavior.opaque,
            onPointerDown: (e) {
              if (phase != PatchMapPhase.ready || !session.active) return;
              _admittedPointers.add(e.pointer);
              input.pointerDown(
                e.pointer,
                e.localPosition,
                e.position,
                buttons: e.buttons,
              );
              _recognitionEpoch = input.inputEpoch;
              _recognitionLocal = e.localPosition;
              _recognitionGlobal = e.position;
            },
            onPointerMove: (e) =>
                input.pointerMove(e.pointer, e.localPosition, e.position),
            onPointerUp: (e) {
              _admittedPointers.remove(e.pointer);
              input.pointerUp(e.pointer, e.localPosition, e.position);
            },
            onPointerCancel: (e) {
              _admittedPointers.remove(e.pointer);
              input.pointerCancel(e.pointer);
            },
            onPointerHover: (e) {
              if (phase == PatchMapPhase.ready && session.active) {
                input.hover(e.pointer, e.localPosition, e.position);
              }
            },
            onPointerSignal: (event) {
              if (event is PointerScrollEvent &&
                  widget.gestures.zoomEnabled &&
                  phase == PatchMapPhase.ready &&
                  session.active) {
                GestureBinding.instance.pointerSignalResolver.register(event, (
                  resolved,
                ) {
                  final scroll = resolved as PointerScrollEvent;
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
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => input.recognizedTap(
                _recognitionLocal,
                _recognitionGlobal,
                epoch: _recognitionEpoch,
              ),
              onDoubleTap: () => input.recognizedDoubleTap(
                _recognitionLocal,
                _recognitionGlobal,
                epoch: _recognitionEpoch,
              ),
              onSecondaryTap: () => input.recognizedSecondaryTap(
                _recognitionLocal,
                _recognitionGlobal,
                epoch: _recognitionEpoch,
              ),
              onLongPress: () => input.recognizedLongPress(
                _recognitionLocal,
                _recognitionGlobal,
                epoch: _recognitionEpoch,
              ),
              onScaleStart: (details) {
                _gestureOptions = widget.gestures;
                _gestureGeneration = session.generation;
                _gestureScale = backend.camera.scale;
                _gestureRotation = backend.camera.rotation;
                _gestureFocal = details.localFocalPoint;
              },
              onScaleUpdate: (details) {
                if (_admittedPointers.length < 2 ||
                    _gestureGeneration != session.generation ||
                    details.pointerCount < 2 ||
                    phase != PatchMapPhase.ready ||
                    !session.active) {
                  return;
                }
                if (_gestureOptions.zoomEnabled ||
                    _gestureOptions.rotationEnabled) {
                  input.cameraGesture(
                    pointerCount: details.pointerCount,
                    localAnchor: _gestureFocal,
                    scale: _gestureOptions.zoomEnabled
                        ? _gestureScale * details.scale
                        : backend.camera.scale,
                    rotation: _gestureOptions.rotationEnabled
                        ? _gestureRotation + details.rotation
                        : backend.camera.rotation,
                  );
                }
                if (!session.active || phase != PatchMapPhase.ready) return;
                final moved = backend.camera.pan(
                  details.localFocalPoint - _gestureFocal,
                );
                _gestureFocal = details.localFocalPoint;
                if (moved) frame.invalidate();
              },
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
  Map<String, Object?>? value(PatchMapTarget target) => session.current(target);
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
      action();
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
