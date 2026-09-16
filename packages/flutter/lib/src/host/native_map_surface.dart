part of 'patch_map_view.dart';

class _MapPainter extends CustomPainter {
  _MapPainter(
    Listenable repaint,
    this.snapshot,
    this.renderer,
    this.background,
    this.painted,
    this.failed,
    this.activate,
    this.marquee,
  ) : super(repaint: repaint);
  final PatchMapRenderSnapshot Function() snapshot;
  final PatchMapCanvasRenderer renderer;
  final Color background;
  final void Function(PatchMapRenderSnapshot) painted;
  final void Function(Object) failed;
  final void Function(String) activate;
  final Rect? Function() marquee;
  @override
  void paint(Canvas canvas, Size size) {
    try {
      final value = snapshot();
      renderer.paint(canvas, size, value, background);
      final box = marquee();
      if (box != null) {
        final options = value.selectionPolicy['box'];
        final visual = options is Map ? options['visual'] as Map? : null;
        final selectionVisual = value.selectionPolicy['visual'] as Map?;
        final color = mapColor(
          visual?['color'] ?? selectionVisual?['color'] ?? '#2563eb',
        );
        canvas.drawRect(
          box,
          Paint()
            ..color = color.withValues(
              alpha: (visual?['fillAlpha'] as num? ?? 0.08).toDouble(),
            ),
        );
        canvas.drawRect(
          box,
          Paint()
            ..color = color
            ..style = PaintingStyle.stroke
            ..strokeWidth =
                (visual?['strokeWidth'] as num? ??
                        selectionVisual?['strokeWidth'] as num? ??
                        2)
                    .toDouble(),
        );
      }
      painted(value);
    } catch (error) {
      failed(error);
    }
  }

  @override
  bool shouldRepaint(_MapPainter oldDelegate) =>
      oldDelegate.renderer != renderer || oldDelegate.background != background;
  @override
  bool shouldRebuildSemantics(_MapPainter oldDelegate) => true;
  @override
  SemanticsBuilderCallback get semanticsBuilder => (size) {
    final value = snapshot();
    final bounds = renderer.accessibilityBounds(value.viewport);
    final output = <CustomPainterSemantics>[];
    for (final target
        in renderer.geometry?.targets.values ?? const <GeometryTarget>[]) {
      if (!target.visible ||
          target.type == 'group' ||
          target.type == 'grid' ||
          target.type == 'relations')
        continue;
      if (target.componentId != null) continue;
      final rect = bounds[target.id];
      if (rect == null) continue;
      final authored = value.dataset.nodes[target.id]?.value;
      final label = authored?['label'];
      final text = authored?['text'];
      final name = label is String && label.isNotEmpty
          ? label
          : text is String && text.isNotEmpty
          ? text
          : target.id;
      if (!rect.overlaps(Offset.zero & size)) continue;
      output.add(
        CustomPainterSemantics(
          rect: rect,
          properties: SemanticsProperties(
            label: name,
            enabled: !target.locked,
            button: true,
            selected: value.selectedIds.contains(target.id),
            textDirection: TextDirection.ltr,
            onTap: target.locked ? null : () => activate(target.id),
          ),
        ),
      );
    }
    return output;
  };
}

class _HostSurface
    implements PatchMapSurfacePort, PatchMapSurfaceProbePort, PatchMapClock {
  _HostSurface(this.state);
  final _PatchMapViewState state;
  @override
  double get milliseconds => state._animationTimeMs;
  @override
  Map<String, dynamic> get debugResources {
    final v = state._snapshot.viewport;
    return {
      'canvasCount': state._closed ? 0 : 1,
      'canvas': {
        'cssSize': [v.width, v.height],
        'backingSize': [
          (v.width * v.pixelRatio).ceil(),
          (v.height * v.pixelRatio).ceil(),
        ],
      },
      'renderer': {
        'resolution': v.pixelRatio,
        'antialias': state.widget.antialias,
        'background': state.widget.background.toARGB32(),
        'backend': 'flutter-canvas',
      },
      'rendering': {
        'commandCount': state._renderer.commandCount,
        'visiblePrimitiveCount': state._renderer.visiblePrimitiveCount,
      },
    };
  }

  @override
  bool prepare(PatchMapRenderSnapshot snapshot) => state.prepare(snapshot);
  @override
  void requestFrame() => state.requestFrame();
  @override
  Future<PatchMapCaptureResult> capture(PatchMapRenderSnapshot snapshot) =>
      state.capture(snapshot);
  @override
  Future<void> dispose() async => state._close();
}

/// Paint invalidation and Semantics invalidation share the same frame owner.
class _SemanticCustomPaint extends CustomPaint {
  const _SemanticCustomPaint({
    required this.semanticsUpdates,
    super.painter,
    super.size,
  });
  final Listenable semanticsUpdates;
  @override
  RenderCustomPaint createRenderObject(BuildContext context) =>
      _SemanticRenderPaint(
        painter: painter,
        size: size,
        updates: semanticsUpdates,
      );
  @override
  void updateRenderObject(
    BuildContext context,
    covariant _SemanticRenderPaint renderObject,
  ) {
    super.updateRenderObject(context, renderObject);
    renderObject.updates = semanticsUpdates;
  }
}

class _SemanticRenderPaint extends RenderCustomPaint {
  _SemanticRenderPaint({
    super.painter,
    required Size size,
    required Listenable updates,
  }) : _updates = updates,
       super(preferredSize: size);
  Listenable _updates;
  set updates(Listenable value) {
    if (identical(value, _updates)) return;
    if (attached) _updates.removeListener(markNeedsSemanticsUpdate);
    _updates = value;
    if (attached) _updates.addListener(markNeedsSemanticsUpdate);
    markNeedsSemanticsUpdate();
  }

  @override
  void attach(PipelineOwner owner) {
    super.attach(owner);
    _updates.addListener(markNeedsSemanticsUpdate);
  }

  @override
  void detach() {
    _updates.removeListener(markNeedsSemanticsUpdate);
    super.detach();
  }
}

// RenderObject.debugNeedsPaint exists only with assertions enabled. Capture
// needs the same paint boundary in profile/release, so retain its readiness
// at the actual invalidation and paint hooks rather than guessing from a timer.
class _CaptureBoundary extends RepaintBoundary {
  const _CaptureBoundary({super.key, required super.child});
  @override
  RenderRepaintBoundary createRenderObject(BuildContext context) =>
      _CaptureRenderBoundary();
}

class _CaptureRenderBoundary extends RenderRepaintBoundary {
  bool paintReady = false;
  @override
  void markNeedsPaint() {
    paintReady = false;
    super.markNeedsPaint();
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    super.paint(context, offset);
    paintReady = true;
  }
}
