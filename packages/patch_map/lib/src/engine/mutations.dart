part of 'controller.dart';

extension PatchMapMutationOperations on PatchMapController {
  PatchMapResult update(
    JsonMap input, {
    String? actionId,
    bool recordHistory = true,
    bool? animate,
  }) {
    _validatePublicUpdate(input, dataset, requireTarget: true);
    return _transaction(
      [
        {...input, 'type': 'update'},
      ],
      actionId: actionId,
      recordHistory: recordHistory,
      animate: animate,
    );
  }

  PatchMapResult updateBatch(
    JsonMap input, {
    String? actionId,
    bool recordHistory = true,
    Object? animate,
  }) {
    // Public target lowering fails before the semantic transaction boundary.
    final requested = this.targets._resolve(
      input['targets'] as Object,
      duplicates: true,
    );
    for (final target in requested) {
      final node = dataset.nodes[target.id];
      if (node?.type == 'grid' &&
          ['background', 'bar', 'icon', 'text'].any(input.containsKey))
        _invalidMutation('Grid templates have no public component target');
      if (node == null ||
          target.componentId != null &&
              (node.type == 'grid' ||
                  !node.components.any(
                    (component) => component['id'] == target.componentId,
                  )))
        throw PatchMapException(
          'INVALID_ARGUMENT',
          'No PatchMap target has id ${target.id}',
        );
    }
    {
      if (input.keys.any(
        (k) => !{
          'targets',
          'changes',
          'background',
          'bar',
          'icon',
          'text',
        }.contains(k),
      ))
        throw const PatchMapException('INVALID_INPUT', 'Unknown batch field');
      final targets = requested;
      final seen = <String>{};
      for (var i = 0; i < targets.length; i++) {
        if (!seen.add(targets[i].key)) {
          return PatchMapResult({
            'status': 'rejected',
            'changed': false,
            'appliedCount': 0,
            'missing': <Object>[],
            'diagnostic': {
              'code': 'DUPLICATE_ID',
              'category': 'INVALID_INPUT',
              'operation': 'transact',
              'lifecycleGeneration': _generation,
              'sceneRevision': _sceneRevision,
              'revisionStamp': revisionStamp,
              'recoverable': true,
              'retryable': true,
              'appliedCount': 0,
              'missingCount': 0,
              'unchangedCount': 0,
              'datasetPath': '\$.targets[$i]',
            },
          });
        }
      }
      final fast = _barHeightBatch(input, targets, animate, actionId);
      if (fast != null) return fast;
      if (animate is List && targets.isNotEmpty) {
        final bar = input['bar'];
        final directBars =
            input.length == 2 &&
            bar is Map &&
            bar.containsKey('height') &&
            bar.keys.every((key) => key == 'height' || key == 'componentId');
        final concreteCompanions =
            bar is Map &&
            bar.containsKey('height') &&
            targets.every((target) => dataset.nodes[target.id]!.instance);
        if (!directBars && !concreteCompanions) {
          _invalidMutation(
            'Animation columns require a direct bar-height batch',
          );
        }
      }
      dynamic column(Object? value, int index) {
        if (value is! List || value.length != targets.length)
          throw const PatchMapException(
            'INVALID_INPUT',
            'Batch column length must equal target count',
          );
        return cloneJson(value[index]);
      }

      JsonMap changes(Object? value, int index) =>
          _map(value).map((key, value) => MapEntry(key, column(value, index)));
      final operations = <JsonMap>[];
      for (var i = 0; i < targets.length; i++) {
        final op = <String, dynamic>{'type': 'update', 'id': targets[i].id};
        if (input['changes'] != null)
          op['changes'] = changes(input['changes'], i);
        for (final kind in ['background', 'bar', 'icon', 'text']) {
          if (!input.containsKey(kind)) continue;
          final spec = _map(input[kind]);
          final part = <String, dynamic>{};
          for (final field in spec.entries) {
            part[field.key] = field.key == 'componentId'
                ? field.value
                : field.key == 'changes'
                ? changes(field.value, i)
                : column(field.value, i);
          }
          if (targets[i].componentId != null)
            part.putIfAbsent('componentId', () => targets[i].componentId);
          op[kind] = part;
        }
        _validatePublicUpdate({...op}..remove('type'), dataset);
        operations.add(op);
      }
      return _transaction(
        operations,
        actionId: actionId,
        recordHistory: recordHistory,
        animate: animate,
      );
    }
  }

