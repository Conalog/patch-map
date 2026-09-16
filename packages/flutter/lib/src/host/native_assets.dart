import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/services.dart';
import 'package:flutter_avif/flutter_avif.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:vector_graphics/vector_graphics.dart' as vector_graphics;
import 'font_decoder.dart';

import '../api/values.dart';
import '../engine/ports.dart';
import '../model/dataset.dart';
import '../semantic/geometry/primitives.dart';

part 'native_asset_runtime.dart';
part 'native_asset_decoding.dart';
part 'native_asset_backend.dart';
part 'native_asset_session.dart';
part 'native_asset_policy.dart';

typedef NativeAssetReader = Future<(String, Uint8List)> Function(Object source);
typedef NativeAssetDecoder =
    Future<NativeAsset> Function(String mime, Uint8List bytes, Object source);

class _Use {
  _Use(this.key, this.source, this.packageOwned, this.kind);
  final String key, kind;
  final JsonMap source;
  final bool packageOwned;
  final result = Completer<NativeAsset>();
  PatchMapAssetAcquisition? acquisition;
  bool released = false;
  NativeAsset? value;
}

class _Binding {
  _Binding(this.requestedKey);
  String requestedKey;
  String? resolvedKey;
}

class NativeAssetSession implements PatchMapAssetPort {
  NativeAssetSession({
    PatchMapAssetRuntime? runtime,
    JsonMap? policy,
    NativeAssetReader? reader,
    NativeAssetDecoder? decoder,
    Future<void> Function()? fontInitializer,
    bool decodingOnly = false,
    String? instanceId,
  }) : runtime = runtime ?? patchMapAssetRuntime,
       _reader = reader,
       _decoder = decoder,
       _fontInitializer = fontInitializer,
       maxBytes = _policyValue(policy, 'maxEncodedBytes', 20 * 1024 * 1024),
       maxWidth = _policyValue(policy, 'maxDecodedWidth', 8192),
       maxHeight = _policyValue(policy, 'maxDecodedHeight', 8192) {
    if (!decodingOnly) {
      _session = this.runtime.createSession(
        instanceId: instanceId ?? 'native-${++_sessionSequence}',
        policy: policy,
      );
      _session.registerAssets();
    }
    if (policy?.keys.any(
          (key) => !{
            'maxEncodedBytes',
            'maxDecodedWidth',
            'maxDecodedHeight',
          }.contains(key),
        ) ??
        false) {
      throw const PatchMapException(
        'INVALID_VALUE',
        'Unknown asset policy field',
      );
    }
  }
  static int _policyValue(JsonMap? policy, String key, int fallback) {
    final value = policy?[key] ?? fallback;
    if (value is! num ||
        !value.isFinite ||
        value <= 0 ||
        value > 9007199254740991 ||
        value != value.roundToDouble()) {
      throw PatchMapException(
        'INVALID_VALUE',
        '$key must be a positive safe integer',
      );
    }
    return value.toInt();
  }

  static int _sessionSequence = 0;
  late final PatchMapAssetSession _session;
  final PatchMapAssetRuntime runtime;
  final int maxBytes, maxWidth, maxHeight;
  final NativeAssetReader? _reader;
  final NativeAssetDecoder? _decoder;
  final Future<void> Function()? _fontInitializer;
  final Map<String, _Use> _uses = {};
  final Map<String, _Binding> _bindings = {};
  final Map<String, Object> _errors = {};
  Set<String> _desired = {};
  bool _managed = false, _disposed = false, _cleanupComplete = false;
  Future<void>? _disposeAttempt;
  int _readyGeneration = 0;
  Map<String, String> _readyKeys = {};
  Future<void>? _activeReady;
  Future<void>? _fontReady;
  static Future<void>? _builtinFontRegistration;
  void Function()? invalidate;

  Future<void> initialize() {
    if (_disposed)
      return Future.error(
        const PatchMapException('CANCELLED', 'Asset session destroyed'),
      );
    return _fontReady ??= _initializeFont();
  }

  Future<void> _initializeFont() async {
    // Process font registration is a platform barrier, not evidence supplied by
    // an arbitrary shared backend cache hit.
    if (_fontInitializer != null) {
      await _fontInitializer();
    } else {
      await (_builtinFontRegistration ??= _loadFont());
    }
    final acquisition = await _session._acquire(
      runtime.resolve('FiraCode-400'),
      loader: () async => NativeAsset(width: 1, height: 1, isFont: true),
    );
    if (acquisition.resource is! NativeAsset ||
        !(acquisition.resource as NativeAsset).isFont) {
      await acquisition.release();
      throw const PatchMapAssetError(
        'ASSET_DECODE_FAILED',
        'ASSET_FAILURE',
        false,
      );
    }
    if (_disposed)
      throw const PatchMapException('CANCELLED', 'Asset session destroyed');
  }

  static Future<void> _loadFont() async {
    final data = await rootBundle.load(
      'packages/conalog_patch_map/assets/fonts/FiraCode-VF.ttf',
    );
    await (FontLoader('FiraCode')..addFont(Future.value(data))).load();
  }

