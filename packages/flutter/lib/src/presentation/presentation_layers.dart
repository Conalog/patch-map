import '../api/presentation.dart';
import '../api/result.dart';
import '../api/target.dart';
import '../dataset/dataset_reader.dart';

/// Immutable, sparse multipliers for drawable leaves and components only.
/// Reads allocate no addresses and perform no layer or document traversal.
final class PresentationOpacity {
  PresentationOpacity._(Map<String, Map<String?, double>> values)
    : _values = Map.unmodifiable({
        for (final entry in values.entries)
          entry.key: Map<String?, double>.unmodifiable(entry.value),
      });

  final Map<String, Map<String?, double>> _values;

  double alpha(String id, [String? componentId]) =>
      _values[id]?[componentId] ?? 1;

  bool affects(String id) => _values.containsKey(id);
}

/// One synchronous owner of keyed logical alpha layers and render membership.
/// Dataset replacement discards this owner before admitting the new document.
final class PresentationLayers {
  final _layers = <String, _Layer>{};
  _MembershipIndex? _index;
  PresentationOpacity? _opacity;

  int get layerCount => _layers.length;
  PresentationOpacity? get opacity => _opacity;

  PatchMapPresentationResult set(
    String key,
    PatchMapPresentationLayer layer,
    DatasetDocument document,
  ) {
    final failures = <PatchMapFailure>[];
    _validateKey(key, failures);
    if (layer.matchedAlpha == null && layer.unmatchedAlpha == null) {
      failures.add(
        const PatchMapFailure(
          'INVALID_VALUE',
          'layer requires at least one alpha multiplier',
          path: 'layer',
        ),
      );
    }
    _validateAlpha(layer.matchedAlpha, 'layer.matchedAlpha', failures);
    _validateAlpha(layer.unmatchedAlpha, 'layer.unmatchedAlpha', failures);
    final scope = layer.scope.toSet();
    final requested = layer.targets.toSet();
    for (final target in scope) {
      if (!_wellFormed(target)) {
        failures.add(
          PatchMapFailure(
            'INVALID_VALUE',
            'scope address must contain nonblank identifiers',
            target: target,
            path: 'layer.scope',
          ),
        );
        continue;
      }
      final owner = document.targets[target.id];
      if (owner == null ||
          target.componentId != null &&
              (owner.type != 'item' ||
                  !owner.components.containsKey(target.componentId))) {
        failures.add(
          PatchMapFailure(
            'MISSING_TARGET',
            'scope address does not exist',
            target: target,
            path: 'layer.scope',
          ),
        );
      }
    }
    for (final target in requested) {
      if (!_wellFormed(target)) {
        failures.add(
          PatchMapFailure(
            'INVALID_VALUE',
            'target address must contain nonblank identifiers',
            target: target,
            path: 'layer.targets',
          ),
        );
      }
    }
    if (_index != null && !identical(_index!.document, document)) {
      failures.add(
        const PatchMapFailure(
          'INCOMPATIBLE_DOCUMENT',
          'replace presentation layer owner before changing documents',
        ),
      );
    }
    final matched = requested.intersection(scope);
    PatchMapPresentationResult result(PatchMapOutcome outcome) =>
        PatchMapPresentationResult(
          outcome,
          failures: failures,
          scopeCount: scope.length,
          targetCount: requested.length,
          matchedCount: matched.length,
          ignoredTargetCount: requested.length - matched.length,
        );
    if (failures.isNotEmpty) return result(PatchMapOutcome.rejected);

    final matchedAlpha = layer.matchedAlpha ?? 1;
    final unmatchedAlpha = layer.unmatchedAlpha ?? 1;
    final previous = _layers[key];
    if (previous != null &&
        previous.matchedAlpha == matchedAlpha &&
        previous.unmatchedAlpha == unmatchedAlpha &&
        _sameSet(previous.scope, scope) &&
        _sameSet(previous.matched, matched)) {
      return result(PatchMapOutcome.unchanged);
    }

    final index = _index ??= _MembershipIndex(document);
    final scopeLeaves = index.expand(scope);
    final matchedLeaves = index.expand(matched);
    _layers[key] = _Layer(scope, matched, matchedAlpha, unmatchedAlpha, {
      for (final target in scopeLeaves)
        if ((matchedLeaves.contains(target) ? matchedAlpha : unmatchedAlpha) !=
            1)
          target: matchedLeaves.contains(target)
              ? matchedAlpha
              : unmatchedAlpha,
    });
    _compose();
    return result(PatchMapOutcome.applied);
  }

