import '../api/target.dart';
import '../api/update.dart';
import '../dataset/dataset_reader.dart';
import '../dataset/dataset_styles.dart';
import '../dataset/dataset_values.dart';
import 'field_operations.dart';
import 'partial_values.dart';
import 'presentation_resolver.dart' show authoredRecord, readAuthoredField;

/// Lookup of an already-owned effective/raw pending record; never a scene copy.
typedef PresentationRecordLookup =
    Map<String, Object?>? Function(PatchMapTarget target);

const _elementFields = {
  'group': <String>[],
  'grid': ['gap'],
  'item': ['size', 'padding', 'contentOrientation'],
  'relations': ['style'],
  'image': ['source', 'size', 'opacity'],
  'text': ['text', 'style', 'size', 'overflow'],
  'rect': ['size', 'fill', 'stroke', 'radius', 'eventMode'],
};
const _componentFields = {
  'background': ['source', 'tint'],
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
const _resetFields = {
  'background': ['show', 'source', 'tint', 'attrs'],
  'bar': ['show', 'source', 'tint'],
  'icon': ['show', 'source', 'tint'],
  'text': [
    'text',
    'style',
    'show',
    'placement',
    'margin',
    'tint',
    'split',
    'attrs',
  ],
};

/// Validates/detaches every request before returning any admitted operation.
/// It does not compare full records or resolve a presentation candidate.
class PresentationAdmission {
  const PresentationAdmission();

  PresentationBatch admit(
    DatasetDocument document,
    Iterable<PatchMapUpdate> updates, {
    PresentationRecordLookup? current,
  }) {
    final seen = <PatchMapTarget>{};
    final patches = <PresentationPatch>[];
    final claims = <PresentationClaim>[];
    var index = 0;
    for (final update in updates) {
      final path = '\$[$index]';
      index++;
      if (!seen.add(update.target)) {
        throw DatasetException(
          'DUPLICATE_ID',
          '$path.target',
          'duplicate update target ${update.target}',
        );
      }
      final target = document.targets[update.target.id];
      if (target == null) {
        throw DatasetException(
          'MISSING_TARGET',
          '$path.target',
          'element target does not exist',
        );
      }
      final authored = authoredRecord(document, update.target);
      final component = update.target.componentId != null;
      final type = component ? authored['type']! as String : target.type;
      final concrete = component && target.row != null;
      Map<String, Object?>? baseline;
      Object? previous(String key) {
        baseline ??= current?.call(update.target) ?? authored;
        return baseline![key];
      }

      final allowed = component
          ? ['show', 'label', 'attrs', ..._componentFields[type]!]
          : ['show', 'locked', 'label', 'attrs', ..._elementFields[type]!];
      known(update.values, allowed, '$path.values');
      final operations = <FieldOperation>[];
      for (final entry in update.values.entries) {
        final key = entry.key;
        final v = entry.value;
        final p = '$path.values.$key';
        if (v == null && concrete && _resetFields[type]!.contains(key)) {
          operations.add(FieldOperation(FieldOperationKind.reset, [key], null));
          continue;
        }
        final normalized = switch (key) {
          'show' || 'locked' || 'animation' => boolean(v, p),
          'label' || 'text' => string(v, p),
          'tint' || 'fill' => color(v, p),
          'attrs' => partialAttrs(v, p, _map(previous(key))),
          'size' => partialSize(
            v,
            p,
            component: component,
            baseline: previous(key),
            axisReset: concrete && type == 'bar',
          ),
          'padding' || 'margin' => partialEdges(v, p),
          'gap' => partialGap(v, p),
          'contentOrientation' => choice(v, p, ['follow-item', 'upright']),
          'placement' => choice(v, p, presentationPlacements),
          'overflow' => choice(v, p, ['visible', 'hidden', 'ellipsis']),
          'animationDuration' => number(v, p, min: 0),
          'opacity' => number(v, p, min: 0, max: 1),
          'split' => _integer(v, p),
          'radius' => radius(v, p, partial: previous(key) is Map),
          'stroke' => stroke(v, p, partial: true),
          'source' => partialSource(
            v,
            p,
            type: type,
            atomic: concrete && (type == 'bar' || type == 'icon'),
            baseline: previous(key),
          ),
          'style' =>
            type == 'relations'
                ? _relationStyle(v, p)
                : partialTextStyle(
                    v,
                    p,
                    item: component,
                    baseline: _map(previous(key)),
                  ),
          'eventMode' => choice(v, p, [
            'none',
            'passive',
            'auto',
            'static',
            'dynamic',
          ]),
          _ => throw StateError('unhandled admitted field $key'),
        };
        final atomic = _atomicRoot(key, normalized, concrete, type);
        _operations(
          normalized,
          [key],
          operations,
          atomic: atomic,
          baseline: normalized is Map ? previous(key) : null,
        );
      }
      final patch = PresentationPatch(update.target, operations);
      patches.add(patch);
      for (final operation in operations) {
        final expected = operation.kind == FieldOperationKind.reset
            ? readAuthoredField(authored, operation.path)
            : (
                exists: true,
                value:
                    operation.value is Map &&
                        (operation.value as Map).isEmpty &&
                        isStrokePath(operation.path)
                    ? stroke(operation.value, 'claim.stroke')
                    : operation.value,
              );
        claims.add(
          PresentationClaim(
            update.target,
            operation.path,
            expected.value,
            exists: expected.exists,
          ),
        );
      }
    }
    return PresentationBatch(patches, claims);
  }
}

Map<String, Object?> _map(Object? value) =>
    value is Map<String, Object?> ? value : const {};
num _integer(Object? value, String path) {
  final n = number(value, path);
  if (n != n.roundToDouble()) invalid(path, 'field must be an integer');
  return n;
}

Map<String, Object?> _relationStyle(Object? value, String path) {
  final normalized = stroke(value, path, compatibility: true, partial: true);
  return frozen({
    for (final key in ['color', 'alpha', 'width'])
      if (normalized.containsKey(key)) key: normalized[key],
  });
}

bool _atomicRoot(String key, Object? normalized, bool concrete, String type) =>
    key == 'tint' && concrete && (type == 'bar' || type == 'icon') ||
    key == 'source' && concrete && (type == 'bar' || type == 'icon') ||
    key == 'size' && normalized is Map && normalized.containsKey('value');

void _operations(
  Object? value,
  List<String> path,
  List<FieldOperation> output, {
  bool atomic = false,
  Object? baseline,
}) {
  if (path.length == 2 && path.first == 'size' && value == null) {
    output.add(FieldOperation(FieldOperationKind.reset, path, null));
    return;
  }
  if (atomic || value is! Map<String, Object?>) {
    output.add(
      FieldOperation(
        path.length == 1
            ? FieldOperationKind.wholeSet
            : FieldOperationKind.childrenSet,
        path,
        value,
      ),
    );
    return;
  }
  if (value.isEmpty) {
    // These are validated partial schema values, even when their authored
    // representation is a scalar. An empty partial specifies no assignment.
    final sizePartial =
        path.first == 'size' &&
        (path.length == 1 ||
            path.length == 2 &&
                (path.last == 'width' || path.last == 'height'));
    if (sizePartial) return;
    if (baseline is! Map) {
      output.add(
        FieldOperation(
          path.length == 1
              ? FieldOperationKind.wholeSet
              : FieldOperationKind.childrenSet,
          path,
          value,
        ),
      );
    }
    return;
  }
  for (final entry in value.entries) {
    final old = baseline is Map ? baseline[entry.key] : null;
    _operations(entry.value, [...path, entry.key], output, baseline: old);
  }
}