  @override
  PatchMapResult register(List<JsonMap> registrations) {
    if (_disposed)
      throw const PatchMapException('CANCELLED', 'Asset session destroyed');
    final result = runtime.registerAssets(registrations);
    _activeReady = null;
    invalidate?.call();
    return result;
  }

  String sourceKey(Object source) {
    final entry = runtime._bindingEntry(source);
    return '${entry.packageOwned ? 'package' : 'host'}:${canonicalJson(entry.descriptor)}';
  }

  NativeAsset? lookup(Object source, String binding) {
    final key = sourceKey(source), current = _uses[key]?.value;
    if (current != null) return current;
    return _uses[_bindings[binding]?.resolvedKey]?.value;
  }

  Future<NativeAsset> ensure(Object source) {
    if (_disposed)
      return Future.error(
        const PatchMapException('CANCELLED', 'Asset session destroyed'),
      );
    final entry = runtime._bindingEntry(source),
        key = sourceKey(source),
        existing = _uses[key];
    if (existing != null && !existing.released) return existing.result.future;
    final use = _Use(key, entry.descriptor, entry.packageOwned, entry.kind);
    _uses[key] = use;
    unawaited(_start(use));
    return use.result.future;
  }

  Future<void> _start(_Use use) async {
    try {
      Future<Object?> Function()? loader;
      // Test/native injection preserves per-session admission. Normal consumers
      // enter the backend once through the same public acquisition coordinator.
      if (_reader != null || _decoder != null) {
        final input =
            await (_reader?.call(use.source) ??
                _admit(use.source, packageOwned: use.packageOwned));
        final mime = _validateInput(input.$1, input.$2, use.source);
        loader = () =>
            _decoder?.call(mime, input.$2, use.source) ??
            _decode(mime, input.$2, use.source);
      }
      if (_disposed || use.released)
        throw const PatchMapException('CANCELLED', 'Asset request superseded');
      final acquisition = await _session._acquire(
        PatchMapNormalizedAssetRegistration(
          '',
          use.source,
          use.kind,
          null,
          use.packageOwned,
        ),
        loader: loader,
      );
      use.acquisition = acquisition;
      if (_disposed || use.released) {
        await acquisition.release();
        throw const PatchMapException('CANCELLED', 'Asset request superseded');
      }
      final resource = acquisition.resource;
      if (resource is! NativeAsset)
        throw const PatchMapAssetError(
          'ASSET_DECODE_FAILED',
          'ASSET_FAILURE',
          false,
        );
      final value = resource;
      if (loader == null &&
          !(use.kind == 'font' && value.isFont) &&
          value.image == null &&
          value.picture == null) {
        throw const PatchMapAssetError(
          'ASSET_DECODE_FAILED',
          'ASSET_FAILURE',
          false,
        );
      }
      if (_disposed || use.released)
        throw const PatchMapException('CANCELLED', 'Asset request superseded');
      if (!value.width.isFinite ||
          !value.height.isFinite ||
          value.width <= 0 ||
          value.height <= 0 ||
          (!use.packageOwned &&
              (value.width > maxWidth || value.height > maxHeight))) {
        throw const PatchMapException(
          'ASSET_POLICY_REJECTED',
          'Decoded dimensions exceed policy',
        );
      }
      if (_managed &&
          !_desired.contains(use.key) &&
          !_bindings.values.any((binding) => binding.resolvedKey == use.key)) {
        throw const PatchMapException(
          'CANCELLED',
          'Asset source no longer visible',
        );
      }
      use.value = value;
      _errors.remove(use.key);
      for (final binding in _bindings.values) {
        if (binding.requestedKey == use.key) binding.resolvedKey = use.key;
      }
      if (!use.result.isCompleted) use.result.complete(value);
      invalidate?.call();
      _collectUnused();
    } catch (error, stack) {
      if (!_disposed && !use.released) _errors[use.key] = error;
      try {
        await _release(use);
      } catch (_) {}
      if (identical(_uses[use.key], use)) _uses.remove(use.key);
      if (!use.result.isCompleted) use.result.completeError(error, stack);
    }
  }

  Future<void> _release(_Use use) async {
    if (use.released) return;
    use.released = true;
    await use.acquisition?.release();
  }

  void _collectUnused() {
    if (!_managed) return;
    final keep = {
      ..._desired,
      for (final binding in _bindings.values)
        if (binding.resolvedKey != null) binding.resolvedKey!,
    };
    _errors.removeWhere((key, _) => !keep.contains(key));
    for (final use in _uses.values.toList()) {
      if (keep.contains(use.key)) continue;
      _uses.remove(use.key);
      _errors.remove(use.key);
      unawaited(_release(use).catchError((Object _) {}));
      if (!use.result.isCompleted)
        use.result.completeError(
          const PatchMapException('CANCELLED', 'Asset request superseded'),
        );
    }
  }