  PatchMapResult? _barHeightBatch(
    JsonMap input,
    List<PatchMapTarget> targets,
    Object? animate,
    String? actionId,
  ) {
    if (transform._active != null && !transform._committing) return null;
    if (input.length != 2 || input['bar'] is! Map) return null;
    final bar = _map(input['bar']);
    if (!bar.containsKey('height') ||
        bar.keys.any((key) => key != 'height' && key != 'componentId'))
      return null;
    final heights = bar['height'];
    if (heights is! List || heights.length != targets.length)
      throw const PatchMapException(
        'INVALID_INPUT',
        'Batch column length must equal target count',
      );
    if (animate != null &&
        animate is! bool &&
        (animate is! List ||
            animate.length != targets.length ||
            animate.any((v) => v is! bool)))
      throw const PatchMapException(
        'INVALID_INPUT',
        'Invalid animation column',
      );
    if (actionId != null && actionId.trim().isEmpty)
      throw const PatchMapException(
        'INVALID_INPUT',
        'actionId must be nonempty',
      );
    final nodes = <PatchMapNode>[];
    for (final target in targets) {
      final node = dataset.nodes[target.id];
      if (node == null) throw _MissingTarget(target.id);
      if (!node.instance) return null;
      nodes.add(node);
    }
    if (!_canCommit)
      return _failure(
        'refused',
        destroyed ? 'DESTROYED' : 'NOT_READY',
        'No ready surface',
      );
    final plans = <String, _BarPlan>{};
    final changedKeys = <String>[],
        changedHeights = <double>[],
        rawHeights = <double>[];
    final baseGeometry = _geometryFor(dataset, _animatedOverlays ?? _overlays);
    var changed = 0;
    for (var i = 0; i < targets.length; i++) {
      final target = targets[i], node = nodes[i], height = heights[i];
      if (height != null && (height is! num || !height.isFinite))
        throw const PatchMapException(
          'INVALID_INPUT',
          'Bar height must be finite or null',
        );
      final componentId = bar['componentId'] ?? target.componentId;
      final bars = node.components.where(
        (v) =>
            v['type'] == 'bar' &&
            (componentId == null || v['id'] == componentId),
      );
      if (bars.length != 1)
        throw const PatchMapException(
          'INVALID_INPUT',
          'Missing or ambiguous component',
        );
      final component = bars.single,
          key = '${target.id}\u0000${bars.single['id']}';
      final oldHeight = _overlays is _BarOverlayStore
          ? (_overlays as _BarOverlayStore).rawHeight(key)
          : (_overlays[key]?['size'] as Map?)?['height'];
      if (oldHeight == height) continue;
      final enabled = animate is bool
          ? animate
          : animate is List
          ? animate[i] as bool
          : component['animation'] != false;
      final authoredSize = component['size'];
      final authoredHeight = authoredSize is Map
          ? authoredSize['height']
          : authoredSize;
      final destination = baseGeometry.resolveBarHeight(
        key,
        height ?? authoredHeight,
      );
      if (enabled || _barTweens.containsKey(key)) {
        plans[key] = (
          from:
              _barTweens[key]?.sample(_clockMs) ??
              baseGeometry.resolveBarHeight(key, oldHeight ?? authoredHeight),
          to: destination,
          animate: enabled && !reducedMotion,
          duration: _number(component['animationDuration'], 200),
        );
      }
      rawHeights.add(height == null ? double.nan : (height as num).toDouble());
      changedKeys.add(key);
      changedHeights.add(destination);
      changed++;
    }
    if (changed == 0)
      return PatchMapResult({
        'status': 'unchanged',
        'changed': false,
        'appliedCount': 0,
        'missing': [],
        'diagnostic': null,
      });
    final tuple = PatchMapRevisionTuple(
      _sceneRevision,
      _viewRevision,
      _interactionRevision + 1,
    );
    final next = _BarOverlayStore.apply(
      _overlays,
      changedKeys,
      Float64List.fromList(rawHeights),
    );
    final preparedBars = _prepareBars(
      plans,
      dataset,
      next,
      changedKeys: changedKeys,
      changedHeights: Float64List.fromList(changedHeights),
      incremental: true,
    );
    if (!_accept(dataset, preparedBars.overlay ?? next, selection._ids, tuple))
      return _failure('refused', 'NOT_READY', 'Surface refused candidate');
    _overlays = next;
    _interactionRevision++;
    _installBars(preparedBars);
    _notify();
    return PatchMapResult({
      'status': 'committed',
      'changed': true,
      'appliedCount': changed,
      'missing': [],
      'diagnostic': null,
    });
  }

