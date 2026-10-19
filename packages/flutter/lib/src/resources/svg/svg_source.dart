import 'dart:convert';

import '../../dataset/dataset_values.dart' show cloneJson, DatasetException;

const _builtins = <String, Object?>{
  'object': 'patch-map-builtin://images/object.svg',
  'device': 'patch-map-builtin://images/device.svg',
  'loading': 'patch-map-builtin://images/loading.svg',
  'warning': 'patch-map-builtin://images/warning.svg',
  'wifi': 'patch-map-builtin://images/wifi.svg',
};

final class SvgSourceException implements Exception {
  const SvgSourceException(this.code, this.source, this.message);
  final String code, source, message;
  @override
  String toString() => '$code at $source: $message';
}

/// Canonical source and detached loader configuration, independent of tint or
/// item placement. data is loader configuration, not XML template substitution.
final class SvgSourceSpec {
  SvgSourceSpec._(this.canonicalSrc, this.data) {
    if (data.containsKey('parseAsGraphicsContext') &&
        data['parseAsGraphicsContext'] is! bool) {
      throw SvgSourceException(
        'invalid-data',
        canonicalSrc,
        'parseAsGraphicsContext must be boolean',
      );
    }
    for (final key in ['width', 'height', 'resolution']) {
      final value = data[key];
      if (value != null && (value is! num || !value.isFinite || value <= 0)) {
        throw SvgSourceException(
          'invalid-data',
          canonicalSrc,
          '$key must be finite and positive',
        );
      }
    }
  }

  final String canonicalSrc;
  final Map<String, Object?> data;
  double? get width => (data['width'] as num?)?.toDouble();
  double? get height => (data['height'] as num?)?.toDouble();
  double get resolution => (data['resolution'] as num? ?? 1).toDouble();
  List<String> get unsupportedDataFields => List.unmodifiable(
    data.keys.where(
      (key) => !const {
        'width',
        'height',
        'resolution',
        'parseAsGraphicsContext',
      }.contains(key),
    ),
  );
  late final String identity = jsonEncode(toJson());
  Map<String, Object?> toJson() =>
      Map.unmodifiable({'src': canonicalSrc, 'data': data, 'parser': 'svg'});
}

/// Instance-owned alias registry. Host equipment aliases must be registered;
/// only the five packaged white icons are installed by default.
final class SvgSourceResolver {
  SvgSourceResolver({Map<String, Object?> symbols = const {}})
    : _symbols = _detach({..._builtins, ...symbols}, r'$.symbols');
  final Map<String, Object?> _symbols;

  SvgSourceSpec resolve(Object source) {
    final visited = <String>{};
    var descriptor = _descriptor(source);
    while (_symbols.containsKey(descriptor.src)) {
      if (!visited.add(descriptor.src)) {
        throw SvgSourceException(
          'alias-cycle',
          descriptor.src,
          'cyclic SVG alias',
        );
      }
      final registered = _descriptor(_symbols[descriptor.src]);
      descriptor = (
        src: registered.src,
        data: {...registered.data, ...descriptor.data},
        parser: descriptor.parser ?? registered.parser,
        format: descriptor.format ?? registered.format,
      );
    }
    final src = descriptor.src;
    final uri = Uri.tryParse(src);
    if (uri == null) {
      throw SvgSourceException('invalid-source', src, 'invalid SVG URI');
    }
    if (!src.contains('/') && !src.contains('.') && !src.contains(':')) {
      throw SvgSourceException(
        'unresolved-alias',
        src,
        'SVG alias is not registered',
      );
    }
    if (uri.hasFragment) {
      throw SvgSourceException(
        'unsupported-fragment',
        src,
        'SVG URL fragment selection is not supported',
      );
    }
    if (descriptor.parser != null && descriptor.parser != 'svg') {
      throw SvgSourceException(
        'unsupported-parser',
        src,
        'source parser must be svg',
      );
    }
    if (descriptor.format != null && descriptor.format != 'svg') {
      throw SvgSourceException(
        'unsupported-format',
        src,
        'source format must be svg',
      );
    }
    final svg =
        uri.path.toLowerCase().endsWith('.svg') ||
        src.toLowerCase().startsWith('data:image/svg+xml') ||
        descriptor.parser == 'svg' ||
        descriptor.format == 'svg';
    if (!svg) {
      throw SvgSourceException(
        'unsupported-source',
        src,
        'source is not identified as SVG',
      );
    }
    final canonical = uri.normalizePath().toString();
    if (uri.scheme == 'patch-map-builtin' &&
        builtinSvgAssetPath(canonical) == null) {
      throw SvgSourceException('unresolved-alias', src, 'unknown packaged SVG');
    }
    final data = _canonicalJson(descriptor.data) as Map<String, Object?>;
    return SvgSourceSpec._(canonical, data);
  }
}

/// Bundled Flutter asset key; null for sources outside the packaged registry.
String? builtinSvgAssetPath(String canonicalSrc) {
  for (final entry in _builtins.entries) {
    if (entry.value == canonicalSrc) {
      return 'packages/conalog_patch_map/assets/icons/${entry.key}.svg';
    }
  }
  return null;
}

typedef _Descriptor = ({
  String src,
  Map<String, Object?> data,
  String? parser,
  String? format,
});
_Descriptor _descriptor(Object? value) {
  if (value is String && value.trim().isNotEmpty) {
    return (src: value.trim(), data: const {}, parser: null, format: null);
  }
  if (value is! Map || value.keys.any((key) => key is! String)) {
    throw const SvgSourceException(
      'invalid-source',
      'source',
      'expected SVG source string or descriptor',
    );
  }
  const keys = {'src', 'data', 'format', 'parser', 'loadParser'};
  if (value.keys.any((key) => !keys.contains(key)) ||
      value['src'] is! String ||
      (value['src'] as String).trim().isEmpty) {
    throw const SvgSourceException(
      'invalid-source',
      'source',
      'invalid SVG source descriptor',
    );
  }
  final data = value.containsKey('data')
      ? value['data']
      : const <String, Object?>{};
  if (data is! Map || data.keys.any((key) => key is! String)) {
    throw SvgSourceException(
      'invalid-data',
      value['src'] as String,
      'SVG data must be a JSON object',
    );
  }
  final parser = value['parser'] ?? value['loadParser'];
  if ((parser != null && parser is! String) ||
      (value['format'] != null && value['format'] is! String)) {
    throw SvgSourceException(
      'invalid-source',
      value['src'] as String,
      'parser and format must be strings',
    );
  }
  return (
    src: (value['src'] as String).trim(),
    data: _detach(data, r'$.source.data'),
    parser: parser as String?,
    format: value['format'] as String?,
  );
}

Map<String, Object?> _detach(Object value, String path) {
  try {
    return cloneJson(value, path)! as Map<String, Object?>;
  } on DatasetException catch (error) {
    throw SvgSourceException('invalid-data', error.path, error.message);
  }
}

Object? _canonicalJson(Object? value) {
  if (value is Map<String, Object?>) {
    final keys = value.keys.toList()..sort();
    return Map<String, Object?>.unmodifiable({
      for (final key in keys) key: _canonicalJson(value[key]),
    });
  }
  if (value is List) {
    return List<Object?>.unmodifiable(value.map(_canonicalJson));
  }
  return value;
}
