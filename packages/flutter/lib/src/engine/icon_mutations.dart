part of 'controller.dart';

/// Temporary candidate metadata; committed storage never retains prior frames.
class _IconSourceOverlay extends MapBase<String, JsonMap> {
  _IconSourceOverlay(this.store, this.previous, this.sources);
  final Map<String, JsonMap> store, previous;
  final Map<String, String> sources;
  @override
  Iterable<String> get keys => store.keys;
  @override
  JsonMap? operator [](Object? key) => store[key];
  @override
  void operator []=(String key, JsonMap value) =>
      throw UnsupportedError('Read-only candidate');
  @override
  JsonMap? remove(Object? key) => throw UnsupportedError('Read-only candidate');
  @override
  void clear() => throw UnsupportedError('Read-only candidate');
}

extension on PatchMapController {
  PatchMapResult? _iconSourceBatch(
    JsonMap input,
    List<PatchMapTarget> targets,
    Object? animate,
    String? actionId,
  ) {
    if (input.length != 2 ||
        input['icon'] is! Map ||
        _barTweens.isNotEmpty ||
        transform._active != null)
      return null;
    final spec = _map(input['icon']);
    if (!spec.containsKey('changes') ||
        spec.keys.any((key) => key != 'changes' && key != 'componentId'))
      return null;
    if (animate != null && animate is! bool) return null;
    if (actionId != null && actionId.trim().isEmpty)
      _invalidMutation('actionId must be nonempty');
    final changes = spec['changes'];
    if (changes is! Map ||
        changes.length != 1 ||
        !changes.containsKey('source'))
      return null;
    final values = changes['source'];
    if (values is! List || values.length != targets.length)
      _invalidMutation('Batch column length must equal target count');
    if (targets.any((target) => !dataset.nodes[target.id]!.instance))
      return null;
    if (values.any((value) => value != null && value is! String)) return null;
    if (spec.containsKey('componentId')) _mutationId(spec['componentId']);
    if (!_canCommit)
      return _failure(
        'refused',
        destroyed ? 'DESTROYED' : 'NOT_READY',
        'No ready surface',
      );
    final next = Map<String, JsonMap>.of(_overlays),
        changed = <String, String>{};
    final resolved = <String>{};
    final normalized = <(JsonMap, String), Object?>{};
    for (var i = 0; i < targets.length; i++) {
      final target = targets[i], node = dataset.nodes[target.id]!;
      final id = spec['componentId'] ?? target.componentId;
      final components = node.components.where(
        (c) => c['type'] == 'icon' && (id == null || c['id'] == id),
      );
      if (components.length != 1)
        _invalidMutation('Missing or ambiguous icon component');
      final component = components.single,
          key = '${node.id}\u0000${component['id']}';
      if (!resolved.add(key)) return null;
      final current = next[key] ?? const <String, dynamic>{};
      final value = values[i];
      if (value == null
          ? !current.containsKey('source')
          : current['source'] == value)
        continue;
      final patch = Map<String, dynamic>.of(current);
      if (value == null) {
        patch.remove('source');
      } else {
        patch['source'] = value;
      }
      if (patch.isEmpty) {
        next.remove(key);
      } else {
        next[key] = Map.unmodifiable(patch);
      }
      final source = value ?? component['source'];
      if (source is! String) return null;
      // Share normalization across identical template/alias pairs within this batch.
      Object? validated;
      try {
        validated = normalized.putIfAbsent(
          (component, source),
          () => normalizeComponent({...component, 'source': source})['source'],
        );
      } on PatchMapDatasetError {
        return null; // General admission owns structured rejection diagnostics.
      }
      if (validated is! String || validated != source) return null;
      changed[key] = validated;
    }
    if (changed.isEmpty)
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
    final candidate = _IconSourceOverlay(next, _overlays, changed);
    if (!_accept(dataset, candidate, selection._ids, tuple))
      return _failure('refused', 'NOT_READY', 'Surface refused candidate');
    _overlays = next;
    _geometryOverlays = next;
    _animatedOverlays = null;
    _interactionRevision++;
    _publish();
    return PatchMapResult({
      'status': 'committed',
      'changed': true,
      'appliedCount': changed.length,
      'missing': [],
      'diagnostic': null,
    });
  }
}
