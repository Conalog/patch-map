part of 'native_assets.dart';

const builtinImageAliases = <String>[
  'object',
  'inverter',
  'combiner',
  'device',
  'edge',
  'loading',
  'warning',
  'wifi',
];

class NativeAsset {
  NativeAsset({
    this.image,
    this.picture,
    this.isFont = false,
    required this.width,
    required this.height,
    void Function()? onDispose,
  }) : _onDispose = onDispose;
  final ui.Image? image;
  final ui.Picture? picture;
  final bool isFont;
  final double width, height;
  final void Function()? _onDispose;
  bool _disposed = false;
  bool _imageDisposed = false,
      _pictureDisposed = false,
      _callbackDisposed = false;
  void dispose() {
    if (_disposed) return;
    Object? failure;
    StackTrace? stack;
    void step(void Function() action, void Function() complete) {
      try {
        action();
        complete();
      } catch (error, trace) {
        failure ??= error;
        stack ??= trace;
      }
    }

    if (!_imageDisposed)
      step(() => image?.dispose(), () => _imageDisposed = true);
    if (!_pictureDisposed)
      step(() => picture?.dispose(), () => _pictureDisposed = true);
    if (!_callbackDisposed)
      step(() => _onDispose?.call(), () => _callbackDisposed = true);
    _disposed = _imageDisposed && _pictureDisposed && _callbackDisposed;
    if (failure != null) Error.throwWithStackTrace(failure!, stack!);
  }
}

class PatchMapNormalizedAssetRegistration {
  const PatchMapNormalizedAssetRegistration(
    this.alias,
    this.descriptor,
    this.kind,
    this.fontWeight,
    this.packageOwned,
  );
  final String alias, kind;
  final JsonMap descriptor;
  final int? fontWeight;
  final bool packageOwned;
  String get canonical => canonicalJson(descriptor);
  String get resourceIdentity =>
      '${packageOwned ? 'package' : 'host'}:$canonical';
  String get cacheIdentity => 'descriptor:${_assetHash(resourceIdentity)}';
  JsonMap toJson() => {
    'alias': alias,
    'descriptor': descriptor,
    'kind': kind,
    if (fontWeight != null) 'fontWeight': fontWeight,
    'canonical': canonical,
    'resourceIdentity': resourceIdentity,
    'cacheIdentity': cacheIdentity,
    'packageOwned': packageOwned,
  };
  String get signature =>
      '${canonicalJson(descriptor)}|$kind|${fontWeight ?? ''}';
}

const _fontSource =
    'patch-map-builtin://fonts/FiraCode-VF.woff2?sha256=408e876a202f15ea6ee307a70a65cf40ceb222c589a0b17e0a3a371db96dd49f';
const builtinFontWeights = [300, 400, 500, 600, 700];
String _nonempty(Object? value, String label) {
  if (value is! String || value.trim().isEmpty)
    throw const PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
  return value.trim();
}

JsonMap normalizeNativeAssetDescriptor(Object? source) {
  if (source is String)
    return Map.unmodifiable({'src': _nonempty(source, 'asset src')});
  if (source is! Map ||
      source.keys.any(
        (key) =>
            key is! String ||
            !{'src', 'data', 'format', 'parser', 'loadParser'}.contains(key),
      )) {
    throw const PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
  }
  final result = <String, dynamic>{
    'src': _nonempty(source['src'], 'asset src'),
  };
  if (source.containsKey('data')) {
    if (source['data'] is! Map)
      throw const PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
    result['data'] = _cloneAssetJson(source['data'], Set<Object>.identity());
  }
  for (final key in ['format', 'parser', 'loadParser']) {
    if (source.containsKey(key)) result[key] = _nonempty(source[key], key);
  }
  return Map.unmodifiable(result);
}

