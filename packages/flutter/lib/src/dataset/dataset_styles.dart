import 'dart:collection';

import 'colors.dart';
import 'dataset_values.dart';

const black = '#1a1a1aff';
const white = '#ffffffff';
const _strokeFields = [
  'color',
  'alpha',
  'opacity',
  'width',
  'cap',
  'join',
  'miterLimit',
  'alignment',
  'pixelLine',
  'textureSpace',
  'fill',
  'texture',
  'matrix',
];
const _textFields = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'fill',
  'stroke',
  'strokeWidth',
  'alpha',
  'cornerRadius',
  'dropShadow',
  'align',
  'textBaseline',
  'wordWrap',
  'breakWords',
  'trim',
  'wordWrapWidth',
  'whiteSpace',
  'lineHeight',
  'leading',
  'letterSpacing',
  'padding',
  'tagStyles',
  'filters',
];

/// Palette-independent schema check. A possible theme identifier is preserved,
/// including custom leaf names such as statusRed. This is not final drawing
/// acceptance: the backend must call [validateDatasetColors] or
/// [validateRecordColors] with its configured resolver before accepting work.
Object color(Object? value, String path) {
  if (value is String && isColorThemeIdentifier(value)) return value;
  final detached = cloneJson(value, path);
  if (detached == null) invalid(path, 'color must not be null');
  try {
    resolveDirectColor(detached);
  } on FormatException catch (error) {
    invalid(path, error.message);
  }
  return detached;
}

/// Final color semantics for detached roots returned by DatasetReader. Call
/// before accepting a drawing/replacement; schema validation alone deliberately
/// cannot prove custom theme identifiers exist. Grid templates are checked once
/// rather than walking every expanded cell. No canonical data is changed.
void validateDatasetColors(
  Iterable<Map<String, Object?>> roots,
  ColorResolver palette,
) {
  var index = 0;
  for (final root in roots) {
    validateRecordColors(root, palette, path: '\$[${index++}]');
  }
}

/// Checks only schema-owned color positions on one already schema-validated
/// record, including partial effective presentation records carrying `type`.
/// A backend must use this after composing an update and before accepting it.
/// attrs, labels, asset descriptor data, filters and other host JSON are not
/// searched for coincidentally named `color`/`fill` fields.
void validateRecordColors(
  Map<String, Object?> value,
  ColorResolver palette, {
  String path = r'$',
}) {
  void check(String key) {
    if (value.containsKey(key)) {
      _validateColor(value[key], '$path.$key', palette);
    }
  }

  switch (value['type']) {
    case 'group':
      if (!value.containsKey('children')) return;
      final children = array(value['children'], '$path.children');
      for (var i = 0; i < children.length; i++) {
        validateRecordColors(
          record(children[i], '$path.children[$i]'),
          palette,
          path: '$path.children[$i]',
        );
      }
    case 'grid':
      if (!value.containsKey('item')) return;
      _validateComponentColors(
        record(value['item'], '$path.item'),
        '$path.item',
        palette,
      );
    case 'item':
      _validateComponentColors(value, path, palette);
    case 'background' || 'bar':
      check('tint');
      final source = value['source'];
      // A source with src is an asset descriptor, even when its data happens
      // to contain fields named fill or borderColor.
      if (source is Map && !source.containsKey('src')) {
        _validateRectTextureColors(
          record(source, '$path.source'),
          '$path.source',
          palette,
        );
      }
    case 'icon':
      check('tint');
    case 'text':
      check('tint');
      if (value.containsKey('style')) {
        _validateTextStyleColors(
          record(value['style'], '$path.style'),
          '$path.style',
          palette,
        );
      }
    case 'rect':
      check('fill');
      if (value.containsKey('stroke')) {
        _validateStrokeColors(
          record(value['stroke'], '$path.stroke'),
          '$path.stroke',
          palette,
        );
      }
    case 'relations':
      final style = value['style'];
      if (style is Map && style.containsKey('color')) {
        _validateColor(style['color'], '$path.style.color', palette);
      }
    case 'image':
      break;
    default:
      invalid('$path.type', 'color validation needs a known record type');
  }
}

