import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/model/dataset.dart';

void main() {
  test(
    'normalizes defaults and identities without retaining caller aliases',
    () {
      final input = <dynamic>[
        {
          'type': 'group',
          'children': [
            {
              'type': 'item',
              'size': 20,
              'components': [
                {'type': 'bar', 'source': {}, 'size': '50%'},
              ],
            },
          ],
        },
      ];
      final dataset = PatchMapDataset.parse(input);
      final child = dataset.nodes[r'@element:$[0].children[0]']!;
      expect(child.parentId, r'@element:$[0]');
      expect(child.components.single['id'], '@component:0');
      expect(child.value['contentOrientation'], 'upright');
      expect(child.components.single['animationDuration'], 200);
      (input[0]['children'][0] as Map)['size'] = 99;
      expect(child.value['size'], {'width': 20, 'height': 20});
      expect(() => child.value['size']['width'] = 1, throwsUnsupportedError);
      final copy = dataset.snapshot();
      copy[0]['children'][0]['size']['width'] = 5;
      expect(child.value['size']['width'], 20);
    },
  );
  test('grid cells preserve index IDs and hide versus destroy behavior', () {
    final dataset = PatchMapDataset.parse([
      {
        'type': 'grid',
        'id': 'g',
        'cells': [
          [1, 0, 'B'],
        ],
        'inactiveCellStrategy': 'hide',
        'item': {
          'size': {'width': 20, 'height': 40},
          'components': [],
        },
      },
    ]);
    expect(dataset.nodes.keys, ['g', 'g.0.0', 'g.0.1', 'g.0.2']);
    expect(dataset.nodes['g.0.1']!.value['show'], false);
    expect(dataset.nodes['g.0.2']!.value['label'], 'B');
    expect(dataset.nodes['g.0.2']!.instance, true);
  });
  test(
    'preserves accepted compatibility and discards only documented fields',
    () {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'item',
          'id': 'i',
          'size': 20,
          'padding': {'x': -2, 'top': 5},
          'attrs': {
            'scale': 2,
            'pivot': {'x': 1, 'y': 2},
          },
          'components': [
            {
              'type': 'background',
              'source': {},
              'size': 'ignored compatibility value',
            },
          ],
        },
        {
          'type': 'relations',
          'links': [
            {
              'source': {'id': 'i'},
              'target': 'i',
            },
            {'source': 'i', 'target': 'i'},
          ],
          'style': {'opacity': 0.5, 'cap': 'round', 'width': 3},
        },
      ], strict: true);
      expect(dataset.roots[0]['padding'], {
        'top': 5,
        'right': -2,
        'bottom': 0,
        'left': -2,
      });
      expect(dataset.roots[0]['components'][0].containsKey('size'), false);
      expect(dataset.roots[1]['links'], [
        {'source': 'i', 'target': 'i'},
      ]);
      expect(dataset.roots[1]['style'], {
        'color': '#1a1a1aff',
        'alpha': 0.5,
        'width': 3,
      });
    },
  );
  test(
    'closed fields, null, cycles, duplicate generated IDs and references fail atomically',
    () {
      final cycle = <String, dynamic>{};
      cycle['self'] = cycle;
      for (final invalid in <Object?>[
        {},
        [
          {'type': 'item', 'size': null},
        ],
        [
          {'type': 'rect', 'size': 1, 'foo': true},
        ],
        [
          {
            'type': 'rect',
            'size': 1,
            'attrs': {'angle': 0, 'rotation': 0},
          },
        ],
        [
          {'type': 'rect', 'size': 1, 'attrs': cycle},
        ],
        [
          {
            'type': 'grid',
            'id': 'g',
            'cells': [
              [1],
            ],
            'item': {'size': 1},
          },
          {'type': 'rect', 'id': 'g.0.0', 'size': 1},
        ],
      ]) {
        expect(
          () => PatchMapDataset.parse(invalid),
          throwsA(isA<PatchMapDatasetError>()),
        );
      }
      expect(
        () => PatchMapDataset.parse([
          {
            'type': 'relations',
            'links': [
              {'source': 'a', 'target': 'b'},
            ],
          },
        ], strict: true),
        throwsA(
          isA<PatchMapDatasetError>().having(
            (e) => e.code,
            'code',
            'MISSING_TARGET',
          ),
        ),
      );
    },
  );
  test('canonical JSON follows JS finite-number spelling and UTF-16 hash', () {
    expect(
      canonicalJson({
        'z': 1.0,
        'a': -0.0,
        'unicode': '한😀',
        'tiny': 1e-7,
        'fixed': 1e-6,
        'large': 1e21,
      }),
      '{"a":0,"fixed":0.000001,"large":1e+21,"tiny":1e-7,"unicode":"한😀","z":1}',
    );
    expect(semanticHash([]), 'fnv1a64:09612b07b5ecb5a5');
    expect(
      PatchMapDataset.parse([
        {'type': 'rect', 'size': 1},
      ]).semanticHash,
      PatchMapDataset.parse([
        {'size': 1.0, 'type': 'rect'},
      ]).semanticHash,
    );
  });
  test(
    'shared authoring fixtures match the reviewed normalization baseline',
    () {
      for (final name in ['gallery', 'editor', 'updates']) {
        final fixture = jsonDecode(
          File('../../conformance/fixtures/$name.json').readAsStringSync(),
        );
        final normalized = PatchMapDataset.parse(fixture['dataset']);
        expect(
          normalized.semanticHash,
          // The fixture PNG IDAT CRC was corrected without changing pixels.
          // npm's public data trace for these authored bytes has this hash.
          'fnv1a64:07494bb037134f8a',
          reason: name,
        );
        expect(
          PatchMapDataset.parse(normalized.snapshot()).semanticHash,
          normalized.semanticHash,
        );
      }
    },
  );
}
