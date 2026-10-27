import 'dart:collection';

import 'dataset_styles.dart';
import 'dataset_values.dart';

export 'dataset_values.dart' show DatasetException;

/// Detached normalized authored data and an immutable concrete identity index.
class DatasetDocument {
  DatasetDocument._(this.roots, this.targets);
  final List<Map<String, Object?>> roots;
  final Map<String, DatasetTarget> targets;
}

class DatasetTarget {
  const DatasetTarget({
    required this.id,
    required this.type,
    required this.data,
    this.parentId,
    this.row,
    this.column,
    this.active = true,
    this.components = const {},
  });
  final String id;
  final String type;
  final Map<String, Object?> data;
  final String? parentId;
  final int? row;
  final int? column;
  final bool active;
  final Map<String, Map<String, Object?>> components;
}

/// Stateless admission: a candidate becomes observable only after all roots pass.
class DatasetReader {
  const DatasetReader();
  DatasetDocument read(Object? input) => _Candidate().read(input);
}

const _elementBase = ['type', 'id', 'label', 'show', 'locked', 'attrs'];
const _componentBase = ['type', 'id', 'label', 'show', 'attrs'];
const _elements = {
  'group': ['children'],
  'grid': ['cells', 'item', 'inactiveCellStrategy', 'gap'],
  'item': ['size', 'components', 'padding', 'contentOrientation'],
  'relations': ['links', 'style'],
  'image': ['source', 'size', 'opacity'],
  'text': ['text', 'style', 'size', 'overflow'],
  'rect': ['size', 'fill', 'stroke', 'radius', 'eventMode'],
};
const _components = {
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

class _Candidate {
  final _ids = <String>{};
  final _targets = <String, DatasetTarget>{};
  final _ancestors = HashSet<Object>.identity();

  DatasetDocument read(Object? input) {
    final values = array(input, r'$');
    final roots = List<Map<String, Object?>>.unmodifiable([
      for (var i = 0; i < values.length; i++)
        _element(values[i], '\$[$i]', null),
    ]);
    return DatasetDocument._(roots, Map.unmodifiable(_targets));
  }

  void _register(String id, String path) {
    if (!_ids.add(id)) {
      throw DatasetException(
        'DUPLICATE_ID',
        path,
        'duplicate scene-global element identity $id',
      );
    }
  }

  Map<String, Object?> _element(Object? value, String path, String? parentId) {
    final input = record(value, path);
    if (!_ancestors.add(value!)) {
      invalid(path, 'cyclic structural values are not accepted');
    }
    try {
      final type = _kind(input['type'], '$path.type', _elements.keys);
      known(input, [..._elementBase, ..._elements[type]!], path);
      final id = input.containsKey('id')
          ? string(input['id'], '$path.id')
          : '@element:$path';
      _register(id, '$path.id');
      final result = <String, Object?>{
        'type': type,
        'id': id,
        if (input.containsKey('label'))
          'label': string(input['label'], '$path.label'),
        'show': _bool(input, 'show', path, true),
        'locked': _bool(input, 'locked', path, false),
        if (input.containsKey('attrs'))
          'attrs': attrs(input['attrs'], '$path.attrs'),
      };
      var componentMap = const <String, Map<String, Object?>>{};
      switch (type) {
        case 'group':
          final children = array(
            required(input, 'children', path),
            '$path.children',
          );
          result['children'] = List<Map<String, Object?>>.unmodifiable([
            for (var i = 0; i < children.length; i++)
              _element(children[i], '$path.children[$i]', id),
          ]);
        case 'grid':
          final rows = array(required(input, 'cells', path), '$path.cells');
          final cells = <List<Object?>>[];
          final strategy = _enum(input, 'inactiveCellStrategy', path, [
            'destroy',
            'hide',
          ], 'destroy');
          for (var r = 0; r < rows.length; r++) {
            final row = array(rows[r], '$path.cells[$r]');
            final normalized = <Object?>[];
            for (var c = 0; c < row.length; c++) {
              final cell = row[c];
              if (cell != 0 && cell != 1 && cell is! String || cell is bool) {
                invalid(
                  '$path.cells[$r][$c]',
                  'grid cell must be 0, 1, or a string',
                );
              }
              if (cell != 0 || strategy == 'hide') {
                _register('$id.$r.$c', '$path.cells[$r][$c]');
              }
              normalized.add(cell);
            }
            cells.add(List.unmodifiable(normalized));
          }
          final templateInput = record(
            required(input, 'item', path),
            '$path.item',
          );
          known(templateInput, [
            'components',
            'size',
            'padding',
            'contentOrientation',
          ], '$path.item');
          final components = _normalizeComponents(templateInput, '$path.item');
          componentMap = _indexComponents(components);
          final template = frozen({
            'size': fixedSize(
              required(templateInput, 'size', '$path.item'),
              '$path.item.size',
            ),
            'components': components,
            'padding': edges(
              field(templateInput, 'padding'),
              '$path.item.padding',
            ),
            'contentOrientation': _orientation(templateInput, '$path.item'),
          });
          result.addAll({
            'cells': List<List<Object?>>.unmodifiable(cells),
            'item': template,
            'inactiveCellStrategy': strategy,
            'gap': gap(field(input, 'gap'), '$path.gap'),
          });
          for (var r = 0; r < cells.length; r++) {
            for (var c = 0; c < cells[r].length; c++) {
              if (cells[r][c] == 0 && strategy == 'destroy') continue;
              final cellId = '$id.$r.$c';
              _targets[cellId] = DatasetTarget(
                id: cellId,
                type: 'item',
                data: template,
                parentId: id,
                row: r,
                column: c,
                active: cells[r][c] != 0,
                components: componentMap,
              );
            }
          }
        case 'item':
          final components = _normalizeComponents(input, path);
          componentMap = _indexComponents(components);
          result.addAll({
            'size': fixedSize(required(input, 'size', path), '$path.size'),
            'components': components,
            'padding': edges(field(input, 'padding'), '$path.padding'),
            'contentOrientation': _orientation(input, path),
          });
        case 'relations':
          result.addAll({
            'links': _links(required(input, 'links', path), '$path.links'),
            'style': relationStyle(field(input, 'style'), '$path.style'),
          });
        case 'image':
          result['source'] = assetSource(
            required(input, 'source', path),
            '$path.source',
          );
          if (input.containsKey('size')) {
            result['size'] = fixedSize(input['size'], '$path.size');
          }
          if (input.containsKey('opacity')) {
            result['opacity'] = number(
              input['opacity'],
              '$path.opacity',
              min: 0,
              max: 1,
            );
          }
        case 'text':
          result['text'] = input.containsKey('text')
              ? string(input['text'], '$path.text')
              : '';
          result['style'] = textStyle(
            field(input, 'style'),
            '$path.style',
            item: false,
          );
          if (input.containsKey('size')) {
            result['size'] = fixedSize(input['size'], '$path.size');
          }
          if (input.containsKey('overflow')) {
            result['overflow'] = choice(input['overflow'], '$path.overflow', [
              'visible',
              'hidden',
              'ellipsis',
            ]);
          }
        case 'rect':
          result['size'] = fixedSize(
            required(input, 'size', path),
            '$path.size',
          );
          if (input.containsKey('fill')) {
            result['fill'] = color(input['fill'], '$path.fill');
          }
          if (input.containsKey('stroke')) {
            result['stroke'] = stroke(input['stroke'], '$path.stroke');
          }
          result['radius'] = radius(field(input, 'radius'), '$path.radius');
          if (input.containsKey('eventMode')) {
            result['eventMode'] = choice(
              input['eventMode'],
              '$path.eventMode',
              ['none', 'passive', 'auto', 'static', 'dynamic'],
            );
          }
      }
      final normalized = frozen(result);
      _targets[id] = DatasetTarget(
        id: id,
        type: type,
        data: normalized,
        parentId: parentId,
        components: componentMap,
      );
      return normalized;
    } finally {
      _ancestors.remove(value);
    }
  }

  List<Map<String, Object?>> _normalizeComponents(
    Map<String, Object?> owner,
    String path,
  ) {
    final values = owner.containsKey('components')
        ? array(owner['components'], '$path.components')
        : const <Object?>[];
    final ids = <String>{};
    final result = <Map<String, Object?>>[];
    for (var i = 0; i < values.length; i++) {
      final p = '$path.components[$i]';
      final input = record(values[i], p);
      final type = _kind(input['type'], '$p.type', _components.keys);
      known(input, [..._componentBase, ..._components[type]!], p);
      final id = input.containsKey('id')
          ? string(input['id'], '$p.id')
          : '@component:$i';
      if (!ids.add(id)) {
        throw DatasetException(
          'DUPLICATE_ID',
          '$p.id',
          'duplicate owner-local component identity $id',
        );
      }
      final component = <String, Object?>{
        'type': type,
        'id': id,
        if (input.containsKey('label'))
          'label': string(input['label'], '$p.label'),
        'show': _bool(input, 'show', p, true),
        if (input.containsKey('attrs'))
          'attrs': attrs(input['attrs'], '$p.attrs'),
        'tint': input.containsKey('tint')
            ? color(input['tint'], '$p.tint')
            : white,
      };
      switch (type) {
        case 'background':
          // Compatibility size is accepted and deliberately omitted, as in JS.
          component['source'] = backgroundSource(
            required(input, 'source', p),
            '$p.source',
          );
        case 'bar':
          component.addAll({
            'source': rectTexture(required(input, 'source', p), '$p.source'),
            'size': componentSize(required(input, 'size', p), '$p.size'),
            'placement': _enum(
              input,
              'placement',
              p,
              componentPlacements,
              'bottom',
            ),
            'margin': edges(field(input, 'margin'), '$p.margin'),
            'animation': _bool(input, 'animation', p, true),
            'animationDuration': input.containsKey('animationDuration')
                ? number(
                    input['animationDuration'],
                    '$p.animationDuration',
                    min: 0,
                  )
                : 200,
          });
        case 'icon':
          component.addAll({
            'source': assetSource(required(input, 'source', p), '$p.source'),
            'size': componentSize(required(input, 'size', p), '$p.size'),
            'placement': _enum(
              input,
              'placement',
              p,
              componentPlacements,
              'center',
            ),
            'margin': edges(field(input, 'margin'), '$p.margin'),
          });
        case 'text':
          final split = input.containsKey('split')
              ? number(input['split'], '$p.split')
              : 0;
          if (split != split.roundToDouble()) {
            invalid('$p.split', 'field must be an integer');
          }
          component.addAll({
            'text': input.containsKey('text')
                ? string(input['text'], '$p.text')
                : '',
            'placement': _enum(
              input,
              'placement',
              p,
              componentPlacements,
              'center',
            ),
            'margin': edges(field(input, 'margin'), '$p.margin'),
            'style': textStyle(field(input, 'style'), '$p.style', item: true),
            'split': split,
          });
      }
      result.add(frozen(component));
    }
    return List.unmodifiable(result);
  }
}

Map<String, Map<String, Object?>> _indexComponents(
  List<Map<String, Object?>> values,
) => Map.unmodifiable({
  for (final value in values) value['id']! as String: value,
});
String _kind(Object? value, String path, Iterable<String> accepted) {
  if (value is! String || !accepted.contains(value)) {
    throw DatasetException(
      'INVALID_RECORD_KIND',
      path,
      'unsupported or missing discriminator',
    );
  }
  return value;
}

bool _bool(
  Map<String, Object?> input,
  String key,
  String path,
  bool fallback,
) => input.containsKey(key) ? boolean(input[key], '$path.$key') : fallback;
String _enum(
  Map<String, Object?> input,
  String key,
  String path,
  Iterable<String> accepted,
  String fallback,
) => input.containsKey(key)
    ? choice(input[key], '$path.$key', accepted)
    : fallback;
String _orientation(Map<String, Object?> input, String path) => _enum(
  input,
  'contentOrientation',
  path,
  ['follow-item', 'upright'],
  'upright',
);
List<Map<String, Object?>> _links(Object? value, String path) {
  final values = array(value, path);
  final seen = <(String, String)>{};
  final result = <Map<String, Object?>>[];
  for (var i = 0; i < values.length; i++) {
    final p = '$path[$i]';
    final input = record(values[i], p);
    known(input, ['source', 'target'], p);
    final source = _endpoint(required(input, 'source', p), '$p.source');
    final target = _endpoint(required(input, 'target', p), '$p.target');
    if (seen.add((source, target))) {
      result.add(frozen({'source': source, 'target': target}));
    }
  }
  return List.unmodifiable(result);
}

String _endpoint(Object? value, String path) {
  if (value is String) return value;
  final input = record(value, path);
  known(input, ['id'], path);
  return string(required(input, 'id', path), '$path.id');
}
