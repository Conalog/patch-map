import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/host/native_assets.dart' show NativeAssetSession;

class ContractBackend extends PatchMapAssetBackend {
  final completion = Completer<Object?>();
  final requests = <PatchMapAssetBackendRequest>[];
  Completer<void>? unloading;
  bool failUnload = false;
  @override
  String get keyNamespace => ' contract ';
  @override
  Object? get(PatchMapAssetBackendRequest request) => null;
  @override
  Future<Object?> load(PatchMapAssetBackendRequest request) {
    requests.add(request);
    return completion.future;
  }

  @override
  Future<void> unload(String key) async {
    await unloading?.future;
    if (failUnload) throw StateError('cleanup');
  }
}

Matcher assetError(String code, String category, bool retryable) =>
    isA<PatchMapAssetError>()
        .having((e) => e.code, 'code', code)
        .having((e) => e.category, 'category', category)
        .having((e) => e.retryable, 'retryable', retryable);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'public native backend factory decodes and releases an actual SVG source',
    () async {
      final backend = createPatchMapNativeAssetBackend();
      final request = PatchMapAssetBackendRequest(
        key: 'factory-svg',
        cacheIdentity: 'fixture-svg',
        packageOwned: false,
        policy: normalizePatchMapAssetPolicy(),
        descriptor: {
          'src': Uri.dataFromString(
            '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"><rect width="2" height="3" fill="red"/></svg>',
            mimeType: 'image/svg+xml',
          ).toString(),
        },
      );
      expect(backend.get(request), null);
      final asset = await backend.load(request) as NativeAsset;
      expect([asset.width, asset.height, asset.isFont], [2, 3, false]);
      expect(asset.picture, isNotNull);
      await backend.unload(request.key);
      await backend.unload(request.key);
      asset.dispose();
    },
  );
  test(
    'asset descriptor registration and policy fields preserve exact public values',
    () {
      expect(patchMapDefaultAssetPolicy, {
        'maxEncodedBytes': 20971520,
        'maxDecodedWidth': 8192,
        'maxDecodedHeight': 8192,
      });
      expect(patchMapBuiltinAssets.map((value) => value['alias']).toList(), [
        'object',
        'inverter',
        'combiner',
        'device',
        'edge',
        'loading',
        'warning',
        'wifi',
        'FiraCode-300',
        'FiraCode-400',
        'FiraCode-500',
        'FiraCode-600',
        'FiraCode-700',
      ]);
      final descriptor = normalizePatchMapAssetDescriptor({
        'src': ' source ',
        'format': ' svg ',
        'parser': ' svg ',
        'loadParser': ' svg ',
        'data': {'resolution': 2},
      });
      expect(descriptor, {
        'src': 'source',
        'format': 'svg',
        'parser': 'svg',
        'loadParser': 'svg',
        'data': {'resolution': 2},
      });
      expect(normalizePatchMapAssetDescriptor(' source '), {'src': 'source'});
      for (final field in ['src', 'format', 'parser', 'loadParser']) {
        for (final invalid in ['', ' ', 4, null]) {
          expect(
            () => normalizePatchMapAssetDescriptor({
              ...descriptor,
              field: invalid,
            }),
            throwsA(assetError('INVALID_VALUE', 'INVALID_INPUT', false)),
          );
        }
      }
      final runtime = PatchMapAssetRuntime(ContractBackend());
      expect(
        runtime.registerAssets([
          {
            'alias': ' font ',
            'descriptor': descriptor,
            'kind': 'font',
            'fontWeight': 500,
          },
          {
            'alias': 'font',
            'descriptor': descriptor,
            'kind': 'font',
            'fontWeight': 500,
          },
          {'alias': 'image', 'descriptor': 'image'},
        ]).toJson(),
        {
          'registeredAliases': ['font', 'image'],
          'duplicateAliases': ['font'],
        },
      );
      final font = runtime.resolve('font');
      expect(
        [
          font.alias,
          font.descriptor,
          font.kind,
          font.fontWeight,
          font.packageOwned,
        ],
        ['font', descriptor, 'font', 500, false],
      );
      expect(runtime.resolve('image').kind, 'image');
      for (final code in [
        'ASSET_LOAD_FAILED',
        'ASSET_DECODE_FAILED',
        'ASSET_UPLOAD_FAILED',
      ]) {
        final value = PatchMapAssetError(code, 'ASSET_FAILURE', true);
        expect(
          [value.code, value.category, value.retryable],
          [code, 'ASSET_FAILURE', true],
        );
      }
      for (final invalid in [
        {'kind': 'other'},
        {'fontWeight': 0},
        {'fontWeight': 2.5},
        {'fontWeight': '500'},
      ]) {
        expect(
          () => runtime.registerAlias({
            'alias': 'bad',
            'descriptor': 'bad',
            ...invalid,
          }),
          throwsA(assetError('INVALID_VALUE', 'INVALID_INPUT', false)),
        );
      }
      expect(
        () =>
            runtime.registerAlias({'alias': 'font', 'descriptor': 'conflict'}),
        throwsA(assetError('CONFLICT', 'CONFLICT', false)),
      );
      const policy = {
        'maxEncodedBytes': 10,
        'maxDecodedWidth': 20,
        'maxDecodedHeight': 30,
      };
      expect(normalizePatchMapAssetPolicy(policy), policy);
      expect(normalizePatchMapAssetPolicy(), patchMapDefaultAssetPolicy);
      for (final field in policy.keys) {
        for (final invalid in [0, -1, 1.5, double.infinity, '1']) {
          expect(
            () => normalizePatchMapAssetPolicy({field: invalid}),
            throwsA(assetError('INVALID_VALUE', 'INVALID_INPUT', false)),
          );
        }
        final metadata = <String, dynamic>{
          'mediaType': 'image/png',
          'encodedBytes': 10,
          'decodedWidth': 20,
          'decodedHeight': 30,
        };
        expect(
          evaluatePatchMapAssetResponsePolicy(policy, metadata)['accepted'],
          true,
        );
        final key = {
          'maxEncodedBytes': 'encodedBytes',
          'maxDecodedWidth': 'decodedWidth',
          'maxDecodedHeight': 'decodedHeight',
        }[field]!;
        metadata[key] = policy[field]! + 1;
        expect(evaluatePatchMapAssetResponsePolicy(policy, metadata), {
          'accepted': false,
          'code': 'ASSET_POLICY_REJECTED',
          'stage': field == 'maxEncodedBytes'
              ? 'encoded-bytes'
              : 'decoded-size',
        });
        expect(
          () => assertPatchMapAssetResponseAllowed(policy, metadata),
          throwsA(assetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false)),
        );
      }
    },
  );

  test(
    'asset backend requests and runtime session status enumerate lifecycle fields',
    () async {
      final backend = ContractBackend(),
          runtime = PatchMapAssetRuntime(ContractBackend());
      final shared = PatchMapAssetRuntime(backend);
      shared.registerAlias({'alias': 'image', 'descriptor': 'source'});
      final identity = shared.resolve('image').cacheIdentity;
      expect(backend.keyNamespace, ' contract ');
      const policy = {
        'maxEncodedBytes': 10,
        'maxDecodedWidth': 20,
        'maxDecodedHeight': 30,
      };
      final session = shared.createSession(
        instanceId: ' instance ',
        policy: policy,
      );
      Map<String, dynamic> resource(
        String state, {
        int resources = 1,
        int pending = 0,
        int leases = 0,
        String? ownership = 'patch-map',
        bool cleanup = false,
      }) => {
        'cacheIdentity': identity,
        'resourceCount': resources,
        'pendingCount': pending,
        'leaseCount': leases,
        'ownership': ownership,
        'state': state,
        'cleanupPending': cleanup,
        'cleanupRetryOwner': cleanup ? 'runtime' : null,
      };
      expect(
        shared.probe('image')['resource'],
        resource('absent', resources: 0, ownership: null),
      );
      expect(runtime.probe()['resource'], null);
      final pending = session.acquire('image');
      await Future<void>.delayed(Duration.zero);
      expect(shared.probe('image'), {
        'builtins': {
          'aliases': [
            'object',
            'inverter',
            'combiner',
            'device',
            'edge',
            'loading',
            'warning',
            'wifi',
          ],
        },
        'fonts': {
          'weights': [300, 400, 500, 600, 700],
        },
        'aliasCount': 1,
        'resourceCount': 1,
        'pendingCount': 1,
        'leaseCount': 0,
        'cleanupPendingCount': 0,
        'resource': resource('pending', pending: 1),
      });
      expect(session.probe(), {
        'instanceId': 'instance',
        'destroyed': false,
        'pendingCount': 1,
        'leaseCount': 0,
        'acquisitionCount': 1,
        'cleanupPendingCount': 0,
      });
      final request = backend.requests.single;
      expect(request.key, startsWith('contract:'));
      expect(request.cacheIdentity, identity);
      expect(request.descriptor, {'src': 'source'});
      expect(request.packageOwned, false);
      expect(request.policy, policy);
      backend.completion.complete(Object());
      final handle = await pending;
      expect(
        shared.probe('image')['resource'],
        resource('resolved', leases: 1),
      );
      backend.unloading = Completer<void>();
      backend.failUnload = true;
      final release = handle.release();
      final failed = expectLater(
        release,
        throwsA(assetError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', false)),
      );
      await Future<void>.delayed(Duration.zero);
      expect(shared.probe('image')['resource'], resource('releasing'));
      backend.unloading!.complete();
      await failed;
      expect(
        shared.probe('image')['resource'],
        resource('cleanup-failed', cleanup: true),
      );
      expect(session.probe()['cleanupPendingCount'], 1);
      backend.failUnload = false;
      await shared.retryCleanup();
      expect(
        shared.probe('image')['resource'],
        resource('absent', resources: 0, ownership: null),
      );
      await session.destroy();
      expect(session.probe(), {
        'instanceId': 'instance',
        'destroyed': true,
        'pendingCount': 0,
        'leaseCount': 0,
        'acquisitionCount': 0,
        'cleanupPendingCount': 0,
      });
      expect(
        () => session.acquire('image'),
        throwsA(assetError('CANCELLED', 'CANCELLED', false)),
      );
      final host = NativeAssetSession(
        runtime: runtime,
        instanceId: 'host',
        fontInitializer: () async {},
      );
      final controller = await PatchMapController.create(assetPort: host);
      expect(
        controller.assets.register({
          'alias': 'public',
          'descriptor': 'public',
        }).toJson(),
        {
          'registeredAliases': ['public'],
          'duplicateAliases': [],
        },
      );
      expect(
        controller.assets.register([
          {'alias': 'public', 'descriptor': 'public'},
        ]).toJson(),
        {
          'registeredAliases': [],
          'duplicateAliases': ['public'],
        },
      );
      final status = controller.assets.status('public');
      expect(status.keys, ['session', 'runtime']);
      expect(status['runtime'], runtime.probe('public'));
      expect(status['session'], {
        'instanceId': 'host',
        'destroyed': false,
        'pendingCount': 0,
        'leaseCount': 0,
        'acquisitionCount': 0,
        'cleanupPendingCount': 0,
        'resolved': 0,
        'failed': 0,
        'ready': false,
      });
      await controller.destroy();
      expect(controller.assets.status(), {
        'session': null,
        'runtime': runtime.probe(),
      });
    },
  );
}
