import 'dart:convert';
import 'package:patch_map/patch_map.dart';
import '../shared_fixtures.dart';

// Preserve the 5,000-panel control; the scale suite builds with 100 groups.
const panelGroupCount = int.fromEnvironment(
  'PATCHMAP_PANEL_GROUPS',
  defaultValue: 50,
);
const panelCount = panelGroupCount * 100;
const panelSceneWidth = 4636.0;
const panelSceneHeight = (panelGroupCount ~/ 5 - 1) * 480.0 + 416.0;
const panelCenterX = panelSceneWidth / 2;
const panelCenterY = panelSceneHeight / 2;

final panelScene =
    jsonDecode(sharedFixtureJson['scenes/panel-groups']!)
        as Map<String, dynamic>;
final panelTargets = List.generate(
  panelCount,
  (i) => 'g${i ~/ 100}.${i % 100 ~/ 20}.${i % 20}',
);
Future<PatchMapController> createPanelController({
  double width = 360,
  double height = 640,
  double dpr = 1,
}) {
  if (panelGroupCount != 50 && panelGroupCount != 100) {
    throw StateError('Comparison supports 50 or 100 panel groups');
  }
  final grid = panelScene['grid'] as Map<String, dynamic>;
  return PatchMap.create(
    width: width,
    height: height,
    pixelRatio: dpr,
    fit: false,
    historyLimit: 0,
    selection: {'box': false},
    theme: panelScene['theme'],
    data: [
      for (var g = 0; g < panelGroupCount; g++)
        {
          ...grid,
          'id': 'g$g',
          'attrs': {
            ...grid['attrs'] as Map,
            'x': g % 5 * 940,
            'y': g ~/ 5 * 480,
          },
          'cells': [for (var r = 0; r < 5; r++) List.filled(20, 1)],
        },
    ],
  );
}