void _validateComponentColors(
  Map<String, Object?> owner,
  String path,
  ColorResolver palette,
) {
  if (!owner.containsKey('components')) return;
  final components = array(owner['components'], '$path.components');
  for (var i = 0; i < components.length; i++) {
    validateRecordColors(
      record(components[i], '$path.components[$i]'),
      palette,
      path: '$path.components[$i]',
    );
  }
}

void _validateRectTextureColors(
  Map<String, Object?> value,
  String path,
  ColorResolver palette,
) {
  for (final key in ['fill', 'borderColor']) {
    if (value.containsKey(key)) {
      _validateColor(value[key], '$path.$key', palette);
    }
  }
}

void _validateStrokeColors(
  Map<String, Object?> value,
  String path,
  ColorResolver palette,
) {
  for (final key in ['color', 'fill']) {
    if (value.containsKey(key)) {
      _validateColor(value[key], '$path.$key', palette);
    }
  }
}

void _validateTextStyleColors(
  Map<String, Object?> value,
  String path,
  ColorResolver palette,
) {
  if (value.containsKey('fill')) {
    _validateColor(value['fill'], '$path.fill', palette);
  }
  if (value.containsKey('stroke')) {
    final stroke = value['stroke'];
    if (stroke is Map) {
      _validateStrokeColors(
        record(stroke, '$path.stroke'),
        '$path.stroke',
        palette,
      );
    } else {
      _validateColor(stroke, '$path.stroke', palette);
    }
  }
  final shadow = value['dropShadow'];
  if (shadow is Map && shadow.containsKey('color')) {
    _validateColor(shadow['color'], '$path.dropShadow.color', palette);
  }
  final tags = value['tagStyles'];
  if (tags is Map) {
    for (final entry in record(tags, '$path.tagStyles').entries) {
      final tagPath = '$path.tagStyles.${entry.key}';
      _validateTextStyleColors(record(entry.value, tagPath), tagPath, palette);
    }
  }
}

void _validateColor(Object? value, String path, ColorResolver palette) {
  if (value == null) invalid(path, 'color must not be null');
  try {
    palette.resolve(value);
  } on FormatException catch (error) {
    invalid(path, error.message);
  }
}

Object assetSource(Object? value, String path, {bool partial = false}) {
  if (value is String) return value;
  final input = record(value, path);
  known(input, ['src', 'data', 'format', 'parser', 'loadParser'], path);
  return frozen({
    if (!partial || input.containsKey('src'))
      'src': string(required(input, 'src', path), '$path.src'),
    if (input.containsKey('data'))
      'data': cloneJson(record(input['data'], '$path.data'), '$path.data'),
    for (final key in ['format', 'parser', 'loadParser'])
      if (input.containsKey(key)) key: string(input[key], '$path.$key'),
  });
}

Object backgroundSource(Object? value, String path) {
  if (value is String) return value;
  final input = record(value, path);
  return input.containsKey('src')
      ? assetSource(input, path)
      : rectTexture(input, path);
}

Map<String, Object?> rectTexture(
  Object? value,
  String path, {
  bool partial = false,
}) {
  final input = record(value, path);
  known(input, ['type', 'fill', 'borderWidth', 'borderColor', 'radius'], path);
  if (input.containsKey('type') && input['type'] != 'rect') {
    throw DatasetException(
      'INVALID_RECORD_KIND',
      '$path.type',
      'rectangular texture discriminator must be rect',
    );
  }
  final normalized = <String, Object?>{
    'type': 'rect',
    'fill': input.containsKey('fill')
        ? color(input['fill'], '$path.fill')
        : '#00000000',
    'borderWidth': input.containsKey('borderWidth')
        ? number(input['borderWidth'], '$path.borderWidth', min: 0)
        : 0,
    'borderColor': input.containsKey('borderColor')
        ? color(input['borderColor'], '$path.borderColor')
        : black,
    'radius': radius(field(input, 'radius'), '$path.radius', partial: partial),
  };
  return frozen(
    partial ? {for (final key in input.keys) key: normalized[key]} : normalized,
  );
}