  PatchMapResult transaction(
    List<JsonMap> operations, {
    String? actionId,
    bool recordHistory = true,
    Object? animate,
    List<String>? selectedIds,
    Object? companion,
    String conflictPolicy = 'reject',
  }) {
    _validatePublicOperations(operations, dataset);
    if (operations.isEmpty)
      return PatchMapResult({
        'status': 'unchanged',
        'changed': false,
        'appliedCount': 0,
        'missing': <Object>[],
        'diagnostic': null,
      });
    return _transaction(
      operations,
      actionId: actionId,
      recordHistory: recordHistory,
      animate: animate,
      selectedIds: selectedIds,
      companion: companion,
      conflictPolicy: conflictPolicy,
    );
  }

  PatchMapResult _transaction(
    List<JsonMap> operations, {
    String? actionId,
    bool recordHistory = true,
    Object? animate,
    List<String>? selectedIds,
    Object? companion,
    String conflictPolicy = 'reject',
  }) {
    if (!_canCommit)
      return _failure(
        'refused',
        destroyed ? 'DESTROYED' : 'NOT_READY',
        'No ready surface',
      );
    var operationIndex = 0;
    try {
      if (actionId != null && actionId.trim().isEmpty)
        throw const PatchMapException(
          'INVALID_INPUT',
          'actionId must be nonempty',
        );
      if (animate != null &&
          animate is! bool &&
          (animate is! List ||
              animate.length != operations.length ||
              animate.any((v) => v is! bool)))
        throw const PatchMapException(
          'INVALID_INPUT',
          'animate must be a boolean or operation-aligned booleans',
        );
      if (!['reject', 'cancel-active', 'queue-after'].contains(conflictPolicy))
        throw const PatchMapException(
          'INVALID_INPUT',
          'Unknown conflict policy',
        );
      if (conflictPolicy != 'reject')
        return _failure(
          'rejected',
          'UNSUPPORTED_RUNTIME',
          'This conflict policy is not supported by the current contract',
        );
      _checkMutationOverlaps(operations, dataset);
      final detached = (cloneJson(operations) as List).cast<JsonMap>();
      final before = _HistorySnapshot(
        _dataset,
        _overlays,
        selection.ids,
        _companion,
      );
      var candidate = _dataset;
      final initialOverlays = !transform._committing
          ? transform._active?._savedOverlays ?? _overlays
          : _overlays;
      var overlays = Map<String, JsonMap>.of(initialOverlays);
      List<JsonMap>? authored;
      List<String>? plannedSelection;
      var applied = 0;
      final barDestinations = <String, _BarPlan>{};
      for (var i = 0; i < detached.length; i++) {
        operationIndex = i;
        final op = detached[i];
        final type = op['type'];
        final shouldAnimate = animate is bool
            ? animate
            : animate is List
            ? animate[i] as bool
            : null;
        if (animate is List &&
            shouldAnimate == true &&
            (type != 'update' ||
                op['bar'] == null ||
                !_map(op['bar']).containsKey('height')))
          throw const PatchMapException(
            'INVALID_INPUT',
            'Animation requires a bar-height destination',
          );
        if (type == 'update') {
          final node = candidate.nodes[op['id']];
          if (node == null) throw _MissingTarget(op['id']?.toString() ?? '');
          _planBarDestination(
            node,
            op,
            overlays,
            shouldAnimate,
            barDestinations,
          );
          if (node.instance) {
            final patches = _componentPatches(node, op, overlay: true);
            for (final entry in patches.entries) {
              final current = overlays[entry.key] ?? {};
              final next = _overlayMerge(current, entry.value);
              if (!_equal(current, next)) {
                if (next.isEmpty) {
                  overlays.remove(entry.key);
                } else {
                  overlays[entry.key] = freezeJson(next) as JsonMap;
                }
                applied++;
              }
            }
            continue;
          }
          authored ??= candidate.snapshot();
          final location = _find(authored, node.id)!;
          final next = _applyUpdate(node, location.value, op);
          if (!_equal(location.value, next)) {
            location.siblings[location.index] = next;
            applied++;
          }
        } else {
          authored ??= candidate.snapshot();
          plannedSelection =
              _structural(authored, op, operationPath: '\$.operations[$i]') ??
              plannedSelection;
          applied += type == 'group' ? (op['ids'] as List).length : 1;
        }
        candidate = PatchMapDataset.parse(authored, strict: true);
      }
      final ids = selectedIds == null
          ? (plannedSelection ?? selection._ids)
                .where((id) => _selectionExists(candidate, id))
                .toList()
          : List<String>.of(selectedIds);
      if (ids.toSet().length != ids.length ||
          ids.any((id) => !_selectionExists(candidate, id)))
        throw const PatchMapException(
          'MISSING_TARGET',
          'Invalid selection in transaction',
        );
      final semanticChanged = candidate.semanticHash != _dataset.semanticHash;
      final overlayChanged = !_equal(overlays, initialOverlays);
      final selectionChanged = !_equal(ids, selection._ids);
      if (!semanticChanged && !overlayChanged && !selectionChanged)
        return PatchMapResult({
          'status': 'unchanged',
          'changed': false,
          'appliedCount': 0,
          'missing': [],
          'diagnostic': null,
        });
      overlays.removeWhere(
        (key, _) => !candidate.nodes.containsKey(key.split('\u0000').first),
      );
      if (!transform._committing) transform._active?.cancel();
      final tuple = PatchMapRevisionTuple(
        _sceneRevision + (semanticChanged ? 1 : 0),
        _viewRevision,
        _interactionRevision +
            (overlayChanged || selectionChanged || editor._committing ? 1 : 0),
      );
      final detachedCompanion = cloneJson(companion);
      final preparedBars = _prepareBars(barDestinations, candidate, overlays);
      if (!_accept(candidate, preparedBars.overlay ?? overlays, ids, tuple))
        return _failure('refused', 'NOT_READY', 'Surface refused candidate');
      _dataset = candidate;
      _overlays = overlays;
      selection._ids = ids;
      _installBars(preparedBars);
      _sceneRevision = tuple.scene;
      _interactionRevision = tuple.interaction;
      if (semanticChanged) _companion = detachedCompanion;
      final historyChanged = semanticChanged;
      if (semanticChanged && !recordHistory) history._closed = true;
      if (semanticChanged && recordHistory)
        history._record(
          before,
          _HistorySnapshot(candidate, overlays, ids, _companion),
          actionId,
        );
      _publish(selectionChanged: false, historyChanged: historyChanged);
      return PatchMapResult({
        'status': 'committed',
        'changed': true,
        'appliedCount': applied,
        'missing': [],
        'diagnostic': null,
      });
    } catch (error) {
      return _caught(error, operationIndex);
    }
  }

