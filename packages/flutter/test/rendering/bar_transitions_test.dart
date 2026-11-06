import 'dart:ui';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/presentation/record_delta.dart';
import 'package:conalog_patch_map/src/rendering/bar_transitions.dart';
import 'package:conalog_patch_map/src/frame/frame_coordinator.dart';
import 'package:flutter_test/flutter_test.dart';

GeometrySnapshot diagram(
  double height, {
  bool animate = true,
  num duration = 200,
  String placement = 'bottom',
}) => GeometrySnapshot.compile(
  const DatasetReader().read([
    {
      'type': 'item',
      'id': 'a',
      'size': 100,
      'components': [
        {
          'type': 'bar',
          'id': 'b',
          'source': {'type': 'rect', 'fill': '#00ff00'},
          'size': {'width': 40, 'height': height},
          'placement': placement,
          'animation': animate,
          'animationDuration': duration,
        },
      ],
    },
  ]),
  (_, _) => Size.zero,
);
void main() {
  test('bar position tween and retarget use the active camera placement', () {
    final transitions = BarTransitions();
    final bottom = diagram(20);
    final top = diagram(20, placement: 'top');
    transitions.replace(bottom, top, [0], animate: true);
    expect(transitions.rectangle(0, 'b')!.center.dy, 90);
    expect(transitions.rectangle(0, 'b', 3)!.center.dy, 10);
    transitions.advance(Duration.zero);
    transitions.advance(const Duration(milliseconds: 100));
    expect(transitions.rectangle(0, 'b')!.center.dy, 50);
    expect(transitions.rectangle(0, 'b', 3)!.center.dy, 50);

    final manual = diagram(20, placement: 'none');
    transitions.replace(top, manual, [0], animate: true);
    expect(transitions.rectangle(0, 'b', 3)!.center.dy, 50);
    transitions.advance(const Duration(milliseconds: 100));
    transitions.advance(const Duration(milliseconds: 200));
    expect(transitions.rectangle(0, 'b', 3)!.center.dy, 30);
    transitions.replace(manual, top, [0], animate: true);
    expect(transitions.rectangle(0, 'b', 3)!.center.dy, 30);
    transitions.advance(const Duration(milliseconds: 200));
    transitions.advance(const Duration(milliseconds: 300));
    expect(transitions.rectangle(0, 'b', 3)!.center.dy, 60);
    transitions.advance(const Duration(milliseconds: 400));
    expect(transitions.rectangle(0, 'b', 3), isNull);
  });

  test('unchanged bar placement does not animate symmetric padding', () {
    final transitions = BarTransitions();
    const box = Rect.fromLTWH(40, 40, 20, 20);
    transitions.replaceRetained(
      0,
      'bar',
      box,
      box,
      {'animation': true, 'animationDuration': 200},
      beforeContent: const Rect.fromLTWH(0, 0, 100, 100),
      afterContent: const Rect.fromLTWH(10, 10, 80, 80),
      animate: true,
    );
    expect(transitions.advance(Duration.zero), isFalse);
  });

  test('component reordering still starts each bar at its own prior box', () {
    GeometrySnapshot bars(List<(String, int)> values) =>
        GeometrySnapshot.compile(
          const DatasetReader().read([
            {
              'id': 'a',
              'type': 'item',
              'size': 100,
              'components': [
                for (final value in values)
                  {
                    'id': value.$1,
                    'type': 'bar',
                    'source': {'type': 'rect', 'fill': '#0080ff'},
                    'size': {'width': 20, 'height': value.$2},
                    'animation': true,
                    'animationDuration': 200,
                  },
              ],
            },
          ]),
          (_, _) => Size.zero,
        );
    final transitions = BarTransitions();
    transitions.replace(
      bars([('first', 20), ('second', 40)]),
      bars([('second', 80), ('first', 60)]),
      [0],
      animate: true,
    );
    expect(transitions.rectangle(0, 'first')!.height, 20);
    expect(transitions.rectangle(0, 'second')!.height, 40);
    transitions.advance(Duration.zero);
    transitions.advance(const Duration(milliseconds: 100));
    expect(transitions.rectangle(0, 'first')!.height, 40);
    expect(transitions.rectangle(0, 'second')!.height, 60);
  });
  test('geometry reorder drops indexed hints before transition sampling', () {
    final before = GeometrySnapshot.compile(
      const DatasetReader().read([
        {
          'id': 'a',
          'type': 'item',
          'size': 100,
          'components': [
            for (final (id, height) in [('first', 20), ('second', 40)])
              {
                'id': id,
                'type': 'bar',
                'source': {},
                'size': {'width': 20, 'height': height},
                'animation': true,
              },
          ],
        },
      ]),
      (_, _) => Size.zero,
    );
    final changes = <PatchMapTarget, RecordDelta>{};
    for (var i = 0; i < 2; i++) {
      final old = before['a']!.item!.components[i].data;
      changes[PatchMapTarget(
        'a',
        componentId: old['id']! as String,
      )] = RecordDelta(
        before: old,
        after: {
          ...old,
          'size': {'width': 20, 'height': i == 0 ? 60 : 80},
          'attrs': <String, Object?>{
            ...(old['attrs'] as Map? ?? const {}),
            'zIndex': i == 0 ? 2 : 0,
          },
        },
        fields: RecordFields.size | RecordFields.attrsZIndex,
      );
    }
    final change = before.prepareChanges(changes, (_, _) => Size.zero);
    expect(change.componentChanges, isEmpty);
    final transitions = BarTransitions();
    transitions.replace(
      before,
      change.snapshot,
      change.changed.keys,
      animate: true,
      componentChanges: change.componentChanges,
    );
    expect(transitions.rectangle(0, 'first')!.height, 20);
    expect(transitions.rectangle(0, 'second')!.height, 40);
    transitions.advance(Duration.zero);
    transitions.advance(const Duration(milliseconds: 100));
    expect(transitions.rectangle(0, 'first')!.height, 40);
    expect(transitions.rectangle(0, 'second')!.height, 60);
  });

  testWidgets('queued vsync age does not consume a new bar transition', (
    tester,
  ) async {
    final transitions = BarTransitions();
    var now = const Duration(milliseconds: 300);
    final frames = FrameCoordinator(
      animationClock: () => now,
      onFrame: transitions.advance,
      onSubmitted: (_) {},
      onError: (error, stack) => fail('$error\n$stack'),
    );
    transitions.replace(diagram(20), diagram(80), [0], animate: true);
    frames.invalidate();
    // This vsync was queued before 300ms of synchronous input preparation.
    await tester.pump();
    expect(transitions.rectangle(0, 'b')!.height, 20);
    now += const Duration(milliseconds: 16);
    await tester.pump(const Duration(milliseconds: 316));
    expect(transitions.rectangle(0, 'b')!.height, inExclusiveRange(20, 21));
    now = const Duration(milliseconds: 400);
    await tester.pump(const Duration(milliseconds: 84));
    expect(transitions.rectangle(0, 'b')!.height, 50);
    now = const Duration(milliseconds: 500);
    await tester.pump(const Duration(milliseconds: 100));
    expect(transitions.rectangle(0, 'b'), isNull);
    expect(frames.scheduled, false);
    frames.dispose();
  });
  test(
    'bar starts at next frame after idle and follows approved cubic polynomial',
    () {
      final transitions = BarTransitions(),
          before = diagram(20),
          after = diagram(80);
      transitions.advance(const Duration(seconds: 1));
      transitions.replace(before, after, [0], animate: true);
      expect(transitions.rectangle(0, 'b')!.height, 20);
      transitions.advance(const Duration(seconds: 50));
      expect(transitions.rectangle(0, 'b')!.height, 20);
      transitions.advance(const Duration(milliseconds: 50050));
      expect(transitions.rectangle(0, 'b')!.height, closeTo(23.75, 1e-8));
      transitions.advance(const Duration(milliseconds: 50100));
      expect(transitions.rectangle(0, 'b')!.height, 50);
      transitions.replace(after, after, [0], animate: true);
      transitions.advance(const Duration(milliseconds: 50150));
      expect(transitions.rectangle(0, 'b')!.height, closeTo(76.25, 1e-8));
      expect(transitions.advance(const Duration(milliseconds: 50200)), false);
      expect(transitions.rectangle(0, 'b'), isNull);
    },
  );
  test(
    'retarget samples displayed rectangle and nonanimated updates stop transition',
    () {
      final transitions = BarTransitions(),
          a = diagram(20),
          b = diagram(80),
          c = diagram(40);
      transitions.replace(a, b, [0], animate: true);
      transitions.advance(Duration.zero);
      transitions.advance(const Duration(milliseconds: 100));
      transitions.replace(b, c, [0], animate: true);
      expect(transitions.rectangle(0, 'b')!.height, 50);
      transitions.advance(const Duration(milliseconds: 120));
      expect(transitions.rectangle(0, 'b')!.height, 50);
      transitions.replace(c, diagram(90, animate: false), [0], animate: true);
      expect(transitions.rectangle(0, 'b'), isNull);
    },
  );
  test(
    'fractional milliseconds keep microsecond rounding and exact completion',
    () {
      final before = diagram(20);
      for (final (duration, micros) in [
        (.00049, 0),
        (.0005, 1),
        (.00149, 1),
        (.0015, 2),
      ]) {
        final after = diagram(80, duration: duration);
        final transitions = BarTransitions();
        transitions.replace(before, after, [0], animate: true);
        const start = Duration(hours: 12);
        expect(transitions.advance(start), micros != 0);
        if (micros == 0) {
          expect(transitions.rectangle(0, 'b'), isNull);
          continue;
        }
        expect(transitions.rectangle(0, 'b')!.height, 20);
        if (micros == 2) {
          expect(
            transitions.advance(
              Duration(microseconds: start.inMicroseconds + 1),
            ),
            true,
          );
          expect(transitions.rectangle(0, 'b')!.height, 50);
        }
        expect(
          transitions.advance(
            Duration(microseconds: start.inMicroseconds + micros),
          ),
          false,
        );
        expect(transitions.rectangle(0, 'b'), isNull);
      }
    },
  );

  test(
    'microsecond retarget starts at next advance and samples the last rectangle',
    () {
      final a = diagram(20),
          b = diagram(80, duration: .004),
          c = diagram(40, duration: .002);
      final transitions = BarTransitions();
      transitions.replace(a, b, [0], animate: true);
      transitions.advance(const Duration(microseconds: 100));
      transitions.advance(const Duration(microseconds: 103));
      expect(transitions.rectangle(0, 'b')!.height, 76.25);
      transitions.replace(b, c, [0], animate: true);
      expect(transitions.rectangle(0, 'b')!.height, 76.25);
      transitions.advance(const Duration(microseconds: 105));
      expect(transitions.rectangle(0, 'b')!.height, 76.25);
      transitions.advance(const Duration(microseconds: 106));
      expect(transitions.rectangle(0, 'b')!.height, 58.125);
      expect(transitions.advance(const Duration(microseconds: 107)), false);
      transitions.replace(c, b, [0], animate: true);
      expect(transitions.rectangle(0, 'b')!.height, 40);
      transitions.advance(const Duration(microseconds: 200));
      expect(transitions.rectangle(0, 'b')!.height, 40);
      transitions.clear();
      expect(transitions.rectangle(0, 'b'), isNull);
      expect(transitions.advance(const Duration(microseconds: 201)), false);
    },
  );

  test('long valid durations do not overflow the completion timestamp', () {
    final before = diagram(20), after = diagram(80, duration: 9223372036854775);
    for (final retained in [false, true]) {
      final transitions = BarTransitions();
      if (retained) {
        transitions.replaceRetained(
          0,
          'b',
          before.nodes[0].item!.components[0].box,
          after.nodes[0].item!.components[0].box,
          after.nodes[0].item!.components[0].data,
          animate: true,
        );
      } else {
        transitions.replace(before, after, [0], animate: true);
      }
      expect(transitions.advance(const Duration(microseconds: 10000)), isTrue);
      expect(transitions.advance(const Duration(microseconds: 10001)), isTrue);
      expect(transitions.rectangle(0, 'b')!.height, 20);
      transitions.clear();
      expect(transitions.advance(const Duration(microseconds: 10002)), isFalse);
    }
  });

  test('zero rounded duration and animate false cancel active transitions', () {
    final a = diagram(20), b = diagram(80);
    for (final animate in [true, false]) {
      final transitions = BarTransitions();
      transitions.replace(a, b, [0], animate: true);
      transitions.advance(Duration.zero);
      transitions.advance(const Duration(milliseconds: 100));
      expect(transitions.rectangle(0, 'b')!.height, 50);
      transitions.replace(b, diagram(40, duration: animate ? .00049 : 200), [
        0,
      ], animate: animate);
      expect(transitions.rectangle(0, 'b'), isNull);
      expect(transitions.advance(const Duration(milliseconds: 101)), false);
    }
  });
}
