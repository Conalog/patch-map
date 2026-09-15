import '../../model/json.dart';
import 'styles.dart';
import 'values.dart';

const elementTypes = [
  'group',
  'grid',
  'item',
  'relations',
  'image',
  'text',
  'rect',
];
const componentTypes = ['background', 'bar', 'icon', 'text'];
const placements = [
  'left',
  'left-top',
  'left-bottom',
  'top',
  'right',
  'right-top',
  'right-bottom',
  'bottom',
  'center',
  'none',
];
const _baseElement = ['type', 'id', 'label', 'show', 'locked', 'attrs'];
const _baseComponent = ['type', 'id', 'label', 'show', 'attrs'];
const _elementFields = <String, List<String>>{
  'group': ['children'],
  'grid': ['cells', 'item', 'inactiveCellStrategy', 'gap'],
  'item': ['size', 'components', 'padding', 'contentOrientation'],
  'relations': ['links', 'style'],
  'image': ['source', 'size', 'opacity'],
  'text': ['text', 'style', 'size', 'overflow'],
  'rect': ['size', 'fill', 'stroke', 'radius', 'eventMode'],
};
const _componentFields = <String, List<String>>{
  'background': ['source', 'tint', 'size'],
  'bar': [
    'source',
    'size',
    'placement',
    'margin',
    'tint',
    'animation',
    'animationDuration',
  ],
  'icon': ['source', 'size', 'placement', 'margin', 'tint'],
  'text': ['text', 'placement', 'margin', 'tint', 'style', 'split'],
};

List<JsonMap> normalizeDataset(Object? input) {
  final detached = array(cloneJson(input), r'$');
  final normalizer = _Normalizer();
  return List<JsonMap>.unmodifiable([
    for (var i = 0; i < detached.length; i++)
      freezeJson(normalizer.element(detached[i], '\$[$i]')) as JsonMap,
  ]);
}

/// Normalizes one component patch candidate without inventing a second schema.
JsonMap normalizeComponent(
  Object? input, {
  int index = 0,
  String path = r'$.component',
}) =>
    freezeJson(_Normalizer().component(input, path, index, <String>{}))
        as JsonMap;

class _Normalizer {
  final Set<String> ids = {};
  void register(String id, String path) {
    if (!ids.add(id))
      invalid(path, 'duplicate scene-global element identity', 'DUPLICATE_ID');
  }

