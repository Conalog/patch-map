import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/src/api/values.dart';
import 'package:patch_map/src/engine/ports.dart';
import 'package:patch_map/src/host/native_assets.dart';
import 'package:patch_map/src/model/dataset.dart';
import 'package:patch_map/src/semantic/geometry/geometry.dart';

class RealHttpOverrides extends HttpOverrides {}

Matcher code(String value) =>
    isA<PatchMapException>().having((error) => error.code, 'code', value);
PatchMapRenderSnapshot scene(
  Object? source, {
  bool show = true,
  List<JsonMap>? data,
  Map<String, JsonMap> overlays = const {},
}) {
  final dataset = PatchMapDataset.parse(
    data ??
        (source == null
            ? []
            : [
                {
                  'id': 'image',
                  'type': 'image',
                  'show': show,
                  'source': source,
                  'size': 32,
                },
              ]),
  );
  return PatchMapRenderSnapshot(
    dataset: dataset,
    geometry: buildGeometry(dataset, overlays: overlays),
    theme: const {},
    selectionPolicy: const {},
    projectionRevision: 1,
    overlays: overlays,
    selectedIds: const [],
    viewport: const PatchMapRenderViewport(
      centerX: 0,
      centerY: 0,
      scale: 1,
      width: 320,
      height: 200,
      pixelRatio: 1,
      rotation: 0,
    ),
    revisions: const PatchMapRevisionTuple(1, 0, 0),
    presentationAlpha: const {},
  );
}

