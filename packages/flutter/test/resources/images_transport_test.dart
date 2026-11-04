import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/resources/images/image_source.dart';
import 'package:conalog_patch_map/src/resources/images/image_source_store.dart';
import 'package:conalog_patch_map/src/resources/images/image_store.dart';
import 'package:conalog_patch_map/src/resources/images/image_transport.dart';
import 'package:conalog_patch_map/src/resources/resource_budget.dart';
import 'package:flutter_test/flutter_test.dart';

final class _LoopbackHttp extends HttpOverrides {}

Future<void> _until(bool Function() predicate) async {
  final watch = Stopwatch()..start();
  while (!predicate()) {
    if (watch.elapsed > const Duration(seconds: 3)) {
      throw StateError('Loopback operation did not settle');
    }
    await Future<void>.delayed(const Duration(milliseconds: 2));
  }
}

Future<Uint8List> _png() async {
  final recorder = ui.PictureRecorder();
  ui.Canvas(recorder).drawRect(
    const ui.Rect.fromLTWH(0, 0, 2, 3),
    ui.Paint()..color = const ui.Color(0xffff0000),
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(2, 3);
  picture.dispose();
  try {
    return (await image.toByteData(
      format: ui.ImageByteFormat.png,
    ))!.buffer.asUint8List();
  } finally {
    image.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'real loopback 503/500 retries then native PNG succeeds with owned HTTP teardown',
    () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final bytes = await _png(),
            server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        var requests = 0;
        final auth = <String?>[], delays = <int>[];
        final subscription = server.listen((request) async {
          requests++;
          auth.add(request.headers.value('x-test'));
          request.response.statusCode = requests == 1
              ? 503
              : requests == 2
              ? 500
              : 200;
          if (requests == 3) {
            request.response.contentLength = bytes.length;
            request.response.add(bytes);
          }
          await request.response.close();
        });
        final retirement = ResourceRetirement(),
            output = ResourceBudget(limitBytes: 256 * 1024 * 1024);
        final store = RasterImageStore(
          outputBudget: output,
          retirement: retirement,
          schedule: (delay, action) {
            delays.add(delay.inMilliseconds);
            final timer = Timer(
              delay.inSeconds == 20 ? delay : Duration.zero,
              action,
            );
            return timer.cancel;
          },
        );
        final lease = store.acquire(
          RasterImageSource(
            identity: 'loopback',
            canonicalUri: Uri.parse('http://127.0.0.1:${server.port}/image'),
            loaderOptions: const {
              'headers': {'x-test': 'native'},
            },
          ),
        );
        try {
          final result = await lease.ready;
          expect(result.failure, isNull);
          expect(result.image!.width, 2);
          expect(requests, 3);
          expect(auth, ['native', 'native', 'native']);
          expect(delays, [20000, 500, 20000, 1000, 20000]);
          expect(store.sourceBytes, 0);
          expect(store.transferCount, 0);
        } finally {
          lease.release();
          store.close();
          retirement.close();
          await subscription.cancel();
          await server.close(force: true);
        }
        expect(output.chargedBytes, 0);
      }, _LoopbackHttp());
    },
  );

  test(
    'real loopback deadline force-closes an active chunked response while inactive',
    () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        final responses = <HttpResponse>[];
        final subscription = server.listen((request) async {
          responses.add(request.response);
          request.response.bufferOutput = false;
          request.response.add([1, 2, 3]);
          try {
            await request.response.flush();
          } catch (_) {
            /* abort is expected */
          }
        });
        void Function()? deadline;
        final store = RasterImageStore(
          outputBudget: ResourceBudget(limitBytes: 256 * 1024 * 1024),
          retirement: ResourceRetirement(),
          schedule: (delay, action) {
            if (delay == ImageSourceStore.attemptDeadline) deadline = action;
            return () {};
          },
        );
        final lease = store.acquire(
          RasterImageSource(
            identity: 'deadline',
            canonicalUri: Uri.parse('http://127.0.0.1:${server.port}/slow'),
          ),
          initialLoad: false,
        );
        try {
          await _until(() => store.bufferedSourceBytes >= 3);
          store.setActive(false);
          deadline!();
          final result = await lease.ready;
          expect(result.failure!.kind, ImageFailureKind.deadline);
          expect(store.transferCount, 0);
          expect(store.sourceBytes, 0);
          expect(store.bufferedSourceBytes, 0);
          expect(responses.length, 1);
        } finally {
          lease.release();
          store.close();
          for (final response in responses) {
            unawaited(response.close().catchError((Object _) => response));
          }
          await subscription.cancel();
          await server.close(force: true);
        }
      }, _LoopbackHttp());
    },
  );

  test('real loopback permanent HTTP status has no automatic retry', () async {
    await HttpOverrides.runWithHttpOverrides(() async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      var requests = 0;
      final subscription = server.listen((request) async {
        requests++;
        request.response.statusCode = 404;
        await request.response.close();
      });
      final store = RasterImageStore(
        outputBudget: ResourceBudget(limitBytes: 256 * 1024 * 1024),
        retirement: ResourceRetirement(),
      );
      final lease = store.acquire(
        RasterImageSource(
          identity: 'missing',
          canonicalUri: Uri.parse('http://127.0.0.1:${server.port}/404'),
        ),
      );
      try {
        final failure = (await lease.ready).failure!;
        expect(failure.kind, ImageFailureKind.httpStatus);
        expect(failure.statusCode, 404);
        expect(failure.transient, isFalse);
        expect(requests, 1);
        expect(store.transferCount, 0);
        expect(store.sourceBytes, 0);
      } finally {
        lease.release();
        store.close();
        await subscription.cancel();
        await server.close(force: true);
      }
    }, _LoopbackHttp());
  });

  test(
    'transport cancellation before headers really stops the HTTP request',
    () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        final received = Completer<HttpRequest>();
        final subscription = server.listen(received.complete);
        final transfer = imageTransferFactory()(
          RasterImageSource(
            identity: 'headers',
            canonicalUri: Uri.parse('http://127.0.0.1:${server.port}/headers'),
          ),
        );
        final responseSettled = transfer.response.then<Object>(
          (_) => 'unexpected response',
          onError: (Object error) => error,
        );
        try {
          await received.future;
          await transfer.cancel();
          expect(await responseSettled, isA<HttpException>());
        } finally {
          await subscription.cancel();
          await server.close(force: true);
        }
      }, _LoopbackHttp());
    },
  );
}
