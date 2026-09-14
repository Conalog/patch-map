// Declaration-only analyzer probe. Never executed; no behavior outcome is implied.
// Every api: marker names the exact shared inventory entry checked below it.
import 'package:patch_map/patch_map.dart';

Future<void> checkAssetBindings(
  PatchMapAssetBackend backend,
  PatchMapAssetBackendRequest request,
  PatchMapAssetUse use,
) async {
  // api:api.PatchMapAssetRuntime
  final PatchMapAssetRuntime runtime = PatchMapAssetRuntime(backend);
  // api:api.PatchMapAssetRuntime.type.createSession
  final PatchMapAssetSession session = runtime.createSession(
    instanceId: 'probe',
    policy: {'maxEncodedBytes': 10},
  );
  // api:api.PatchMapAssetRuntime.type.registerAlias
  final PatchMapResult single = runtime.registerAlias({
    'alias': 'one',
    'descriptor': 'one',
  });
  // api:api.PatchMapAssetRuntime.type.registerAssets
  final PatchMapResult batch = runtime.registerAssets([
    {'alias': 'two', 'descriptor': 'two'},
  ]);
  // api:api.PatchMapAssetRuntime.type.resolve
  final PatchMapNormalizedAssetRegistration resolved = runtime.resolve('one');
  // api:api.PatchMapAssetRuntime.type.sourceEntry
  final PatchMapNormalizedAssetRegistration source = runtime.sourceEntry({
    'src': 'one',
  });
  // api:api.PatchMapAssetRuntime.type.probe
  final Map<String, dynamic> probe = runtime.probe('one');
  // api:api.PatchMapAssetRuntime.type.attach
  final Object? resource = await runtime.attach(use);
  // api:api.PatchMapAssetRuntime.type.release
  await runtime.release(use);
  // api:api.PatchMapAssetRuntime.type.retryCleanup
  await runtime.retryCleanup();
  // api:api.PatchMapAssetRuntime.type.retryCleanupFor
  await runtime.retryCleanupFor([use.canonical]);

  // api:api.PatchMapAssetBackend.get
  final Object? cached = backend.get(request);
  // api:api.PatchMapAssetBackend.load
  final Object? loaded = await backend.load(request);
  // api:api.PatchMapAssetBackend.describe
  final PatchMapAssetResourceDescription? description = backend.describe(
    request,
    loaded,
  );
  // api:api.PatchMapAssetBackend.unload
  await backend.unload(request.key);
  // api:api.PatchMapAssetBackend.keyNamespace
  final String? namespace = backend.keyNamespace;
  // api:api.PatchMapAssetBackendRequest.key
  final String key = request.key;
  // api:api.PatchMapAssetBackendRequest.cacheIdentity
  final String identity = request.cacheIdentity;
  // api:api.PatchMapAssetBackendRequest.descriptor
  final Map<String, dynamic> descriptor = request.descriptor;
  // api:api.PatchMapAssetBackendRequest.policy
  final Map<String, dynamic> policy = request.policy;
  // api:api.PatchMapAssetBackendRequest.packageOwned
  final bool owned = request.packageOwned;

  // JSON-key bindings require runtime shape assertions; analyzer proves only map acceptance.
  // api:api.AssetSourceDescriptor.src
  final Map<String, dynamic> input = {'src': 'source'};
  // api:api.AssetSourceDescriptor.data
  input['data'] = {'family': 'fixture'};
  // api:api.AssetSourceDescriptor.format
  input['format'] = 'svg';
  // api:api.AssetSourceDescriptor.parser
  input['parser'] = 'loadSVG';
  // api:api.AssetSourceDescriptor.loadParser
  input['loadParser'] = 'loadSVG';
  final Map<String, dynamic> normalized = normalizePatchMapAssetDescriptor(
    input,
  );
  // api:api.PatchMapAssetPolicy.maxEncodedBytes
  final Map<String, dynamic> admission = {'maxEncodedBytes': 10};
  // api:api.PatchMapAssetPolicy.maxDecodedWidth
  admission['maxDecodedWidth'] = 20;
  // api:api.PatchMapAssetPolicy.maxDecodedHeight
  admission['maxDecodedHeight'] = 30;
  final Map<String, dynamic> limits = normalizePatchMapAssetPolicy(admission);
  // api:api.PatchMapAssetRegistrationResult.registeredAliases
  final Object? registered = batch.toJson()['registeredAliases'];
  // api:api.PatchMapAssetRegistrationResult.duplicateAliases
  final Object? duplicates = single.toJson()['duplicateAliases'];

  // api:api.PatchMapAssetError
  const PatchMapAssetError error = PatchMapAssetError(
    'INVALID_VALUE',
    'INVALID_INPUT',
    false,
  );
  // api:api.PatchMapAssetError.type.code
  final String code = error.code;
  // api:api.PatchMapAssetError.type.category
  final String category = error.category;
  // api:api.PatchMapAssetError.type.retryable
  final bool retryable = error.retryable;
  // Keep all typed reads observable to the analyzer without executing this probe.
  assert(
    [
      session,
      resolved,
      source,
      probe,
      resource,
      cached,
      description,
      namespace,
      key,
      identity,
      descriptor,
      policy,
      owned,
      normalized,
      limits,
      registered,
      duplicates,
      code,
      category,
      retryable,
    ].isNotEmpty,
  );
}

