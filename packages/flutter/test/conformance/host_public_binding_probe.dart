import 'package:conalog_patch_map/conalog_patch_map.dart';

// Public compilation witness; native behavior is asserted by named host tests.
Future<void> hostPublicBinding() async {
  final c = await PatchMap.create(
    data: [],
    pointer: {
      'hoverDuringPress': true,
      'tooltip': {'pinOnContextMenu': true, 'preventDefault': false},
    },
    selection: {
      'allowMultiple': true,
      'brush': {
        'longPress': {'behavior': 'toggle', 'delayMs': 500},
        'operation': 'auto',
      },
      'clearOnBlankClick': 'double',
      'deselectOnTargetDoubleClick': true,
      'isSelectable': (Map<String, dynamic> target) => target['id'] != 'locked',
      'resolveModifierSelection': (Map<String, dynamic> input) => <String>[],
      'visual': {
        'displayMode': 'all',
        'color': '#123456',
        'strokeWidth': 2,
        'strokeScale': 'viewport',
        'minStrokeWidth': 1,
        'strokeAlignment': 'outside',
      },
      'box': {
        'activationModifier': 'shift',
        'partialIntersection': true,
        'visual': {'color': '#123456', 'fillAlpha': 0.1, 'strokeWidth': 2},
      },
    },
    viewport: {
      'initial': {
        'centerWorld': [50, 50],
        'scale': 1,
      },
      'wheel': {'activationModifier': 'control'},
    },
    zoomLimits: [0.5, 4],
  );
  final view = PatchMapView(
    controller: c,
    antialias: false,
    resizeMode: PatchMapResizeMode.manual,
  );
  final disposers = [
    c.pointer.onHover((event) {}),
    c.pointer.onTooltip((event) {}),
    c.selection.onChange((ids) {}),
    c.selection.brush.onChange((PatchMapBrushChange event) {
      final PatchMapBrushState state = event.state;
      if (state.drawing && !state.enabled) throw StateError(event.source);
    }),
    c.selection.onPointerChange((event) {}),
    c.viewport.onSettled((state) {}),
  ];
  final Map<String, dynamic> debug = c.debug.snapshot();
  if (view.controller != c || debug['lifecycle'] == null)
    throw StateError('missing host binding');
  if (c.attached) {
    c.selection.add(<String>[]);
    c.selection.remove(<String>[]);
    c.selection.toggle(<String>[]);
    c.selection.clear();
    c.selection.brush.enable();
    c.selection.brush.toggle();
    c.selection.brush.disable();
    c.selection.brush.state.toJson();
    final Map<String, dynamic> fit = c.viewport.fit(padding: [2, 3]).toJson();
    final Map<String, dynamic> restored = c.viewport.reset(padding: 2).toJson();
    if (fit['status'] == null || restored['status'] == null)
      throw StateError('missing viewport result');
  }
  for (final dispose in disposers) dispose();
  await c.destroy();
}
