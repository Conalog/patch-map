import 'dart:async';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/resources/bars/bar_masks.dart';
import 'package:conalog_patch_map/src/resources/resource_budget.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'native mask pair has exact bytes, padded UV axes and white alpha artwork',
    () async {
      final plan = BarMaskPlan.tryCreate(20, 3)!;
      expect(plan.threeWidth, 126);
      expect(plan.nineWidth, 54);
      expect(plan.height, 54);
      expect(plan.sourceAxis, [0, 21, 33, 54]);
      expect(plan.threeSourceRight, 126);
      expect(plan.threeSliceUsable, isTrue);
      final masks = await createBarMasks(plan);
      try {
        expect(masks.bytes, plan.estimatedBytes);
        final pixels = (await masks.threeImage.toByteData(
          format: ui.ImageByteFormat.rawStraightRgba,
        ))!;
        expect(pixels.getUint8(3), 0);
        final center =
            ((plan.height ~/ 2) * plan.threeWidth + plan.threeWidth ~/ 2) * 4;
        expect(
          [for (var i = 0; i < 4; i++) pixels.getUint8(center + i)],
          [255, 255, 255, 255],
        );
      } finally {
        masks.dispose();
        masks.dispose();
      }
      expect(masks.threeImage.debugDisposed, isTrue);
      expect(masks.nineImage.debugDisposed, isTrue);
      expect(BarMaskPlan.tryCreate(4, 3)!.threeSliceUsable, isFalse);
    },
  );

  test(
    'same radius shares masks independent of color and changing height',
    () async {
      final budget = ResourceBudget(limitBytes: 2 * 1024 * 1024),
          retirement = ResourceRetirement();
      var creations = 0;
      final pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
        creator: (plan) {
          creations++;
          return createBarMasks(plan);
        },
      );
      final first = pool.acquire(3),
          second = pool.acquire(3),
          retained = first.retain();
      final masks = await first.ready;
      expect(await second.ready, same(masks));
      expect(await retained.ready, same(masks));
      expect(creations, 1);
      expect(first.sharedReferenceCount, 3);
      expect(budget.liveBytes, masks!.bytes);
      expect(budget.reservedBytes, 0);
      first.release();
      second.release();
      retained.release();
      expect(pool.unusedBytes, masks.bytes);
      final again = pool.acquire(3);
      expect(await again.ready, same(masks));
      expect(pool.unusedBytes, 0);
      expect(creations, 1);
      again.release();
      pool.close();
      expect(masks.isDisposed, isFalse);
      expect(budget.retiringBytes, masks.bytes);
      retirement.flush();
      expect(masks.isDisposed, isTrue);
      expect(budget.chargedBytes, 0);
    },
  );

  test(
    'reserve before creation and start at most four jobs in FIFO order',
    () async {
      final budget = ResourceBudget(limitBytes: 2 * 1024 * 1024),
          retirement = ResourceRetirement();
      final starts = <double>[], pending = <double, Completer<BarMasks>>{};
      final pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
        creator: (plan) {
          expect(
            budget.reservedBytes,
            greaterThanOrEqualTo(plan.estimatedBytes),
          );
          starts.add(plan.radius);
          return (pending[plan.radius] = Completer<BarMasks>()).future;
        },
      );
      final handles = [for (var i = 0; i < 6; i++) pool.acquire(i.toDouble())];
      expect(starts, [0, 1, 2, 3]);
      expect(pool.preparingCount, 4);
      expect(pool.queuedCount, 2);
      expect(
        budget.reservedBytes,
        [
          for (var i = 0; i < 4; i++)
            BarMaskPlan.tryCreate(20, i.toDouble())!.estimatedBytes,
        ].reduce((a, b) => a + b),
      );
      for (var i = 0; i < 6; i++) {
        final radius = i.toDouble();
        pending[radius]!.complete(
          await createBarMasks(BarMaskPlan.tryCreate(20, radius)!),
        );
        expect(await handles[i].ready, isNotNull);
        expect(pool.preparingCount, lessThanOrEqualTo(4));
      }
      expect(starts, [0, 1, 2, 3, 4, 5]);
      expect(pool.preparingCount, 0);
      for (final handle in handles) {
        handle.release();
      }
      pool.close();
      retirement.close();
      expect(budget.chargedBytes, 0);
    },
  );

  test(
    'inactive admission queues jobs and unstarted zero-reference jobs disappear',
    () async {
      final budget = ResourceBudget(limitBytes: 2 * 1024 * 1024),
          retirement = ResourceRetirement();
      final starts = <double>[];
      final pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
        active: false,
        creator: (plan) {
          starts.add(plan.radius);
          return createBarMasks(plan);
        },
      );
      final removed = pool.acquire(1), active = pool.acquire(2);
      removed.release();
      expect(await removed.ready, isNull);
      expect(starts, isEmpty);
      expect(pool.queuedCount, 1);
      expect(budget.chargedBytes, 0);
      pool.setActive(true);
      expect(await active.ready, isNotNull);
      expect(starts, [2]);
      active.release();
      pool.close();
      retirement.close();
      expect(budget.chargedBytes, 0);
    },
  );

  test(
    'pending zero-reference reacquire joins the same uncancellable job',
    () async {
      final budget = ResourceBudget(limitBytes: 2 * 1024 * 1024),
          retirement = ResourceRetirement();
      final done = Completer<BarMasks>();
      var calls = 0;
      final pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
        creator: (plan) {
          calls++;
          return done.future;
        },
      );
      final old = pool.acquire(3);
      final original = old.ready;
      final reserved = budget.reservedBytes;
      old.release();
      expect(pool.preparingCount, 1);
      expect(budget.reservedBytes, reserved);
      final current = pool.acquire(3);
      expect(calls, 1);
      expect(current.sharedReferenceCount, 1);
      done.complete(await createBarMasks(BarMaskPlan.tryCreate(20, 3)!));
      expect(await original, isNull);
      expect(await current.ready, isNotNull);
      expect(budget.reservedBytes, 0);
      expect(budget.liveBytes, reserved);
      current.release();
      pool.close();
      retirement.close();
      expect(budget.chargedBytes, 0);
    },
  );

  test(
    'budget denial stays fallback until explicit space-change retry',
    () async {
      final bytes = BarMaskPlan.tryCreate(20, 3)!.estimatedBytes;
      final budget = ResourceBudget(limitBytes: bytes),
          retirement = ResourceRetirement();
      final outside = budget.tryReserve(bytes)!;
      var calls = 0, notifications = 0;
      final pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
        creator: (plan) {
          calls++;
          return createBarMasks(plan);
        },
        onReady: () => notifications++,
      );
      final handle = pool.acquire(3);
      expect(await handle.ready, isNull);
      expect(pool.deniedCount, 1);
      expect(calls, 0);
      expect(pool.lastCreationError, isNull);
      outside.release();
      expect(calls, 0);
      pool.retryDenied();
      expect(await handle.ready, isNotNull);
      expect(calls, 1);
      expect(notifications, 1);
      expect(pool.deniedCount, 0);
      handle.release();
      pool.close();
      retirement.close();
      expect(budget.chargedBytes, 0);
    },
  );

  test(
    'dimension-cap and impossible single-reservation sizes use null fallback',
    () async {
      final retirement = ResourceRetirement();
      var calls = 0;
      final pool = BarMaskPool(
        representativeWidth: 1000,
        budget: ResourceBudget(limitBytes: 2 * 1024 * 1024),
        retirement: retirement,
        creator: (plan) {
          calls++;
          return createBarMasks(plan);
        },
      );
      final capped = pool.acquire(3);
      expect(await capped.ready, isNull);
      expect(calls, 0);
      expect(pool.lastCreationError, isNull);
      capped.release();
      pool.close();
      final tiny = BarMaskPool(
        representativeWidth: 20,
        budget: ResourceBudget(limitBytes: 1),
        retirement: retirement,
        creator: (plan) {
          calls++;
          return createBarMasks(plan);
        },
      );
      final denied = tiny.acquire(3);
      expect(await denied.ready, isNull);
      expect(calls, 0);
      denied.release();
      tiny.close();
      retirement.close();
      expect(BarMaskPlan.tryCreate(20, 1000), isNull);
      final zero = BarMaskPool(
        representativeWidth: 0,
        budget: ResourceBudget(limitBytes: 2 * 1024 * 1024),
        retirement: retirement,
      );
      final empty = zero.acquire(0);
      expect(await empty.ready, isNull);
      expect(zero.preparingCount, 0);
      empty.release();
      zero.close();
    },
  );

  test(
    'unused masks follow the 1 MiB FIFO bound while retirement remains charged',
    () async {
      final budget = ResourceBudget(limitBytes: 8 * 1024 * 1024),
          retirement = ResourceRetirement();
      final pool = BarMaskPool(
        representativeWidth: 200,
        budget: budget,
        retirement: retirement,
      );
      final first = pool.acquire(10), second = pool.acquire(11);
      final older = (await first.ready)!, newer = (await second.ready)!;
      first.release();
      expect(pool.unusedBytes, older.bytes);
      second.release();
      expect(pool.unusedBytes, newer.bytes);
      expect(pool.unusedBytes, lessThanOrEqualTo(1024 * 1024));
      expect(retirement.pendingCount, 1);
      expect(older.isDisposed, isFalse);
      expect(budget.retiringBytes, older.bytes);
      expect(budget.liveBytes, newer.bytes);
      retirement.flush();
      expect(older.isDisposed, isTrue);
      expect(newer.isDisposed, isFalse);
      expect(budget.chargedBytes, newer.bytes);
      pool.close();
      retirement.close();
      expect(budget.chargedBytes, 0);
    },
  );

  test(
    'native partial two-image failure disposes every temporary result and remembers identity',
    () async {
      final budget = ResourceBudget(limitBytes: 2 * 1024 * 1024),
          retirement = ResourceRetirement();
      final images = <ui.Image>[], pictures = <ui.Picture>[];
      var calls = 0;
      final pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
        creator: (plan) {
          calls++;
          return createBarMasks(
            plan,
            rasterize: (picture, width, height) async {
              pictures.add(picture);
              if (pictures.length == 2) throw StateError('second image failed');
              final image = await picture.toImage(width, height);
              images.add(image);
              return image;
            },
          );
        },
      );
      final failed = pool.acquire(3);
      expect(await failed.ready, isNull);
      expect(images.single.debugDisposed, isTrue);
      expect(pictures.every((p) => p.debugDisposed), isTrue);
      expect(budget.chargedBytes, 0);
      expect(pool.preparingCount, 0);
      expect(pool.failed(3), isTrue);
      failed.release();
      final retry = pool.acquire(3);
      expect(await retry.ready, isNull);
      pool.retryDenied();
      pool.setActive(false);
      pool.setActive(true);
      expect(calls, 1);
      retry.release();
      pool.close();
      retirement.close();
    },
  );

  test(
    'close keeps actual in-flight bytes and slot until late cleanup settles',
    () async {
      final budget = ResourceBudget(limitBytes: 2 * 1024 * 1024),
          retirement = ResourceRetirement();
      final started = Completer<BarMasks>(), done = Completer<void>();
      final pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
        creator: (plan) async {
          final masks = await createBarMasks(plan);
          started.complete(masks);
          await done.future;
          return masks;
        },
      );
      final handle = pool.acquire(3);
      final masks = await started.future;
      final charge = budget.chargedBytes;
      pool.close();
      budget.close();
      expect(pool.preparingCount, 1);
      expect(budget.reservedBytes, charge);
      expect(masks.isDisposed, isFalse);
      expect(() => pool.acquire(3), throwsStateError);
      done.complete();
      expect(await handle.ready, isNull);
      expect(pool.preparingCount, 0);
      expect(budget.chargedBytes, 0);
      expect(masks.isDisposed, isTrue);
      handle.release();
      retirement.close();
      expect(pool.referenceCount, 0);
    },
  );

  test(
    'throwing ready notification cannot turn valid resources into failed creations',
    () async {
      final budget = ResourceBudget(limitBytes: 2 * 1024 * 1024),
          retirement = ResourceRetirement();
      final pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
        onReady: () => throw StateError('callback failed'),
      );
      final handle = pool.acquire(3), masks = (await handle.ready)!;
      expect(masks.isDisposed, isFalse);
      expect(pool.failed(3), isFalse);
      expect(pool.lastCreationError, isNull);
      expect(pool.lastNotificationError, isStateError);
      expect(budget.liveBytes, masks.bytes);
      handle.release();
      pool.close();
      retirement.close();
      expect(budget.chargedBytes, 0);
    },
  );

  test(
    'shared-budget reclamation schedules only the FIFO bytes needed',
    () async {
      final budget = ResourceBudget(limitBytes: 2 * 1024 * 1024),
          retirement = ResourceRetirement();
      final pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
      );
      final first = pool.acquire(1), second = pool.acquire(2);
      final older = (await first.ready)!, newer = (await second.ready)!;
      first.release();
      second.release();
      final available = budget.availableBytes;
      expect(pool.retireUnusedFor(available + 1), older.bytes);
      expect(pool.unusedBytes, newer.bytes);
      expect(retirement.pendingCount, 1);
      expect(budget.availableBytes, available);
      expect(budget.retiringBytes, older.bytes);
      retirement.flush();
      expect(budget.availableBytes, available + older.bytes);
      pool.close();
      retirement.close();
      expect(budget.chargedBytes, 0);
    },
  );

  test(
    'space callback deactivation cannot start a new job during FIFO reclamation',
    () async {
      late BarMaskPool pool;
      final limit = BarMaskPlan.tryCreate(20, 2)!.estimatedBytes;
      final budget = ResourceBudget(
        limitBytes: limit,
        onSpaceAvailable: () => pool.setActive(false),
      );
      final retirement = ResourceRetirement()..close();
      var calls = 0;
      pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
        creator: (plan) {
          calls++;
          return createBarMasks(plan);
        },
      );
      final first = pool.acquire(1);
      await first.ready;
      first.release();
      final second = pool.acquire(2);
      expect(pool.isActive, isFalse);
      expect(pool.preparingCount, 0);
      expect(pool.queuedCount, 1);
      expect(calls, 1);
      pool.setActive(true);
      expect(await second.ready, isNotNull);
      expect(calls, 2);
      second.release();
      pool.close();
      expect(budget.chargedBytes, 0);
    },
  );

  test(
    'unreferenced completed preparation may enter bounded cache without notifying a frame',
    () async {
      final budget = ResourceBudget(limitBytes: 2 * 1024 * 1024),
          retirement = ResourceRetirement();
      final done = Completer<BarMasks>();
      var notifications = 0;
      final pool = BarMaskPool(
        representativeWidth: 20,
        budget: budget,
        retirement: retirement,
        creator: (_) => done.future,
        onReady: () => notifications++,
      );
      final handle = pool.acquire(3);
      final ready = handle.ready;
      handle.release();
      final masks = await createBarMasks(BarMaskPlan.tryCreate(20, 3)!);
      done.complete(masks);
      expect(await ready, isNull);
      expect(notifications, 0);
      expect(pool.unusedBytes, masks.bytes);
      pool.close();
      retirement.close();
      expect(budget.chargedBytes, 0);
    },
  );
}
