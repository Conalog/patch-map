import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/resources/images/image_decode.dart';
import 'package:conalog_patch_map/src/resources/images/image_source.dart';
import 'package:conalog_patch_map/src/resources/images/image_source_store.dart';
import 'package:conalog_patch_map/src/resources/images/image_store.dart';
import 'package:conalog_patch_map/src/resources/images/image_transport.dart';
import 'package:conalog_patch_map/src/resources/resource_budget.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> _drain() async {
  for (var i = 0; i < 30; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

RasterImageSource _url(Object key) => RasterImageSource(
  identity: key,
  canonicalUri: Uri.parse('https://example.test/$key'),
);

final class _Transfer implements ImageTransfer {
  _Transfer(this.contentLength);
  final int? contentLength;
  final stream = StreamController<List<int>>();
  @override
  Future<ImageTransferResponse> get response async =>
      ImageTransferResponse(bytes: stream.stream, contentLength: contentLength);
  @override
  Future<void> cancel() async {}
}

final class _Descriptor implements RasterImageDescriptor {
  _Descriptor(this.result);
  final Completer<ui.Image> result;
  bool disposed = false;
  @override
  int get width => 1;
  @override
  int get height => 1;
  @override
  Future<ui.Image> decode() => result.future;
  @override
  void dispose() {
    disposed = true;
  }
}

Future<ui.Image> _image() async {
  final recorder = ui.PictureRecorder();
  ui.Canvas(recorder);
  final picture = recorder.endRecording();
  try {
    return await picture.toImage(1, 1);
  } finally {
    picture.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'space callback can close during header shrink without starting a stranded body reader',
    () async {
      final transfer = _Transfer(1);
      late final ImageSourceStore sources;
      sources = ImageSourceStore(
        transferFactory: (_) => transfer,
        onSpaceAvailable: () => sources.close(),
      );
      final lease = sources.acquireSourceBytes(_url('reentrant-close'));
      expect((await lease.ready).failure!.kind, ImageFailureKind.closed);
      await _drain();
      expect(sources.transferCount, 0);
      expect(sources.sourceBytes, 0);
      expect(sources.bufferedSourceBytes, 0);
      lease.release();
      expect(sources.referenceCount, 0);
    },
  );
  test(
    'SVG percent and binary base64 data URI use shared bounded byte admission',
    () async {
      final sources = ImageSourceStore();
      for (final (uri, expected) in [
        (
          'data:image/svg+xml,%3Csvg%20id=%22a%22/%3E',
          utf8.encode('<svg id="a"/>'),
        ),
        ('data:image/png;base64,AP8BAg==', [0, 255, 1, 2]),
      ]) {
        final lease = sources.acquireSourceBytes(
          RasterImageSource(identity: uri, canonicalUri: Uri.parse(uri)),
        );
        expect((await lease.ready).bytes, expected);
        expect(sources.sourceBytes, expected.length);
        lease.release();
        expect(sources.sourceBytes, 0);
      }
      sources.close();
    },
  );
  test(
    'over-limit data URI is rejected before decoded buffer allocation',
    () async {
      final sources = ImageSourceStore();
      final uri = Uri.parse(
        'data:image/svg+xml,${'a' * (20 * 1024 * 1024 + 1)}',
      );
      final lease = sources.acquireSourceBytes(
        RasterImageSource(identity: 'large-data', canonicalUri: uri),
      );
      expect(
        (await lease.ready).failure!.kind,
        ImageFailureKind.sourceTooLarge,
      );
      expect(sources.sourceBytes, 0);
      expect(sources.bufferedSourceBytes, 0);
      lease.release();
      sources.close();
    },
  );
  test(
    'SVG raw bytes and raster share one source, then own independent native lifetime',
    () async {
      var loads = 0;
      final sources = ImageSourceStore(
        assetLoader: (_, _) async {
          loads++;
          return Uint8List.fromList([1, 2, 3]);
        },
      );
      final inspect = Completer<RasterImageDescriptor>(),
          decode = Completer<ui.Image>(),
          output = ResourceBudget(limitBytes: 256 * 1024 * 1024);
      final retirement = ResourceRetirement();
      final raster = RasterImageStore(
        sources: sources,
        outputBudget: output,
        retirement: retirement,
        inspect: (_) => inspect.future,
      );
      sources.onSpaceAvailable = raster.retryDenied;
      final spec = RasterImageSource(identity: 'same', assetKey: 'shared');
      final svg = sources.acquireSourceBytes(spec),
          image = raster.acquire(spec);
      final bytes = (await svg.ready).bytes!;
      expect(bytes, [1, 2, 3]);
      await _drain();
      expect(loads, 1);
      expect(sources.referenceCount, 2);
      expect(sources.sourceBytes, 6);
      final descriptor = _Descriptor(decode);
      inspect.complete(descriptor);
      await _drain();
      expect(sources.referenceCount, 1);
      expect(sources.sourceBytes, 6);
      svg.release();
      expect(sources.sourceBytes, 3);
      // Closing the raster consumer does not close the shared SVG/byte owner.
      raster.close();
      image.release();
      expect(sources.isClosed, isFalse);
      expect(output.reservedBytes, 4);
      final value = await _image();
      decode.complete(value);
      await _drain();
      expect(value.debugDisposed, isTrue);
      expect(descriptor.disposed, isTrue);
      expect(sources.sourceBytes, 0);
      expect(output.chargedBytes, 0);
      sources.close();
      expect(sources.referenceCount, 0);
    },
  );

  test(
    'closing source owner preserves ready byte charge until every borrowed lease releases',
    () async {
      final sources = ImageSourceStore(
        assetLoader: (_, _) async => Uint8List.fromList([1, 2, 3]),
      );
      final first = sources.acquireSourceBytes(
            RasterImageSource(identity: 'closed', assetKey: 'one'),
          ),
          second = first.retain();
      final bytes = (await first.ready).bytes!;
      expect(() => bytes[0] = 7, throwsUnsupportedError);
      expect(sources.sourceBytes, 3);
      sources.close();
      expect(sources.sourceBytes, 3);
      expect(() => sources.acquireSourceBytes(_url('new')), throwsStateError);
      expect((await second.ready).failure!.kind, ImageFailureKind.closed);
      first.release();
      expect(sources.sourceBytes, 3);
      second.release();
      expect(second.release(), isFalse);
      expect(sources.sourceBytes, 0);
      expect(sources.entryCount, 0);
      expect(sources.referenceCount, 0);
    },
  );

  test(
    'unknown length coalesces tiny chunks into pages and flattens exact bytes under the copy budget',
    () async {
      const pageBytes = 64 * 1024;
      final transfer = _Transfer(null);
      final sources = ImageSourceStore(transferFactory: (_) => transfer);
      final lease = sources.acquireSourceBytes(_url('chunks'));
      final copies = [
        sources.tryReserveCopy(20 * 1024 * 1024)!,
        sources.tryReserveCopy(20 * 1024 * 1024)!,
        sources.tryReserveCopy(4 * 1024 * 1024)!,
      ];
      await _drain();
      transfer.stream.add(const []);
      await _drain();
      expect(sources.bufferedSourceBytes, 0);

      final expected = List.generate(pageBytes + 2, (index) => index % 251);
      for (var index = 0; index < pageBytes - 1; index++) {
        if (index % 16 == 0) transfer.stream.add(const []);
        transfer.stream.add([expected[index]]);
      }
      await _drain();
      expect(sources.bufferedSourceBytes, pageBytes);
      transfer.stream.add(expected.sublist(pageBytes - 1));
      await transfer.stream.close();
      await _drain();
      expect(sources.transferCount, 0);
      expect(sources.sourceBytes, 64 * 1024 * 1024);
      expect(sources.bufferedSourceBytes, 2 * pageBytes);
      expect(lease.bytes, isNull);

      for (final copy in copies.reversed) {
        copy.release();
      }
      expect((await lease.ready).bytes, expected);
      expect(sources.sourceBytes, expected.length);
      expect(sources.payloadBytes, expected.length);
      expect(sources.bufferedSourceBytes, expected.length);
      lease.release();
      sources.close();
      expect(sources.sourceBytes, 0);
      expect(sources.bufferedSourceBytes, 0);
    },
  );

  test(
    'cancelling an unknown body drops its partial page on settlement',
    () async {
      final transfer = _Transfer(null);
      final sources = ImageSourceStore(transferFactory: (_) => transfer);
      final lease = sources.acquireSourceBytes(_url('cancelled-chunks'));
      transfer.stream.add([1]);
      await _drain();
      expect(sources.bufferedSourceBytes, 64 * 1024);
      lease.release();
      expect((await lease.ready).failure!.kind, ImageFailureKind.cancelled);
      await _drain();
      expect(sources.sourceBytes, 0);
      expect(sources.bufferedSourceBytes, 0);
      expect(sources.transferCount, 0);
      await transfer.stream.close();
      sources.close();
    },
  );

  test(
    'source length over limit fails before body, and truncated body is typed failure',
    () async {
      for (final length in [20 * 1024 * 1024 + 1, 2]) {
        final transfer = _Transfer(length);
        final sources = ImageSourceStore(transferFactory: (_) => transfer);
        final lease = sources.acquireSourceBytes(
          _url(length),
          initialLoad: false,
        );
        if (length == 2) {
          transfer.stream.add([1]);
          unawaited(transfer.stream.close());
        }
        final failure = (await lease.ready).failure!;
        expect(
          failure.kind,
          length == 2
              ? ImageFailureKind.transport
              : ImageFailureKind.sourceTooLarge,
        );
        expect(sources.sourceBytes, 0);
        expect(sources.transferCount, 0);
        lease.release();
        sources.close();
      }
    },
  );

  test(
    'copy charges share the exact 64 MiB source budget and survive close until actual release',
    () async {
      final sources = ImageSourceStore();
      final first = sources.tryReserveCopy(20 * 1024 * 1024)!,
          second = sources.tryReserveCopy(20 * 1024 * 1024)!,
          third = sources.tryReserveCopy(20 * 1024 * 1024)!;
      expect(sources.tryReserveCopy(5 * 1024 * 1024), isNull);
      final fourth = sources.tryReserveCopy(4 * 1024 * 1024)!;
      expect(sources.sourceBytes, 64 * 1024 * 1024);
      sources.close();
      expect(sources.sourceBytes, 64 * 1024 * 1024);
      for (final lease in [first, second, third, fourth]) {
        lease.release();
      }
      expect(sources.sourceBytes, 0);
      expect(sources.tryReserveCopy(1), isNull);
    },
  );

  test(
    'native corrupt source and repeated asset failures clean both source and native-copy charges',
    () async {
      var loads = 0;
      final sources = ImageSourceStore(
        assetLoader: (_, _) async {
          loads++;
          if (loads <= 2) throw StateError('asset unavailable');
          return Uint8List.fromList([1, 2, 3]);
        },
      );
      final output = ResourceBudget(limitBytes: 256 * 1024 * 1024),
          retirement = ResourceRetirement();
      final raster = RasterImageStore(
        sources: sources,
        outputBudget: output,
        retirement: retirement,
      );
      sources.onSpaceAvailable = raster.retryDenied;
      final lease = raster.acquire(
        RasterImageSource(identity: 'corrupt', assetKey: 'corrupt'),
      );
      expect((await lease.ready).failure!.kind, ImageFailureKind.transport);
      expect(raster.retryFailed('corrupt'), isTrue);
      expect((await lease.ready).failure!.kind, ImageFailureKind.transport);
      expect(raster.retryFailed('corrupt'), isTrue);
      expect((await lease.ready).failure!.kind, ImageFailureKind.decode);
      expect(sources.sourceBytes, 0);
      expect(output.chargedBytes, 0);
      expect(raster.preparingBytes, 0);
      expect(loads, 3);
      lease.release();
      raster.close();
      sources.close();
      retirement.close();
    },
  );
}
