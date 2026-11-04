import '../api/target.dart';
import '../api/update.dart';
import '../dataset/dataset_reader.dart';
import '../dataset/dataset_styles.dart';
import '../dataset/dataset_values.dart';
import 'field_operations.dart';
import 'partial_values.dart';

/// Lookup of an already-owned effective/raw pending record; never a scene copy.
typedef PresentationRecordLookup =
    Map<String, Object?>? Function(PatchMapTarget target);

const _elementCommon = ['show', 'locked', 'label', 'attrs'];
const _componentCommon = ['show', 'label', 'attrs'];
const _elementFields = {
  'group': _elementCommon,
  'grid': [..._elementCommon, 'gap'],
  'item': [..._elementCommon, 'size', 'padding', 'contentOrientation'],
  'relations': [..._elementCommon, 'style'],
  'image': [..._elementCommon, 'source', 'size', 'opacity'],
  'text': [..._elementCommon, 'text', 'style', 'size', 'overflow'],
  'rect': [..._elementCommon, 'size', 'fill', 'stroke', 'radius', 'eventMode'],
};
const _componentFields = {
  'background': [..._componentCommon, 'source', 'tint'],
  'bar': [
    ..._componentCommon,
    'source',
    'size',
    'placement',
    'margin',
    'tint',
    'animation',
    'animationDuration',
  ],
  'icon': [
    ..._componentCommon,
    'source',
    'size',
    'placement',
    'margin',
    'tint',
  ],
  'text': [
    ..._componentCommon,
    'text',
    'placement',
    'margin',
    'tint',
    'style',
    'split',
  ],
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
    // Only immutable primitive color values can reuse a successful schema
    // check. Bound the temporary set, discard it on return/throw, and keep
    // mutable channel objects on the normal detach/validation path.
    Set<Object>? checkedColors;
    Object checkedColor(Object? value, String path) {
      final shareable = value is num || value is String && value.length <= 128;
      if (shareable && (checkedColors?.contains(value) ?? false)) return value!;
      final result = color(value, path);
      if (shareable && (checkedColors?.length ?? 0) < 256) {
        (checkedColors ??= {}).add(value!);
      }
      return result;
    }

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
      final componentId = update.target.componentId;
      final component = componentId != null;
      final authored = component
          ? target.type == 'item'
                ? target.components[componentId]
                : null
          : target.data;
      if (authored == null) {
        throw DatasetException(
          'MISSING_TARGET',
          update.target.toString(),
          'component target does not exist',
        );
      }
      final type = component ? authored['type']! as String : target.type;
      final concrete = component && target.row != null;
      Map<String, Object?>? baseline;
      Object? previous(String key) {
        baseline ??= current?.call(update.target) ?? authored;
        return baseline![key];
      }

      final allowed = component
          ? _componentFields[type]!
          : _elementFields[type]!;
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
          'tint' || 'fill' => checkedColor(v, p),
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
          'placement' => choice(v, p, componentPlacements),
          'overflow' => choice(v, p, ['visible', 'hidden', 'ellipsis']),
          'animationDuration' => animationDuration(v, p),
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
            ? readField(authored, operation.path)
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
          PresentationClaim.fromOperation(
            update.target,
            operation,
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
  return normalized;
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
    output.add(FieldOperation(FieldOperationKind.set, path, value));
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
      output.add(FieldOperation(FieldOperationKind.set, path, value));
    }
    return;
  }
  for (final entry in value.entries) {
    final old = baseline is Map ? baseline[entry.key] : null;
    _operations(entry.value, [...path, entry.key], output, baseline: old);
  }
}
