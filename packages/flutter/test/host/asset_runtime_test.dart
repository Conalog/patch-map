import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/host/native_assets.dart' show NativeAssetSession;

class Backend extends PatchMapAssetBackend {
  Object? cached;
  Future<Object?> Function(PatchMapAssetBackendRequest)? onLoad;
  PatchMapAssetResourceDescription? description;
  int loads = 0, unloads = 0, failures = 0;
  final requests = <PatchMapAssetBackendRequest>[];
  @override
  Object? get(PatchMapAssetBackendRequest request) => cached;
  @override
  Future<Object?> load(PatchMapAssetBackendRequest request) async {
    loads++;
    requests.add(request);
    return onLoad == null ? Object() : await onLoad!(request);
  }

  @override
  PatchMapAssetResourceDescription? describe(
    PatchMapAssetBackendRequest request,
    Object? resource,
  ) => description;
  @override
  Future<void> unload(String key) async {
    unloads++;
    if (failures-- > 0) throw StateError('unload failed');
  }
}

Matcher code(String code) =>
    isA<PatchMapAssetError>().having((e) => e.code, 'code', code);
Future<void> settle() => Future<void>.delayed(Duration.zero);
void main() {
  test(
    'manual session distinguishes aliases from sources and deduplicates handles',
    () async {
      final backend = Backend(), runtime = PatchMapAssetRuntime(Backend());
      expect(runtime.probe()['aliasCount'], 0);
      final shared = PatchMapAssetRuntime(backend);
      final session = shared.createSession(instanceId: ' example ');
      session.registerAssets([
        {'alias': 'alias', 'descriptor': 'https://example.test/a'},
      ]);
      final a = await session.acquire('alias'),
          b = await session.acquire('alias');
      expect(identical(a.resource, b.resource), true);
      expect(backend.loads, 1);
      expect(session.probe(), {
        'instanceId': 'example',
        'destroyed': false,
        'pendingCount': 0,
        'leaseCount': 1,
        'acquisitionCount': 1,
        'cleanupPendingCount': 0,
      });
      expect(a.cacheIdentity, shared.resolve('alias').cacheIdentity);
      expect(a.normalizedResourceIdentity, a.cacheIdentity);
      final source = await session.acquireSource('alias');
      expect(backend.loads, 2);
      expect(backend.requests.last.descriptor, {'src': 'alias'});
      await a.release();
      await a.release();
      expect(backend.unloads, 0);
      await b.release();
      expect(backend.unloads, 1);
      await source.release();
      await session.destroy();
      expect(shared.probe()['resourceCount'], 0);
      expect(() => session.acquire('alias'), throwsA(code('CANCELLED')));
    },
  );
  test(
    'same backend shares physical resources across separate runtime catalogs',
    () async {
      final backend = Backend(), first = PatchMapAssetRuntime(Backend());
      final aRuntime = PatchMapAssetRuntime(backend),
          bRuntime = PatchMapAssetRuntime(backend);
      final a = aRuntime.createSession(instanceId: 'a'),
          b = bRuntime.createSession(instanceId: 'b');
      a.registerAssets([
        {'alias': 'image', 'descriptor': 'source'},
      ]);
      expect(() => b.acquire('image'), throwsA(code('INVALID_VALUE')));
      final one = await a.acquire('image'),
          two = await b.acquireSource('source');
      expect(one.resource, same(two.resource));
      expect(backend.loads, 1);
      expect(aRuntime.probe('image')['resource']['leaseCount'], 2);
      await a.destroy();
      expect(backend.unloads, 0);
      await b.destroy();
      expect(backend.unloads, 1);
      expect(first.probe()['resourceCount'], 0);
    },
  );
  test('external cached resources are never unloaded', () async {
    final external = Object(), backend = Backend()..cached = Object();
    backend.cached = external;
    final runtime = PatchMapAssetRuntime(backend),
        session = PatchMapAssetRuntime(
          backend,
        ).createSession(instanceId: 'external');
    runtime.registerAlias({'alias': 'image', 'descriptor': 'source'});
    final handle = await session.acquireSource('source');
    expect(handle.resource, same(external));
    expect(backend.loads, 0);
    expect(runtime.probe('image')['resource']['ownership'], 'external');
    await handle.release();
    expect(backend.unloads, 0);
    expect(runtime.probe('image')['resource']['state'], 'absent');
    await session.destroy();
  });
  test('backend descriptions do not alter coordinator identity', () async {
    final backend = Backend()
      ..description = const PatchMapAssetResourceDescription(
        normalizedResourceIdentity: ' decoded ',
        cacheIdentity: ' fixture ',
      );
    final runtime = PatchMapAssetRuntime(backend),
        session = PatchMapAssetRuntime(
          backend,
        ).createSession(instanceId: 'description');
    final handle = await session.acquireSource({
      'src': ' source ',
      'data': {'b': 2, 'a': 1},
    });
    expect(handle.normalizedResourceIdentity, 'decoded');
    expect(handle.describedCacheIdentity, 'fixture');
    expect(
      handle.cacheIdentity,
      runtime.sourceEntry({
        'data': {'a': 1, 'b': 2},
        'src': 'source',
      }).cacheIdentity,
    );
    await session.destroy();
    expect(backend.unloads, 1);
  });
  test(
    'cleanup failure is visible and reacquisition retries before allocating a fresh key',
    () async {
      final backend = Backend()..failures = 2;
      final runtime = PatchMapAssetRuntime(backend);
      runtime.registerAlias({'alias': 'image', 'descriptor': 'source'});
      final session = runtime.createSession(instanceId: 'cleanup');
      final handle = await session.acquire('image');
      await expectLater(handle.release(), throwsA(code('INTERNAL_FAILURE')));
      expect(runtime.probe('image')['resource']['state'], 'cleanup-failed');
      expect(session.probe()['cleanupPendingCount'], 1);
      await expectLater(
        session.acquire('image'),
        throwsA(code('INTERNAL_FAILURE')),
      );
      expect(backend.loads, 1);
      final next = await session.acquire('image');
      expect(backend.loads, 2);
      expect(backend.requests.first.key, isNot(backend.requests.last.key));
      await next.release();
      await session.retryCleanup();
      await session.destroy();
      expect(runtime.probe()['cleanupPendingCount'], 0);
    },
  );
  test(
    'destroy cancels pending consumers immediately and late completion cleans up once',
    () async {
      final complete = Completer<Object?>(), backend = Backend();
      backend.onLoad = (_) => complete.future;
      final runtime = PatchMapAssetRuntime(backend),
          session = PatchMapAssetRuntime(
            backend,
          ).createSession(instanceId: 'pending');
      final pending = session.acquireSource('source');
      final canceled = expectLater(pending, throwsA(code('CANCELLED')));
      await settle();
      expect(session.probe()['pendingCount'], 1);
      await session.destroy();
      await canceled;
      expect(session.probe()['pendingCount'], 0);
      expect(backend.unloads, 0);
      complete.complete(Object());
      await settle();
      expect(backend.unloads, 1);
      expect(runtime.probe()['resourceCount'], 0);
    },
  );
  test(
    'host policies isolate resources while exact builtin signatures share',
    () async {
      final backend = Backend(), runtime = PatchMapAssetRuntime(Backend());
      final shared = PatchMapAssetRuntime(backend);
      final a = shared.createSession(instanceId: 'a'),
          b = shared.createSession(
            instanceId: 'b',
            policy: {'maxEncodedBytes': 12},
          );
      a.registerAssets();
      await a.acquireSource('host');
      await b.acquireSource('host');
      await a.acquire('object');
      await b.acquire('object');
      expect(backend.loads, 3);
      expect(backend.requests.where((r) => r.packageOwned).length, 1);
      expect(runtime.probe()['aliasCount'], 0);
      await a.destroy();
      await b.destroy();
      expect(backend.unloads, 3);
    },
  );
  test(
    'load failure and invalid backend descriptions release ownership',
    () async {
      final backend = Backend()..onLoad = (_) async => throw StateError('load');
      final runtime = PatchMapAssetRuntime(backend),
          session = PatchMapAssetRuntime(
            backend,
          ).createSession(instanceId: 'errors');
      await expectLater(
        session.acquireSource('source'),
        throwsA(code('ASSET_LOAD_FAILED')),
      );
      expect(runtime.probe()['resourceCount'], 0);
      expect(backend.unloads, 0);
      backend.onLoad = null;
      backend.description = const PatchMapAssetResourceDescription(
        normalizedResourceIdentity: '',
      );
      await expectLater(
        session.acquireSource('source'),
        throwsA(code('INVALID_VALUE')),
      );
      expect(runtime.probe()['resourceCount'], 0);
      expect(backend.unloads, 1);
      await session.destroy();
    },
  );
  test(
    'descriptor normalization detaches nested input and rejects non-JSON/cyclic data',
    () {
      final data = <String, dynamic>{
        'nested': <Object?>[
          1,
          {'a': 'before'},
        ],
      };
      final descriptor = normalizePatchMapAssetDescriptor({
        'src': ' source ',
        'data': data,
      });
      (data['nested'] as List)[1] = 'after';
      expect(descriptor['data']['nested'][1], {'a': 'before'});
      expect(
        () => (descriptor['data'] as Map)['new'] = 1,
        throwsUnsupportedError,
      );
      final cycle = <String, dynamic>{};
      cycle['self'] = cycle;
      for (final invalid in [
        cycle,
        {'number': double.nan},
        {'value': Object()},
        {1: 'key'},
      ]) {
        expect(
          () => normalizePatchMapAssetDescriptor({
            'src': 'source',
            'data': invalid,
          }),
          throwsA(code('INVALID_VALUE')),
        );
      }
    },
  );
  test('modified font descriptor never gains package-owned trust', () {
    final runtime = PatchMapAssetRuntime(Backend());
    final builtin = patchMapBuiltinAssets.firstWhere(
      (r) => r['kind'] == 'font',
    );
    runtime.registerAlias({
      ...builtin,
      'descriptor': {'src': (builtin['descriptor'] as Map)['src']},
    });
    expect(runtime.resolve(builtin['alias'] as String).packageOwned, false);
    expect(
      () => runtime.registerAssets(patchMapBuiltinAssets),
      throwsA(code('CONFLICT')),
    );
  });
  test('public response policy reports the first failed admission stage', () {
    const policy = {
      'maxEncodedBytes': 10,
      'maxDecodedWidth': 4,
      'maxDecodedHeight': 4,
    };
    const base = {
      'mediaType': ' Image/PNG; charset=utf-8 ',
      'encodedBytes': 10,
    };
    expect(evaluatePatchMapAssetResponsePolicy(policy, base), {
      'accepted': true,
      'code': null,
      'stage': 'accepted',
    });
    for (final entry in <String, Map<String, dynamic>>{
      'media-type': {...base, 'mediaType': 'application/octet-stream'},
      'encoded-bytes': {...base, 'encodedBytes': 11},
      'decoded-size': {...base, 'decodedWidth': 4},
      'svg-content': {
        ...base,
        'mediaType': 'image/svg+xml',
        'svgText': '<svg onload="x"/>',
      },
    }.entries) {
      expect(
        evaluatePatchMapAssetResponsePolicy(policy, entry.value)['stage'],
        entry.key,
      );
      expect(
        () => assertPatchMapAssetResponseAllowed(policy, entry.value),
        throwsA(code('ASSET_POLICY_REJECTED')),
      );
    }
    expect(
      () => evaluatePatchMapAssetResponsePolicy(policy, {
        ...base,
        'mediaType': 'invalid',
      }),
      throwsA(code('INVALID_VALUE')),
    );
    expect(
      () => normalizePatchMapAssetPolicy({'maxEncodedBytes': 0}),
      throwsA(code('INVALID_VALUE')),
    );
  });
  test(
    'native adapter rejects opaque and empty drawable resources and releases them',
    () async {
      for (final result in [Object(), NativeAsset(width: 4, height: 4)]) {
        final backend = Backend()..onLoad = (_) async => result;
        final session = NativeAssetSession(
          runtime: PatchMapAssetRuntime(backend),
          fontInitializer: () async {},
        );
        await expectLater(
          session.ensure('source'),
          throwsA(code('ASSET_DECODE_FAILED')),
        );
        expect(backend.unloads, 1);
        await session.dispose();
        expect(session.runtime.probe()['resourceCount'], 0);
      }
    },
  );
  test(
    'native cleanup failure drops bindings and repeated destroy retries cleanup',
    () async {
      final backend = Backend()..failures = 3;
      backend.onLoad = (_) async =>
          NativeAsset(width: 1, height: 1, isFont: true);
      final runtime = PatchMapAssetRuntime(backend);
      final native = NativeAssetSession(
        runtime: runtime,
        fontInitializer: () async {},
      );
      native.register([
        {
          'alias': 'font',
          'kind': 'font',
          'descriptor': {
            'src': 'font',
            'data': {'family': 'test'},
          },
        },
      ]);
      await native.ensure('font');
      final firstDestroy = native.dispose();
      final joinedDestroy = native.dispose();
      await Future.wait([
        expectLater(firstDestroy, throwsA(code('INTERNAL_FAILURE'))),
        expectLater(joinedDestroy, throwsA(code('INTERNAL_FAILURE'))),
      ]);
      expect(backend.unloads, 2);
      expect(native.status()['session']['resolved'], 0);
      expect(native.status()['session']['destroyed'], true);
      await expectLater(native.dispose(), throwsA(code('INTERNAL_FAILURE')));
      await native.dispose();
      expect(runtime.probe()['resourceCount'], 0);
      expect(native.status()['session'], null);
      expect(native.status()['runtime'], runtime.probe());
    },
  );
  test(
    'opaque builtin cache cannot bypass native font registration barrier',
    () async {
      final backend = Backend(), runtime = PatchMapAssetRuntime(Backend());
      final shared = PatchMapAssetRuntime(backend),
          manual = PatchMapAssetRuntime(
            backend,
          ).createSession(instanceId: 'manual');
      manual.registerAssets();
      await manual.acquire('FiraCode-400');
      var registrations = 0;
      final native = NativeAssetSession(
        runtime: shared,
        fontInitializer: () async {
          registrations++;
        },
      );
      await expectLater(
        native.initialize(),
        throwsA(code('ASSET_DECODE_FAILED')),
      );
      expect(registrations, 1);
      expect(backend.unloads, 0);
      await native.dispose();
      await manual.destroy();
      expect(backend.unloads, 1);
      expect(runtime.probe()['resourceCount'], 0);
    },
  );
  test(
    'NativeAsset retries failed cleanup steps and successful disposal stays idempotent',
    () {
      var attempts = 0;
      final asset = NativeAsset(
        width: 1,
        height: 1,
        onDispose: () {
          if (++attempts == 1) throw StateError('retry');
        },
      );
      expect(asset.dispose, throwsStateError);
      asset.dispose();
      asset.dispose();
      expect(attempts, 2);
    },
  );
  test(
    'public low-level attach release and scoped retry use the same coordinator',
    () async {
      final backend = Backend()..failures = 2;
      final runtime = PatchMapAssetRuntime(backend);
      final use = PatchMapAssetUse(source: runtime.sourceEntry('source'));
      expect(use.status, 'validating');
      final value = await runtime.attach(use);
      expect(await use.promise, same(value));
      expect(use.status, 'leased');
      expect(use.description!.normalizedResourceIdentity, use.cacheIdentity);
      final session = runtime.createSession(instanceId: 'coexisting');
      final handle = await session.acquireSource('source');
      expect(handle.resource, same(value));
      expect(backend.loads, 1);
      await handle.release();
      await session.destroy();
      await expectLater(
        runtime.release(use),
        throwsA(code('INTERNAL_FAILURE')),
      );
      await runtime.retryCleanupFor(['unrelated']);
      expect(runtime.probe()['cleanupPendingCount'], 1);
      await expectLater(
        runtime.retryCleanupFor([use.canonical]),
        throwsA(code('INTERNAL_FAILURE')),
      );
      await runtime.retryCleanupFor([use.canonical]);
      expect(runtime.probe()['resourceCount'], 0);
    },
  );
}
