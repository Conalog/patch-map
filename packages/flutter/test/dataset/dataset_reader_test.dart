import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';

void main() {
  const reader = DatasetReader();
  Map<String, Object?> item({
    String? id,
    Object? size = 20,
    List<Object?>? components,
  }) => {'type': 'item', 'id': ?id, 'size': size, 'components': ?components};
  Matcher diagnostic(String code, [String? path]) => isA<DatasetException>()
      .having((error) => error.code, 'code', code)
      .having((error) => path == null || error.path == path, 'path', true);

  test('admits actual gallery with every authored and component kind', () {
    final fixture =
        jsonDecode(
              File(
                '../../conformance/fixtures/gallery.json',
              ).readAsStringSync(),
            )
            as Map;
    final document = reader.read(fixture['dataset']);
    expect(
      document.targets.values.map((v) => v.type).toSet(),
      containsAll([
        'group',
        'grid',
        'item',
        'relations',
        'image',
        'text',
        'rect',
      ]),
    );
    expect(
      document.targets.values
          .expand((v) => v.components.values)
          .map((v) => v['type'])
          .toSet(),
      containsAll(['background', 'bar', 'icon', 'text']),
    );
  });

  test('admits real large-grid fixture and shares cell templates', () {
    final fixture = jsonDecode(
      File(
        '../javascript/tests/fixtures/large-grid-scene.json',
      ).readAsStringSync(),
    );
    final document = reader.read(fixture);
    final grid = document.targets.values.firstWhere(
      (v) =>
          v.type == 'grid' &&
          (v.data['cells'] as List).fold<int>(
                0,
                (sum, row) => sum + (row as List).length,
              ) >
              100,
    );
    final cells = document.targets.values
        .where((v) => v.parentId == grid.id && v.row != null)
        .toList();
    expect(cells.length, greaterThan(100));
    expect(identical(cells.first.data, cells.last.data), isTrue);
    expect(identical(cells.first.components, cells.last.components), isTrue);
    expect(identical(cells.first.data, grid.data['item']), isTrue);
  });

  test('normalizes defaults and non-square size without scalar distortion', () {
    final document = reader.read([
      item(
        size: {'width': 20, 'height': 40},
        components: [
          {'type': 'bar', 'source': {}, 'size': '25%'},
          {
            'type': 'icon',
            'source': 'icon.svg',
            'size': {
              'width': {'value': 3, 'unit': 'px'},
              'height': 'calc(100% - 2px)',
            },
          },
          {'type': 'text'},
        ],
      ),
      item(),
    ]);
    final root = document.roots.first;
    expect(root['id'], r'@element:$[0]');
    expect(root['contentOrientation'], 'upright');
    expect(root['size'], {'width': 20, 'height': 40});
    expect(document.roots.last['size'], {'width': 20, 'height': 20});
    final components = document.targets[root['id']]!.components;
    expect(components['@component:0']!['placement'], 'bottom');
    expect(components['@component:0']!['animationDuration'], 200);
    expect(components['@component:0']!['animation'], true);
    expect(
      (components['@component:2']!['style'] as Map)['fontFamily'],
      'FiraCode',
    );
  });

  test(
    'retains hide cells, destroys zero cells and does not use string as id',
    () {
      Map<String, Object?> grid(String id, String strategy) => {
        'type': 'grid',
        'id': id,
        'cells': [
          [0, 1, 'label'],
        ],
        'item': {'size': 20},
        'inactiveCellStrategy': strategy,
      };
      final document = reader.read([
        grid('hide', 'hide'),
        grid('destroy', 'destroy'),
      ]);
      expect(document.targets['hide.0.0']!.active, false);
      expect(document.targets['hide.0.2']!.active, true);
      expect(document.targets.containsKey('destroy.0.0'), false);
      expect(document.targets.containsKey('label'), false);
    },
  );

  test(
    'rejects global generated/grid ids and owner-local component collisions',
    () {
      expect(
        () => reader.read([item(), item(id: r'@element:$[0]')]),
        throwsA(diagnostic('DUPLICATE_ID', r'$[1].id')),
      );
      expect(
        () => reader.read([
          {
            'type': 'grid',
            'id': 'g',
            'cells': [
              [1],
            ],
            'item': {'size': 2},
          },
          item(id: 'g.0.0'),
        ]),
        throwsA(diagnostic('DUPLICATE_ID')),
      );
      expect(
        () => reader.read([
          item(
            components: [
              {'type': 'text'},
              {'type': 'text', 'id': '@component:0'},
            ],
          ),
        ]),
        throwsA(diagnostic('DUPLICATE_ID')),
      );
      expect(
        reader.read([
          item(
            components: [
              {'type': 'text', 'id': 'x'},
            ],
          ),
          item(
            components: [
              {'type': 'text', 'id': 'x'},
            ],
          ),
        ]).roots,
        hasLength(2),
      );
    },
  );

  test(
    'rejects unknown fields, nulls, wrong types, finite violations and bad color',
    () {
      for (final input in [
        [item()..['unknown'] = true],
        [item()..['size'] = null],
        [item()..['show'] = 1],
        [item()..['size'] = double.nan],
        [
          {'type': 'rect', 'size': 2, 'fill': 'definitely-not-color'},
        ],
        [
          item()..['attrs'] = {'alpha': 2},
        ],
        [
          item()..['padding'] = {'top': null},
        ],
        [
          item(
            components: [
              {'type': 'text', 'split': 0.2},
            ],
          ),
        ],
      ]) {
        expect(() => reader.read(input), throwsA(isA<DatasetException>()));
      }
      expect(
        () => reader.read([
          item(),
          {'type': 'not-kind'},
        ]),
        throwsA(diagnostic('INVALID_RECORD_KIND')),
      );
      expect(reader.read([item()]).roots, hasLength(1));
    },
  );

  test(
    'rejects structural/open JSON/text style cycles and permits shared inputs',
    () {
      final group = <String, Object?>{'type': 'group'};
      group['children'] = [group];
      expect(() => reader.read([group]), throwsA(diagnostic('INVALID_VALUE')));
      final attrs = <String, Object?>{};
      attrs['self'] = attrs;
      expect(
        () => reader.read([item()..['attrs'] = attrs]),
        throwsA(diagnostic('INVALID_VALUE')),
      );
      final style = <String, Object?>{};
      style['tagStyles'] = {'loop': style};
      expect(
        () => reader.read([
          {'type': 'text', 'style': style},
        ]),
        throwsA(diagnostic('INVALID_VALUE')),
      );
      final shared = item();
      expect(reader.read([shared, shared]).roots, hasLength(2));
    },
  );

  test('deeply detaches JSON and rejects all snapshot mutations', () {
    final nested = <Object?>[
      {'value': 1},
    ];
    final source = item(
      components: [
        {
          'type': 'icon',
          'source': {
            'src': 'a',
            'data': {'nested': nested},
          },
          'size': 2,
        },
        {
          'type': 'text',
          'style': {
            'filters': [nested],
          },
        },
      ],
    )..['attrs'] = {'extension': nested};
    final document = reader.read([source]);
    (nested.first as Map)['value'] = 9;
    nested.add(3);
    final attrs = document.roots.first['attrs'] as Map;
    expect(attrs['extension'], [
      {'value': 1},
    ]);
    expect(() => document.roots.add({}), throwsUnsupportedError);
    expect(() => document.targets.clear(), throwsUnsupportedError);
    expect(() => document.roots.first['show'] = false, throwsUnsupportedError);
    expect(
      () => ((attrs['extension'] as List).first as Map)['value'] = 3,
      throwsUnsupportedError,
    );
    final components = document.targets.values.first.components;
    expect(() => components.clear(), throwsUnsupportedError);
    expect(
      () => components.values.first['show'] = false,
      throwsUnsupportedError,
    );
    expect(
      (((components['@component:0']!['source'] as Map)['data']
          as Map)['nested']),
      [
        {'value': 1},
      ],
    );
  });

  test(
    'normalizes relations endpoints/dedup without rejecting dangling targets',
    () {
      final document = reader.read([
        {
          'type': 'relations',
          'links': [
            {
              'source': {'id': 'a'},
              'target': 'missing',
            },
            {
              'source': 'a',
              'target': {'id': 'missing'},
            },
            {'source': 'missing', 'target': 'a'},
          ],
          'style': {'opacity': 0.5, 'width': 2},
        },
      ]);
      expect(document.roots.first['links'], [
        {'source': 'a', 'target': 'missing'},
        {'source': 'missing', 'target': 'a'},
      ]);
      expect(document.roots.first['style'], {
        'color': '#1a1a1aff',
        'alpha': 0.5,
        'width': 2,
      });
    },
  );
  test(
    'validates Pixi string color grammar and retains JSON source values',
    () {
      for (final color in [
        'red',
        'ReBeccAPurple',
        'transparent',
        '0xfff',
        'ffffff',
        '#1234',
        '#12345678',
        'rgb(1, 2, 3)',
        'rgb(1% 2% 3% / 50%)',
        'hsl(1turn 20% 30%)',
        'theme.primary',
      ]) {
        final root = reader
            .read([
              {'type': 'rect', 'size': 2, 'fill': color},
            ])
            .roots
            .single;
        expect(root['fill'], color);
      }
      for (final color in [
        '',
        'unknown-color',
        'abcde',
        '0x1234',
        '#12345',
        'rgb(1%, 2, 3)',
        'rgb(1., 2, 3)',
        'hsl(0, 20, 30)',
        'url(image)',
      ]) {
        expect(
          () => reader.read([
            {'type': 'rect', 'size': 2, 'fill': color},
          ]),
          throwsA(diagnostic('INVALID_VALUE')),
          reason: color,
        );
      }
      final color = <String, Object?>{'r': 1, 'g': 2, 'b': 3};
      final root = reader
          .read([
            {'type': 'rect', 'size': 2, 'fill': color},
          ])
          .roots
          .single;
      color['r'] = 10;
      expect(root['fill'], {'r': 1, 'g': 2, 'b': 3});
    },
  );

  test('normalizes advanced styles, source descriptors, edges and radii', () {
    final document = reader.read([
      item(
        components: [
          {
            'type': 'background',
            'size': null,
            'source': {
              'fill': [1, 0, 0],
              'radius': [1, 2, 3, 4],
            },
          },
          {
            'type': 'icon',
            'size': 4,
            'source': {
              'src': 'a.svg',
              'data': {'a': true},
              'parser': 'svg',
              'format': 'svg',
              'loadParser': 'loadTextures',
            },
            'margin': {'x': 1, 'y': 2, 'left': -3},
          },
          {
            'type': 'text',
            'style': {
              'fontFamily': ['FiraCode', 'sans-serif'],
              'fontSize': '12px',
              'fontWeight': '0b1100100',
              'fontStyle': 'italic',
              'fontVariant': 'small-caps',
              'stroke': {
                'color': 'red',
                'alpha': 0.5,
                'width': 2,
                'cap': 'round',
                'join': 'bevel',
                'miterLimit': 4,
                'alignment': 0.2,
                'pixelLine': true,
                'textureSpace': 'local',
                'matrix': [1, 0],
              },
              'strokeWidth': 2,
              'alpha': 0.7,
              'cornerRadius': 1,
              'dropShadow': {
                'color': 'black',
                'alpha': 0.5,
                'angle': -1,
                'blur': 2,
                'distance': -3,
              },
              'align': 'justify',
              'textBaseline': 'middle',
              'wordWrap': true,
              'breakWords': false,
              'trim': false,
              'wordWrapWidth': 'auto',
              'whiteSpace': 'pre-line',
              'lineHeight': 3,
              'leading': -1,
              'letterSpacing': -2,
              'padding': 2,
              'tagStyles': {
                'bold': {'fontWeight': 700},
              },
              'filters': [
                {'name': 'custom'},
              ],
              'autoFont': {'min': 2, 'max': 20},
              'overflow': 'ellipsis',
            },
          },
        ],
      )..['padding'] = {'x': 2, 'top': 3},
    ]);
    final root = document.roots.single;
    expect(root['padding'], {'top': 3, 'right': 2, 'bottom': 0, 'left': 2});
    final components = document.targets.values.single.components;
    expect(components['@component:0']!.containsKey('size'), false);
    expect((components['@component:0']!['source'] as Map)['radius'], [
      1,
      2,
      3,
      4,
    ]);
    expect(components['@component:1']!['margin'], {
      'top': 2,
      'right': 1,
      'bottom': 2,
      'left': -3,
    });
    final style = components['@component:2']!['style'] as Map;
    expect(style['fontWeight'], '0b1100100');
    expect(style['tagStyles'], {
      'bold': {'fontWeight': 700},
    });
    expect((style['stroke'] as Map)['pixelLine'], true);
    expect(
      () => reader.read([
        {
          'type': 'text',
          'style': {
            'autoFont': {'min': 2},
          },
        },
      ]),
      throwsA(diagnostic('UNKNOWN_FIELD')),
    );
    expect(
      () => reader.read([
        item(
          components: [
            {
              'type': 'text',
              'style': {
                'autoFont': {'min': 20, 'max': 2},
              },
            },
          ],
        ),
      ]),
      throwsA(diagnostic('INVALID_VALUE')),
    );
    expect(
      () => reader.read([
        {
          'type': 'rect',
          'size': 2,
          'stroke': {'opacity': 0.5},
        },
      ]),
      throwsA(diagnostic('UNKNOWN_FIELD')),
    );
  });

  test('expands 10000 cells using one normalized template', () {
    final document = reader.read([
      {
        'type': 'grid',
        'id': 'g',
        'cells': List.generate(100, (_) => List.filled(100, 1)),
        'item': {
          'size': {'width': 12, 'height': 20},
          'components': [
            {'type': 'text', 'text': '12'},
          ],
        },
      },
    ]);
    expect(document.targets.length, 10001);
    expect(
      identical(
        document.targets['g.0.0']!.data,
        document.targets['g.99.99']!.data,
      ),
      true,
    );
    expect(
      identical(
        document.targets['g.0.0']!.components['@component:0'],
        document.targets['g.99.99']!.components['@component:0'],
      ),
      true,
    );
  });
}
