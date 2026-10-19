import 'dart:ui';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:flutter_test/flutter_test.dart';
import 'draw_plan_test.dart' as support;

class Throws extends DrawContent {
  @override
  void dispose() {}
  @override
  void paint(Canvas c, Rect r, double s) =>
      throw StateError('native paint failure');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('standalone paint failure restores the caller Canvas stack', () {
    final h = support.Harness(active: false);
    final p = h.read([
      {'type': 'rect', 'id': 'r', 'size': 20},
    ]);
    final node = DrawNode(p.geometry.nodes[0], const [], Throws())..retain();
    final rec = PictureRecorder();
    // Keep the recorder used by the Canvas explicit for disposal.
    final c = Canvas(rec);
    final before = c.getSaveCount();
    expect(
      () => node.paint(c, cameraRotation: 0, physicalScale: 1),
      throwsStateError,
    );
    final after = c.getSaveCount();
    c.restoreToCount(before);
    rec.endRecording().dispose();
    node.release();
    h.close();
    expect(after, before);
  });
}