PatchMapNormalizedAssetRegistration _normalizeRegistration(JsonMap value) {
  final alias = _nonempty(value['alias'], 'alias'),
      descriptor = normalizeNativeAssetDescriptor(value['descriptor']);
  final kind = value['kind'] ?? 'image', weight = value['fontWeight'];
  if (kind != 'image' && kind != 'font')
    throw const PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
  if (value.containsKey('fontWeight') &&
      (weight is! num ||
          !weight.isFinite ||
          weight <= 0 ||
          weight != weight.roundToDouble())) {
    throw const PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
  }
  final packageImage =
      kind == 'image' &&
      weight == null &&
      builtinImageAliases.contains(alias) &&
      descriptor.length == 1 &&
      descriptor['src'] == 'patch-map-builtin://images/$alias.svg';
  final packageFont =
      kind == 'font' &&
      builtinFontWeights.contains(weight) &&
      alias == 'FiraCode-$weight' &&
      canonicalJson(descriptor) ==
          canonicalJson({
            'src': _fontSource,
            'parser': 'web-font',
            'data': {
              'family': 'FiraCode',
              'weights': builtinFontWeights.map((value) => '$value').toList(),
            },
          });
  return PatchMapNormalizedAssetRegistration(
    alias,
    descriptor,
    kind as String,
    weight is num ? weight.toInt() : null,
    packageImage || packageFont,
  );
}

/// Alias catalog; physical resources are shared by backend object identity.
class PatchMapAssetRuntime {
  PatchMapAssetRuntime([PatchMapAssetBackend? backend])
    : backend = backend ?? _defaultNativeBackend;
  final PatchMapAssetBackend backend;
  _AssetCoordinator get _coordinator =>
      _coordinators[backend] ??= _AssetCoordinator(backend);
  final Map<String, PatchMapNormalizedAssetRegistration> _aliases = {};
  PatchMapAssetSession createSession({
    required String instanceId,
    JsonMap? policy,
  }) => PatchMapAssetSession._(
    this,
    _nonempty(instanceId, 'instanceId'),
    normalizePatchMapAssetPolicy(policy),
  );
  PatchMapResult registerAlias(JsonMap registration) =>
      registerAssets([registration]);
  PatchMapResult registerAssets(List<JsonMap> registrations) {
    final normalized = registrations.map(_normalizeRegistration).toList(),
        seen = <String, String>{};
    for (final registration in normalized) {
      final previous = seen[registration.alias],
          existing = _aliases[registration.alias];
      if (previous != null && previous != registration.signature ||
          existing != null && existing.signature != registration.signature) {
        throw const PatchMapAssetError('CONFLICT', 'CONFLICT', false);
      }
      seen[registration.alias] = registration.signature;
    }
    final added = <String>[], duplicates = <String>[];
    for (final registration in normalized) {
      if (_aliases.containsKey(registration.alias)) {
        duplicates.add(registration.alias);
      } else {
        _aliases[registration.alias] = registration;
        added.add(registration.alias);
      }
    }
    return PatchMapResult({
      'registeredAliases': added,
      'duplicateAliases': duplicates,
    });
  }

  PatchMapNormalizedAssetRegistration resolve(String alias) {
    final value = _aliases[_nonempty(alias, 'alias')];
    if (value == null)
      throw const PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
    return value;
  }

