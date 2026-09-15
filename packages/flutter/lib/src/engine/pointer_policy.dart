part of 'controller.dart';

void _validatePointerPolicies(JsonMap pointer, JsonMap selection) {
  void invalid(String field) => throw PatchMapException(
    'INVALID_INPUT',
    'Invalid pointer policy: $field',
  );
  void boolean(JsonMap policy, String field) {
    if (policy.containsKey(field) && policy[field] is! bool) invalid(field);
  }

  void choice(JsonMap policy, String field, List<String> choices) {
    if (policy.containsKey(field) && !choices.contains(policy[field]))
      invalid(field);
  }

  JsonMap? record(JsonMap policy, String field) =>
      policy.containsKey(field) ? _map(policy[field]) : null;
  double positive(JsonMap policy, String field, double fallback) {
    if (!policy.containsKey(field)) return fallback;
    final value = policy[field];
    if (value is! num || !value.isFinite || value <= 0) invalid(field);
    return (value as num).toDouble();
  }

  void color(JsonMap policy) {
    if (!policy.containsKey('color')) return;
    final value = policy['color'];
    if (value is! num && value is! String) invalid('color');
    normalizeDirectColor(value);
  }

  boolean(pointer, 'hoverDuringPress');
  final tooltip = record(pointer, 'tooltip');
  if (tooltip != null) {
    boolean(tooltip, 'pinOnContextMenu');
    boolean(tooltip, 'preventDefault');
  }
  boolean(selection, 'allowMultiple');
  boolean(selection, 'deselectOnTargetDoubleClick');
  choice(selection, 'clearOnBlankClick', ['single', 'double', 'never']);
  if (selection.containsKey('isSelectable') &&
      selection['isSelectable'] is! bool Function(JsonMap))
    invalid('isSelectable');
  if (selection.containsKey('resolveModifierSelection') &&
      selection['resolveModifierSelection'] is! List<String> Function(JsonMap))
    invalid('resolveModifierSelection');
  final visual = record(selection, 'visual');
  var stroke = 2.0;
  if (visual != null) {
    choice(visual, 'displayMode', [
      'all',
      'group-only',
      'element-only',
      'hidden',
    ]);
    choice(visual, 'strokeScale', ['fixed', 'viewport']);
    choice(visual, 'strokeAlignment', ['outside', 'center', 'inside']);
    stroke = positive(visual, 'strokeWidth', 2);
    if (positive(visual, 'minStrokeWidth', math.min(1, stroke)) > stroke)
      invalid('minStrokeWidth');
    color(visual);
  }
  if (selection.containsKey('box') && selection['box'] is! bool) {
    final box = _map(selection['box']);
    boolean(box, 'partialIntersection');
    choice(box, 'activationModifier', ['none', 'shift']);
    final visual = record(box, 'visual');
    if (visual != null) {
      positive(visual, 'strokeWidth', stroke);
      color(visual);
      if (visual.containsKey('fillAlpha')) {
        final alpha = visual['fillAlpha'];
        if (alpha is! num || !alpha.isFinite || alpha < 0 || alpha > 1)
          invalid('fillAlpha');
      }
    }
  }
}