NativeAssetSession mockSession({
  PatchMapAssetRuntime? runtime,
  JsonMap? policy,
  NativeAssetReader? reader,
  NativeAssetDecoder? decoder,
}) => NativeAssetSession(
  runtime: runtime ?? PatchMapAssetRuntime(),
  policy: policy,
  fontInitializer: () async {},
  reader: reader ?? (_) async => ('image/png', Uint8List(4)),
  decoder: decoder ?? (_, __, ___) async => NativeAsset(width: 16, height: 16),
);
Future<void> settle() => Future<void>.delayed(Duration.zero);
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'registration normalizes trimmed descriptors and treats duplicates atomically',
    () async {
      final session = mockSession();
      final result = session.register([
        {
          'alias': ' A ',
          'descriptor': {
            'src': ' https://example.test/a.png ',
            'data': {'b': 2, 'a': 1},
          },
        },
        {
          'alias': 'A',
          'descriptor': {
            'data': {'a': 1, 'b': 2},
            'src': 'https://example.test/a.png',
          },
        },
      ]);
      expect(result.toJson(), {
        'registeredAliases': ['A'],
        'duplicateAliases': ['A'],
      });
      expect(session.sourceKey(' A '), session.sourceKey('A'));
      expect(
        () => session.register([
          {'alias': 'B', 'descriptor': 'b'},
          {'alias': 'A', 'descriptor': 'different'},
        ]),
        throwsA(code('CONFLICT')),
      );
      expect(
        session.register([
          {'alias': 'B', 'descriptor': 'b'},
        ]).toJson(),
        {
          'registeredAliases': ['B'],
          'duplicateAliases': [],
        },
      );
      expect(
        () => session.register([
          {'alias': 'x', 'descriptor': 'x'},
          {'alias': 'x', 'descriptor': 'y'},
        ]),
        throwsA(code('CONFLICT')),
      );
      await session.dispose();
    },
  );
  test(
    'asset aliases live in the shared runtime and immutable builtins cannot be replaced',
    () async {
      final runtime = PatchMapAssetRuntime(),
          a = mockSession(runtime: PatchMapAssetRuntime());
      final one = mockSession(runtime: runtime),
          two = mockSession(runtime: runtime);
      one.register([
        {'alias': 'custom', 'descriptor': 'https://example.test/a.png'},
      ]);
      expect(
        two.register([
          {
            'alias': 'custom',
            'descriptor': {'src': 'https://example.test/a.png'},
          },
        ]).toJson()['duplicateAliases'],
        ['custom'],
      );
      expect(one.sourceKey('custom'), two.sourceKey('custom'));
      expect(
        () => two.register([
          {'alias': 'object', 'descriptor': 'https://example.test/o.png'},
        ]),
        throwsA(code('CONFLICT')),
      );
      expect(runtime.probe()['aliasCount'], 14);
      expect(runtime.probe()['fonts'], {
        'weights': [300, 400, 500, 600, 700],
      });
      await one.dispose();
      await two.dispose();
      await a.dispose();
    },
  );
  test(
    'registration rejects invalid descriptor fields and fractional policy; null kind defaults to image',
    () async {
      final session = mockSession();
      for (final descriptor in [
        {'src': 'a', 'unknown': 1},
        {'src': 'a', 'data': []},
        {'src': 'a', 'parser': ''},
      ]) {
        expect(
          () => session.register([
            {'alias': 'bad', 'descriptor': descriptor},
          ]),
          throwsA(code('INVALID_VALUE')),
        );
      }
      expect(
        session.register([
          {'alias': 'null-kind', 'descriptor': 'x', 'kind': null},
        ]).toJson()['registeredAliases'],
        ['null-kind'],
      );
      expect(
        () => session.register([
          {'alias': 'bad', 'descriptor': 'x', 'fontWeight': 1.5},
        ]),
        throwsA(code('INVALID_VALUE')),
      );
      expect(
        () => mockSession(policy: {'maxEncodedBytes': 1.5}),
        throwsA(code('INVALID_VALUE')),
      );
      expect(
        () => mockSession(policy: {'maxDecodedWidth': double.infinity}),
        throwsA(code('INVALID_VALUE')),
      );
      await session.dispose();
    },
  );
  test(
    'each session admits bytes before shared decode and releases only its own lease',
    () async {
      final runtime = PatchMapAssetRuntime();
      var reads = 0, decodes = 0, disposals = 0;
      Future<(String, Uint8List)> read(Object _) async {
        reads++;
        return ('image/png', Uint8List(8));
      }

      Future<NativeAsset> decode(String _, Uint8List __, Object ___) async {
        decodes++;
        return NativeAsset(width: 16, height: 16, onDispose: () => disposals++);
      }

      final a = mockSession(runtime: runtime, reader: read, decoder: decode),
          b = mockSession(runtime: runtime, reader: read, decoder: decode);
      await Future.wait([
        a.ensure('https://example.test/a'),
        b.ensure('https://example.test/a'),
      ]);
      expect(reads, 2);
      expect(decodes, 1);
      expect(runtime.probe()['leaseCount'], 2);
      final strict = mockSession(
        runtime: runtime,
        policy: {'maxEncodedBytes': 4},
        reader: read,
        decoder: decode,
      );
      await expectLater(
        strict.ensure('https://example.test/a'),
        throwsA(code('ASSET_POLICY_REJECTED')),
      );
      expect(reads, 3);
      expect(decodes, 1);
      await a.dispose();
      await settle();
      expect(disposals, 0);
      await b.dispose();
      await strict.dispose();
      await settle();
      expect(disposals, 1);
      expect(runtime.probe()['resourceCount'], 0);
    },
  );
  test(
    'shared host resources isolate different decoded-size policies',
    () async {
      final runtime = PatchMapAssetRuntime();
      var decodes = 0;
      Future<NativeAsset> decode(String _, Uint8List __, Object ___) async {
        decodes++;
        return NativeAsset(width: 16, height: 16);
      }

      final strict = mockSession(
        runtime: runtime,
        policy: {'maxDecodedWidth': 8},
        decoder: decode,
      );
      final normal = mockSession(runtime: runtime, decoder: decode);
      final failure = expectLater(
        strict.ensure('https://example.test/policy'),
        throwsA(code('ASSET_POLICY_REJECTED')),
      );
      final image = await normal.ensure('https://example.test/policy');
      await failure;
      expect(image.width, 16);
      expect(decodes, 2);
      expect(runtime.probe()['leaseCount'], 1);
      await strict.dispose();
      await normal.dispose();
      expect(runtime.probe()['resourceCount'], 0);
    },
  );
  test(
    'invalid native image and SFNT bytes reject readiness with decode errors',
    () async {
      for (final mime in ['image/png', 'font/ttf']) {
        final session = NativeAssetSession(
          fontInitializer: () async {},
          reader: (_) async => (mime, Uint8List(20)),
        );
        await expectLater(
          session.ensure('https://example.test/invalid'),
          throwsA(code('ASSET_DECODE_FAILED')),
        );
        expect(session.runtime.probe()['resourceCount'], 0);
        await session.dispose();
      }
    },
  );
  test(
    'replacement preserves old texture, supersedes late completion and frees removed bindings',
    () async {
      final pending = <String, Completer<NativeAsset>>{}, disposed = <String>[];
      final session = mockSession(
        decoder: (_, __, source) {
          final src = (source as Map)['src'] as String;
          if (src == 'a')
            return Future.value(
              NativeAsset(
                width: 10,
                height: 10,
                onDispose: () => disposed.add(src),
              ),
            );
          return (pending[src] ??= Completer<NativeAsset>()).future;
        },
      );
      await session.ready(scene('a'));
      final a = session.lookup('a', 'image\u0000');
      expect(a, isNotNull);
      final b = session.ready(scene('b'));
      final bError = expectLater(b, throwsA(code('CANCELLED')));
      await settle();
      expect(session.lookup('b', 'image\u0000'), same(a));
      final c = session.ready(scene('c'));
      await settle();
      pending['c']!.complete(
        NativeAsset(width: 30, height: 30, onDispose: () => disposed.add('c')),
      );
      await c;
      await bError;
      await settle();
      expect(session.lookup('c', 'image\u0000')!.width, 30);
      expect(disposed, ['a']);
      pending['b']!.complete(
        NativeAsset(width: 20, height: 20, onDispose: () => disposed.add('b')),
      );
      await settle();
      expect(session.lookup('c', 'image\u0000')!.width, 30);
      expect(disposed, ['a', 'b']);
      await session.ready(scene(null));
      await settle();
      expect(disposed, ['a', 'b', 'c']);
      expect(session.status()['session']['resolved'], 0);
      await session.dispose();
      expect(session.runtime.probe()['resourceCount'], 0);
    },
  );
  test(
    'capture and host readiness join the same visible binding generation',
    () async {
      final decode = Completer<NativeAsset>();
      var decodes = 0;
      final session = mockSession(
        decoder: (_, __, ___) {
          decodes++;
          return decode.future;
        },
      );
      final snapshot = scene('same');
      final host = session.ready(snapshot), capture = session.ready(snapshot);
      await settle();
      decode.complete(NativeAsset(width: 10, height: 10));
      await Future.wait([host, capture]);
      expect(decodes, 1);
      await session.dispose();
    },
  );
  test(
    'failed replacement keeps the previous resolved binding and can retry',
    () async {
      var reject = true, disposals = 0;
      final session = mockSession(
        decoder: (_, __, source) async {
          if ((source as Map)['src'] == 'bad' && reject)
            throw const PatchMapException('ASSET_DECODE_FAILED', 'bad');
          return NativeAsset(
            width: 10,
            height: 10,
            onDispose: () => disposals++,
          );
        },
      );
      await session.ready(scene('good'));
      final previous = session.lookup('good', 'image\u0000');
      await expectLater(
        session.ready(scene('bad')),
        throwsA(code('ASSET_DECODE_FAILED')),
      );
      expect(session.lookup('bad', 'image\u0000'), same(previous));
      expect(disposals, 0);
      reject = false;
      await session.ready(scene('bad'));
      await settle();
      expect(disposals, 1);
      await session.dispose();
      await settle();
      expect(disposals, 2);
    },
  );
  test(
    'destroy settles pending requests immediately and late decode cannot reattach',
    () async {
      final decode = Completer<NativeAsset>();
      var disposals = 0;
      final session = mockSession(decoder: (_, __, ___) => decode.future);
      final pending = session.ensure('a');
      final expectation = expectLater(pending, throwsA(code('CANCELLED')));
      await settle();
      await session.dispose();
      await expectation;
      decode.complete(
        NativeAsset(width: 1, height: 1, onDispose: () => disposals++),
      );
      await settle();
      expect(disposals, 1);
      expect(session.runtime.probe()['leaseCount'], 0);
      expect(session.status()['session'], null);
      expect(session.status()['runtime']['pendingCount'], 0);
    },
  );
  test(
    'hidden owners, components and inactive grid templates do not block visible readiness',
    () async {
      final loaded = <String>[];
      final session = mockSession(
        reader: (source) async {
          loaded.add((source as Map)['src'] as String);
          return ('image/png', Uint8List(1));
        },
      );
      await session.ready(
        scene(
          null,
          data: [
            {
              'type': 'group',
              'id': 'hidden-group',
              'show': false,
              'children': [
                {
                  'type': 'image',
                  'id': 'hidden',
                  'source': 'hidden',
                  'size': 20,
                },
              ],
            },
            {
              'type': 'item',
              'id': 'item',
              'size': 20,
              'components': [
                {
                  'type': 'icon',
                  'id': 'off',
                  'show': false,
                  'source': 'off',
                  'size': 10,
                },
                {'type': 'icon', 'id': 'on', 'source': 'on', 'size': 10},
              ],
            },
            {
              'type': 'grid',
              'id': 'grid',
              'cells': [
                [0],
              ],
              'item': {
                'size': 20,
                'components': [
                  {
                    'type': 'icon',
                    'id': 'grid-icon',
                    'source': 'grid-hidden',
                    'size': 10,
                  },
                ],
              },
            },
          ],
        ),
      );
      expect(loaded, ['on']);
      await session.dispose();
    },
  );
  test(
    'concrete component source overlay alone determines admitted source',
    () async {
      final loaded = <String>[];
      final session = mockSession(
        reader: (source) async {
          loaded.add((source as Map)['src'] as String);
          return ('image/png', Uint8List(1));
        },
      );
      await session.ready(
        scene(
          null,
          data: [
            {
              'type': 'grid',
              'id': 'grid',
              'cells': [
                [1],
              ],
              'item': {
                'size': 20,
                'components': [
                  {
                    'type': 'icon',
                    'id': 'icon',
                    'source': 'template',
                    'size': 10,
                  },
                ],
              },
            },
          ],
          overlays: {
            'grid.0.0\u0000icon': {'source': 'overlay'},
          },
        ),
      );
      expect(loaded, ['overlay']);
      await session.dispose();
    },
  );
  test(
    'MIME, parser agreement, SVG content and decoded bounds enforce session policy',
    () async {
      for (final source in [
        'data:application/octet-stream;base64,AA==',
        'data:image/svg+xml,${Uri.encodeComponent('<svg><script/></svg>')}',
      ]) {
        final session = NativeAssetSession(fontInitializer: () async {});
        await expectLater(
          session.ensure(source),
          throwsA(code('ASSET_POLICY_REJECTED')),
        );
        await session.dispose();
      }
      final svg = mockSession(reader: (_) async => ('image/png', Uint8List(1)));
      await expectLater(
        svg.ensure({'src': 'a', 'parser': 'loadSvg'}),
        throwsA(code('ASSET_POLICY_REJECTED')),
      );
      await svg.dispose();
      final large = mockSession(
        policy: {'maxDecodedWidth': 10},
        decoder: (_, __, ___) async => NativeAsset(width: 11, height: 1),
      );
      await expectLater(
        large.ensure('a'),
        throwsA(code('ASSET_POLICY_REJECTED')),
      );
      expect(large.runtime.probe()['leaseCount'], 0);
      await large.dispose();
    },
  );
  test(
    'actual shared gallery PNG has valid native decoding and intrinsic size',
    () async {
      final gallery =
          jsonDecode(
                File(
                  '../../conformance/fixtures/gallery.json',
                ).readAsStringSync(),
              )
              as Map;
      final source =
          (gallery['dataset'] as List).firstWhere(
                (value) => value['type'] == 'image',
              )['source']
              as String;
      final session = NativeAssetSession(fontInitializer: () async {});
      final image = await session.ensure(source);
      expect(image.image, isNotNull);
      expect(image.width, 1);
      expect(image.height, 1);
      await session.dispose();
      await settle();
      expect(session.runtime.probe()['resourceCount'], 0);
    },
  );
  test(
    'actual tiny SVG bytes decode with intrinsic dimensions and dispose',
    () async {
      final session = NativeAssetSession(fontInitializer: () async {});
      final source =
          'data:image/svg+xml,${Uri.encodeComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"><rect width="12" height="8" fill="red"/></svg>')}';
      final image = await session.ensure(source);
      expect(image.width, 12);
      expect(image.height, 8);
      expect(image.picture, isNotNull);
      await session.dispose();
      await settle();
      expect(session.runtime.probe()['resourceCount'], 0);
    },
  );
  test(
    'trusted builtin resources are independent of restrictive host policy',
    () async {
      final session = NativeAssetSession(
        runtime: PatchMapAssetRuntime(),
        policy: {
          'maxEncodedBytes': 1,
          'maxDecodedWidth': 1,
          'maxDecodedHeight': 1,
        },
        fontInitializer: () async {},
      );
      final asset = await session.ensure('object');
      expect(asset.picture, isNotNull);
      expect(asset.width, greaterThan(1));
      await session.dispose();
    },
  );
  test(
    'bundled font lease reports the same canonical builtin aliases',
    () async {
      final runtime = PatchMapAssetRuntime(),
          session = mockSession(runtime: PatchMapAssetRuntime());
      final native = mockSession(runtime: runtime);
      await native.initialize();
      final alias = runtime.probe('FiraCode-400')['resource'] as Map;
      expect(alias['state'], 'resolved');
      expect(
        alias['cacheIdentity'],
        runtime.resolve('FiraCode-300').cacheIdentity,
      );
      expect(runtime.probe('FiraCode-700')['resource']['leaseCount'], 1);
      await native.dispose();
      await session.dispose();
      expect(runtime.probe('FiraCode-400')['resource']['state'], 'absent');
    },
  );
  test(
    'real HTTP admission rejects redirects status MIME and streamed size before decode',
    () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        final paths = <String>[];
        var decodes = 0;
        server.listen((request) async {
          paths.add(request.uri.path);
          request.response.headers.contentType = ContentType('image', 'png');
          if (request.uri.path == '/redirect') {
            request.response.statusCode = 302;
            request.response.headers.set(HttpHeaders.locationHeader, '/ok');
          } else if (request.uri.path == '/missing') {
            request.response.statusCode = 404;
          } else if (request.uri.path == '/mime') {
            request.response.headers.contentType = ContentType(
              'application',
              'octet-stream',
            );
            request.response.add([1]);
          } else if (request.uri.path == '/large') {
            request.response.contentLength = 9;
            request.response.add(List.filled(9, 0));
          } else if (request.uri.path == '/stream') {
            request.response.bufferOutput = false;
            request.response.add(List.filled(4, 0));
            await request.response.flush();
            request.response.add(List.filled(5, 0));
          } else {
            request.response.add([1]);
          }
          await request.response.close();
        });
        final session = NativeAssetSession(
          runtime: PatchMapAssetRuntime(),
          policy: {'maxEncodedBytes': 8},
          fontInitializer: () async {},
          decoder: (_, __, ___) async {
            decodes++;
            return NativeAsset(width: 1, height: 1);
          },
        );
        final origin = 'http://127.0.0.1:${server.port}';
        try {
          for (final path in [
            '/redirect',
            '/missing',
            '/mime',
            '/large',
            '/stream',
          ]) {
            await expectLater(
              session.ensure('$origin$path'),
              throwsA(
                code(
                  path == '/redirect' || path == '/missing'
                      ? 'ASSET_LOAD_FAILED'
                      : 'ASSET_POLICY_REJECTED',
                ),
              ),
            );
          }
          expect(decodes, 0);
          expect(paths.where((p) => p == '/ok'), isEmpty);
          await expectLater(
            session.ensure(
              'http://user:password@127.0.0.1:${server.port}/auth',
            ),
            throwsA(code('ASSET_POLICY_REJECTED')),
          );
          expect(paths, isNot(contains('/auth')));
          await session.ensure('$origin/ok');
          expect(decodes, 1);
        } finally {
          await session.dispose();
          await server.close(force: true);
        }
        expect(session.runtime.probe()['resourceCount'], 0);
      }, RealHttpOverrides());
    },
  );
}
