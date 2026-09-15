part of 'controller.dart';

Never _invalidMutation(String message) =>
    throw PatchMapException('INVALID_ARGUMENT', message);

void _knownMutationFields(JsonMap value, Set<String> allowed) {
  if (value.keys.any((key) => !allowed.contains(key))) {
    _invalidMutation('Unsupported public mutation field');
  }
}

JsonMap _mutationRecord(Object? value) {
  if (value is! Map<String, dynamic>)
    _invalidMutation('Expected a JSON record');
  return value;
}

String _mutationId(Object? value) {
  if (value is! String || value.isEmpty)
    _invalidMutation('Expected a nonempty identity');
  return value;
}

void _validatePublicUpdate(
  JsonMap input,
  PatchMapDataset dataset, {
  bool transaction = false,
  bool requireTarget = false,
}) {
  _knownMutationFields(input, {
    'id',
    'changes',
    'background',
    'bar',
    'icon',
    'text',
    if (transaction) 'type',
  });
  final id = _mutationId(input['id']);
  final node = dataset.nodes[id];
  if (requireTarget && node == null)
    _invalidMutation('No PatchMap target has id $id');
  var changesCount = 0;
  if (input.containsKey('changes')) {
    if (node?.instance == true)
      _invalidMutation('Instance owner changes require authored editing');
    final changes = _mutationRecord(input['changes']);
    if (changes.isEmpty ||
        changes.keys.any(
          {
            'id',
            'type',
            'children',
            'components',
            'item',
            'cells',
            'links',
            'relations',
          }.contains,
        )) {
      _invalidMutation('Empty or protected element changes');
    }
    changesCount++;
  }
  for (final kind in ['background', 'bar', 'icon', 'text']) {
    if (!input.containsKey(kind)) continue;
    final patch = _mutationRecord(input[kind]);
    _knownMutationFields(patch, {
      'componentId',
      'changes',
      if (kind == 'bar') 'height',
      if (kind == 'text') ...['text', 'style'],
    });
    final componentId = patch.containsKey('componentId')
        ? _mutationId(patch['componentId'])
        : null;
    final rootText =
        kind == 'text' && node?.type == 'text' && componentId == null;
    final components = node?.type == 'grid'
        ? const <JsonMap>[]
        : node?.components
                  .where(
                    (c) =>
                        c['type'] == kind &&
                        (componentId == null || c['id'] == componentId),
                  )
                  .toList() ??
              const <JsonMap>[];
    if (!rootText && components.length != 1)
      _invalidMutation('Missing or ambiguous $kind component on $id');
    if (transaction && node?.instance == true)
      _invalidMutation('Transaction component targets must be authored');
    final changes = patch.containsKey('changes')
        ? _mutationRecord(patch['changes'])
        : <String, dynamic>{};
    if (changes.keys.any({'id', 'type'}.contains))
      _invalidMutation('Protected component identity');
    if (patch.length == (componentId == null ? 0 : 1) ||
        (changes.isEmpty &&
            patch.keys.every({'componentId', 'changes'}.contains))) {
      _invalidMutation('Component patch requires changed fields');
    }
    if (node?.instance == true) {
      final allowed = {
        'show',
        'source',
        'tint',
        if (kind == 'background' || kind == 'text') 'attrs',
        if (kind == 'text') ...[
          'text',
          'style',
          'placement',
          'margin',
          'split',
        ],
      };
      if (changes.keys.any((key) => !allowed.contains(key)))
        _invalidMutation('Unsupported instance presentation field');
    } else if (kind == 'text') {
      if (patch.containsKey('text') && patch['text'] is! String)
        _invalidMutation('Authored text must be a string');
      if (patch.containsKey('style')) _mutationRecord(patch['style']);
    }
    changesCount++;
  }
  if (changesCount == 0) _invalidMutation('Update requires changed fields');
}

void _validatePublicOperations(
  List<JsonMap> operations,
  PatchMapDataset dataset,
) {
  const fields = {
    'add': {'type', 'parentId', 'index', 'value'},
    'replace': {'type', 'id', 'componentId', 'value'},
    'remove': {'type', 'id', 'componentId', 'cascade'},
    'move': {'type', 'id', 'parentId', 'index'},
    'group': {'type', 'ids', 'value'},
    'ungroup': {'type', 'id', 'relationPolicy'},
  };
  for (final op in operations) {
    final type = op['type'];
    if (type == 'update') {
      _validatePublicUpdate(op, dataset, transaction: true);
      continue;
    }
    final allowed = fields[type];
    if (allowed == null) _invalidMutation('Unknown transaction operation');
    _knownMutationFields(op, allowed);
    if (type != 'add' && type != 'group') _mutationId(op['id']);
    if (op.containsKey('componentId')) _mutationId(op['componentId']);
    if (['add', 'replace', 'group'].contains(type))
      _mutationRecord(op['value']);
    if (type == 'add' || type == 'move') {
      if (op['parentId'] != null) _mutationId(op['parentId']);
      final index = op['index'];
      if (index is! int || index < 0)
        _invalidMutation('Index must be a nonnegative integer');
    }
    if (type == 'group') {
      if (op['ids'] is! List)
        _invalidMutation('Group targets must be an array');
      for (final id in op['ids'] as List) {
        _mutationId(id);
      }
    }
  }
}

// v1 lowers shorthand after changes and rejects duplicate/prefix paths during
// transaction normalization, before any authored candidate can publish.
void _checkMutationOverlaps(List<JsonMap> operations, PatchMapDataset dataset) {
  var loweredIndex = 0;
  void flatten(Map value, List<String> prefix, List<List<String>> paths) {
    for (final entry in value.entries) {
      final path = [...prefix, entry.key as String];
      if (entry.value is Map && (entry.value as Map).isNotEmpty) {
        flatten(entry.value as Map, path, paths);
      } else {
        paths.add(path);
      }
    }
  }

  bool prefix(List<String> a, List<String> b) {
    if (a.length > b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  for (final operation in operations) {
    if (operation['type'] != 'update') {
      loweredIndex++;
      continue;
    }
    if (operation.containsKey('changes')) loweredIndex++;
    for (final kind in ['background', 'bar', 'icon', 'text']) {
      final patch = operation[kind];
      if (patch is! Map) continue;
      if (dataset.nodes[operation['id']]?.instance != true &&
          patch['changes'] is Map &&
          (kind == 'bar' && patch.containsKey('height') ||
              kind == 'text' &&
                  (patch.containsKey('text') || patch.containsKey('style')))) {
        final paths = <List<String>>[];
        flatten(patch['changes'] as Map, [], paths);
        if (kind == 'bar' && patch.containsKey('height'))
          paths.add(['size', 'height']);
        if (kind == 'text' && patch.containsKey('text')) paths.add(['text']);
        if (kind == 'text' && patch['style'] is Map)
          flatten(patch['style'] as Map, ['style'], paths);
        for (var left = 0; left < paths.length; left++) {
          for (var right = left + 1; right < paths.length; right++) {
            if (prefix(paths[left], paths[right]) ||
                prefix(paths[right], paths[left])) {
              throw PatchMapDatasetError(
                'OVERLAPPING_PATH',
                '\$.operations[$loweredIndex].changes[$right].path',
                'Duplicate or prefix-overlapping mutation paths',
              );
            }
          }
        }
      }
      loweredIndex++;
    }
  }
}
