import 'dart:convert';

import '../dataset/dataset_values.dart' show cloneJson, DatasetException;
import 'canonical_json.dart';
import 'images/image_source.dart';
import 'svg/svg_source.dart';

/// One alias registry for both SVG and raster assets. data is loader
/// configuration, not SVG text substitution or item placement. Physical byte
/// identity includes every option passed to the loader; descriptor identity
/// additionally includes parser/format choices.
final class AssetRegistry {
  factory AssetRegistry({Map<String, Object?> symbols = const {}}) {
    final normalized = <String, _Descriptor>{};
    for (final entry in symbols.entries) {
      final key = _nonempty(entry.key, 'symbol alias');
      if (normalized.containsKey(key)) {
        throw FormatException('Duplicate image alias after trimming: $key');
      }
      normalized[key] = _descriptor(entry.value);
    }
    return AssetRegistry._(
      Map.unmodifiable(normalized),
      SvgSourceResolver(
        symbols: {
          for (final entry in normalized.entries)
            entry.key: entry.value.toJson(),
        },
      ),
    );
  }
  AssetRegistry._(this._symbols, this.svg);
  final Map<String, _Descriptor> _symbols;
  final SvgSourceResolver svg;

  ResolvedAsset resolve(Object value) {
    var descriptor = _descriptor(value);
    final visited = <String>{};
    while (_symbols.containsKey(descriptor.src)) {
      final src = descriptor.src;
      if (!visited.add(src)) throw FormatException('Cyclic image alias: $src');
      final registered = _symbols[src]!;
      descriptor = _Descriptor(
        registered.src,
        canonicalResourceJson({...registered.data, ...descriptor.data})
            as Map<String, Object?>,
        descriptor.parser ?? registered.parser,
        descriptor.format ?? registered.format,
      );
    }
    final src = descriptor.src, uri = Uri.parse(descriptor.src);
    final isSvg =
        builtinSvgSources.containsKey(src) ||
        uri.path.toLowerCase().endsWith('.svg') ||
        (src.length >= 18 &&
            src.substring(0, 18).toLowerCase() == 'data:image/svg+xml') ||
        descriptor.format == 'svg' ||
        descriptor.parser == 'svg' ||
        uri.scheme == 'patch-map-builtin';
    _validateUri(uri, src, isSvg: isSvg);
    if (isSvg) {
      final spec = svg.resolve(descriptor.toJson());
      if (spec.unsupportedDataFields.isNotEmpty) {
        throw SvgSourceException(
          'unsupported-data',
          spec.canonicalSrc,
          'Unsupported SVG loader fields: ${spec.unsupportedDataFields.join(', ')}',
        );
      }
      return ResolvedAsset._(
        spec.canonicalSrc,
        spec.identity,
        spec.data,
        spec,
        _byteSource(spec.canonicalSrc, spec.data),
      );
    }
    if (uri.scheme.isEmpty && !src.contains('/') && !src.contains('.')) {
      throw FormatException('Image alias is not registered: $src');
    }
    final canonical = uri.normalizePath().toString();
    final data = descriptor.data;
    return ResolvedAsset._(
      canonical,
      jsonEncode({
        'src': canonical,
        'data': data,
        'format': descriptor.format,
        'parser': descriptor.parser,
      }),
      data,
      null,
      _byteSource(canonical, data),
    );
  }
}

final class ResolvedAsset {
  const ResolvedAsset._(
    this.src,
    this.identity,
    this.data,
    this.svg,
    this.byteSource,
  );
  final String src, identity;
  final Map<String, Object?> data;
  final SvgSourceSpec? svg;
  final RasterImageSource byteSource;
}

final class _Descriptor {
  const _Descriptor(this.src, this.data, this.parser, this.format);
  final String src;
  final Map<String, Object?> data;
  final String? parser, format;
  Map<String, Object?> toJson() => {
    'src': src,
    'data': data,
    if (parser != null) 'parser': parser,
    if (format != null) 'format': format,
  };
}

_Descriptor _descriptor(Object? value) {
  if (value is String) {
    return _Descriptor(_nonempty(value, 'asset src'), const {}, null, null);
  }
  if (value is! Map || value.keys.any((key) => key is! String)) {
    throw const FormatException(
      'Image source must be a string or string-keyed descriptor',
    );
  }
  const allowed = {'src', 'data', 'format', 'parser', 'loadParser'};
  if (value.keys.any((key) => !allowed.contains(key))) {
    throw const FormatException('Unknown image descriptor field');
  }
  final src = _nonempty(value['src'], 'asset src');
  final data = value.containsKey('data')
      ? _jsonRecord(value['data'], 'source.data')
      : const <String, Object?>{};
  String? option(String key) =>
      value.containsKey(key) ? _nonempty(value[key], 'asset $key') : null;
  final parser = option('parser'), legacyParser = option('loadParser');
  return _Descriptor(src, data, parser ?? legacyParser, option('format'));
}

String _nonempty(Object? value, String label) {
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('$label must be a nonempty string');
  }
  return value.trim();
}

Map<String, Object?> _jsonRecord(Object? value, String path) {
  if (value is! Map || value.keys.any((key) => key is! String)) {
    throw FormatException('$path must be a JSON object');
  }
  try {
    return canonicalResourceJson(cloneJson(value, path))
        as Map<String, Object?>;
  } on DatasetException catch (error) {
    throw FormatException('${error.path}: ${error.message}');
  }
}

void _validateUri(Uri uri, String src, {required bool isSvg}) {
  final scheme = uri.scheme;
  final invalid =
      !const {
        '',
        'http',
        'https',
        'data',
        'patch-map-builtin',
      }.contains(scheme) ||
      (scheme.isEmpty && uri.hasAuthority) ||
      ((scheme == 'http' || scheme == 'https') &&
          (!uri.hasAuthority || uri.host.isEmpty));
  if (!invalid) return;
  if (isSvg) {
    throw SvgSourceException(
      'unsupported-source',
      src,
      'Unsupported SVG URI scheme or missing HTTP host',
    );
  }
  throw FormatException(
    'Unsupported image URI scheme or missing HTTP host: $src',
  );
}

RasterImageSource _byteSource(String src, Map<String, Object?> options) {
  final uri = Uri.parse(src), builtin = builtinSvgAssetPath(src);
  _validateUri(uri, src, isSvg: uri.path.toLowerCase().endsWith('.svg'));
  if (uri.scheme == 'patch-map-builtin' && builtin == null) {
    throw SvgSourceException('unresolved-alias', src, 'Unknown packaged SVG');
  }
  if ((uri.scheme == 'http' || uri.scheme == 'https') &&
      options['headers'] != null) {
    final headers = options['headers'];
    if (headers is! Map ||
        headers.entries.any(
          (entry) => entry.key is! String || entry.value is! String,
        )) {
      throw const FormatException(
        'Image loader headers must contain string names and values',
      );
    }
  }
  final canonical = uri.normalizePath().toString();
  final canonicalUri = const {'http', 'https', 'data'}.contains(uri.scheme)
      ? uri
      : null;
  final assetKey = builtin ?? (uri.scheme.isEmpty ? canonical : null);
  return RasterImageSource(
    // Parser/format/placement are not transfer inputs. data must remain part of
    // this key: even the same URL can return different bytes for other headers.
    identity: jsonEncode({
      'uri': canonicalUri?.normalizePath().toString(),
      'assetKey': assetKey,
      'loaderOptions': options,
    }),
    canonicalUri: canonicalUri,
    assetKey: assetKey,
    loaderOptions: options,
  );
}