Map<String, Object?> stroke(
  Object? value,
  String path, {
  bool compatibility = false,
  bool partial = false,
}) {
  final input = identical(value, missing)
      ? <String, Object?>{}
      : record(value, path);
  known(input, _strokeFields, path);
  if (input.containsKey('opacity') && !compatibility) {
    throw DatasetException(
      'UNKNOWN_FIELD',
      '$path.opacity',
      'unknown field opacity',
    );
  }
  if (input.containsKey('alpha') && input.containsKey('opacity')) {
    invalid(path, 'alpha and compatibility opacity are mutually exclusive');
  }
  final normalized = <String, Object?>{
    'color': input.containsKey('color')
        ? color(input['color'], '$path.color')
        : black,
    'alpha': input.containsKey('alpha')
        ? number(input['alpha'], '$path.alpha', min: 0, max: 1)
        : input.containsKey('opacity')
        ? number(input['opacity'], '$path.opacity', min: 0, max: 1)
        : 1,
    'width': input.containsKey('width')
        ? number(input['width'], '$path.width', min: 0)
        : 1,
    'cap': input.containsKey('cap')
        ? choice(input['cap'], '$path.cap', ['butt', 'round', 'square'])
        : 'butt',
    'join': input.containsKey('join')
        ? choice(input['join'], '$path.join', ['miter', 'round', 'bevel'])
        : 'miter',
    'miterLimit': input.containsKey('miterLimit')
        ? number(input['miterLimit'], '$path.miterLimit', min: 0)
        : 10,
    'alignment': input.containsKey('alignment')
        ? number(input['alignment'], '$path.alignment', min: 0, max: 1)
        : 0.5,
    'pixelLine': input.containsKey('pixelLine')
        ? boolean(input['pixelLine'], '$path.pixelLine')
        : false,
    if (input.containsKey('textureSpace'))
      'textureSpace': choice(input['textureSpace'], '$path.textureSpace', [
        'local',
        'global',
      ]),
    for (final key in ['fill', 'texture', 'matrix'])
      if (input.containsKey(key)) key: cloneJson(input[key], '$path.$key'),
  };
  return frozen(
    partial
        ? {
            for (final key in input.keys)
              (key == 'opacity' ? 'alpha' : key):
                  normalized[key == 'opacity' ? 'alpha' : key],
          }
        : normalized,
  );
}

Map<String, Object?> relationStyle(Object? value, String path) {
  final normalized = stroke(value, path, compatibility: true);
  return frozen({
    for (final key in ['color', 'alpha', 'width']) key: normalized[key],
  });
}

Map<String, Object?> textStyle(
  Object? value,
  String path, {
  required bool item,
  bool defaults = true,
  bool partial = false,
  Set<Object>? ancestors,
}) {
  final input = identical(value, missing)
      ? <String, Object?>{}
      : record(value, path);
  known(input, [
    ..._textFields,
    if (item) ...['autoFont', 'overflow'],
  ], path);
  final parents = ancestors ?? HashSet<Object>.identity();
  final identity = identical(value, missing) ? input : value!;
  if (!parents.add(identity)) {
    invalid(path, 'cyclic text styles are not accepted');
  }
  try {
    final result = <String, Object?>{
      if (defaults) ...{
        'fontFamily': 'FiraCode',
        'fontSize': 16,
        'fontWeight': 400,
        'fill': black,
      },
    };
    for (final entry in input.entries) {
      final key = entry.key;
      final v = entry.value;
      final p = '$path.$key';
      result[key] = switch (key) {
        'fontFamily' =>
          v is String
              ? v
              : List<String>.unmodifiable(
                  array(v, p).indexed.map((e) => string(e.$2, '$p[${e.$1}]')),
                ),
        'fontSize' => _fontSize(v, p, item),
        'fontWeight' => _fontWeight(v, p),
        'fontStyle' => choice(v, p, ['normal', 'italic', 'oblique']),
        'fontVariant' => choice(v, p, ['normal', 'small-caps']),
        'fill' => color(v, p),
        'stroke' => v is Map ? stroke(v, p, partial: partial) : color(v, p),
        'strokeWidth' || 'cornerRadius' || 'padding' => number(v, p, min: 0),
        'alpha' => number(v, p, min: 0, max: 1),
        'dropShadow' => _dropShadow(v, p),
        'align' => choice(v, p, ['left', 'center', 'right', 'justify']),
        'textBaseline' => choice(v, p, [
          'alphabetic',
          'top',
          'hanging',
          'middle',
          'ideographic',
          'bottom',
        ]),
        'wordWrap' || 'breakWords' || 'trim' => boolean(v, p),
        'wordWrapWidth' => item && v == 'auto' ? 'auto' : number(v, p, min: 0),
        'whiteSpace' => choice(v, p, ['normal', 'pre', 'pre-line']),
        'lineHeight' || 'leading' || 'letterSpacing' => number(v, p),
        'tagStyles' => _tagStyles(v, p, item, parents, partial),
        'filters' => cloneJson(array(v, p), p),
        'autoFont' => _autoFont(v, p),
        'overflow' => choice(v, p, ['visible', 'hidden', 'ellipsis']),
        _ => throw StateError('unhandled style field'),
      };
    }
    return frozen(result);
  } finally {
    parents.remove(identity);
  }
}