  PatchMapResult _caught(Object error, int operationIndex) {
    if (error is _MissingTarget)
      return _failure(
        'rejected',
        'MISSING_TARGET',
        error.toString(),
        diagnosticMissingCount: 1,
        datasetPath: '\$.operations[$operationIndex].target',
      );
    return _failure(
      'rejected',
      error is PatchMapException
          ? error.code
          : error is PatchMapDatasetError
          ? error.code
          : 'INVALID_INPUT',
      error.toString(),
      datasetPath: error is PatchMapDatasetError ? error.datasetPath : null,
    );
  }
}

class _MissingTarget implements Exception {
  _MissingTarget(this.id);
  final String id;
  @override
  String toString() => 'Missing target: $id';
}

JsonMap _overlayMerge(JsonMap current, JsonMap patch) {
  final result = Map<String, dynamic>.of(current);
  for (final entry in patch.entries) {
    if (entry.value == null) {
      result.remove(entry.key);
    } else if (entry.value is Map) {
      final nested = _overlayMerge(
        result[entry.key] is Map
            ? _map(result[entry.key])
            : <String, dynamic>{},
        _map(entry.value),
      );
      if (nested.isEmpty) {
        result.remove(entry.key);
      } else {
        result[entry.key] = nested;
      }
    } else {
      result[entry.key] = cloneJson(entry.value);
    }
  }
  return result;
}