  JsonMap element(Object? input, String path) {
    final v = record(input, path);
    final type = kind(v['type'], elementTypes, '$path.type');
    known(v, [..._baseElement, ..._elementFields[type]!], path);
    final id = v.containsKey('id')
        ? string(v['id'], '$path.id')
        : '@element:$path';
    register(id, '$path.id');
    final result = <String, dynamic>{
      'type': type,
      'id': id,
      if (v.containsKey('label')) 'label': string(v['label'], '$path.label'),
      'show': v.containsKey('show') ? boolean(v['show'], '$path.show') : true,
      'locked': v.containsKey('locked')
          ? boolean(v['locked'], '$path.locked')
          : false,
      if (v.containsKey('attrs')) 'attrs': attrs(v['attrs'], '$path.attrs'),
    };
    switch (type) {
      case 'group':
        final children = array(
          requiredValue(v, 'children', path),
          '$path.children',
        );
        result['children'] = [
          for (var i = 0; i < children.length; i++)
            element(children[i], '$path.children[$i]'),
        ];
      case 'grid':
        final rows = array(requiredValue(v, 'cells', path), '$path.cells');
        final cells = <List<dynamic>>[];
        final strategy = v.containsKey('inactiveCellStrategy')
            ? enumeration(v['inactiveCellStrategy'], [
                'destroy',
                'hide',
              ], '$path.inactiveCellStrategy')
            : 'destroy';
        for (var row = 0; row < rows.length; row++) {
          final columns = array(rows[row], '$path.cells[$row]');
          final normalized = <dynamic>[];
          for (var column = 0; column < columns.length; column++) {
            final cell = columns[column];
            if (cell != 0 && cell != 1 && cell is! String)
              invalid(
                '$path.cells[$row][$column]',
                'grid cell must be 0, 1, or string',
              );
            if (cell is bool)
              invalid(
                '$path.cells[$row][$column]',
                'grid cell must be 0, 1, or string',
              );
            if (cell != 0 || strategy == 'hide')
              register('$id.$row.$column', '$path.cells[$row][$column]');
            normalized.add(cell);
          }
          cells.add(normalized);
        }
        result.addAll({
          'cells': cells,
          'item': itemTemplate(requiredValue(v, 'item', path), '$path.item'),
          'inactiveCellStrategy': strategy,
          'gap': v.containsKey('gap')
              ? gap(v['gap'], '$path.gap')
              : {'x': 0, 'y': 0},
        });
      case 'item':
        result.addAll(itemFields(v, path));
      case 'relations':
        final links = array(requiredValue(v, 'links', path), '$path.links');
        final normalized = <JsonMap>[];
        final seen = <String>{};
        for (var i = 0; i < links.length; i++) {
          final at = '$path.links[$i]';
          final link = record(links[i], at);
          known(link, ['source', 'target'], at);
          final source = endpoint(
            requiredValue(link, 'source', at),
            '$at.source',
          );
          final target = endpoint(
            requiredValue(link, 'target', at),
            '$at.target',
          );
          if (seen.add('${source.length}:$source${target.length}:$target'))
            normalized.add({'source': source, 'target': target});
        }
        result.addAll({
          'links': normalized,
          'style': relationStyle(
            v.containsKey('style') ? v['style'] : <String, dynamic>{},
            '$path.style',
          ),
        });
      case 'image':
        result['source'] = assetSource(
          requiredValue(v, 'source', path),
          '$path.source',
        );
        if (v.containsKey('size'))
          result['size'] = fixedSize(v['size'], '$path.size');
        if (v.containsKey('opacity'))
          result['opacity'] = finite(
            v['opacity'],
            '$path.opacity',
            min: 0,
            max: 1,
          );
      case 'text':
        result.addAll({
          'text': v.containsKey('text') ? string(v['text'], '$path.text') : '',
          'style': normalizeTextStyle(
            v.containsKey('style') ? v['style'] : <String, dynamic>{},
            '$path.style',
          ),
        });
        if (v.containsKey('size'))
          result['size'] = fixedSize(v['size'], '$path.size');
        if (v.containsKey('overflow'))
          result['overflow'] = enumeration(v['overflow'], [
            'visible',
            'hidden',
            'ellipsis',
          ], '$path.overflow');
      case 'rect':
        result['size'] = fixedSize(
          requiredValue(v, 'size', path),
          '$path.size',
        );
        if (v.containsKey('fill'))
          result['fill'] = color(v['fill'], '$path.fill');
        if (v.containsKey('stroke'))
          result['stroke'] = strokeStyle(v['stroke'], '$path.stroke');
        result['radius'] = v.containsKey('radius')
            ? radius(v['radius'], '$path.radius')
            : 0;
        if (v.containsKey('eventMode'))
          result['eventMode'] = enumeration(v['eventMode'], [
            'none',
            'passive',
            'auto',
            'static',
            'dynamic',
          ], '$path.eventMode');
    }
    return result;
  }

  JsonMap itemTemplate(Object? value, String path) {
    final v = record(value, path);
    known(v, ['components', 'size', 'padding', 'contentOrientation'], path);
    return itemFields(v, path);
  }

