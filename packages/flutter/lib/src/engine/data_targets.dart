part of 'controller.dart';

class PatchMapDataApi {
  PatchMapDataApi._(this._c);
  final PatchMapController _c;
  PatchMapResult replace(
    Object? input, {
    String? datasetRef,
    bool strict = false,
    Object fit = true,
  }) {
    _c._assertLive();
    if (fit is! bool && fit is! Map)
      throw const PatchMapException(
        'INVALID_INPUT',
        'fit must be bool or fit options',
      );
    final candidate = PatchMapDataset.parse(input, strict: strict);
    final fitPlan = fit == false
        ? null
        : _c.viewport._planFit(
            fit is Map ? fit['targets'] : null,
            fit is Map ? fit['padding'] ?? 16 : 16,
            candidate: candidate,
          );
    final interactionDelta =
        _c.selection.ids.isNotEmpty || _c.editor.state['mode'] != 'select'
        ? 1
        : 0;
    final next = PatchMapRevisionTuple(
      _c._sceneRevision + 1,
      _c._viewRevision,
      _c._interactionRevision + interactionDelta,
    );
    if (!_c._accept(candidate, {}, [], next))
      throw const PatchMapException(
        'NOT_READY',
        'Surface refused dataset replacement',
      );
    _c._replaceRequest++;
    _c._dataset = candidate;
    _c._datasetGeneration++;
    _c._datasetRef = datasetRef;
    _c._overlays = {};
    _c._barTweens.clear();
    _c._barColumns = null;
    _c._animatedOverlays = null;
    _c._sceneRevision++;
    _c._interactionRevision += interactionDelta;
    _c.presentation._layers.clear();
    _c.presentation._revision++;
    _c.selection._ids = [];
    _c.history._clear('replace');
    _c.editor._sceneReplaced();
    _c.transform._active?._end();
    if (fitPlan != null) _c.viewport._applyFit(fitPlan);
    _c._notify();
    return PatchMapResult({
      'rootIds': candidate.roots.map((e) => e['id']).toList(),
      'semanticHash': candidate.semanticHash,
      'sceneRevision': _c._sceneRevision,
    });
  }

  Future<PatchMapResult> replaceAsync(
    Object? input, {
    String? datasetRef,
    bool strict = false,
    Object fit = true,
  }) async {
    final detached = cloneJson(input);
    final request = ++_c._replaceRequest;
    await Future<void>.value();
    _c._assertLive();
    if (request != _c._replaceRequest)
      throw const PatchMapException(
        'SUPERSEDED',
        'A newer dataset replacement won',
      );
    return replace(detached, datasetRef: datasetRef, strict: strict, fit: fit);
  }

  List<JsonMap> snapshot() => _c._dataset.snapshot();
  String serialize([bool strictReferences = true]) {
    if (strictReferences) _c._dataset.validateReferences();
    return _serializeJson(PatchMapDataset.parse(snapshot()).roots);
  }
}

class PatchMapTargetsApi {
  PatchMapTargetsApi._(this._c);
  final PatchMapController _c;
  PatchMapTargetMatch? get(Object address) {
    final target = _target(address);
    final node = _c._dataset.nodes[target.id];
    if (node == null) return null;
    JsonMap value;
    if (target.componentId == null) {
      value = node.instance
          ? {
              'type': 'grid-cell',
              'id': node.id,
              'gridId': node.parentId,
              'row': node.value['row'],
              'column': node.value['column'],
              'value': node.value['value'],
              'show': node.value['value'] != 0,
              'locked': node.value['locked'],
            }
          : node.value;
    } else {
      if (node.type == 'grid') return null;
      final candidates = node.components.where(
        (v) => v['id'] == target.componentId,
      );
      if (candidates.isEmpty) return null;
      value = candidates.first;
    }

    return PatchMapTargetMatch(
      target.id,
      componentId: target.componentId,
      type: value['type'] as String,
      value: value,
    );
  }