Map<String, JsonMap> _componentPatches(
  PatchMapNode node,
  JsonMap op, {
  required bool overlay,
}) {
  if (op.keys.any(
    (k) => !{
      'id',
      'type',
      'changes',
      'background',
      'bar',
      'icon',
      'text',
    }.contains(k),
  ))
    throw const PatchMapException('INVALID_INPUT', 'Unknown update field');
  if (overlay && op.containsKey('changes'))
    throw const PatchMapException(
      'INVALID_INPUT',
      'Instance element changes require authored edit',
    );
  final result = <String, JsonMap>{};
  for (final kind in ['background', 'bar', 'icon', 'text']) {
    if (!op.containsKey(kind)) continue;
    final part = _map(op[kind]);
    final allowed = {
      'componentId',
      'changes',
      if (kind == 'bar') 'height',
      if (kind == 'text') ...['text', 'style'],
    };
    if (part.keys.any((k) => !allowed.contains(k)))
      throw const PatchMapException(
        'INVALID_INPUT',
        'Unknown component update',
      );
    final components = node.components
        .where(
          (v) =>
              v['type'] == kind &&
              (part['componentId'] == null || v['id'] == part['componentId']),
        )
        .toList();
    if (components.length != 1)
      throw const PatchMapException(
        'INVALID_INPUT',
        'Missing or ambiguous component',
      );
    final component = components.single;
    final patch = part['changes'] == null
        ? <String, dynamic>{}
        : _cloneMap(part['changes']);
    if (part.containsKey('height')) {
      final height = part['height'];
      if (height != null && (height is! num || !height.isFinite))
        throw const PatchMapException(
          'INVALID_INPUT',
          'Bar height must be finite',
        );
      if (overlay) {
        patch['size'] = {'height': height};
      } else {
        final size = component['size'];
        patch['size'] = {
          ...(size is Map ? _map(size) : {'width': size}),
          'height': height,
        };
      }
    }
    if (part.containsKey('text')) patch['text'] = part['text'];
    if (part.containsKey('style')) patch['style'] = part['style'];
    if (patch.keys.any(
      (k) => {'id', 'type', 'components', 'children'}.contains(k),
    ))
      throw const PatchMapException(
        'INVALID_INPUT',
        'Identity requires structural operation',
      );
    if (overlay) {
      final fields = <String>{
        'show',
        'source',
        'tint',
        if (kind == 'background' || kind == 'text') 'attrs',
        if (kind == 'bar') 'size',
        if (kind == 'text') ...[
          'text',
          'style',
          'placement',
          'margin',
          'split',
        ],
      };
      if (patch.keys.any((k) => !fields.contains(k)))
        throw const PatchMapException(
          'INVALID_INPUT',
          'Unsupported instance overlay field',
        );
      if (patch['show'] != null && patch['show'] is! bool ||
          patch['text'] != null && patch['text'] is! String)
        throw const PatchMapException('INVALID_INPUT', 'Invalid overlay value');
    }
    result['${node.id}\u0000${component['id']}'] = patch;
  }
  return result;
}

JsonMap _applyUpdate(PatchMapNode node, JsonMap value, JsonMap op) {
  final changes = op['changes'] == null
      ? <String, dynamic>{}
      : _cloneMap(op['changes']);
  if (changes.keys.any(
    (k) => {
      'id',
      'type',
      'children',
      'components',
      'item',
      'cells',
      'links',
    }.contains(k),
  ))
    throw const PatchMapException(
      'INVALID_INPUT',
      'Structural field requires transaction operation',
    );
  var result = _merge(value, changes);
  if (node.type == 'text' &&
      op['text'] is Map &&
      op['text']['componentId'] == null) {
    final patch = _map(op['text']);
    result = _merge(result, {
      ..._map(patch['changes'] ?? {}),
      if (patch.containsKey('text')) 'text': patch['text'],
      if (patch.containsKey('style')) 'style': patch['style'],
    });
    op = {...op}..remove('text');
  }
  final patches = _componentPatches(node, op, overlay: false);
  if (patches.isNotEmpty) {
    final owner = node.type == 'grid' ? _map(result['item']) : result;
    final components = (owner['components'] as List).map(_cloneMap).toList();
    for (var i = 0; i < components.length; i++) {
      final patch = patches['${node.id}\u0000${components[i]['id']}'];
      if (patch != null) components[i] = _merge(components[i], patch);
    }
    owner['components'] = components;
    if (node.type == 'grid') result['item'] = owner;
  }
  return result;
}
