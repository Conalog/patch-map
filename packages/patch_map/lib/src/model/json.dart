import 'dart:collection';
import 'dart:convert';

typedef JsonMap = Map<String, dynamic>;

class PatchMapDatasetError implements Exception {
  const PatchMapDatasetError(this.code, this.datasetPath, this.detail);
  final String code;
  final String datasetPath;
  final String detail;
  String get category =>
      code == 'MISSING_TARGET' ? 'MISSING_TARGET' : 'INVALID_INPUT';
  @override
  String toString() => '$code at $datasetPath: $detail';
}

/// Copies JSON values without retaining mutable aliases. Cycles and non-JSON
/// values fail at the same admission boundary as ordinary invalid dataset data.
dynamic cloneJson(Object? value, {String path = r'$'}) =>
    _copy(value, path, HashSet.identity(), false);
dynamic freezeJson(Object? value, {String path = r'$'}) =>
    _copy(value, path, HashSet.identity(), true);

dynamic _copy(Object? value, String path, Set<Object> ancestors, bool frozen) {
  if (value == null || value is String || value is bool) return value;
  if (value is num && value.isFinite) return value;
  if (value is! List && value is! Map) {
    throw PatchMapDatasetError(
      'INVALID_VALUE',
      path,
      'value must be finite JSON',
    );
  }
  if (!ancestors.add(value)) {
    throw PatchMapDatasetError('INVALID_VALUE', path, 'cyclic JSON value');
  }
  try {
    if (value is List) {
      final result = [
        for (var i = 0; i < value.length; i++)
          _copy(value[i], '$path[$i]', ancestors, frozen),
      ];
      return frozen ? List<dynamic>.unmodifiable(result) : result;
    }
    final result = <String, dynamic>{};
    for (final entry in (value as Map).entries) {
      if (entry.key is! String)
        throw PatchMapDatasetError(
          'INVALID_VALUE',
          path,
          'object keys must be strings',
        );
      result[entry.key as String] = _copy(
        entry.value,
        '$path.${entry.key}',
        ancestors,
        frozen,
      );
    }
    return frozen ? Map<String, dynamic>.unmodifiable(result) : result;
  } finally {
    ancestors.remove(value);
  }
}

/// ECMAScript-compatible finite number spelling, including exponent thresholds.
String canonicalNumber(num number) {
  if (!number.isFinite)
    throw ArgumentError.value(number, 'number', 'must be finite');
  final value = number.toDouble();
  if (value == 0) return '0';
  final negative = value < 0;
  var source = value.abs().toString();
  var exponent = 0;
  if (source.contains('e')) {
    final parts = source.split('e');
    source = parts[0];
    exponent = int.parse(parts[1]);
  }
  var point = source.indexOf('.');
  if (point < 0) point = source.length;
  var digits = source.replaceAll('.', '');
  var decimal = point + exponent;
  while (digits.startsWith('0') && digits.length > 1) {
    digits = digits.substring(1);
    decimal--;
  }
  while (digits.endsWith('0') && digits.length > 1) {
    digits = digits.substring(0, digits.length - 1);
  }
  String result;
  if (decimal > 0 && decimal <= 21) {
    result = digits.length <= decimal
        ? digits.padRight(decimal, '0')
        : '${digits.substring(0, decimal)}.${digits.substring(decimal)}';
  } else if (decimal <= 0 && decimal > -6) {
    result = '0.${''.padLeft(-decimal, '0')}$digits';
  } else {
    final power = decimal - 1;
    result =
        '${digits[0]}${digits.length > 1 ? '.${digits.substring(1)}' : ''}e${power >= 0 ? '+' : ''}$power';
  }
  return negative ? '-$result' : result;
}

String canonicalJson(Object? value) {
  if (value == null || value is bool || value is String)
    return jsonEncode(value);
  if (value is num) return canonicalNumber(value);
  if (value is List) return '[${value.map(canonicalJson).join(',')}]';
  if (value is Map<String, dynamic>) {
    final keys = value.keys.toList()..sort();
    return '{${keys.map((key) => '${jsonEncode(key)}:${canonicalJson(value[key])}').join(',')}}';
  }
  throw ArgumentError('Not a normalized JSON value');
}

String semanticHash(Object? value) {
  // Two unsigned halves avoid BigInt allocation on every UTF-16 code unit.
  var high = 0xcbf29ce4;
  var low = 0x84222325;
  for (final unit in canonicalJson(value).codeUnits) {
    low = (low ^ unit) & 0xffffffff;
    final product = low * 0x1b3;
    high = (high * 0x1b3 + (product >> 32) + (low << 8)) & 0xffffffff;
    low = product & 0xffffffff;
  }
  return 'fnv1a64:${high.toRadixString(16).padLeft(8, '0')}${low.toRadixString(16).padLeft(8, '0')}';
}
