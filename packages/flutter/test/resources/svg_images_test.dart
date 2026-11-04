import 'dart:async';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/resources/resource_budget.dart';
import 'package:conalog_patch_map/src/resources/svg/svg_images.dart';
import 'package:conalog_patch_map/src/resources/svg/svg_source.dart';
import 'package:conalog_patch_map/src/resources/svg/svg_vectors.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'whole-scene threshold visible demand and native density buckets share images',
    (tester) async {
      await tester.runAsync(() async {
        final h = _Harness();
        final source = h.source();
        final low = h.images.acquire(source, sourceReferenceCount: 15);
        final first = h.images.acquire(source, sourceReferenceCount: 16);
        final second = h.images.acquire(source, sourceReferenceCount: 200);
        await Future.wait([
          low.vectorReady,
          first.vectorReady,
          second.vectorReady,
        ]);
        expect(_resolve(low), isNull);
        expect(_resolve(first, visible: false), isNull);
        expect(h.images.preparingCount, 0);
        expect(_resolve(first), isNull);
        expect(_resolve(second), isNull);
        await _until(() => h.images.preparingCount == 0);
        final image = _resolve(first)!;
        expect(identical(image, _resolve(second)), isTrue);
        expect([image.width, image.height], [192, 96]);
        expect(h.created, [(192, 96)]);
        final pixels = (await image.toByteData(
          format: ui.ImageByteFormat.rawStraightRgba,
        ))!;
        expect(pixels.getUint8((48 * 192 + 96) * 4), 255);
        expect(_resolve(first, size: const ui.Size(193, 96.5)), isNull);
        await _until(() => h.images.preparingCount == 0);
        expect(_resolve(first, size: const ui.Size(193, 96.5))!.width, 384);
        // Nonuniform destinations must cover both axes while retaining aspect.
        expect(_resolve(first, size: const ui.Size(100, 100))!.width, 384);
        expect(_resolve(first, size: const ui.Size(800, 400), dpr: 2), isNull);
        expect(h.created.length, 2);
        low.release();
        first.release();
        second.release();
        source.release();
        expect(h.budget.retiringBytes, greaterThan(0));
        h.close();
      });
    },
  );

  testWidgets('all four buckets respect scale DPR and >1536 keeps vector', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final h = _Harness(limit: 16 * 1024 * 1024);
      final source = h.source();
      final lease = h.images.acquire(source, sourceReferenceCount: 16);
      await lease.vectorReady;
      for (final level in [192, 384, 768, 1536]) {
        _resolve(lease, size: ui.Size(level / 4, level / 8), scale: 2, dpr: 2);
        await _until(() => h.images.preparingCount == 0);
        final image = _resolve(
          lease,
          size: ui.Size(level / 4, level / 8),
          scale: 2,
          dpr: 2,
        )!;
        expect([image.width, image.height], [level, level ~/ 2]);
        h.retirement.flush();
      }
      expect(_resolve(lease, size: const ui.Size(1537, 768.5)), isNull);
      expect(lease.vector, isNotNull);
      lease.release();
      source.release();
      h.close();
    });
  });

  testWidgets(
    'shared reserved live retiring budget denies without per-frame retry',
    (tester) async {
      await tester.runAsync(() async {
        final h = _Harness();
        final blocker = h.budget.tryReserve(h.budget.limitBytes)!..promote();
        final source = h.source();
        final lease = h.images.acquire(source, sourceReferenceCount: 16);
        await lease.vectorReady;
        for (var i = 0; i < 20; i++) {
          expect(_resolve(lease), isNull);
        }
        expect(h.images.deniedCount, 1);
        expect(h.created, isEmpty);
        blocker.retire();
        h.images.retryDenied();
        expect(h.created, isEmpty);
        expect(h.budget.retiringBytes, h.budget.limitBytes);
        blocker.release();
        h.images.retryDenied();
        await _until(() => h.images.preparingCount == 0);
        expect(_resolve(lease), isNotNull);
        expect(h.budget.liveBytes, 192 * 96 * 4);
        lease.release();
        source.release();
        expect(h.budget.liveBytes, 0);
        expect(h.budget.retiringBytes, 192 * 96 * 4);
        h.close();
      });
    },
  );

  testWidgets(
    'inactive queue FIFO four jobs and callbacks do not become creation failures',
    (tester) async {
      await tester.runAsync(() async {
        final gates = <Completer<void>>[];
        final h = _Harness(
          before: () {
            final gate = Completer<void>();
            gates.add(gate);
            return gate.future;
          },
        );
        h.images.setActive(false);
        final sources = [for (var i = 0; i < 6; i++) h.source('$i.svg')];
        final leases = [
          for (final source in sources)
            h.images.acquire(source, sourceReferenceCount: 16),
        ];
        await Future.wait(leases.map((lease) => lease.vectorReady));
        for (final lease in leases) {
          _resolve(lease);
        }
        expect(h.images.queuedCount, 6);
        expect(gates, isEmpty);
        h.images.onReady = () => throw StateError('notification');
        h.images.setActive(true);
        expect(gates.length, 4);
        expect(h.images.preparingCount, 4);
        expect(h.images.queuedCount, 2);
        gates.first.complete();
        await _until(() => gates.length == 5);
        expect(_resolve(leases.first), isNotNull);
        expect(h.images.lastCreationError, isNull);
        expect(h.images.lastNotificationError, isA<StateError>());
        gates[1].complete();
        await _until(() => gates.length == 6);
        for (final gate in gates.skip(2)) {
          gate.complete();
        }
        await _until(() => h.images.preparingCount == 0);
        expect(h.images.queuedCount, 0);
        for (final lease in leases) {
          lease.release();
        }
        for (final source in sources) {
          source.release();
        }
        h.close();
      });
    },
  );

  testWidgets(
    'last release and close keep pending charge until actual settlement',
    (tester) async {
      await tester.runAsync(() async {
        for (final closeEarly in [false, true]) {
          final gate = Completer<void>();
          final h = _Harness(before: () => gate.future);
          final source = h.source();
          final lease = h.images.acquire(source, sourceReferenceCount: 16);
          await lease.vectorReady;
          _resolve(lease);
          expect(h.budget.reservedBytes, 192 * 96 * 4);
          lease.release();
          source.release();
          if (closeEarly) {
            h.images.close();
            h.vectors.close();
          }
          expect(h.budget.reservedBytes, 192 * 96 * 4);
          expect(h.vectors.referenceCount, 1);
          gate.complete();
          await _until(() => h.images.preparingCount == 0);
          expect(h.budget.chargedBytes, 0);
          expect(h.images.entryCount, 0);
          expect(h.vectors.referenceCount, 0);
          expect(h.nativeImages.single.debugDisposed, isTrue);
          h.close();
        }
      });
    },
  );

  testWidgets(
    'shared 2 MiB rejects oversized bucket and close retires borrowed image',
    (tester) async {
      await tester.runAsync(() async {
        final h = _Harness();
        final source = h.source();
        final lease = h.images.acquire(source, sourceReferenceCount: 16);
        await lease.vectorReady;
        expect(_resolve(lease, size: const ui.Size(0, 100)), isNull);
        expect(h.created, isEmpty);
        expect(_resolve(lease, size: const ui.Size(1536, 768)), isNull);
        expect(h.images.deniedCount, 1);
        expect(h.budget.chargedBytes, 0);
        _resolve(lease);
        await _until(() => h.images.preparingCount == 0);
        final image = _resolve(lease)!;
        expect(image.debugDisposed, isFalse);
        h.images.close();
        expect(h.budget.liveBytes, 0);
        expect(h.budget.retiringBytes, 192 * 96 * 4);
        expect(image.debugDisposed, isFalse);
        expect(_resolve(lease), isNull);
        h.retirement.flush();
        expect(image.debugDisposed, isTrue);
        expect(h.budget.chargedBytes, 0);
        expect(lease.vector, isNotNull);
        lease.release();
        source.release();
        h.close();
      });
    },
  );

  testWidgets(
    'failed optimization retains vector and remembers same identity',
    (tester) async {
      await tester.runAsync(() async {
        var calls = 0;
        final h = _Harness(
          before: () async {
            calls++;
            throw StateError('raster failure');
          },
        );
        final source = h.source();
        final lease = h.images.acquire(source, sourceReferenceCount: 16);
        await lease.vectorReady;
        _resolve(lease);
        await _until(() => h.images.preparingCount == 0);
        for (var i = 0; i < 10; i++) {
          expect(_resolve(lease), isNull);
        }
        expect(calls, 1);
        expect(lease.vector, isNotNull);
        expect(h.budget.chargedBytes, 0);
        lease.release();
        final retry = h.images.acquire(source, sourceReferenceCount: 16);
        await retry.vectorReady;
        _resolve(retry);
        expect(calls, 1);
        retry.release();
        source.release();
        h.close();
      });
    },
  );
}

