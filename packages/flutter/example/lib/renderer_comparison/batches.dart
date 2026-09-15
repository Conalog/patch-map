import 'dart:typed_data';
import 'dart:ui';
import 'package:flame/sprite.dart';
import 'package:flame/components.dart';

abstract interface class PanelBatch {
  factory PanelBatch(Image image, bool flame, int capacity) =>
      flame ? FlameBatch(image) : RawBatch(image, capacity);
  int addTransform({required Rect source, required RSTransform transform});
  void replace(int handle, {Rect? source, RSTransform? transform});
  void replaceSlice(
    int handle,
    double left,
    double top,
    double width,
    double height,
    double scale,
    double x,
    double y,
  );
  void render(Canvas canvas, {required Paint paint});
}

class FlameBatch implements PanelBatch {
  FlameBatch(Image image) : batch = SpriteBatch(image, useAtlas: true);
  final SpriteBatch batch;
  @override
  int addTransform({required Rect source, required RSTransform transform}) =>
      batch.addTransform(source: source, transform: transform);
  @override
  void replace(int handle, {Rect? source, RSTransform? transform}) =>
      batch.replace(handle, source: source, transform: transform);
  @override
  void replaceSlice(
    int handle,
    double left,
    double top,
    double width,
    double height,
    double scale,
    double x,
    double y,
  ) {
    batch.replace(
      handle,
      source: Rect.fromLTWH(left, top, width, height),
      transform: RSTransform(scale, 0, x, y),
    );
  }

  @override
  void render(Canvas canvas, {required Paint paint}) =>
      batch.render(canvas, paint: paint);
}

class RawBatch implements PanelBatch {
  RawBatch(this.image, int capacity)
    : sources = Float32List(capacity * 4),
      transforms = Float32List(capacity * 4);
  final Image image;
  final Float32List sources, transforms;
  int count = 0;
  Float32List? _sourceView, _transformView;
  @override
  int addTransform({required Rect source, required RSTransform transform}) {
    final i = count++;
    _sourceView = _transformView = null;
    replace(i, source: source, transform: transform);
    return i;
  }

  @override
  void replace(int handle, {Rect? source, RSTransform? transform}) {
    final i = handle * 4;
    if (source != null) {
      sources[i] = source.left;
      sources[i + 1] = source.top;
      sources[i + 2] = source.right;
      sources[i + 3] = source.bottom;
    }
    if (transform != null) {
      transforms[i] = transform.scos;
      transforms[i + 1] = transform.ssin;
      transforms[i + 2] = transform.tx;
      transforms[i + 3] = transform.ty;
    }
  }

  @override
  void replaceSlice(
    int handle,
    double left,
    double top,
    double width,
    double height,
    double scale,
    double x,
    double y,
  ) {
    final i = handle * 4;
    sources[i] = left;
    sources[i + 1] = top;
    sources[i + 2] = left + width;
    sources[i + 3] = top + height;
    transforms[i] = scale;
    transforms[i + 1] = 0;
    transforms[i + 2] = x;
    transforms[i + 3] = y;
  }

  @override
  void render(Canvas canvas, {required Paint paint}) {
    canvas.drawRawAtlas(
      image,
      _transformView ??= Float32List.sublistView(transforms, 0, count * 4),
      _sourceView ??= Float32List.sublistView(sources, 0, count * 4),
      null,
      null,
      null,
      paint,
    );
  }
}

class PanelBackground {
  PanelBackground(
    List<Rect> panels,
    Color fill,
    Color border,
    double radius,
    double borderWidth, {
    required bool flame,
  }) {
    void draw(Canvas c) {
      final f = Paint()..color = fill;
      final b = Paint()
        ..color = border
        ..style = PaintingStyle.stroke
        ..strokeWidth = borderWidth;
      for (final r in panels) {
        final shape = RRect.fromRectAndRadius(r, Radius.circular(radius));
        c.drawRRect(shape, f);
        c.drawRRect(shape, b);
      }
    }

    if (flame) {
      component = _SnapshotBackground(draw)..takeSnapshot();
    } else {
      final r = PictureRecorder();
      draw(Canvas(r));
      picture = r.endRecording();
    }
  }
  _SnapshotBackground? component;
  Picture? picture;
  void render(Canvas c) {
    if (component != null) {
      component!.renderTree(c);
    } else {
      c.drawPicture(picture!);
    }
  }

  void dispose() {
    if (component?.hasSnapshot ?? false) {
      component!.snapshot.dispose();
      component!.clearSnapshot();
    }
    picture?.dispose();
  }
}

class _SnapshotBackground extends PositionComponent with Snapshot {
  _SnapshotBackground(this.draw);
  final void Function(Canvas) draw;
  @override
  void render(Canvas c) => draw(c);
}
