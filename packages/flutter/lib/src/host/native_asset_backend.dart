part of 'native_assets.dart';

class PatchMapAssetError extends PatchMapException {
  const PatchMapAssetError(String code, this.category, this.retryable)
    : super(code, '$code: asset', operation: 'asset', recoverable: retryable);
  final String category;
  final bool retryable;
}

class PatchMapAssetBackendRequest {
  const PatchMapAssetBackendRequest({
    required this.key,
    required this.descriptor,
    required this.cacheIdentity,
    required this.packageOwned,
    required this.policy,
  });
  final String key, cacheIdentity;
  final JsonMap descriptor, policy;
  final bool packageOwned;
}

class PatchMapAssetResourceDescription {
  const PatchMapAssetResourceDescription({
    required this.normalizedResourceIdentity,
    this.cacheIdentity,
  });
  final String normalizedResourceIdentity;
  final String? cacheIdentity;
}

/// A backend may serve opaque resources to manual sessions. A mounted native
/// image requires NativeAsset; the Canvas adapter validates this boundary.
abstract class PatchMapAssetBackend {
  String? get keyNamespace => null;
  Object? get(PatchMapAssetBackendRequest request);
  Future<Object?> load(PatchMapAssetBackendRequest request);
  PatchMapAssetResourceDescription? describe(
    PatchMapAssetBackendRequest request,
    Object? resource,
  ) => null;
  Future<void> unload(String key);
}

class PatchMapAssetAcquisition {
  PatchMapAssetAcquisition._(
    this.cacheIdentity,
    this.normalizedResourceIdentity,
    this.describedCacheIdentity,
    this.resource,
    this._release,
  );
  final String cacheIdentity, normalizedResourceIdentity;
  final String? describedCacheIdentity;
  final Object? resource;
  final Future<void> Function() _release;
  bool _released = false;
  Future<void> release() async {
    if (_released) return;
    _released = true;
    await _release();
  }
}

const patchMapDefaultAssetPolicy = <String, dynamic>{
  'maxEncodedBytes': 20 * 1024 * 1024,
  'maxDecodedWidth': 8192,
  'maxDecodedHeight': 8192,
};
JsonMap normalizePatchMapAssetPolicy([JsonMap? policy]) {
  if (policy?.keys.any((key) => !patchMapDefaultAssetPolicy.containsKey(key)) ??
      false) {
    throw const PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
  }
  try {
    return Map.unmodifiable({
      for (final entry in patchMapDefaultAssetPolicy.entries)
        entry.key: NativeAssetSession._policyValue(
          policy,
          entry.key,
          entry.value as int,
        ),
    });
  } on PatchMapException catch (error) {
    throw _publicAssetError(error);
  }
}

JsonMap normalizePatchMapAssetDescriptor(Object source) =>
    normalizeNativeAssetDescriptor(source);

PatchMapAssetBackend createPatchMapNativeAssetBackend() =>
    _NativeAssetBackend();
final PatchMapAssetBackend _defaultNativeBackend =
    createPatchMapNativeAssetBackend();

class _NativeAssetBackend extends PatchMapAssetBackend {
  final Map<String, NativeAsset> _owned = {};
  @override
  String get keyNamespace => 'patch-map-native';
  @override
  Object? get(PatchMapAssetBackendRequest request) => null;
  @override
  Future<Object?> load(PatchMapAssetBackendRequest request) async {
    // Admission/decoding are the same operations used by mounted native views.
    // This helper owns no bindings, listeners or leases.
    final decoder = NativeAssetSession(
      policy: request.packageOwned ? null : request.policy,
      decodingOnly: true,
    );
    final input = await decoder._admit(
      request.descriptor,
      packageOwned: request.packageOwned,
    );
    final mime = decoder._validateInput(input.$1, input.$2, request.descriptor);
    final resource = await decoder._decode(mime, input.$2, request.descriptor);
    _owned[request.key] = resource;
    return resource;
  }

  @override
  Future<void> unload(String key) async {
    final resource = _owned[key];
    resource?.dispose();
    if (identical(_owned[key], resource)) _owned.remove(key);
  }
}

final _coordinators = Expando<_AssetCoordinator>();
int _backendSequence = 0;

class _AssetResource {
  _AssetResource(
    this.canonical,
    this.source,
    this.request,
    this.ownership,
    this.unload,
  );
  final String canonical, ownership;
  final PatchMapNormalizedAssetRegistration source;
  final PatchMapAssetBackendRequest request;
  final Future<void> Function() unload;
  final users = <PatchMapAssetUse>{};
  late Future<Object?> loading;
  PatchMapAssetResourceDescription? description;
  String state = 'pending';
  bool failed = false;
  Future<void>? releasing;
}

class _AssetCoordinator {
  _AssetCoordinator(this.backend)
    : namespace = backend.keyNamespace?.trim().isNotEmpty == true
          ? backend.keyNamespace!.trim()
          : 'backend-${++_backendSequence}';
  final PatchMapAssetBackend backend;
  final String namespace;
  int sequence = 0;
  final resources = <String, _AssetResource>{};