Object _fontSize(Object? value, String path, bool item) {
  if (value is num) return number(value, path, min: 0);
  if (!item ||
      value is! String ||
      value.isEmpty ||
      RegExp(r'^[-+]?\d+(?:\.\d+)?$').hasMatch(value)) {
    invalid(path, 'fontSize must use a numeric or item CSS-size branch');
  }
  return value;
}

Object _fontWeight(Object? value, String path) {
  if (value is String &&
      ['normal', 'bold', 'bolder', 'lighter'].contains(value)) {
    return value;
  }
  final n = value is num
      ? value
      : value is String
      ? _jsNumber(value)
      : null;
  if (n == null ||
      !n.isFinite ||
      n != n.roundToDouble() ||
      n < 100 ||
      n > 900) {
    invalid(
      path,
      'fontWeight must be supported string or integer from 100 through 900',
    );
  }
  return value!;
}

num? _jsNumber(String value) {
  final text = value.trim();
  if (RegExp(r'^0[xX][0-9a-fA-F]+$').hasMatch(text)) {
    return int.tryParse(text.substring(2), radix: 16);
  }
  if (RegExp(r'^0[bB][01]+$').hasMatch(text)) {
    return int.tryParse(text.substring(2), radix: 2);
  }
  if (RegExp(r'^0[oO][0-7]+$').hasMatch(text)) {
    return int.tryParse(text.substring(2), radix: 8);
  }
  if (!RegExp(
    r'^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$',
  ).hasMatch(text)) {
    return null;
  }
  return num.tryParse(text);
}

Object _dropShadow(Object? value, String path) {
  if (value is bool) return value;
  final input = record(value, path);
  known(input, ['color', 'alpha', 'angle', 'blur', 'distance'], path);
  return frozen({
    for (final entry in input.entries)
      entry.key: entry.key == 'color'
          ? color(entry.value, '$path.color')
          : entry.key == 'alpha'
          ? number(entry.value, '$path.alpha', min: 0, max: 1)
          : number(entry.value, '$path.${entry.key}'),
  });
}

Map<String, Object?> _tagStyles(
  Object? value,
  String path,
  bool item,
  Set<Object> ancestors,
  bool partial,
) {
  final input = record(value, path);
  final keys = input.keys.toList()..sort();
  return frozen({
    for (final key in keys)
      key: textStyle(
        input[key],
        '$path.$key',
        item: item,
        defaults: false,
        partial: partial,
        ancestors: ancestors,
      ),
  });
}

Map<String, Object?> _autoFont(Object? value, String path) {
  final input = record(value, path);
  known(input, ['min', 'max'], path);
  final result = <String, Object?>{};
  for (final key in ['min', 'max']) {
    if (input.containsKey(key)) {
      final n = number(input[key], '$path.$key');
      if (n <= 0) invalid('$path.$key', 'value must be positive');
      result[key] = n;
    }
  }
  if (result.containsKey('min') &&
      result.containsKey('max') &&
      (result['min']! as num) > (result['max']! as num)) {
    invalid(path, 'autoFont min must not exceed max');
  }
  return frozen(result);
}