  PatchMapPresentationResult clear(String key) {
    final failures = <PatchMapFailure>[];
    _validateKey(key, failures);
    if (failures.isNotEmpty) {
      return PatchMapPresentationResult(
        PatchMapOutcome.rejected,
        failures: failures,
      );
    }
    if (_layers.remove(key) == null) {
      return PatchMapPresentationResult(PatchMapOutcome.unchanged);
    }
    if (_layers.isEmpty) {
      _index = null;
      _opacity = null;
    } else {
      _compose();
    }
    return PatchMapPresentationResult(PatchMapOutcome.applied);
  }

  void _compose() {
    final values = <String, Map<String?, double>>{};
    final keys = _layers.keys.toList()..sort();
    for (final key in keys) {
      for (final entry in _layers[key]!.factors.entries) {
        final target = entry.key;
        final owner = values.putIfAbsent(target.id, () => {});
        owner[target.componentId] =
            (owner[target.componentId] ?? 1) * entry.value;
      }
    }
    if (values.isEmpty) {
      _opacity = null;
    } else if (!_sameValues(_opacity?._values, values)) {
      _opacity = PresentationOpacity._(values);
    }
  }
}

final class _Layer {
  const _Layer(
    this.scope,
    this.matched,
    this.matchedAlpha,
    this.unmatchedAlpha,
    this.factors,
  );
  final Set<PatchMapTarget> scope;
  final Set<PatchMapTarget> matched;
  final double matchedAlpha;
  final double unmatchedAlpha;
  final Map<PatchMapTarget, double> factors;
}

/// Built only after a valid first set. Retains one adjacency index, never a
/// transitive membership table or an earlier document/publication snapshot.
final class _MembershipIndex {
  _MembershipIndex(this.document) {
    for (final target in document.targets.values) {
      final parentId = target.parentId;
      if (parentId != null) {
        (_children[parentId] ??= []).add(target);
      }
    }
  }
  final DatasetDocument document;
  final _children = <String, List<DatasetTarget>>{};

  Set<PatchMapTarget> expand(Iterable<PatchMapTarget> targets) {
    final result = <PatchMapTarget>{};
    final visited = <String>{};
    void append(DatasetTarget target) {
      if (!visited.add(target.id)) return;
      if (target.type == 'group' || target.type == 'grid') {
        for (final child in _children[target.id] ?? const <DatasetTarget>[]) {
          append(child);
        }
      } else if (target.type == 'item') {
        for (final componentId in target.components.keys) {
          result.add(PatchMapTarget(target.id, componentId: componentId));
        }
      } else {
        result.add(PatchMapTarget(target.id));
      }
    }

    for (final target in targets) {
      if (target.componentId != null) {
        result.add(target);
      } else {
        append(document.targets[target.id]!);
      }
    }
    return result;
  }
}

void _validateKey(String key, List<PatchMapFailure> failures) {
  if (key.trim().isEmpty) {
    failures.add(
      const PatchMapFailure(
        'INVALID_VALUE',
        'presentation key must be nonblank',
        path: 'key',
      ),
    );
  }
}

void _validateAlpha(
  double? value,
  String path,
  List<PatchMapFailure> failures,
) {
  if (value != null && (!value.isFinite || value < 0 || value > 1)) {
    failures.add(
      PatchMapFailure(
        'INVALID_VALUE',
        'alpha multiplier must be finite and between zero and one',
        path: path,
      ),
    );
  }
}

bool _wellFormed(PatchMapTarget target) =>
    target.id.trim().isNotEmpty &&
    (target.componentId == null || target.componentId!.trim().isNotEmpty);

bool _sameSet(Set<PatchMapTarget> left, Set<PatchMapTarget> right) =>
    left.length == right.length && left.containsAll(right);

bool _sameValues(
  Map<String, Map<String?, double>>? left,
  Map<String, Map<String?, double>> right,
) {
  if (left == null || left.length != right.length) return false;
  for (final entry in right.entries) {
    final prior = left[entry.key];
    if (prior == null || prior.length != entry.value.length) return false;
    for (final factor in entry.value.entries) {
      if (prior[factor.key] != factor.value) return false;
    }
  }
  return true;
}