  Future<void> attach(
    PatchMapAssetUse use, {
    Future<Object?> Function()? loader,
  }) async {
    try {
      while (true) {
        if (use.status == 'released') return;
        var resource = resources[use.canonical];
        if (resource?.state == 'releasing') {
          try {
            await resource!.releasing;
          } catch (_) {}
          continue;
        }
        if (resource?.state == 'cleanup-failed') {
          await collect(resource!);
          continue;
        }
        if (resource == null) {
          final request = PatchMapAssetBackendRequest(
            key: '$namespace:${_assetHash(use.canonical)}:${++sequence}',
            descriptor: use.source.descriptor,
            cacheIdentity: use.source.cacheIdentity,
            packageOwned: use.source.packageOwned,
            policy: use.policy,
          );
          Object? cached;
          try {
            cached = loader == null ? backend.get(request) : null;
          } catch (_) {
            throw const PatchMapAssetError(
              'ASSET_LOAD_FAILED',
              'ASSET_FAILURE',
              true,
            );
          }
          Object? overridden;
          resource = _AssetResource(
            use.canonical,
            use.source,
            request,
            cached == null ? 'patch-map' : 'external',
            loader == null
                ? () => backend.unload(request.key)
                : () async {
                    if (overridden is NativeAsset)
                      (overridden as NativeAsset).dispose();
                  },
          );
          final created = resource;
          resources[use.canonical] = created;
          created.loading =
              Future<Object?>.sync(
                () => cached ?? (loader ?? () => backend.load(request))(),
              ).then(
                (value) {
                  overridden = value;
                  // The decoded value may already need cleanup if describe rejects.
                  created.state = 'resolved';
                  final described = loader == null
                      ? backend.describe(request, value)
                      : null;
                  created.description = PatchMapAssetResourceDescription(
                    normalizedResourceIdentity: described == null
                        ? use.source.cacheIdentity
                        : _nonempty(
                            described.normalizedResourceIdentity,
                            'normalizedResourceIdentity',
                          ),
                    cacheIdentity: described?.cacheIdentity == null
                        ? null
                        : _nonempty(
                            described!.cacheIdentity,
                            'described cacheIdentity',
                          ),
                  );
                  return value;
                },
                onError: (Object error, StackTrace stack) {
                  created.failed = true;
                  Error.throwWithStackTrace(_publicAssetError(error), stack);
                },
              );
          // Pending work is abandonable; cleanup remains owned by this coordinator.
          unawaited(
            created.loading.then(
              (_) async {
                try {
                  await collect(created);
                } catch (_) {}
              },
              onError: (Object _) async {
                try {
                  await collect(created);
                } catch (_) {}
              },
            ),
          );
        }
        use._resource = resource;
        resource.users.add(use);
        use.status = 'pending';
        final value = await resource.loading;
        if (use.status == 'released') return;
        use.status = 'leased';
        use.description = resource.description!;
        if (!use._result.isCompleted) use._result.complete(value);
        return;
      }
    } catch (error, stack) {
      use.status = 'released';
      use._resource?.users.remove(use);
      if (use._resource != null) {
        try {
          await collect(use._resource!);
        } catch (_) {}
      }
      if (!use._result.isCompleted)
        use._result.completeError(_publicAssetError(error), stack);
    }
  }

  Future<void> release(PatchMapAssetUse use) async {
    if (use.status == 'released') return;
    use.status = 'released';
    if (!use._result.isCompleted)
      use._result.completeError(
        const PatchMapAssetError('CANCELLED', 'CANCELLED', false),
      );
    final resource = use._resource;
    if (resource == null) return;
    resource.users.remove(use);
    await collect(resource);
  }

  Future<void> collect(_AssetResource resource) async {
    if (resource.users.isNotEmpty) return;
    if (resource.failed || resource.ownership == 'external') {
      if (identical(resources[resource.canonical], resource))
        resources.remove(resource.canonical);
      return;
    }
    if (resource.state == 'pending') return; // settlement callback collects it
    if (resource.state == 'releasing') return resource.releasing;
    resource.state = 'releasing';
    final cleanup = Future<void>.sync(resource.unload).then(
      (_) {
        if (identical(resources[resource.canonical], resource))
          resources.remove(resource.canonical);
      },
      onError: (Object _) {
        resource.state = 'cleanup-failed';
        throw const PatchMapAssetError(
          'INTERNAL_FAILURE',
          'INTERNAL_FAILURE',
          false,
        );
      },
    );
    resource.releasing = cleanup;
    await cleanup;
  }

  Future<void> retryCleanup([Set<String>? candidates]) async {
    var failed = false;
    for (final resource in resources.values.toList()) {
      if (resource.state != 'cleanup-failed' ||
          (candidates != null && !candidates.contains(resource.canonical)))
        continue;
      try {
        await collect(resource);
      } catch (_) {
        failed = true;
      }
    }
    if (failed)
      throw const PatchMapAssetError(
        'INTERNAL_FAILURE',
        'INTERNAL_FAILURE',
        false,
      );
  }
}

PatchMapAssetError _publicAssetError(Object error) {
  if (error is PatchMapAssetError) return error;
  if (error is PatchMapException) {
    final code = error.code;
    return PatchMapAssetError(
      code,
      code == 'INVALID_VALUE'
          ? 'INVALID_INPUT'
          : code == 'CONFLICT'
          ? 'CONFLICT'
          : code == 'CANCELLED'
          ? 'CANCELLED'
          : code == 'INTERNAL_FAILURE'
          ? 'INTERNAL_FAILURE'
          : 'ASSET_FAILURE',
      code == 'ASSET_LOAD_FAILED',
    );
  }
  return const PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
}