ui.Image? _resolve(
  SvgImageLease lease, {
  ui.Size size = const ui.Size(100, 50),
  double scale = 1,
  double dpr = 1,
  bool visible = true,
}) => lease.resolve(
  logicalSize: size,
  scale: scale,
  devicePixelRatio: dpr,
  visible: visible,
);

Future<void> _until(bool Function() condition) async {
  final deadline = DateTime.now().add(const Duration(seconds: 8));
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('native creation did not settle');
    }
    await Future<void>.delayed(const Duration(milliseconds: 1));
  }
}

final class _Harness {
  _Harness({int limit = 2 * 1024 * 1024, Future<void> Function()? before}) {
    budget = ResourceBudget(limitBytes: limit);
    vectors = SvgVectorStore(
      sourceLoader: (_) async =>
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#ff0000"/></svg>',
    );
    images = SvgImageStore(
      budget: budget,
      retirement: retirement,
      rasterize: (picture, width, height) async {
        created.add((width, height));
        await before?.call();
        final image = await picture.toImage(width, height);
        nativeImages.add(image);
        return image;
      },
    );
  }
  final retirement = ResourceRetirement();
  late final ResourceBudget budget;
  late final SvgVectorStore vectors;
  late final SvgImageStore images;
  final created = <(int, int)>[];
  final nativeImages = <ui.Image>[];
  SvgVectorLease source([String name = 'icon.svg']) =>
      vectors.acquire(SvgSourceResolver().resolve(name));
  void close() {
    images.close();
    retirement.close();
    vectors.close();
    budget.close();
    expect(images.entryCount, 0);
    expect(images.preparingCount, 0);
    expect(vectors.referenceCount, 0);
    expect(budget.chargedBytes, 0);
    expect(nativeImages.every((image) => image.debugDisposed), isTrue);
  }
}
