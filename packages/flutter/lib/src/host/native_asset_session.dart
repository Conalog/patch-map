part of 'native_assets.dart';

class PatchMapAssetUse {
  factory PatchMapAssetUse({
    required PatchMapNormalizedAssetRegistration source,
    String? canonical,
    JsonMap? policy,
  }) {
    final normalized = normalizePatchMapAssetPolicy(policy);
    return PatchMapAssetUse._(
      canonical ?? _assetUseIdentity(source, normalized),
      source,
      normalized,
    );
  }
  PatchMapAssetUse._(this.canonical, this.source, this.policy) {
    unawaited(_result.future.then((_) {}, onError: (Object _) {}));
  }
  final String canonical;
  final PatchMapNormalizedAssetRegistration source;
  final JsonMap policy;
  final _result = Completer<Object?>();
  Future<Object?> get promise => _result.future;
  String get sourceIdentity => source.resourceIdentity;
  String get cacheIdentity => source.cacheIdentity;
  JsonMap get descriptor => source.descriptor;
  bool get packageOwned => source.packageOwned;
  Object? get entry => _resource;
  String status = 'validating';
  int handleCount = 0;
  _AssetResource? _resource;
  PatchMapAssetResourceDescription? description;
}

/// Session-scoped acquisition handles; destroying one session never releases
/// another session's lease, including runtimes sharing one backend.
class PatchMapAssetSession {
  PatchMapAssetSession._(this.runtime, this.instanceId, this.policy);
  final PatchMapAssetRuntime runtime;
  final String instanceId;
  final JsonMap policy;
  final _uses = <String, PatchMapAssetUse>{};
  final _cleanupCandidates = <String>{};
  bool _destroyed = false;
  void _assertAlive() {
    if (_destroyed)
      throw const PatchMapAssetError('CANCELLED', 'CANCELLED', false);
  }

  PatchMapResult registerAssets([List<JsonMap>? registrations]) {
    _assertAlive();
    return runtime.registerAssets(registrations ?? patchMapBuiltinAssets);
  }

  Future<PatchMapAssetAcquisition> acquire(String alias) {
    _assertAlive();
    return _acquire(runtime.resolve(alias));
  }

  Future<PatchMapAssetAcquisition> acquireSource(Object source) {
    _assertAlive();
    return _acquire(runtime.sourceEntry(source));
  }

  Future<PatchMapAssetAcquisition> _acquire(
    PatchMapNormalizedAssetRegistration source, {
    Future<Object?> Function()? loader,
  }) {
    _assertAlive();
    final future = _beginAcquire(source, loader: loader);
    unawaited(future.then((_) {}, onError: (Object _) {}));
    return future;
  }

  Future<PatchMapAssetAcquisition> _beginAcquire(
    PatchMapNormalizedAssetRegistration source, {
    Future<Object?> Function()? loader,
  }) async {
    final identity = _assetUseIdentity(source, policy);
    var use = _uses[identity];
    if (use == null || use.status == 'released') {
      use = PatchMapAssetUse._(identity, source, policy);
      _uses[identity] = use;
      unawaited(runtime._coordinator.attach(use, loader: loader));
    }
    use.handleCount++;
    Object? resource;
    try {
      resource = await use._result.future;
    } catch (_) {
      if (identical(_uses[identity], use)) _uses.remove(identity);
      rethrow;
    }
    if (_destroyed || use.status != 'leased')
      throw const PatchMapAssetError('CANCELLED', 'CANCELLED', false);
    final acquired = use;
    final description = acquired.description!;
    _cleanupCandidates.remove(identity);
    return PatchMapAssetAcquisition._(
      source.cacheIdentity,
      description.normalizedResourceIdentity,
      description.cacheIdentity,
      resource,
      () async {
        if (acquired.status == 'released' || --acquired.handleCount > 0) return;
        if (identical(_uses[identity], acquired)) _uses.remove(identity);
        await _release(acquired);
      },
    );
  }

  Future<void> _release(PatchMapAssetUse use) async {
    try {
      await runtime._coordinator.release(use);
    } catch (_) {
      _cleanupCandidates.add(use.canonical);
      rethrow;
    }
  }

  JsonMap probe() {
    final pending = _uses.values
        .where((use) => use.status == 'validating' || use.status == 'pending')
        .length;
    final leased = _uses.values.where((use) => use.status == 'leased').length;
    return {
      'instanceId': instanceId,
      'destroyed': _destroyed,
      'pendingCount': pending,
      'leaseCount': leased,
      'acquisitionCount': pending + leased,
      'cleanupPendingCount': _cleanupCandidates.length,
    };
  }

  JsonMap runtimeProbe([String? alias]) => runtime.probe(alias);
  Future<void> destroy() async {
    if (_destroyed) return retryCleanup();
    _destroyed = true;
    final uses = _uses.values.toList();
    _uses.clear();
    await Future.wait([
      for (final use in uses) _release(use).catchError((Object _) {}),
    ]);
    await retryCleanup();
  }

  Future<void> retryCleanup() async {
    if (_cleanupCandidates.isEmpty) return;
    await runtime._coordinator.retryCleanup(_cleanupCandidates);
    _cleanupCandidates.clear();
  }
}

String _assetUseIdentity(
  PatchMapNormalizedAssetRegistration source,
  JsonMap policy,
) => source.packageOwned
    ? source.resourceIdentity
    : '${source.resourceIdentity}:policy:${_assetHash(jsonEncode(policy))}';
