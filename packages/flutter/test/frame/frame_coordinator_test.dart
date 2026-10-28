import 'package:conalog_patch_map/src/frame/frame_coordinator.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

class _WitnessPainter extends CustomPainter {
  _WitnessPainter(this.frames, this.revision) : super(repaint: frames);
  final FrameCoordinator frames;
  final int Function() revision;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint());
    frames.didPaint(7, revision());
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

void main() {
  testWidgets('only actual painted revisions submit; idle has no frame loop', (
    tester,
  ) async {
    var ticks = 0, revision = 1;
    final stamps = <PaintSubmission>[];
    final frames = FrameCoordinator(
      onFrame: (_) {
        ticks++;
        return false;
      },
      onSubmitted: stamps.add,
      onError: (error, stack) => fail('$error\n$stack'),
    );
    frames.invalidate();
    frames.invalidate();
    await tester.pump();
    expect(ticks, 1);
    expect(stamps, isEmpty, reason: 'a scheduled frame is not a paint witness');
    await tester.pumpWidget(
      CustomPaint(
        painter: _WitnessPainter(frames, () => revision),
        size: const Size(100, 100),
      ),
    );
    expect(stamps.single.generation, 7);
    expect(stamps.single.revision, 1);
    revision = 2;
    frames.invalidate();
    await tester.pump();
    expect(stamps.last.revision, 2);
    expect(frames.scheduled, false);
    expect(tester.binding.hasScheduledFrame, false);
    frames.dispose();
  });

  testWidgets(
    'notification frames skip paint but callback invalidations paint once',
    (tester) async {
      var revision = 1, ticks = 0;
      var invalidateInCallback = false;
      final stamps = <PaintSubmission>[];
      late FrameCoordinator frames;
      frames = FrameCoordinator(
        onFrame: (_) {
          ticks++;
          if (invalidateInCallback) frames.invalidate();
          return false;
        },
        onSubmitted: stamps.add,
        onError: (error, stack) => fail('$error\n$stack'),
      );
      await tester.pumpWidget(
        CustomPaint(
          painter: _WitnessPainter(frames, () => revision),
          size: const Size(100, 100),
        ),
      );
      expect(stamps.length, 1);
      frames.requestNotification();
      frames.requestNotification();
      await tester.pump();
      expect(ticks, 1);
      expect(stamps.length, 1);
      expect(frames.scheduled, false);
      invalidateInCallback = true;
      revision++;
      frames.requestNotification();
      await tester.pump();
      expect(stamps.map((s) => s.revision), [1, 2]);
      expect(frames.scheduled, false);
      expect(tester.binding.hasScheduledFrame, false);
      frames.invalidate();
      frames.requestNotification();
      await tester.pump();
      expect(ticks, 3);
      expect(stamps.length, 3);
      expect(frames.scheduled, false);
      frames.dispose();
    },
  );

  testWidgets(
    'animation paints final tick and preserves reentrant notifications',
    (tester) async {
      var ticks = 0, paints = 0;
      late FrameCoordinator frames;
      frames = FrameCoordinator(
        onFrame: (_) {
          ticks++;
          if (ticks == 2) frames.requestNotification();
          return ticks == 1;
        },
        onSubmitted: (_) => paints++,
        onError: (error, stack) => fail('$error\n$stack'),
      );
      await tester.pumpWidget(
        CustomPaint(
          painter: _WitnessPainter(frames, () => ticks),
          size: const Size(100, 100),
        ),
      );
      frames.invalidate();
      await tester.pump();
      expect(paints, 2);
      await tester.pump();
      expect(paints, 3, reason: 'final animation tick still paints');
      await tester.pump();
      expect(ticks, 3, reason: 'new notification was not swallowed');
      expect(paints, 3);
      expect(frames.scheduled, false);
      frames.dispose();
    },
  );

  testWidgets(
    'notification callback suspension and failure do not lose recovery',
    (tester) async {
      var paints = 0, ticks = 0, errors = 0;
      late FrameCoordinator frames;
      frames = FrameCoordinator(
        onFrame: (_) {
          ticks++;
          if (ticks == 1) frames.setActive(false);
          if (ticks == 2) throw StateError('callback');
          return false;
        },
        onSubmitted: (_) {},
        onError: (_, _) {
          errors++;
          frames.invalidate();
        },
      )..addListener(() => paints++);
      frames.requestNotification();
      await tester.pump();
      expect(paints, 0);
      frames.setActive(true);
      await tester.pump();
      expect(errors, 1);
      await tester.pump();
      expect(paints, 1);
      expect(frames.scheduled, false);
      frames.requestNotification();
      frames.dispose();
      await tester.pump();
      expect(ticks, 3);
    },
  );

  testWidgets('inactive invalidations coalesce and disposal cancels work', (
    tester,
  ) async {
    var ticks = 0, submissions = 0;
    final frames = FrameCoordinator(
      onFrame: (_) {
        ticks++;
        return true;
      },
      onSubmitted: (_) => submissions++,
      onError: (error, stack) => fail('$error\n$stack'),
    );
    frames.invalidate();
    frames.setActive(false);
    for (var i = 0; i < 100; i++) {
      frames.invalidate();
    }
    await tester.pump();
    expect(ticks, 0);
    frames.didPaint(1, 1);
    await tester.pump();
    expect(submissions, 0);
    frames.setActive(true);
    await tester.pump();
    expect(ticks, 1);
    expect(frames.scheduled, true);
    frames.dispose();
    await tester.pump();
    expect(ticks, 1);
    expect(frames.scheduled, false);
  });
}
