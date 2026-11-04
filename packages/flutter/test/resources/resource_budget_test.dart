import 'dart:async';

import 'package:conalog_patch_map/src/resources/resource_budget.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('reservations saturate shared space before resource creation', () {
    final budget = ResourceBudget(limitBytes: 10);
    final bar = budget.tryReserve(6)!;
    final svg = budget.tryReserve(4)!;
    expect(budget.tryReserve(1), isNull);
    expect(budget.reservedBytes, 10);
    expect(budget.availableBytes, 0);
    expect(bar.release(), isTrue);
    expect(budget.tryReserve(6), isNotNull);
    expect(svg.bytes, 4);
    expectAccounting(budget);
  });

  test(
    'growth denial is atomic and shrink makes only freed bytes available',
    () {
      var notifications = 0;
      final budget = ResourceBudget(
        limitBytes: 10,
        onSpaceAvailable: () => notifications++,
      );
      final first = budget.tryReserve(6)!;
      final second = budget.tryReserve(4)!;
      expect(first.tryResize(7), isFalse);
      expect(first.bytes, 6);
      expect(budget.reservedBytes, 10);
      expect(notifications, 0);
      expect(second.tryResize(2), isTrue);
      expect(notifications, 1);
      expect(first.tryResize(8), isTrue);
      expect(first.tryResize(8), isTrue);
      expect(notifications, 1);
      expect(budget.chargedBytes, 10);
      expectAccounting(budget);
    },
  );

  test('promotion and retirement retain the full aggregate charge', () {
    var notifications = 0;
    final budget = ResourceBudget(
      limitBytes: 10,
      onSpaceAvailable: () => notifications++,
    );
    final preparing = budget.tryReserve(3)!;
    final live = budget.tryReserve(4)!..promote();
    final retiring = budget.tryReserve(3)!
      ..promote()
      ..retire();
    expect(budget.reservedBytes, 3);
    expect(budget.liveBytes, 4);
    expect(budget.retiringBytes, 3);
    expect(budget.tryReserve(1), isNull);
    expect(retiring.tryResize(4), isFalse);
    expect(notifications, 0);
    preparing.promote();
    live.retire();
    expect(budget.reservedBytes, 0);
    expect(budget.liveBytes, 3);
    expect(budget.retiringBytes, 7);
    expect(budget.chargedBytes, 10);
    retiring.release();
    expect(budget.availableBytes, 3);
    expect(notifications, 1);
    expectAccounting(budget);
  });

  test(
    'logical cancellation retains reservation until actual settlement',
    () async {
      final budget = ResourceBudget(limitBytes: 10);
      final pending = budget.tryReserve(10)!;
      final completion = Completer<void>();
      var cancelled = false;
      final work = () async {
        try {
          await completion.future;
          if (!cancelled) pending.promote();
        } finally {
          if (cancelled) pending.release();
        }
      }();
      cancelled = true;
      expect(pending.state, ResourceBudgetState.reserved);
      expect(budget.tryReserve(1), isNull);
      expect(budget.chargedBytes, 10);
      completion.complete();
      await work;
      expect(budget.chargedBytes, 0);
      expect(pending.state, ResourceBudgetState.released);
    },
  );

  test('failed preparation can release its reservation in finally', () async {
    final budget = ResourceBudget(limitBytes: 10);
    final lease = budget.tryReserve(10)!;
    Future<void> prepare() async {
      try {
        throw StateError('creation failed');
      } finally {
        lease.release();
      }
    }

    await expectLater(prepare(), throwsStateError);
    expect(budget.chargedBytes, 0);
    expect(lease.state, ResourceBudgetState.released);
  });

  test('close preserves all phases and permits their late release', () {
    var notifications = 0;
    final budget = ResourceBudget(
      limitBytes: 20,
      onSpaceAvailable: () => notifications++,
    );
    final pending = budget.tryReserve(6)!;
    final live = budget.tryReserve(7)!..promote();
    final retiring = budget.tryReserve(4)!
      ..promote()
      ..retire();
    budget.close();
    budget.close();
    expect(budget.isClosed, isTrue);
    expect(budget.chargedBytes, 17);
    expect(budget.tryReserve(0), isNull);
    expect(budget.tryReserve(1), isNull);
    expect(pending.promote, throwsStateError);
    expect(pending.tryResize(7), isFalse);
    expect(pending.tryResize(5), isTrue);
    expect(live.tryResize(8), isFalse);
    live.retire();
    pending.release();
    live.release();
    retiring.release();
    expect(budget.chargedBytes, 0);
    expect(notifications, 0);
    expectAccounting(budget);
  });

  test(
    'a closed pending job still owns space until its late settlement',
    () async {
      final budget = ResourceBudget(limitBytes: 10);
      final lease = budget.tryReserve(10)!;
      final completion = Completer<void>();
      final work = completion.future.whenComplete(lease.release);
      budget.close();
      expect(budget.chargedBytes, 10);
      completion.complete();
      await work;
      expect(budget.chargedBytes, 0);
    },
  );

  test('zero charge and double release do not notify or underflow', () {
    var notifications = 0;
    final budget = ResourceBudget(
      limitBytes: 0,
      onSpaceAvailable: () => notifications++,
    );
    final lease = budget.tryReserve(0)!
      ..promote()
      ..retire();
    expect(lease.release(), isTrue);
    expect(lease.release(), isFalse);
    expect(lease.bytes, 0);
    expect(budget.chargedBytes, 0);
    expect(notifications, 0);
    expectAccounting(budget);
  });

  test('invalid amounts and phase changes leave accounting intact', () {
    expect(() => ResourceBudget(limitBytes: -1), throwsRangeError);
    final budget = ResourceBudget(limitBytes: 10);
    expect(() => budget.tryReserve(-1), throwsRangeError);
    final lease = budget.tryReserve(5)!;
    expect(() => lease.tryResize(-1), throwsRangeError);
    expect(lease.retire, throwsStateError);
    expect(lease.bytes, 5);
    lease.promote();
    expect(lease.promote, throwsStateError);
    lease.retire();
    expect(lease.retire, throwsStateError);
    lease.release();
    expect(() => lease.tryResize(0), throwsStateError);
    expect(lease.promote, throwsStateError);
    expect(lease.retire, throwsStateError);
    expectAccounting(budget);
  });

  test(
    'notifications see committed accounting and can reserve freed space',
    () {
      late ResourceBudget budget;
      late ResourceBudgetLease lease;
      ResourceBudgetLease? replacement;
      budget = ResourceBudget(
        limitBytes: 10,
        onSpaceAvailable: () {
          expect(lease.state, ResourceBudgetState.released);
          expect(lease.bytes, 0);
          expect(budget.chargedBytes, 0);
          replacement = budget.tryReserve(10);
        },
      );
      lease = budget.tryReserve(10)!;
      lease.release();
      expect(replacement, isNotNull);
      expect(budget.chargedBytes, 10);
      expectAccounting(budget);
    },
  );

  test('throwing notification cannot undo a shrink or release', () {
    final budget = ResourceBudget(
      limitBytes: 10,
      onSpaceAvailable: () => throw StateError('callback failed'),
    );
    final lease = budget.tryReserve(10)!;
    expect(() => lease.tryResize(5), throwsStateError);
    expect(lease.bytes, 5);
    expect(budget.chargedBytes, 5);
    expect(lease.release, throwsStateError);
    expect(lease.state, ResourceBudgetState.released);
    expect(lease.release(), isFalse);
    expect(budget.chargedBytes, 0);
    expectAccounting(budget);
  });

  test('retiring shrink and live resize use their own accounting buckets', () {
    final budget = ResourceBudget(limitBytes: 10);
    final lease = budget.tryReserve(4)!..promote();
    expect(lease.tryResize(8), isTrue);
    expect(budget.liveBytes, 8);
    expect(budget.reservedBytes, 0);
    lease.retire();
    expect(lease.tryResize(3), isTrue);
    expect(budget.retiringBytes, 3);
    expect(budget.liveBytes, 0);
    expect(lease.tryResize(4), isFalse);
    lease.release();
    expectAccounting(budget);
  });
}

void expectAccounting(ResourceBudget budget) {
  expect(budget.reservedBytes, greaterThanOrEqualTo(0));
  expect(budget.liveBytes, greaterThanOrEqualTo(0));
  expect(budget.retiringBytes, greaterThanOrEqualTo(0));
  expect(
    budget.chargedBytes,
    budget.reservedBytes + budget.liveBytes + budget.retiringBytes,
  );
  expect(budget.chargedBytes, lessThanOrEqualTo(budget.limitBytes));
  expect(budget.availableBytes, budget.limitBytes - budget.chargedBytes);
}