// Remaining declaration containers and JSON-key bindings. Do not execute.
void checkAssetValueBindings(
  PatchMapAssetRuntime runtime,
  PatchMapAssetSession session,
  PatchMapAssetBackend backend,
  PatchMapAssetBackendRequest request,
  PatchMapController controller,
  Object source,
  Map<String, dynamic> registration,
  Map<String, dynamic> policy,
) {
  final values = <Object?>[];
  // api:api.AssetSource
  values.add(normalizePatchMapAssetDescriptor(source));
  // api:api.AssetSourceDescriptor
  values.add(normalizePatchMapAssetDescriptor(source));
  // api:api.createPatchMapPixiAssetBackend
  values.add(createPatchMapNativeAssetBackend());
  // api:api.PatchMapAssetBackend
  values.add(backend);
  // api:api.PatchMapAssetBackendRequest
  values.add(request);
  // api:api.PatchMapAssetError.prototype
  values.add(const PatchMapAssetError("INVALID_VALUE", "INVALID_INPUT", false));
  // api:api.PatchMapAssetError.type
  values.add(const PatchMapAssetError("INVALID_VALUE", "INVALID_INPUT", false));
  // api:api.PatchMapAssetPolicy
  values.add(normalizePatchMapAssetPolicy(policy));
  // api:api.PatchMapAssetRegistration
  values.add(runtime.registerAlias(registration));
  // api:api.PatchMapAssetRegistration.alias
  values.add(registration['alias']);
  // api:api.PatchMapAssetRegistration.descriptor
  values.add(registration['descriptor']);
  // api:api.PatchMapAssetRegistration.fontWeight
  values.add(registration['fontWeight']);
  // api:api.PatchMapAssetRegistration.kind
  values.add(registration['kind']);
  // api:api.PatchMapAssetRegistrationResult
  values.add(runtime.registerAssets([registration]).toJson());
  // api:api.PatchMapAssetResourceProbe
  values.add(runtime.probe('image')['resource'] as Map<String, dynamic>);
  // api:api.PatchMapAssetResourceProbe.cacheIdentity
  values.add(
    (runtime.probe('image')['resource']
        as Map<String, dynamic>)['cacheIdentity'],
  );
  // api:api.PatchMapAssetResourceProbe.cleanupPending
  values.add(
    (runtime.probe('image')['resource']
        as Map<String, dynamic>)['cleanupPending'],
  );
  // api:api.PatchMapAssetResourceProbe.cleanupRetryOwner
  values.add(
    (runtime.probe('image')['resource']
        as Map<String, dynamic>)['cleanupRetryOwner'],
  );
  // api:api.PatchMapAssetResourceProbe.leaseCount
  values.add(
    (runtime.probe('image')['resource'] as Map<String, dynamic>)['leaseCount'],
  );
  // api:api.PatchMapAssetResourceProbe.ownership
  values.add(
    (runtime.probe('image')['resource'] as Map<String, dynamic>)['ownership'],
  );
  // api:api.PatchMapAssetResourceProbe.pendingCount
  values.add(
    (runtime.probe('image')['resource']
        as Map<String, dynamic>)['pendingCount'],
  );
  // api:api.PatchMapAssetResourceProbe.resourceCount
  values.add(
    (runtime.probe('image')['resource']
        as Map<String, dynamic>)['resourceCount'],
  );
  // api:api.PatchMapAssetResourceProbe.state
  values.add(
    (runtime.probe('image')['resource'] as Map<String, dynamic>)['state'],
  );
  // api:api.PatchMapAssetRuntime.prototype
  values.add(runtime);
  // api:api.PatchMapAssetRuntime.type
  values.add(runtime);
  // api:api.PatchMapAssetRuntimeProbe
  values.add(runtime.probe('image'));
  // api:api.PatchMapAssetRuntimeProbe.aliasCount
  values.add((runtime.probe('image'))['aliasCount']);
  // api:api.PatchMapAssetRuntimeProbe.builtins
  values.add((runtime.probe('image'))['builtins']);
  // api:api.PatchMapAssetRuntimeProbe.cleanupPendingCount
  values.add((runtime.probe('image'))['cleanupPendingCount']);
  // api:api.PatchMapAssetRuntimeProbe.fonts
  values.add((runtime.probe('image'))['fonts']);
  // api:api.PatchMapAssetRuntimeProbe.leaseCount
  values.add((runtime.probe('image'))['leaseCount']);
  // api:api.PatchMapAssetRuntimeProbe.pendingCount
  values.add((runtime.probe('image'))['pendingCount']);
  // api:api.PatchMapAssetRuntimeProbe.resource
  values.add((runtime.probe('image'))['resource']);
  // api:api.PatchMapAssetRuntimeProbe.resourceCount
  values.add((runtime.probe('image'))['resourceCount']);
  // api:api.PatchMapAssetsApi
  values.add(controller.assets);
  // api:api.PatchMapAssetsApi.register
  values.add(controller.assets.register(registration));
  // api:api.PatchMapAssetsApi.status
  values.add(controller.assets.status('image'));
  // api:api.PatchMapAssetSessionProbe
  values.add(session.probe());
  // api:api.PatchMapAssetSessionProbe.acquisitionCount
  values.add((session.probe())['acquisitionCount']);
  // api:api.PatchMapAssetSessionProbe.cleanupPendingCount
  values.add((session.probe())['cleanupPendingCount']);
  // api:api.PatchMapAssetSessionProbe.destroyed
  values.add((session.probe())['destroyed']);
  // api:api.PatchMapAssetSessionProbe.instanceId
  values.add((session.probe())['instanceId']);
  // api:api.PatchMapAssetSessionProbe.leaseCount
  values.add((session.probe())['leaseCount']);
  // api:api.PatchMapAssetSessionProbe.pendingCount
  values.add((session.probe())['pendingCount']);
  // api:api.PatchMapAssetStatus
  values.add(controller.assets.status());
  // api:api.PatchMapAssetStatus.runtime
  values.add(controller.assets.status()['runtime']);
  // api:api.PatchMapAssetStatus.session
  values.add(controller.assets.status()['session']);
  // api:api.PatchMapResolvedAssetPolicy
  values.add(normalizePatchMapAssetPolicy(policy));
  // api:api.PatchMapResolvedAssetPolicy.maxDecodedHeight
  values.add(normalizePatchMapAssetPolicy(policy)['maxDecodedHeight']);
  // api:api.PatchMapResolvedAssetPolicy.maxDecodedWidth
  values.add(normalizePatchMapAssetPolicy(policy)['maxDecodedWidth']);
  // api:api.PatchMapResolvedAssetPolicy.maxEncodedBytes
  values.add(normalizePatchMapAssetPolicy(policy)['maxEncodedBytes']);
  assert(values.isNotEmpty);
}

void checkAssetConstants() {
  final values = <Object?>[];
  // api:api.PATCH_MAP_BUILTIN_ASSETS
  values.add(patchMapBuiltinAssets);
  // api:api.PATCH_MAP_DEFAULT_ASSET_POLICY
  values.add(patchMapDefaultAssetPolicy);
  // api:api.PATCH_MAP_DEFAULT_ASSET_POLICY.maxDecodedHeight
  values.add(patchMapDefaultAssetPolicy['maxDecodedHeight']);
  // api:api.PATCH_MAP_DEFAULT_ASSET_POLICY.maxDecodedWidth
  values.add(patchMapDefaultAssetPolicy['maxDecodedWidth']);
  // api:api.PATCH_MAP_DEFAULT_ASSET_POLICY.maxEncodedBytes
  values.add(patchMapDefaultAssetPolicy['maxEncodedBytes']);
  assert(values.isNotEmpty);
}