  JsonMap itemFields(JsonMap v, String path) {
    final components = v.containsKey('components')
        ? array(v['components'], '$path.components')
        : <dynamic>[];
    final componentIds = <String>{};
    return {
      'size': fixedSize(requiredValue(v, 'size', path), '$path.size'),
      'components': [
        for (var i = 0; i < components.length; i++)
          component(components[i], '$path.components[$i]', i, componentIds),
      ],
      'padding': v.containsKey('padding')
          ? edges(v['padding'], '$path.padding')
          : {'top': 0, 'right': 0, 'bottom': 0, 'left': 0},
      'contentOrientation': v.containsKey('contentOrientation')
          ? enumeration(v['contentOrientation'], [
              'follow-item',
              'upright',
            ], '$path.contentOrientation')
          : 'upright',
    };
  }

  JsonMap component(
    Object? input,
    String path,
    int index,
    Set<String> componentIds,
  ) {
    final v = record(input, path);
    final type = kind(v['type'], componentTypes, '$path.type');
    known(v, [..._baseComponent, ..._componentFields[type]!], path);
    final id = v.containsKey('id')
        ? string(v['id'], '$path.id')
        : '@component:$index';
    if (!componentIds.add(id))
      invalid(
        '$path.id',
        'duplicate owner-local component identity',
        'DUPLICATE_ID',
      );
    final result = <String, dynamic>{
      'type': type,
      'id': id,
      if (v.containsKey('label')) 'label': string(v['label'], '$path.label'),
      'show': v.containsKey('show') ? boolean(v['show'], '$path.show') : true,
      if (v.containsKey('attrs')) 'attrs': attrs(v['attrs'], '$path.attrs'),
    };
    switch (type) {
      case 'background':
        result['source'] = backgroundSource(
          requiredValue(v, 'source', path),
          '$path.source',
        );
      case 'bar':
        result.addAll({
          'source': rectTexture(
            requiredValue(v, 'source', path),
            '$path.source',
          ),
          'size': componentSize(requiredValue(v, 'size', path), '$path.size'),
          'animation': v.containsKey('animation')
              ? boolean(v['animation'], '$path.animation')
              : true,
          'animationDuration': v.containsKey('animationDuration')
              ? finite(
                  v['animationDuration'],
                  '$path.animationDuration',
                  min: 0,
                )
              : 200,
        });
      case 'icon':
        result.addAll({
          'source': assetSource(
            requiredValue(v, 'source', path),
            '$path.source',
          ),
          'size': componentSize(requiredValue(v, 'size', path), '$path.size'),
        });
      case 'text':
        final split = v.containsKey('split')
            ? finite(v['split'], '$path.split')
            : 0;
        if (split.truncateToDouble() != split)
          invalid('$path.split', 'split must be integer');
        result.addAll({
          'text': v.containsKey('text') ? string(v['text'], '$path.text') : '',
          'style': normalizeTextStyle(
            v.containsKey('style') ? v['style'] : <String, dynamic>{},
            '$path.style',
            item: true,
          ),
          'split': split,
        });
    }
    if (type != 'background') {
      result['placement'] = v.containsKey('placement')
          ? enumeration(v['placement'], placements, '$path.placement')
          : type == 'bar'
          ? 'bottom'
          : 'center';
      result['margin'] = v.containsKey('margin')
          ? edges(v['margin'], '$path.margin')
          : {'top': 0, 'right': 0, 'bottom': 0, 'left': 0};
    }
    result['tint'] = v.containsKey('tint')
        ? color(v['tint'], '$path.tint')
        : white;
    // Public serialization follows root-normalization.ts insertion order.
    // Semantic hashing separately sorts keys and is unaffected by this order.
    for (final key
        in type == 'bar'
            ? ['animation', 'animationDuration']
            : type == 'text'
            ? ['style', 'split']
            : <String>[]) {
      final value = result.remove(key);
      result[key] = value;
    }
    return result;
  }

  String endpoint(Object? value, String path) {
    if (value is String) return value;
    final v = record(value, path);
    known(v, ['id'], path);
    return string(requiredValue(v, 'id', path), '$path.id');
  }

  String kind(Object? value, List<String> accepted, String path) {
    if (value is! String || !accepted.contains(value))
      invalid(path, 'unsupported discriminator', 'INVALID_RECORD_KIND');
    return value;
  }
}
