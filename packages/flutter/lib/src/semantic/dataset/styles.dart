import '../../model/json.dart';
import 'values.dart';

const black = '#1a1a1aff';
const white = '#ffffffff';
const transparent = '#00000000';

dynamic color(Object? value, String path) {
  if (value is String) {
    final source = value.trim();
    if (source.isEmpty) invalid(path, 'color string must not be empty');
    final named = _cssNames.contains(source.toLowerCase());
    final hex = RegExp(
      r'^(?:#[\da-f]{4}|(?:#|0x)?(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8}))$',
      caseSensitive: false,
    ).hasMatch(source);
    final theme = RegExp(
      r'^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)+$',
    ).hasMatch(value);
    final functional = _functionalColor(source);
    if (!named && !hex && !theme && !functional)
      invalid(path, 'invalid color or theme path');
    return value;
  }
  if (value is num) return finite(value, path);
  if (value is List || value is Map) return cloneJson(value, path: path);
  invalid(path, 'unsupported JSON color source');
}

bool _functionalColor(String source) {
  final match = RegExp(
    r'^(rgba?|hsla?)\(([^()]*)\)$',
    caseSensitive: false,
  ).firstMatch(source);
  if (match == null) return false;
  final body = match[2]!.trim();
  List<String> channels;
  String? alpha;
  if (body.contains(',')) {
    channels = body.split(',').map((part) => part.trim()).toList();
    if (channels.length == 4) alpha = channels.removeLast();
  } else {
    final sections = body.split('/');
    if (sections.length > 2) return false;
    channels = sections.first.trim().split(RegExp(r'\s+'));
    if (sections.length == 2) alpha = sections.last.trim();
  }
  if (channels.length != 3) return false;
  final numeric = RegExp(r'^[+-]?\d*\.?\d+%?$');
  if (alpha != null && !numeric.hasMatch(alpha)) return false;
  if (match[1]!.toLowerCase().startsWith('rgb')) {
    return channels.every(numeric.hasMatch) &&
        channels.every(
          (part) => part.endsWith('%') == channels.first.endsWith('%'),
        );
  }
  return RegExp(
        r'^[+-]?\d*\.?\d+(?:deg|rad|grad|turn)?$',
        caseSensitive: false,
      ).hasMatch(channels[0]) &&
      channels
          .skip(1)
          .every((part) => part.endsWith('%') && numeric.hasMatch(part));
}

const _cssNames = <String>{
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
  'transparent',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
};

dynamic assetSource(Object? value, String path) {
  if (value is String) return value;
  final v = record(value, path);
  known(v, ['src', 'data', 'format', 'parser', 'loadParser'], path);
  return <String, dynamic>{
    'src': string(requiredValue(v, 'src', path), '$path.src'),
    if (v.containsKey('data'))
      'data': cloneJson(record(v['data'], '$path.data'), path: '$path.data'),
    for (final key in ['format', 'parser', 'loadParser'])
      if (v.containsKey(key)) key: string(v[key], '$path.$key'),
  };
}

dynamic backgroundSource(Object? value, String path) =>
    value is String || (value is Map && value.containsKey('src'))
    ? assetSource(value, path)
    : rectTexture(value, path);
JsonMap rectTexture(Object? value, String path) {
  final v = record(value, path);
  known(v, ['type', 'fill', 'borderWidth', 'borderColor', 'radius'], path);
  if (v.containsKey('type') && v['type'] != 'rect')
    invalid('$path.type', 'expected rect texture', 'INVALID_RECORD_KIND');
  return {
    'type': 'rect',
    'fill': v.containsKey('fill')
        ? color(v['fill'], '$path.fill')
        : transparent,
    'borderWidth': v.containsKey('borderWidth')
        ? finite(v['borderWidth'], '$path.borderWidth', min: 0)
        : 0,
    'borderColor': v.containsKey('borderColor')
        ? color(v['borderColor'], '$path.borderColor')
        : black,
    'radius': v.containsKey('radius') ? radius(v['radius'], '$path.radius') : 0,
  };
}

JsonMap strokeStyle(
  Object? value,
  String path, {
  bool compatibilityOpacity = false,
}) {
  final v = record(value, path);
  known(v, [
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
  ], path);
  if (v.containsKey('opacity') && !compatibilityOpacity)
    invalid('$path.opacity', 'unknown opacity', 'UNKNOWN_FIELD');
  if (v.containsKey('opacity') && v.containsKey('alpha'))
    invalid(path, 'alpha and opacity are mutually exclusive');
  return <String, dynamic>{
    'color': v.containsKey('color') ? color(v['color'], '$path.color') : black,
    'alpha': v.containsKey('alpha')
        ? finite(v['alpha'], '$path.alpha', min: 0, max: 1)
        : v.containsKey('opacity')
        ? finite(v['opacity'], '$path.opacity', min: 0, max: 1)
        : 1,
    'width': v.containsKey('width')
        ? finite(v['width'], '$path.width', min: 0)
        : 1,
    'cap': v.containsKey('cap')
        ? enumeration(v['cap'], ['butt', 'round', 'square'], '$path.cap')
        : 'butt',
    'join': v.containsKey('join')
        ? enumeration(v['join'], ['miter', 'round', 'bevel'], '$path.join')
        : 'miter',
    'miterLimit': v.containsKey('miterLimit')
        ? finite(v['miterLimit'], '$path.miterLimit', min: 0)
        : 10,
    'alignment': v.containsKey('alignment')
        ? finite(v['alignment'], '$path.alignment', min: 0, max: 1)
        : 0.5,
    'pixelLine': v.containsKey('pixelLine')
        ? boolean(v['pixelLine'], '$path.pixelLine')
        : false,
    if (v.containsKey('textureSpace'))
      'textureSpace': enumeration(v['textureSpace'], [
        'local',
        'global',
      ], '$path.textureSpace'),
    for (final key in ['fill', 'texture', 'matrix'])
      if (v.containsKey(key)) key: cloneJson(v[key], path: '$path.$key'),
  };
}

