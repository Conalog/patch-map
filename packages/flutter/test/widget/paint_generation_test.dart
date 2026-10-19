import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:conalog_patch_map/src/rendering/render_publication.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'patch_map_view_test.dart' as support;

class ThrowingContent extends DrawContent {
  @override
  void dispose() {}
  @override
  void paint(Canvas canvas, Rect rect, double scale) {
    throw StateError('old generation paint failure');
  }
}

void main() {
  testWidgets(
    'old paint failure must not fail a replacement accepted in post-frame callback',
    (tester) async {
      final c = PatchMapController();
      await tester.pumpWidget(support.host(c));
      final first = c.draw([
        {
          'type': 'item',
          'id': 'old',
          'size': 100,
          'components': [
            {
              'type': 'background',
              'id': 'bg',
              'source': {'fill': 'red'},
            },
          ],
        },
      ]);
      await support.progress(tester);
      await first;
      final dynamic state = tester.state(find.byType(PatchMapView));
      final RenderPublication original = state.backend.current;
      final broken = RenderPublication(original.geometry, [
        RenderPage([
          DrawNode(original.geometry.nodes[0], [
            DrawComponent(
              original.node(0).components.first.layout,
              ThrowingContent(),
            ),
          ], null),
        ]),
      ], original.resources);
      state.backend.publish(
        broken,
        state.session.generation,
        state.backend.revision,
      );
      Object? nextError;
      PatchMapResult? nextResult;
      tester.binding.addPostFrameCallback((_) {
        c
            .draw(support.rectangle('new'))
            .then(
              (value) {
                nextResult = value;
              },
              onError: (Object error) {
                nextError = error;
              },
            );
      });
      state.frame.invalidate();
      await tester.pump(const Duration(milliseconds: 16));
      await support.progress(tester);
      final phase = c.phase;
      final accepted = c.getValue(const PatchMapTarget('new'))?['id'];
      final reported = tester.takeException();
      await tester.pumpWidget(const SizedBox());
      broken.dispose();
      expect(reported, isNull);
      expect(nextResult?.outcome, PatchMapOutcome.applied);
      expect(accepted, 'new');
      expect(
        nextError,
        isNull,
        reason:
            'a deferred failure belongs to the generation whose painter threw',
      );
      expect(phase, PatchMapPhase.ready);
    },
  );
}
