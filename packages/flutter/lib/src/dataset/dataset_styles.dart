import 'dart:collection';

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

Object color(Object? value, String path) {
  if (value is String) {
    if (!_validColor(value)) {
      invalid(
        path,
        'color string must be a supported CSS color or dotted theme path',
      );
    }
    return value;
  }
  if (value is num) return number(value, path);
  if (value is List || value is Map) return cloneJson(value, path)!;
  invalid(path, 'color must use a supported JSON color source');
}

// This validates source syntax only. Rendering owns conversion to native color.
bool _validColor(String value) {
  if (RegExp(r'^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)+$').hasMatch(value)) {
    return true;
  }
  // Pixi first rewrites bare/0x hex, then delegates CSS parsing to colord.
  if (RegExp(
    r'^(#|0x)?(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$',
    caseSensitive: false,
  ).hasMatch(value)) {
    return true;
  }
  final text = value.toLowerCase().trim();
  if (RegExp(
    r'^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$',
  ).hasMatch(text)) {
    return true;
  }
  if (_colorNames.contains(text)) return true;
  const n = r'[+-]?\d*\.?\d+';
  final rgbComma = RegExp(
    '^rgba?\\(\\s*($n)(%)?\\s*,\\s*($n)(%)?\\s*,\\s*($n)(%)?\\s*(?:,\\s*$n%?\\s*)?\\)\$',
  );
  final rgbSpace = RegExp(
    '^rgba?\\(\\s*($n)(%)?\\s+($n)(%)?\\s+($n)(%)?\\s*(?:/\\s*$n%?\\s*)?\\)\$',
  );
  final hslComma = RegExp(
    '^hsla?\\(\\s*$n(?:deg|rad|grad|turn)?\\s*,\\s*$n%\\s*,\\s*$n%\\s*(?:,\\s*$n%?\\s*)?\\)\$',
  );
  final hslSpace = RegExp(
    '^hsla?\\(\\s*$n(?:deg|rad|grad|turn)?\\s+$n%\\s+$n%\\s*(?:/\\s*$n%?\\s*)?\\)\$',
  );
  final rgb = rgbComma.firstMatch(text) ?? rgbSpace.firstMatch(text);
  final validRgb =
      rgb != null &&
      rgb.group(2) == rgb.group(4) &&
      rgb.group(4) == rgb.group(6);
  return validRgb || hslComma.hasMatch(text) || hslSpace.hasMatch(text);
}

const _colorNames = {
  'transparent',
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
};
Object assetSource(Object? value, String path) {
  if (value is String) return value;
  final input = record(value, path);
  known(input, ['src', 'data', 'format', 'parser', 'loadParser'], path);
  return frozen({
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

Map<String, Object?> rectTexture(Object? value, String path) {
  final input = record(value, path);
  known(input, ['type', 'fill', 'borderWidth', 'borderColor', 'radius'], path);
  if (input.containsKey('type') && input['type'] != 'rect') {
    throw DatasetException(
      'INVALID_RECORD_KIND',
      '$path.type',
      'rectangular texture discriminator must be rect',
    );
  }
  return frozen({
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
    'radius': radius(field(input, 'radius'), '$path.radius'),
  });
}

Map<String, Object?> stroke(
  Object? value,
  String path, {
  bool compatibility = false,
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
  return frozen({
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
  });
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
        'stroke' => v is Map ? stroke(v, p) : color(v, p),
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
        'tagStyles' => _tagStyles(v, p, item, parents),
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