JsonMap relationStyle(Object? value, String path) {
  final stroke = strokeStyle(value, path, compatibilityOpacity: true);
  return {
    for (final key in ['color', 'alpha', 'width']) key: stroke[key],
  };
}

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

JsonMap normalizeTextStyle(
  Object? value,
  String path, {
  bool item = false,
  bool defaults = true,
}) {
  final v = record(value, path);
  known(v, [
    ..._textFields,
    if (item) ...['autoFont', 'overflow'],
  ], path);
  final result = <String, dynamic>{
    if (defaults) ...{
      'fontFamily': 'FiraCode',
      'fontSize': 16,
      'fontWeight': 400,
      'fill': black,
    },
  };
  for (final entry in v.entries) {
    final key = entry.key;
    final field = entry.value;
    final at = '$path.$key';
    dynamic next;
    switch (key) {
      case 'fontFamily':
        next = field is String
            ? field
            : [for (final part in array(field, at)) string(part, at)];
      case 'fontSize':
        if (field is num) {
          next = finite(field, at, min: 0);
        } else {
          final size = string(field, at);
          if (!item ||
              size.isEmpty ||
              RegExp(r'^[-+]?\d+(?:\.\d+)?$').hasMatch(size))
            invalid(at, 'invalid font size');
          next = size;
        }
      case 'fontWeight':
        if (field is String &&
            ['normal', 'bold', 'bolder', 'lighter'].contains(field)) {
          next = field;
        } else {
          final numeric = field is String ? num.tryParse(field.trim()) : field;
          final weight = finite(numeric, at, min: 100, max: 900);
          if (weight.truncateToDouble() != weight)
            invalid(at, 'weight must be integer');
          next = field;
        }
      case 'fontStyle':
        next = enumeration(field, ['normal', 'italic', 'oblique'], at);
      case 'fontVariant':
        next = enumeration(field, ['normal', 'small-caps'], at);
      case 'fill':
        next = color(field, at);
      case 'stroke':
        next = field is Map ? strokeStyle(field, at) : color(field, at);
      case 'strokeWidth':
      case 'cornerRadius':
      case 'padding':
        next = finite(field, at, min: 0);
      case 'alpha':
        next = finite(field, at, min: 0, max: 1);
      case 'dropShadow':
        if (field is bool) {
          next = field;
        } else {
          final shadow = record(field, at);
          known(shadow, ['color', 'alpha', 'angle', 'blur', 'distance'], at);
          next = <String, dynamic>{
            for (final k in shadow.keys)
              k: k == 'color'
                  ? color(shadow[k], '$at.$k')
                  : k == 'alpha'
                  ? finite(shadow[k], '$at.$k', min: 0, max: 1)
                  : finite(shadow[k], '$at.$k'),
          };
        }
      case 'align':
        next = enumeration(field, ['left', 'center', 'right', 'justify'], at);
      case 'textBaseline':
        next = enumeration(field, [
          'alphabetic',
          'top',
          'hanging',
          'middle',
          'ideographic',
          'bottom',
        ], at);
      case 'wordWrap':
      case 'breakWords':
      case 'trim':
        next = boolean(field, at);
      case 'wordWrapWidth':
        next = item && field == 'auto' ? 'auto' : finite(field, at, min: 0);
      case 'whiteSpace':
        next = enumeration(field, ['normal', 'pre', 'pre-line'], at);
      case 'lineHeight':
      case 'leading':
      case 'letterSpacing':
        next = finite(field, at);
      case 'tagStyles':
        final tags = record(field, at);
        final keys = tags.keys.toList()..sort();
        next = {
          for (final tag in keys)
            tag: normalizeTextStyle(
              tags[tag],
              '$at.$tag',
              item: item,
              defaults: false,
            ),
        };
      case 'filters':
        next = cloneJson(array(field, at), path: at);
      case 'autoFont':
        final sizes = record(field, at);
        known(sizes, ['min', 'max'], at);
        final output = <String, dynamic>{};
        for (final k in sizes.keys) {
          final n = finite(sizes[k], '$at.$k');
          if (n <= 0) invalid('$at.$k', 'must be positive');
          output[k] = n;
        }
        if (output.containsKey('min') &&
            output.containsKey('max') &&
            (output['min'] as num) > (output['max'] as num))
          invalid(at, 'min exceeds max');
        next = output;
      case 'overflow':
        next = enumeration(field, ['visible', 'hidden', 'ellipsis'], at);
    }
    result[key] = next;
  }
  return result;
}