  PatchMapNormalizedAssetRegistration sourceEntry(Object source) =>
      PatchMapNormalizedAssetRegistration(
        '',
        normalizeNativeAssetDescriptor(source),
        'image',
        null,
        false,
      );
  PatchMapNormalizedAssetRegistration _bindingEntry(Object source) =>
      (source is String ? _aliases[source.trim()] : null) ??
      sourceEntry(source);
  JsonMap probe([String? alias]) {
    final registration = alias == null ? null : _aliases[alias.trim()];
    final entries = _coordinator.resources.values;
    final matching = registration == null
        ? <_AssetResource>[]
        : entries
              .where(
                (entry) =>
                    entry.source.resourceIdentity ==
                    registration.resourceIdentity,
              )
              .toList();
    final state = matching.any((e) => e.state == 'cleanup-failed')
        ? 'cleanup-failed'
        : matching.any((e) => e.state == 'releasing')
        ? 'releasing'
        : matching.any((e) => e.state == 'pending')
        ? 'pending'
        : matching.isEmpty
        ? 'absent'
        : 'resolved';
    int count(Iterable<_AssetResource> values, String status) => values.fold(
      0,
      (n, e) => n + e.users.where((u) => u.status == status).length,
    );
    return {
      'builtins': {'aliases': builtinImageAliases},
      'fonts': {'weights': builtinFontWeights},
      'aliasCount': _aliases.length,
      'resourceCount': entries.length,
      'pendingCount': count(entries, 'pending'),
      'leaseCount': count(entries, 'leased'),
      'cleanupPendingCount': entries
          .where((e) => e.state == 'cleanup-failed')
          .length,
      'resource': registration == null
          ? null
          : {
              'cacheIdentity': registration.cacheIdentity,
              'resourceCount': matching.length,
              'pendingCount': count(matching, 'pending'),
              'leaseCount': count(matching, 'leased'),
              'ownership': matching.isEmpty ? null : matching.first.ownership,
              'state': state,
              'cleanupPending': state == 'cleanup-failed',
              'cleanupRetryOwner': state == 'cleanup-failed' ? 'runtime' : null,
            },
    };
  }

  /// Low-level native binding of the exported runtime coordinator protocol.
  Future<Object?> attach(PatchMapAssetUse use) async {
    await _coordinator.attach(use);
    return use.promise;
  }

  Future<void> release(PatchMapAssetUse use) => _coordinator.release(use);
  Future<void> retryCleanupFor(Iterable<String> canonicalKeys) =>
      _coordinator.retryCleanup(canonicalKeys.toSet());
  Future<void> retryCleanup() => _coordinator.retryCleanup();
}

final List<JsonMap> patchMapBuiltinAssets = List.unmodifiable([
  for (final alias in builtinImageAliases)
    Map<String, dynamic>.unmodifiable({
      'alias': alias,
      'descriptor': 'patch-map-builtin://images/$alias.svg',
      'kind': 'image',
    }),
  for (final weight in builtinFontWeights)
    freezeJson({
          'alias': 'FiraCode-$weight',
          'kind': 'font',
          'fontWeight': weight,
          'descriptor': {
            'src': _fontSource,
            'parser': 'web-font',
            'data': {
              'family': 'FiraCode',
              'weights': builtinFontWeights.map((v) => '$v').toList(),
            },
          },
        })
        as JsonMap,
]);
final patchMapAssetRuntime = PatchMapAssetRuntime();
String _assetHash(String value) {
  var high = 0xcbf29ce4, low = 0x84222325;
  for (final unit in value.codeUnits) {
    low = (low ^ unit) & 0xffffffff;
    final product = low * 0x1b3;
    high = (high * 0x1b3 + (product >> 32) + (low << 8)) & 0xffffffff;
    low = product & 0xffffffff;
  }
  return '${high.toRadixString(16).padLeft(8, '0')}${low.toRadixString(16).padLeft(8, '0')}';
}

Object? _cloneAssetJson(Object? value, Set<Object> ancestors) {
  if (value == null || value is String || value is bool) return value;
  if (value is num && value.isFinite) return value;
  if (value is! Map && value is! List || ancestors.contains(value)) {
    throw const PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
  }
  ancestors.add(value);
  try {
    if (value is List)
      return List.unmodifiable(value.map((v) => _cloneAssetJson(v, ancestors)));
    final record = value as Map;
    if (record.keys.any((key) => key is! String))
      throw const PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
    return Map<String, dynamic>.unmodifiable({
      for (final key in record.keys)
        key as String: _cloneAssetJson(record[key], ancestors),
    });
  } finally {
    ancestors.remove(value);
  }
}
