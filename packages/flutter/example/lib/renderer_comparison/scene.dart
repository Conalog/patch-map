import 'dart:convert';
import 'package:patch_map/patch_map.dart';
import '../shared_fixtures.dart';

final panelScene =
    jsonDecode(sharedFixtureJson['scenes/panel-groups']!)
        as Map<String, dynamic>;
final panelTargets = List.generate(
  5000,
  (i) => 'g${i ~/ 100}.${i % 100 ~/ 20}.${i % 20}',
);
Future<PatchMapController> createPanelController({
  double width = 360,
  double height = 640,
  double dpr = 1,
}) {
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
      for (var g = 0; g < 50; g++)
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
