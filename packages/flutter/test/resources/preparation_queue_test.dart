import 'dart:async';

import 'package:conalog_patch_map/src/resources/preparation_queue.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'cancellation drops only unstarted jobs while preserving FIFO and four slots',
    () async {
      final queue = PreparationQueue();
      final blockers = List.generate(4, (_) => Completer<void>());
      final tokens = List.generate(4, (_) => PreparationCancellation());
      final running = [
        for (var i = 0; i < 4; i++)
          queue.schedule(() => blockers[i].future, cancellation: tokens[i]),
      ];
      final started = <int>[];
      final cancelled = PreparationCancellation();
      final dropped = queue.schedule(() async {
        started.add(0);
      }, cancellation: cancelled);
      final droppedResult = expectLater(
        dropped,
        throwsA(isA<PreparationCancelled>()),
      );
      final tail = [
        for (var i = 1; i < 4; i++)
          queue.schedule(() async {
            started.add(i);
          }),
      ];
      expect(queue.running, 4);
      expect(tokens.first.cancel(), isFalse);
      expect(cancelled.cancel(), isTrue);
      await droppedResult;
      expect(queue.running, 4);
      expect(started, isEmpty);
      blockers.first.complete();
      await Future.wait(tail);
      expect(started, [1, 2, 3]);
      expect(queue.running, 3);
      queue.close();
      expect(queue.running, 3);
      for (final blocker in blockers.skip(1)) {
        blocker.complete();
      }
      await Future.wait(running);
      await Future<void>.delayed(Duration.zero);
      expect(queue.running, 0);
    },
  );

  test(
    'close neutrally settles waiting work without invoking its creator',
    () async {
      final queue = PreparationQueue()..setActive(false);
      var called = false;
      final pending = queue.schedule(() async {
        called = true;
      });
      final result = expectLater(pending, throwsA(isA<PreparationCancelled>()));
      queue.close();
      await result;
      queue.setActive(true);
      expect(called, isFalse);
      expect(queue.running, 0);
    },
  );
}