  PatchMapTargetSet query([JsonMap query = const {}]) {
    const allowed = {'id', 'componentId', 'type', 'within', 'scope'};
    if (query.keys.any((k) => !allowed.contains(k)))
      throw const PatchMapException('INVALID_INPUT', 'Unknown query field');
    for (final field in ['id', 'componentId', 'type', 'within']) {
      if (query.containsKey(field) &&
          (query[field] is! String ||
              (query[field] as String).trim().isEmpty)) {
        throw const PatchMapException(
          'INVALID_INPUT',
          'Invalid query identity',
        );
      }
    }
    final scope = query['scope'] ?? 'all';
    if (!['all', 'authored', 'instances'].contains(scope))
      throw const PatchMapException('INVALID_INPUT', 'Invalid query scope');
    bool within(PatchMapNode node) {
      final ancestor = query['within'];
      if (ancestor == null) return true;
      PatchMapNode? current = node;
      while (current != null) {
        if (current.id == ancestor) return true;
        current = _c.dataset.nodes[current.parentId];
      }
      return false;
    }

    final result = <PatchMapTargetMatch>[];
    for (final node in _c.dataset.nodes.values) {
      if (scope == 'authored' && node.instance ||
          scope == 'instances' && !node.instance)
        continue;
      if (query['id'] != null && query['id'] != node.id || !within(node))
        continue;
      if (query['componentId'] == null &&
          (query['type'] == null || query['type'] == node.type))
        result.add(get(PatchMapTarget(node.id))!);
      for (final component
          in node.type == 'grid' ? <JsonMap>[] : node.components) {
        if (query['componentId'] != null &&
            query['componentId'] != component['id'])
          continue;
        if (query['type'] != null && query['type'] != component['type'])
          continue;
        result.add(
          get(PatchMapTarget(node.id, componentId: component['id'] as String))!,
        );
      }
    }
    final ordered = [
      ...result.where((t) => t.kind == 'element'),
      ...result.where((t) => t.kind == 'component'),
    ];
    return PatchMapTargetSet(_c, _c._sceneRevision, ordered);
  }

  List<PatchMapTarget> _resolve(Object input, {bool duplicates = false}) {
    if (input is PatchMapTargetSet) {
      if (!identical(input.owner, _c) || input.revision != _c._sceneRevision)
        throw const PatchMapException(
          'STALE_TARGET',
          'Target set is stale or foreign',
        );
      return input.matches;
    }
    final list = input is List ? input : [input];
    final result = list.map(_target).toList();
    if (!duplicates && result.map((e) => e.key).toSet().length != result.length)
      throw const PatchMapException('INVALID_INPUT', 'Duplicate targets');
    return result;
  }
}

PatchMapTarget _target(Object? value) {
  if (value is PatchMapTarget) {
    if (value.id.trim().isEmpty || value.componentId?.trim().isEmpty == true) {
      throw const PatchMapException('INVALID_INPUT', 'Invalid target');
    }
    return value;
  }
  if (value is String && value.trim().isNotEmpty) return PatchMapTarget(value);
  final map = _map(value);
  if (map['id'] is! String ||
      (map['id'] as String).trim().isEmpty ||
      map.keys.any((k) => k != 'id' && k != 'componentId') ||
      map.containsKey('componentId') &&
          (map['componentId'] is! String ||
              (map['componentId'] as String).trim().isEmpty))
    throw const PatchMapException('INVALID_INPUT', 'Invalid target');
  return PatchMapTarget(
    map['id'] as String,
    componentId: map['componentId'] as String?,
  );
}

JsonMap _merge(JsonMap base, JsonMap patch) {
  final result = _cloneMap(base);
  for (final entry in patch.entries) {
    result[entry.key] = entry.value is Map && result[entry.key] is Map
        ? _merge(_map(result[entry.key]), _map(entry.value))
        : cloneJson(entry.value);
  }
  return result;
}

// JSON.stringify preserves normalized field insertion order and uses ECMAScript
// finite number spelling. Semantic hash sorting is deliberately separate.
String _serializeJson(Object? value) {
  if (value is num) return canonicalNumber(value);
  if (value is List) return '[${value.map(_serializeJson).join(',')}]';
  if (value is Map) {
    final indexed = <String>[], ordinary = <String>[];
    for (final key in value.keys.cast<String>()) {
      final index = int.tryParse(key);
      (index != null && index >= 0 && index < 4294967295 && '$index' == key
              ? indexed
              : ordinary)
          .add(key);
    }
    indexed.sort((a, b) => int.parse(a).compareTo(int.parse(b)));
    return '{${[...indexed, ...ordinary].map((key) => '${jsonEncode(key)}:${_serializeJson(value[key])}').join(',')}}';
  }
  return jsonEncode(value);
}
