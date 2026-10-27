import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/resources/images/image_decode.dart';
import 'package:conalog_patch_map/src/resources/images/image_source.dart';
import 'package:conalog_patch_map/src/resources/images/image_store.dart';
import 'package:conalog_patch_map/src/resources/images/image_transport.dart';
import 'package:conalog_patch_map/src/resources/resource_budget.dart';
import 'package:flutter_test/flutter_test.dart';

const mib = 1024 * 1024;
RasterImageSource source(Object key) => RasterImageSource(
  identity: key,
  canonicalUri: Uri.parse('https://example.test/$key.png'),
);
Future<void> drain([int count = 35]) async {
  for (var i = 0; i < count; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

Future<ui.Image> image([int width = 1, int height = 1]) async {
  final recorder = ui.PictureRecorder();
  ui.Canvas(recorder).drawRect(
    ui.Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
    ui.Paint()..color = const ui.Color(0xff1280d0),
  );
  final picture = recorder.endRecording();
  try {
    return await picture.toImage(width, height);
  } finally {
    picture.dispose();
  }
}

Future<Uint8List> png() async {
  final value = await image(2, 3);
  try {
    return (await value.toByteData(
      format: ui.ImageByteFormat.png,
    ))!.buffer.asUint8List();
  } finally {
    value.dispose();
  }
}

final class Transfer implements ImageTransfer {
  final responseResult = Completer<ImageTransferResponse>();
  final stream = StreamController<List<int>>();
  Completer<void>? cancelGate;
  int cancelCalls = 0, streamCancels = 0;
  Transfer({int? knownLength, bool respond = true}) {
    stream.onCancel = () {
      streamCancels++;
    };
    if (respond) {
      responseResult.complete(
        ImageTransferResponse(bytes: stream.stream, contentLength: knownLength),
      );
    }
  }
  @override
  Future<ImageTransferResponse> get response => responseResult.future;
  @override
  Future<void> cancel() async {
    cancelCalls++;
    await cancelGate?.future;
  }

  void finish(List<int> bytes) {
    stream.add(bytes);
    unawaited(stream.close());
  }
}

final class Descriptor implements RasterImageDescriptor {
  Descriptor(this.width, this.height, this.create);
  @override
  final int width, height;
  final Future<ui.Image> Function() create;
  bool disposed = false;
  int decodes = 0;
  @override
  Future<ui.Image> decode() {
    decodes++;
    return create();
  }

  @override
  void dispose() {
    expect(disposed, isFalse);
    disposed = true;
  }
}

final class Clock {
  int now = 0;
  final tasks = <({int at, void Function() run, List<bool> cancelled})>[];
  void Function() schedule(Duration delay, void Function() action) {
    final cancelled = [false];
    tasks.add((
      at: now + delay.inMilliseconds,
      run: action,
      cancelled: cancelled,
    ));
    return () {
      cancelled[0] = true;
    };
  }

  void advance(int milliseconds) {
    now += milliseconds;
    final due =
        tasks.where((task) => task.at <= now && !task.cancelled[0]).toList()
          ..sort((a, b) => a.at.compareTo(b.at));
    for (final task in due) {
      task.cancelled[0] = true;
      task.run();
    }
  }

  int get pending => tasks.where((task) => !task.cancelled[0]).length;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'native raster data URI decodes through the bounded source owner',
    () async {
      final bytes = await png(),
          output = ResourceBudget(limitBytes: 256 * mib),
          retirement = ResourceRetirement();
      final store = RasterImageStore(
        outputBudget: output,
        retirement: retirement,
      );
      final lease = store.acquire(
        RasterImageSource(
          identity: 'data-png',
          canonicalUri: Uri.dataFromBytes(bytes, mimeType: 'image/png'),
        ),
      );
      final result = await lease.ready;
      expect(result.failure, isNull);
      expect(result.image!.width, 2);
      expect(result.image!.height, 3);
      expect(store.sourceBytes, 0);
      expect(output.liveBytes, 24);
      lease.release();
      store.close();
      retirement.close();
      expect(output.chargedBytes, 0);
    },
  );
  test(
    'native PNG shares identity, exact output charge, and safe last-reference retirement',
    () async {
      final bytes = await png(),
          budget = ResourceBudget(limitBytes: 256 * mib),
          retirement = ResourceRetirement();
      var loads = 0, changes = 0;
      final store = RasterImageStore(
        outputBudget: budget,
        retirement: retirement,
        assetLoader: (key, options) async {
          loads++;
          return bytes;
        },
        onChanged: (_) {
          changes++;
        },
      );
      final spec = RasterImageSource(identity: 'asset', assetKey: 'map.png');
      final first = store.acquire(spec),
          second = store.acquire(spec),
          retained = first.retain();
      final result = await first.ready;
      expect(result.failure, isNull);
      expect(result.image!.width, 2);
      expect(result.image!.height, 3);
      expect((await second.ready).image, same(result.image));
      expect(loads, 1);
      expect(changes, 1);
      expect(budget.liveBytes, 24);
      expect(store.sourceBytes, 0);
      expect(store.preparingBytes, 0);
      first.release();
      second.release();
      expect(budget.liveBytes, 24);
      retained.release();
      expect(retained.release(), isFalse);
      expect(budget.retiringBytes, 24);
      expect(result.image!.debugDisposed, isFalse);
      expect(store.entryCount, 0);
      retirement.flush();
      expect(result.image!.debugDisposed, isTrue);
      expect(budget.chargedBytes, 0);
      store.close();
      expect(store.referenceCount, 0);
    },
  );

  test(
    'download FIFO caps at 16 and reserves 20 MiB before knowing length',
    () async {
      final requests = <Transfer>[], starts = <Object>[];
      final store = RasterImageStore(
        outputBudget: ResourceBudget(limitBytes: 256 * mib),
        retirement: ResourceRetirement(),
        transferFactory: (spec) {
          starts.add(spec.identity);
          final request = Transfer(knownLength: 1);
          requests.add(request);
          return request;
        },
      );
      final leases = [for (var i = 0; i < 20; i++) store.acquire(source(i))];
      expect(store.transferCount, 2);
      expect(store.sourceBytes, 40 * mib);
      await drain();
      expect(store.transferCount, 16);
      expect(store.sourceBytes, 16);
      expect(store.queuedTransfers, 4);
      expect(starts, List.generate(16, (i) => i));
      leases[0].release();
      leases[1].release();
      await drain();
      expect(starts, List.generate(18, (i) => i));
      store.close();
      for (final lease in leases.skip(2)) {
        lease.release();
      }
      await drain();
      expect(requests.every((request) => request.streamCancels == 1), isTrue);
      expect(store.sourceBytes, 0);
      expect(store.transferCount, 0);
      expect(store.referenceCount, 0);
    },
  );

  test(
    'unknown streams stay bounded, overrun aborts and capacity stays until physical cancellation',
    () async {
      final requests = <Transfer>[];
      final store = RasterImageStore(
        outputBudget: ResourceBudget(limitBytes: 256 * mib),
        retirement: ResourceRetirement(),
        transferFactory: (_) {
          final request = Transfer();
          requests.add(request);
          return request;
        },
      );
      final leases = [for (var i = 0; i < 3; i++) store.acquire(source(i))];
      await drain();
      expect(requests.length, 2);
      expect(store.sourceBytes, 40 * mib);
      expect(store.bufferedSourceBytes, 0);
      requests[0].cancelGate = Completer<void>();
      requests[0].stream.add(Uint8List(20 * mib));
      requests[0].stream.add([1]);
      await drain();
      expect(requests[0].cancelCalls, 1);
      expect(store.sourceBytes, 40 * mib);
      expect(store.transferCount, 2);
      requests[0].cancelGate!.complete();
      expect(
        (await leases[0].ready).failure!.kind,
        ImageFailureKind.sourceTooLarge,
      );
      await drain();
      expect(requests.length, 3);
      store.close();
      for (final lease in leases) {
        lease.release();
      }
      await drain();
      expect(store.sourceBytes, 0);
    },
  );

  test(
    'initial transient attempts are exactly three; inactive retry delay counts wall time',
    () async {
      final clock = Clock(), requests = <Transfer>[];
      final store = RasterImageStore(
        outputBudget: ResourceBudget(limitBytes: 256 * mib),
        retirement: ResourceRetirement(),
        schedule: clock.schedule,
        transferFactory: (_) {
          final request = Transfer(respond: false);
          requests.add(request);
          return request;
        },
      );
      final lease = store.acquire(source('retry'));
      requests[0].responseResult.completeError(
        const ImageResourceFailure(
          ImageFailureKind.httpStatus,
          '503',
          transient: true,
        ),
      );
      await drain();
      store.setActive(false);
      clock.advance(500);
      await drain();
      expect(requests.length, 1);
      store.setActive(true);
      expect(requests.length, 2);
      requests[1].responseResult.completeError(
        const ImageResourceFailure(
          ImageFailureKind.transport,
          'offline',
          transient: true,
        ),
      );
      await drain();
      clock.advance(999);
      expect(requests.length, 2);
      clock.advance(1);
      expect(requests.length, 3);
      requests[2].responseResult.completeError(
        const ImageResourceFailure(
          ImageFailureKind.transport,
          'offline',
          transient: true,
        ),
      );
      expect((await lease.ready).failure!.kind, ImageFailureKind.transport);
      clock.advance(100000);
      await drain();
      expect(requests.length, 3);
      store.setActive(false);
      expect(store.retryFailed('retry'), isTrue);
      expect(requests.length, 3);
      store.setActive(true);
      expect(requests.length, 4);
      requests[3].responseResult.completeError(
        const ImageResourceFailure(
          ImageFailureKind.transport,
          'again',
          transient: true,
        ),
      );
      expect((await lease.ready).failure!.kind, ImageFailureKind.transport);
      clock.advance(100000);
      await drain();
      expect(requests.length, 4);
      lease.release();
      store.close();
      expect(clock.pending, 0);
      expect(store.sourceBytes, 0);
    },
  );

  test(
    'attempt deadline includes inactive time and waits for abort settlement',
    () async {
      final clock = Clock(),
          request = Transfer(knownLength: 1)..cancelGate = Completer<void>();
      final store = RasterImageStore(
        outputBudget: ResourceBudget(limitBytes: 256 * mib),
        retirement: ResourceRetirement(),
        schedule: clock.schedule,
        transferFactory: (_) => request,
      );
      final lease = store.acquire(source('slow'));
      await drain();
      store.setActive(false);
      clock.advance(20000);
      await drain();
      expect(request.cancelCalls, 1);
      expect(request.streamCancels, 1);
      expect(store.transferCount, 1);
      expect(store.sourceBytes, 1);
      lease.release();
      expect((await lease.ready).failure!.kind, ImageFailureKind.cancelled);
      request.cancelGate!.complete();
      await drain();
      expect(store.transferCount, 0);
      expect(store.sourceBytes, 0);
      store.close();
      expect(clock.pending, 0);
    },
  );

  test(
    'inactive completed transfer waits before descriptor or codec creation',
    () async {
      final request = Transfer(knownLength: 1);
      var inspections = 0;
      final store = RasterImageStore(
        outputBudget: ResourceBudget(limitBytes: 256 * mib),
        retirement: ResourceRetirement(),
        transferFactory: (_) => request,
        inspect: (_) async {
          inspections++;
          return Descriptor(1, 1, image);
        },
      );
      final lease = store.acquire(source('inactive'));
      await drain();
      store.setActive(false);
      request.finish([1]);
      await drain();
      expect(inspections, 0);
      expect(store.sourceBytes, 1);
      store.setActive(true);
      expect((await lease.ready).image, isNotNull);
      expect(inspections, 1);
      lease.release();
      store.close();
      store.retirement.flush();
    },
  );

  test('descriptor axes and pixels are rejected before any codec', () async {
    for (final dimensions in [(8193, 1), (4097, 4096), (0, 1)]) {
      final descriptor = Descriptor(dimensions.$1, dimensions.$2, image);
      final store = RasterImageStore(
        outputBudget: ResourceBudget(limitBytes: 256 * mib),
        retirement: ResourceRetirement(),
        assetLoader: (_, _) async => Uint8List.fromList([1]),
        inspect: (_) async => descriptor,
      );
      final lease = store.acquire(
        RasterImageSource(identity: dimensions, assetKey: 'bad'),
      );
      expect((await lease.ready).failure!.kind, ImageFailureKind.dimensions);
      expect(descriptor.decodes, 0);
      expect(descriptor.disposed, isTrue);
      expect(store.sourceBytes, 0);
      expect(store.preparingBytes, 0);
      lease.release();
      store.close();
    }
  });

  test(
    'native compressed copy stays inside 64 MiB while inspection is uncancellable',
    () async {
      final inspection = Completer<RasterImageDescriptor>(),
          request = Transfer();
      var inspectionBytes = 0;
      final store = RasterImageStore(
        outputBudget: ResourceBudget(limitBytes: 256 * mib),
        retirement: ResourceRetirement(),
        transferFactory: (_) => request,
        inspect: (bytes) {
          inspectionBytes = bytes.length;
          return inspection.future;
        },
      );
      final lease = store.acquire(source('copy'));
      request.finish(List.filled(10, 1));
      await drain();
      expect(inspectionBytes, 10);
      expect(store.sourceBytes, 20);
      store.close();
      lease.release();
      expect(store.sourceBytes, 20);
      final descriptor = Descriptor(1, 1, image);
      inspection.complete(descriptor);
      await drain();
      expect(descriptor.disposed, isTrue);
      expect(descriptor.decodes, 0);
      expect(store.sourceBytes, 0);
      expect(store.inspectingCount, 0);
    },
  );

  test(
    'decode FIFO max2 reserves 128 MiB pixels and both failures release exact charges',
    () async {
      final gates = <Completer<ui.Image>>[],
          starts = <int>[],
          descriptors = <Descriptor>[];
      final output = ResourceBudget(limitBytes: 256 * mib);
      final store = RasterImageStore(
        outputBudget: output,
        retirement: ResourceRetirement(),
        assetLoader: (_, _) async => Uint8List.fromList([1]),
        inspect: (_) async {
          final index = descriptors.length, gate = Completer<ui.Image>();
          gates.add(gate);
          final descriptor = Descriptor(4096, 4096, () {
            starts.add(index);
            return gate.future;
          });
          descriptors.add(descriptor);
          return descriptor;
        },
      );
      final leases = [
        for (var i = 0; i < 3; i++)
          store.acquire(RasterImageSource(identity: i, assetKey: '$i')),
      ];
      await drain();
      expect(starts, [0, 1]);
      expect(store.decodingCount, 2);
      expect(store.preparingBytes, 128 * mib);
      expect(output.reservedBytes, 128 * mib);
      expect(store.sourceBytes, 3);
      gates[0].completeError(Exception('decode0'));
      await drain();
      expect(starts, [0, 1, 2]);
      expect(store.decodingCount, 2);
      gates[1].completeError(Exception('decode1'));
      gates[2].completeError(Exception('decode2'));
      for (final lease in leases) {
        expect((await lease.ready).failure!.kind, ImageFailureKind.decode);
        lease.release();
      }
      expect(store.preparingBytes, 0);
      expect(output.chargedBytes, 0);
      expect(store.sourceBytes, 0);
      expect(descriptors.every((value) => value.disposed), isTrue);
      store.close();
    },
  );

  test(
    'output capacity settles failure without waiting for live or retiring images',
    () async {
      final output = ResourceBudget(limitBytes: 4),
          retirement = ResourceRetirement();
      final store = RasterImageStore(
        outputBudget: output,
        retirement: retirement,
        assetLoader: (_, _) async => Uint8List.fromList([1]),
        inspect: (_) async => Descriptor(1, 1, image),
      );
      final first = store.acquire(
        RasterImageSource(identity: 1, assetKey: 'one'),
      );
      final firstImage = (await first.ready).image!;
      final second = store.acquire(
        RasterImageSource(identity: 2, assetKey: 'two'),
      );
      expect((await second.ready).failure!.kind, ImageFailureKind.outputBudget);
      expect(store.queuedDecodes, 0);
      expect(store.decodingCount, 0);
      first.release();
      store.retryDenied();
      expect(output.retiringBytes, 4);
      expect(store.decodingCount, 0);
      retirement.flush();
      expect(firstImage.debugDisposed, isTrue);
      store.retryDenied();
      expect(second.image, isNull);
      expect(store.retryFailed(2), isTrue);
      expect((await second.ready).image, isNotNull);
      second.release();
      store.close();
      retirement.flush();
      expect(output.chargedBytes, 0);
    },
  );

  test(
    'late codec result after close is disposed without early reservation release',
    () async {
      final gate = Completer<ui.Image>(),
          output = ResourceBudget(limitBytes: 256 * mib),
          retirement = ResourceRetirement();
      final descriptor = Descriptor(1, 1, () => gate.future);
      final store = RasterImageStore(
        outputBudget: output,
        retirement: retirement,
        assetLoader: (_, _) async => Uint8List.fromList([1]),
        inspect: (_) async => descriptor,
      );
      final lease = store.acquire(
        RasterImageSource(identity: 1, assetKey: 'late'),
      );
      await drain();
      store.close();
      lease.release();
      expect(store.decodingCount, 1);
      expect(output.reservedBytes, 4);
      expect(store.preparingBytes, 4);
      expect(store.sourceBytes, 1);
      expect(() => store.acquire(source('closed')), throwsStateError);
      output.close();
      final value = await image();
      gate.complete(value);
      await drain();
      expect(value.debugDisposed, isTrue);
      expect(descriptor.disposed, isTrue);
      expect(store.decodingCount, 0);
      expect(output.chargedBytes, 0);
      expect(store.preparingBytes, 0);
      expect(store.sourceBytes, 0);
      expect(retirement.pendingCount, 0);
    },
  );

  test(
    'callback failure preserves valid image and detached loader options',
    () async {
      final headers = <String, Object?>{'Authorization': 'first'},
          options = <String, Object?>{'headers': headers};
      final spec = RasterImageSource(
        identity: 'detached',
        assetKey: 'asset',
        loaderOptions: options,
      );
      headers['Authorization'] = 'changed';
      expect((spec.loaderOptions['headers'] as Map)['Authorization'], 'first');
      expect(
        () => (spec.loaderOptions['headers'] as Map)['new'] = 'bad',
        throwsUnsupportedError,
      );
      final store = RasterImageStore(
        outputBudget: ResourceBudget(limitBytes: 256 * mib),
        retirement: ResourceRetirement(),
        assetLoader: (_, _) async => Uint8List.fromList([1]),
        inspect: (_) async => Descriptor(1, 1, image),
        onChanged: (_) => throw StateError('callback'),
      );
      final lease = store.acquire(spec);
      expect((await lease.ready).image, isNotNull);
      expect(lease.failure, isNull);
      expect(store.lastNotificationError, isStateError);
      lease.release();
      store.close();
      store.retirement.flush();
    },
  );
}
