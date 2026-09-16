import 'package:conalog_patch_map/conalog_patch_map.dart';

// Analyzer-only public binding probe; dynamic JSON keys need runtime witnesses.
Future<void> modelDatasetBinding() async {
  final controller = await PatchMap.create(
    data: <Map<String, dynamic>>[
      {
        'type': 'group',
        'id': 'group',
        'attrs': {'x': 10, 'y': 20, 'angle': 90, 'scaleX': -1},
        'children': [
          {
            'type': 'item',
            'id': 'item',
            'size': {'width': 20, 'height': 40},
            'contentOrientation': 'upright',
            'padding': {'top': 2, 'x': 1},
            'components': [
              {
                'type': 'background',
                'source': {'type': 'rect', 'fill': '#123456'},
              },
              {
                'type': 'bar',
                'size': '50%',
                'source': {},
                'placement': 'bottom',
                'margin': {'bottom': 2},
                'animationDuration': 200,
              },
              {'type': 'icon', 'size': 10, 'source': 'object'},
              {
                'type': 'text',
                'text': 'Label',
                'style': {'fontSize': 12},
              },
            ],
          },
        ],
      },
      {
        'type': 'grid',
        'id': 'grid',
        'cells': [
          [1, 0, 'B'],
        ],
        'inactiveCellStrategy': 'hide',
        'item': {'size': 20},
      },
      {
        'type': 'relations',
        'links': [
          {
            'source': {'id': 'item'},
            'target': 'item',
          },
        ],
        'style': {'color': '#123456', 'alpha': 0.5, 'width': 2},
      },
      {'type': 'rect', 'id': 'rect', 'size': 20, 'fill': 'red'},
      {'type': 'image', 'id': 'image', 'source': 'object', 'size': 20},
      {'type': 'text', 'id': 'text', 'text': 'Map label'},
    ],
  );
  controller.update({
    'id': 'item',
    'bar': {'height': 72},
  });
  final Object normalized = controller.data.snapshot();
  final String serialized = controller.data.serialize();
  if (normalized is! List || serialized.isEmpty)
    throw StateError('invalid data result');
  await controller.destroy();
}
