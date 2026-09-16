import '../semantic/dataset/normalization.dart';
import 'json.dart';
export 'json.dart';

class PatchMapNode {
  const PatchMapNode({
    required this.id,
    required this.type,
    required this.value,
    required this.parentId,
    required this.instance,
    required this.components,
  });
  final String id;
  final String type;
  final JsonMap value;
  final String? parentId;
  final bool instance;
  final List<JsonMap> components;
}

class PatchMapDataset {
  PatchMapDataset._(this.roots, this.nodes);
  factory PatchMapDataset.parse(Object? input, {bool strict = false}) {
    final roots = normalizeDataset(input);
    final nodes = <String, PatchMapNode>{};
    void visit(JsonMap value, String? parent) {
      final id = value['id'] as String;
      final type = value['type'] as String;
      final components =
          (type == 'grid' ? value['item']['components'] : value['components'])
              as List? ??
          const [];
      nodes[id] = PatchMapNode(
        id: id,
        type: type,
        value: value,
        parentId: parent,
        instance: false,
        components: List<JsonMap>.unmodifiable(components.cast<JsonMap>()),
      );
      if (type == 'group') {
        for (final child in value['children'] as List) {
          visit(child as JsonMap, id);
        }
      } else if (type == 'grid') {
        final cells = value['cells'] as List;
        for (var row = 0; row < cells.length; row++) {
          final columns = cells[row] as List;
          for (var column = 0; column < columns.length; column++) {
            final cell = columns[column];
            if (cell == 0 && value['inactiveCellStrategy'] == 'destroy')
              continue;
            final cellId = '$id.$row.$column';
            final template = value['item'] as JsonMap;
            final instance = <String, dynamic>{
              ...template,
              'id': cellId,
              'type': 'grid-cell',
              'show': value['show'] == true && cell != 0,
              'locked': value['locked'],
              'row': row,
              'column': column,
              'value': cell,
              if (cell is String) 'label': cell,
            };
            nodes[cellId] = PatchMapNode(
              id: cellId,
              type: 'grid-cell',
              value: Map.unmodifiable(instance),
              parentId: id,
              instance: true,
              components: List<JsonMap>.unmodifiable(
                components.cast<JsonMap>(),
              ),
            );
          }
        }
      }
    }

    for (final root in roots) {
      visit(root, null);
    }
    final result = PatchMapDataset._(roots, Map.unmodifiable(nodes));
    if (strict) result.validateReferences();
    return result;
  }
  final List<JsonMap> roots;
  final Map<String, PatchMapNode> nodes;
  late final String semanticHash = _hash(roots);
  List<JsonMap> snapshot() => (cloneJson(roots) as List).cast<JsonMap>();
  void validateReferences() {
    void visit(List<dynamic> values, String path) {
      for (var i = 0; i < values.length; i++) {
        final value = values[i] as JsonMap;
        final current = '$path[$i]';
        if (value['type'] == 'group')
          visit(value['children'] as List, '$current.children');
        if (value['type'] != 'relations') continue;
        final links = value['links'] as List;
        for (var j = 0; j < links.length; j++) {
          for (final key in ['source', 'target']) {
            if (!nodes.containsKey(links[j][key])) {
              throw PatchMapDatasetError(
                'MISSING_TARGET',
                '$current.links[$j].$key',
                'relation endpoint does not exist',
              );
            }
          }
        }
      }
    }

    visit(roots, r'$');
  }
}

String _hash(Object value) => semanticHash(value);