  @override
  Future<void> ready(PatchMapRenderSnapshot snapshot) {
    if (_disposed)
      return Future.error(
        const PatchMapException('CANCELLED', 'Asset session destroyed'),
      );
    final sources = _visibleSources(snapshot), keyCache = <Object, String>{};
    String keyFor(Object source) =>
        keyCache.putIfAbsent(source, () => sourceKey(source));
    final keys = {
      for (final entry in sources.entries) entry.key: keyFor(entry.value),
    };
    final same =
        keys.length == _readyKeys.length &&
        keys.entries.every((entry) => _readyKeys[entry.key] == entry.value);
    if (same && _activeReady != null) return _activeReady!;
    _readyKeys = keys;
    final generation = ++_readyGeneration;
    final future = _prepareBindings(sources, keys, generation);
    _activeReady = future;
    unawaited(
      future.then(
        (_) {},
        onError: (Object _, StackTrace __) {
          if (generation == _readyGeneration) _activeReady = null;
        },
      ),
    );
    return future;
  }

  Future<void> _prepareBindings(
    Map<String, Object> sources,
    Map<String, String> keys,
    int generation,
  ) async {
    await initialize();
    if (_disposed || generation != _readyGeneration)
      throw const PatchMapException('CANCELLED', 'Asset readiness superseded');
    _managed = true;
    _desired = keys.values.toSet();
    _bindings.removeWhere((binding, _) => !sources.containsKey(binding));
    for (final entry in sources.entries) {
      final key = keys[entry.key]!,
          binding = _bindings.putIfAbsent(entry.key, () => _Binding(key));
      binding.requestedKey = key;
      if (_uses[key]?.value != null) binding.resolvedKey = key;
    }
    invalidate?.call();
    _collectUnused();
    await Future.wait([
      for (final source in {
        for (final entry in sources.entries) keys[entry.key]!: entry.value,
      }.values)
        ensure(source),
    ]);
    if (_disposed || generation != _readyGeneration)
      throw const PatchMapException('CANCELLED', 'Asset readiness superseded');
  }

  @override
  Map<String, MapRect> get imageSizes {
    final result = <String, MapRect>{};
    for (final entry in _bindings.entries) {
      if (!entry.key.endsWith('\u0000')) continue;
      final asset =
          _uses[entry.value.requestedKey]?.value ??
          _uses[entry.value.resolvedKey]?.value;
      if (asset != null)
        result[entry.key.substring(0, entry.key.length - 1)] = MapRect(
          0,
          0,
          asset.width,
          asset.height,
        );
    }
    return result;
  }

  Map<String, Object> _visibleSources(PatchMapRenderSnapshot snapshot) {
    final sources = <String, Object>{};
    for (final primitive in snapshot.geometry.primitives) {
      if (!primitive.visible || primitive.opacity <= 0) continue;
      final source = primitive.value['source'];
      if (primitive.type != 'text' &&
          source is! String &&
          !(source is Map && source['src'] is String))
        continue;
      final key = '${primitive.ownerId}\u0000${primitive.componentId ?? ''}';
      if ((snapshot.presentationAlpha[key] ??
              snapshot.presentationAlpha[primitive.ownerId] ??
              1) <=
          0)
        continue;
      if (source is String || source is Map && source['src'] is String)
        sources[key] = source!;
      if (primitive.type == 'text') {
        final style = primitive.value['style'] as Map?;
        final family = style?['fontFamily'];
        final families = family is List
            ? family.whereType<String>().toList()
            : family is String
            ? family
                  .split(',')
                  .map(
                    (value) =>
                        value.trim().replaceAll(RegExp(r'''^["']|["']$'''), ''),
                  )
                  .toList()
            : <String>[];
        for (final registration in runtime._aliases.values) {
          if (registration.kind != 'font' || registration.packageOwned)
            continue;
          final registeredFamily =
              (registration.descriptor['data'] as Map?)?['family'];
          if (families.contains(registeredFamily))
            sources['font:${registration.alias}'] = registration.alias;
        }
      }
    }
    return sources;
  }

  @override
  JsonMap status([String? alias]) => {
    'session': _cleanupComplete
        ? null
        : {
            ..._session.probe(),
            'resolved': _uses.values
                .where((value) => value.value != null)
                .length,
            'failed': _errors.length,
            if (alias != null) 'ready': _uses[sourceKey(alias)]?.value != null,
          },
    'runtime': runtime.probe(alias),
  };
  @override
  Future<void> dispose() async {
    final pending = _disposeAttempt;
    if (pending != null) return pending;
    final attempt = _disposeOwned();
    _disposeAttempt = attempt;
    try {
      await attempt;
    } finally {
      if (identical(_disposeAttempt, attempt)) _disposeAttempt = null;
    }
  }

  Future<void> _disposeOwned() async {
    if (_cleanupComplete) return;
    if (_disposed) {
      await _session.retryCleanup();
      _cleanupComplete = true;
      return;
    }
    _disposed = true;
    _readyGeneration++;
    invalidate = null;
    for (final use in _uses.values) {
      use.released = true;
      if (!use.result.isCompleted)
        use.result.completeError(
          const PatchMapException('CANCELLED', 'Asset session destroyed'),
        );
    }
    _uses.clear();
    _bindings.clear();
    _desired.clear();
    _readyKeys.clear();
    _activeReady = null;
    _errors.clear();
    await _session.destroy();
    _cleanupComplete = true;
  }
}
