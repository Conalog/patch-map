import 'dart:ui' as ui;
import 'package:flame/game.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:patch_map/src/engine/ports.dart';
import 'dense_scene.dart';
import 'flame_renderer.dart';

/// Same dense algorithm and clock for both hosts, without a second game ticker.
class DensePlayback {
  DensePlayback(
    this.scene, {
    required this.flame,
    bool atlasBars = true,
    double minAtlasScale = 0.4,
    bool? flameBatch,
  }) : renderer = FlamePanelRenderer(
         flameBatch: flameBatch ?? flame,
         atlasBars: atlasBars,
         minAtlasScale: minAtlasScale,
       ) {
    renderer.dense = scene;
    renderer.prepare(scene.initial);
    viewport = scene.initial.viewport;
  }
  final DensePanelScene scene;
  final bool flame;
  final FlamePanelRenderer renderer;
  final clock = Stopwatch()..start();
  late PatchMapRenderViewport viewport;
  VoidCallback? requestFrame;
  double sampleTime = 0;
  int painted = 0;
  ui.Rect? lastVisibleWorldRect;
  bool disposed = false;
  double get milliseconds => clock.elapsedMicroseconds / 1000;
  bool get active => sampleTime < scene.animationEnd;
  void tick() {
    sampleTime = milliseconds;
    renderer.sampleTime = sampleTime;
  }

  PatchMapRenderSnapshot get snapshot {
    final s = scene.initial;
    return PatchMapRenderSnapshot(
      dataset: s.dataset,
      overlays: s.overlays,
      selectedIds: s.selectedIds,
      viewport: viewport,
      revisions: s.revisions,
      presentationAlpha: s.presentationAlpha,
      geometry: s.geometry,
      projectionRevision: s.projectionRevision,
      theme: s.theme,
      selectionPolicy: s.selectionPolicy,
    );
  }

  void heights(List<double> values, {bool animate = true}) {
    scene.heights(values, milliseconds, animate: animate);
    requestFrame?.call();
  }

  void texts(List<String> values) {
    scene.textValues(values);
    requestFrame?.call();
  }

  void mode(bool text) {
    scene.mode(text, milliseconds);
    requestFrame?.call();
  }

  void camera(double x, double y, double scale) {
    final v = viewport;
    viewport = PatchMapRenderViewport(
      centerX: x,
      centerY: y,
      scale: scale,
      width: v.width,
      height: v.height,
      pixelRatio: v.pixelRatio,
      rotation: 0,
    );
    requestFrame?.call();
  }

  void paint(ui.Canvas canvas, ui.Size size, {ui.Rect? visibleWorldRect}) {
    lastVisibleWorldRect =
        visibleWorldRect ??
        ui.Rect.fromCenter(
          center: ui.Offset(viewport.centerX, viewport.centerY),
          width: viewport.width / viewport.scale,
          height: viewport.height / viewport.scale,
        );
    renderer.paint(canvas, size, snapshot, visibleWorldRect: visibleWorldRect);
    painted++;
  }

  void dispose() {
    if (disposed) return;
    disposed = true;
    requestFrame = null;
    clock.stop();
    renderer.dispose();
  }
}

class DenseView extends StatefulWidget {
  const DenseView(this.playback, {super.key});
  final DensePlayback playback;
  @override
  State<DenseView> createState() => _DenseViewState();
}

class _DenseViewState extends State<DenseView> {
  final repaint = ValueNotifier(0);
  int? frame;
  late final DenseGame? game;
  @override
  void initState() {
    super.initState();
    game = widget.playback.flame ? DenseGame(widget.playback) : null;
    widget.playback.requestFrame = game == null ? request : game!.resumeEngine;
    if (game == null) request();
  }

  void request() {
    if (frame != null || !mounted) return;
    frame = SchedulerBinding.instance.scheduleFrameCallback((_) {
      frame = null;
      if (!mounted) return;
      widget.playback.tick();
      repaint.value++;
      if (widget.playback.active) request();
    });
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: game == null
        ? CustomPaint(
            painter: _DensePainter(widget.playback, repaint),
            size: Size.infinite,
          )
        : GameWidget(game: game!),
  );
  @override
  void dispose() {
    widget.playback.requestFrame = null;
    if (frame != null)
      SchedulerBinding.instance.cancelFrameCallbackWithId(frame!);
    game?.pauseEngine();
    repaint.dispose();
    super.dispose();
  }
}

class _DensePainter extends CustomPainter {
  _DensePainter(this.p, Listenable repaint) : super(repaint: repaint);
  final DensePlayback p;
  @override
  void paint(Canvas c, Size s) => p.paint(c, s);
  @override
  bool shouldRepaint(_DensePainter old) => old.p != p;
}

class DenseGame extends FlameGame {
  DenseGame(this.p);
  final DensePlayback p;
  PatchMapRenderViewport? _appliedViewport;
  @override
  void update(double dt) {
    super.update(dt);
    p.tick();
    final v = p.viewport;
    if (!identical(v, _appliedViewport)) {
      // Viewfinder.position returns a derived vector; mutating that getter does
      // not move the camera. Its setter also invalidates visibleWorldRect.
      camera.viewfinder.position = Vector2(v.centerX, v.centerY);
      camera.viewfinder.zoom = v.scale;
      _appliedViewport = v;
    }
  }

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    p.paint(
      canvas,
      Size(size.x, size.y),
      visibleWorldRect: camera.visibleWorldRect,
    );
    if (!p.active) pauseEngine();
  }

  @override
  Color backgroundColor() => const Color(0xfffafafa);
}
