import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/api/update.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/field_operations.dart';
import 'package:conalog_patch_map/src/presentation/presentation_admission.dart';
import 'package:conalog_patch_map/src/presentation/presentation_composer.dart';
import 'package:conalog_patch_map/src/presentation/presentation_resolver.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const admission = PresentationAdmission();
  const composer = PresentationComposer();
  const resolver = PresentationResolver();
  DatasetDocument scene() => const DatasetReader().read([
    {
      'type': 'item',
      'id': 'authored',
      'size': {'width': 30, 'height': 40},
      'components': [
        {
          'type': 'text',
          'id': 'text',
          'style': {'fontSize': 12},
          'text': '12',
        },
        {
          'type': 'bar',
          'id': 'bar',
          'size': 20,
          'source': {'fill': 'blue', 'borderWidth': 2},
        },
      ],
    },
    {
      'type': 'grid',
      'id': 'g',
      'cells': [
        [1, 0],
      ],
      'inactiveCellStrategy': 'hide',
      'item': {
        'size': 20,
        'components': [
          {
            'type': 'background',
            'id': 'background',
            'source': {'fill': 'blue', 'borderWidth': 2},
            'attrs': {'x': 1, 'alpha': 0.5},
          },
          {
            'type': 'text',
            'id': 'text',
            'style': {'fontSize': 12},
            'text': '12',
          },
          {
            'type': 'bar',
            'id': 'bar',
            'size': 20,
            'source': {'fill': 'blue', 'borderWidth': 2},
          },
          {
            'type': 'icon',
            'id': 'icon',
            'size': 4,
            'source': {
              'src': 'a.svg',
              'data': {'a': 1},
            },
          },
        ],
      },
    },
  ]);
  const text = PatchMapTarget('g.0.0', componentId: 'text');
  const bar = PatchMapTarget('g.0.0', componentId: 'bar');
  const background = PatchMapTarget('g.0.0', componentId: 'background');
  PresentationBatch batch(
    DatasetDocument document,
    PatchMapTarget target,
    Map<String, Object?> values, {
    Map<String, Object?>? current,
  }) => admission.admit(document, [
    PatchMapUpdate(target, values),
  ], current: current == null ? null : (_) => current);
  Map<String, Object?> resolve(
    DatasetDocument document,
    PresentationPlan batch, {
    Map<String, Object?>? current,
  }) => resolver
      .resolve(
        document,
        batch,
        current: current == null ? null : (_) => current,
      )
      .values
      .single;

  test('target equality/hash retains owner-local address identity', () {
    expect(
      const PatchMapTarget('a', componentId: 't'),
      const PatchMapTarget('a', componentId: 't'),
    );
    expect(
      {const PatchMapTarget('a', componentId: 't'): 1}[const PatchMapTarget(
        'a',
        componentId: 't',
      )],
      1,
    );
    expect(
      const PatchMapTarget('a'),
      isNot(const PatchMapTarget('a', componentId: 't')),
    );
  });

  test('authored null never becomes a blanket reset', () {
    final document = scene();
    for (final values in [
      <String, Object?>{'style': null},
      {'text': null},
      {'attrs': null},
      {'show': null},
    ]) {
      expect(
        () => batch(
          document,
          const PatchMapTarget('authored', componentId: 'text'),
          values,
        ),
        throwsA(isA<DatasetException>()),
      );
    }
    expect(
      () => batch(
        document,
        const PatchMapTarget('authored', componentId: 'bar'),
        {'source': null},
      ),
      throwsA(isA<DatasetException>()),
    );
    expect(
      () => batch(document, const PatchMapTarget('authored'), {
        'size': {'height': null},
      }),
      throwsA(isA<DatasetException>()),
    );
  });

  test(
    'style reset barrier survives later fill and later reset clears children',
    () {
      final document = scene();
      final overridden = resolve(
        document,
        batch(document, text, {
          'style': {'fontSize': 40},
        }),
      );
      final reset = batch(document, text, {'style': null}, current: overridden);
      final fill = batch(document, text, {
        'style': {'fill': 'red'},
      }, current: overridden);
      final combined = composer.compose(reset, fill);
      expect(combined.patches.single.operations.map((o) => o.kind), [
        FieldOperationKind.reset,
        FieldOperationKind.childrenSet,
      ]);
      final effective = resolve(document, combined, current: overridden);
      expect((effective['style'] as Map)['fontSize'], 12);
      expect((effective['style'] as Map)['fill'], 'red');
      expect(reset.claims.first.isSatisfiedBy(effective), false);
      expect(fill.claims.last.isSatisfiedBy(effective), true);
      final resetAgain = composer.compose(combined, reset);
      expect(resetAgain.patches.single.operations, hasLength(1));
      expect(
        (resolve(document, resetAgain, current: overridden)['style']
            as Map)['fill'],
        '#1a1a1aff',
      );
    },
  );

  test('size partial promotes scalar and axis reset preserves other axis', () {
    final document = scene();
    final first = resolve(
      document,
      batch(document, bar, {
        'size': {'height': 7},
        'placement': 'right',
        'margin': {'left': -2},
      }),
    );
    expect(first['size'], {'width': 20, 'height': 7});
    expect(first['placement'], 'right');
    final next = resolve(
      document,
      batch(document, bar, {
        'size': {'width': 11},
      }, current: first),
      current: first,
    );
    expect(next['size'], {'width': 11, 'height': 7});
    final reset = batch(document, bar, {
      'size': {'height': null},
    }, current: next);
    final finalRecord = resolve(document, reset, current: next);
    expect(finalRecord['size'], {'width': 11, 'height': 20});
    expect(reset.claims.single.isSatisfiedBy(finalRecord), true);
    expect(
      () => batch(document, bar, {'size': null}),
      throwsA(isA<DatasetException>()),
    );
    expect(
      () => batch(document, bar, {
        'size': {
          'width': {'value': null},
        },
      }),
      throwsA(isA<DatasetException>()),
    );
  });

  test('same scalar-axis update keeps original record identity', () {
    final document = scene();
    final original = authoredRecord(document, bar);
    final effective = resolve(
      document,
      batch(document, bar, {
        'size': {'height': 20},
      }),
    );
    expect(identical(original, effective), true);
  });

  test('main-only concrete fields do not gain null resets or height alias', () {
    final document = scene();
    for (final entry in [
      {'placement': null},
      {'animation': null},
      {'animationDuration': null},
      {'margin': null},
      {'attrs': null},
      {'height': 10},
    ]) {
      expect(
        () => batch(document, bar, entry),
        throwsA(isA<DatasetException>()),
      );
    }
    expect(
      () => batch(
        document,
        const PatchMapTarget('g.0.0', componentId: 'icon'),
        {'size': null},
      ),
      throwsA(isA<DatasetException>()),
    );
  });

  test(
    'concrete bar source is atomic while background source merges recursively',
    () {
      final document = scene();
      final barRecord = resolve(
        document,
        batch(document, bar, {
          'source': {'fill': 'red'},
        }),
      );
      expect((barRecord['source'] as Map)['borderWidth'], 0);
      final backgroundRecord = resolve(
        document,
        batch(document, background, {
          'source': {'fill': 'red'},
        }),
      );
      expect((backgroundRecord['source'] as Map)['borderWidth'], 2);
      final authoredBar = resolve(
        document,
        batch(document, const PatchMapTarget('authored', componentId: 'bar'), {
          'source': {'fill': 'red'},
        }),
      );
      expect((authoredBar['source'] as Map)['borderWidth'], 2);
      final reset = resolve(
        document,
        batch(document, bar, {'source': null}, current: barRecord),
        current: barRecord,
      );
      expect(
        identical(reset['source'], authoredRecord(document, bar)['source']),
        true,
      );
    },
  );

  test('only top-level supported null resets; nested schema null rejects', () {
    final document = scene();
    for (final entry in [
      {
        'style': {'fill': null},
      },
      {
        'style': {'fontSize': null},
      },
      {
        'margin': {'left': null},
      },
      {
        'attrs': {'alpha': null},
      },
    ]) {
      expect(
        () => batch(document, text, entry),
        throwsA(isA<DatasetException>()),
      );
    }
    expect(
      () => batch(document, background, {
        'source': {'fill': null},
      }),
      throwsA(isA<DatasetException>()),
    );
    final changed = resolve(
      document,
      batch(document, background, {
        'attrs': {
          'x': 9,
          'custom': {'value': null},
        },
      }),
    );
    expect((changed['attrs'] as Map)['custom'], {'value': null});
    final reset = resolve(
      document,
      batch(document, background, {'attrs': null}, current: changed),
      current: changed,
    );
    expect(reset['attrs'], {'x': 1, 'alpha': 0.5});
  });

  test(
    'invalid last entry, duplicates, missing targets and unknown fields reject batch',
    () {
      final document = scene();
      expect(
        () => admission.admit(document, [
          const PatchMapUpdate(text, {'text': 'new'}),
          const PatchMapUpdate(bar, {
            'size': {'height': -1},
          }),
        ]),
        throwsA(isA<DatasetException>()),
      );
      expect(authoredRecord(document, text)['text'], '12');
      expect(
        () => admission.admit(document, [
          const PatchMapUpdate(text, {'text': 'a'}),
          const PatchMapUpdate(text, {'text': 'b'}),
        ]),
        throwsA(
          isA<DatasetException>().having((e) => e.code, 'code', 'DUPLICATE_ID'),
        ),
      );
      expect(
        () => batch(document, const PatchMapTarget('missing'), {'show': false}),
        throwsA(
          isA<DatasetException>().having(
            (e) => e.code,
            'code',
            'MISSING_TARGET',
          ),
        ),
      );
      expect(
        () => batch(document, text, {'unknown': 1}),
        throwsA(
          isA<DatasetException>().having(
            (e) => e.code,
            'code',
            'UNKNOWN_FIELD',
          ),
        ),
      );
      expect(
        () => batch(document, const PatchMapTarget('g'), {
          'cells': [
            [1],
          ],
        }),
        throwsA(isA<DatasetException>()),
      );
    },
  );

  test('admission detaches caller data and operations/maps are immutable', () {
    final document = scene();
    final filter = <String, Object?>{'name': 'x'};
    final values = <String, Object?>{
      'style': {
        'filters': [filter],
      },
      'attrs': {
        'custom': [1],
      },
    };
    final admitted = batch(document, text, values);
    filter['name'] = 'mutated';
    (values['attrs'] as Map)['custom'] = [9];
    values.clear();
    final effective = resolve(document, admitted);
    expect((effective['style'] as Map)['filters'], [
      {'name': 'x'},
    ]);
    expect((effective['attrs'] as Map)['custom'], [1]);
    expect(() => admitted.patches.clear(), throwsUnsupportedError);
    expect(
      () => admitted.patches.single.operations.first.path.clear(),
      throwsUnsupportedError,
    );
    expect(() => effective['text'] = 'bad', throwsUnsupportedError);
    expect(
      () => ((effective['style'] as Map)['filters'] as List).clear(),
      throwsUnsupportedError,
    );
  });

  test('sparse style/spacing does not inject defaults into admitted patch', () {
    final document = scene();
    final admitted = batch(document, text, {
      'style': {
        'stroke': {'color': 'red'},
      },
      'margin': {'left': 2},
    });
    expect(admitted.patches.single.operations.map((op) => op.path.join('.')), [
      'style.stroke.color',
      'margin.left',
    ]);
    final effective = resolve(document, admitted);
    expect((effective['style'] as Map)['fontSize'], 12);
    expect(((effective['style'] as Map)['stroke'] as Map)['width'], 1);
  });

  test(
    'repeated same-value claims survive; different later value supersedes',
    () {
      final document = scene();
      final first = batch(document, text, {'text': 'same'});
      final second = batch(document, text, {'text': 'same'});
      final same = composer.compose(first, second);
      final sameRecord = resolve(document, same);
      expect(
        [
          ...first.claims,
          ...second.claims,
        ].every((claim) => claim.isSatisfiedBy(sameRecord)),
        true,
      );
      final third = batch(document, text, {'text': 'other'});
      final different = composer.compose(same, third);
      final differentRecord = resolve(document, different);
      expect(
        [
          ...first.claims,
          ...second.claims,
        ].every((claim) => !claim.isSatisfiedBy(differentRecord)),
        true,
      );
      expect(third.claims.last.isSatisfiedBy(differentRecord), true);
    },
  );

  test(
    'ordinary 10000 text updates do not query effective state during admission',
    () {
      final document = const DatasetReader().read([
        {
          'type': 'grid',
          'id': 'big',
          'cells': [List.filled(10000, 1)],
          'item': {
            'size': 10,
            'components': [
              {'type': 'text', 'id': 't', 'text': '0'},
            ],
          },
        },
      ]);
      var lookups = 0;
      final admitted = admission.admit(
        document,
        [
          for (var i = 0; i < 10000; i++)
            PatchMapUpdate(PatchMapTarget('big.0.$i', componentId: 't'), const {
              'text': '1',
            }),
        ],
        current: (_) {
          lookups++;
          throw StateError('must not inspect current text');
        },
      );
      expect(lookups, 0);
      expect(admitted.patches.length, 10000);
      expect(
        admitted.patches.every((patch) => patch.operations.length == 1),
        true,
      );
    },
  );

  test('same effective values preserve record and nested identities', () {
    final document = scene();
    final original = authoredRecord(document, text);
    final effective = resolve(
      document,
      batch(document, text, {
        'text': '12',
        'style': {'fontSize': 12},
      }),
    );
    expect(identical(original, effective), true);
    final changed = resolve(document, batch(document, text, {'text': '13'}));
    expect(identical(original['style'], changed['style']), true);
  });

  test(
    'cross-field autoFont/vector/attrs validation reads narrow current values',
    () {
      final document = scene();
      final current = resolve(
        document,
        batch(document, text, {
          'style': {
            'autoFont': {'min': 10, 'max': 20},
          },
          'attrs': {'rotation': 1},
        }),
      );
      expect(
        () => batch(document, text, {
          'style': {
            'autoFont': {'min': 21},
          },
        }, current: current),
        throwsA(isA<DatasetException>()),
      );
      expect(
        () => batch(document, text, {
          'attrs': {'angle': 3},
        }, current: current),
        throwsA(isA<DatasetException>()),
      );
      expect(
        () => batch(document, text, {
          'attrs': {
            'scale': {'x': 2},
          },
        }),
        throwsA(isA<DatasetException>()),
      );
    },
  );
  test(
    'new optional stroke defaults resolve without polluting sparse admission',
    () {
      final document = scene();
      final admitted = batch(document, text, {
        'style': {'stroke': {}},
      });
      expect(admitted.patches.single.operations.single.value, isEmpty);
      final effective = resolve(document, admitted);
      expect(((effective['style'] as Map)['stroke'] as Map)['width'], 1);
      expect(admitted.claims.single.isSatisfiedBy(effective), true);
    },
  );
  test(
    'introducing default black stroke is a real change even when leaf equals default',
    () {
      final document = scene();
      final admitted = batch(document, text, {
        'style': {
          'stroke': {'color': '#1a1a1aff'},
        },
      });
      final effective = resolve(document, admitted);
      expect((effective['style'] as Map)['stroke'], isA<Map>());
      expect(identical(effective, authoredRecord(document, text)), false);
    },
  );
  test('authored element fields resolve without structural replacement', () {
    final document = const DatasetReader().read([
      {'type': 'group', 'id': 'group', 'children': []},
      {'type': 'image', 'id': 'image', 'source': 'a.svg'},
      {'type': 'text', 'id': 'label', 'text': 'old'},
      {
        'type': 'rect',
        'id': 'rect',
        'size': 20,
        'radius': {'topLeft': 1, 'topRight': 2},
      },
      {'type': 'relations', 'id': 'relations', 'links': []},
      {
        'type': 'grid',
        'id': 'grid',
        'cells': [],
        'gap': {'x': 1, 'y': 2},
        'item': {'size': 2},
      },
    ]);
    final admitted = admission.admit(document, const [
      PatchMapUpdate(PatchMapTarget('group'), {
        'show': false,
        'attrs': {'x': 2},
      }),
      PatchMapUpdate(PatchMapTarget('image'), {
        'source': {
          'src': 'b.svg',
          'data': {'x': null},
        },
        'size': {'width': 5, 'height': 6},
        'opacity': 0.5,
      }),
      PatchMapUpdate(PatchMapTarget('label'), {
        'text': 'new',
        'overflow': 'hidden',
        'style': {'fontSize': 20},
      }),
      PatchMapUpdate(PatchMapTarget('rect'), {
        'size': {'height': 30},
        'radius': {'topLeft': 4},
        'stroke': {'width': 2},
        'eventMode': 'none',
      }),
      PatchMapUpdate(PatchMapTarget('relations'), {
        'style': {'opacity': 0.3, 'width': 3},
      }),
      PatchMapUpdate(PatchMapTarget('grid'), {
        'gap': {'x': 3},
      }),
    ]);
    final effective = resolver.resolve(document, admitted);
    expect(effective[const PatchMapTarget('group')]!['show'], false);
    expect(effective[const PatchMapTarget('image')]!['source'], {
      'src': 'b.svg',
      'data': {'x': null},
    });
    expect(effective[const PatchMapTarget('label')]!['text'], 'new');
    final rect = effective[const PatchMapTarget('rect')]!;
    expect(rect['size'], {'width': 20, 'height': 30});
    expect((rect['radius'] as Map)['topRight'], 2);
    expect((rect['stroke'] as Map)['color'], '#1a1a1aff');
    expect(effective[const PatchMapTarget('relations')]!['style'], {
      'color': '#1a1a1aff',
      'alpha': 0.3,
      'width': 3,
    });
    expect(effective[const PatchMapTarget('grid')]!['gap'], {'x': 3, 'y': 2});
    expect(
      () => batch(document, const PatchMapTarget('image'), {
        'size': {'width': 3},
      }),
      throwsA(isA<DatasetException>()),
    );
  });

  test(
    'presentation JSON/style cycles and nonfinite values reject at admission',
    () {
      final document = scene();
      final attrs = <String, Object?>{};
      attrs['loop'] = attrs;
      expect(
        () => batch(document, text, {'attrs': attrs}),
        throwsA(isA<DatasetException>()),
      );
      final style = <String, Object?>{};
      style['tagStyles'] = {'loop': style};
      expect(
        () => batch(document, text, {'style': style}),
        throwsA(isA<DatasetException>()),
      );
      expect(
        () => batch(document, bar, {
          'size': {'width': double.infinity},
        }),
        throwsA(isA<DatasetException>()),
      );
    },
  );
  test('empty size partial preserves scalar size and record identity', () {
    final document = scene();
    final original = authoredRecord(document, bar);
    final admitted = batch(document, bar, {'size': {}});
    expect(admitted.patches.single.operations, isEmpty);
    expect(admitted.claims, isEmpty);
    final effective = resolve(document, admitted);
    expect(effective['size'], 20);
    expect(identical(original, effective), true);
  });

  test('empty size-axis partial preserves scalar axis and record identity', () {
    final document = scene();
    final original = authoredRecord(document, bar);
    final admitted = batch(document, bar, {
      'size': {'height': {}},
    });
    expect(admitted.patches.single.operations, isEmpty);
    expect(admitted.claims, isEmpty);
    final effective = resolve(document, admitted);
    expect(effective['size'], 20);
    expect(identical(original, effective), true);
  });

  test('opaque attrs size and width keys never acquire schema promotion', () {
    final document = scene();
    final previous = resolve(
      document,
      batch(document, text, {
        'attrs': {
          'custom': {
            'size': 10,
            'box': {
              'size': {'width': 10},
            },
          },
        },
      }),
    );
    final admitted = batch(document, text, {
      'attrs': {
        'custom': {
          'size': {'flag': true},
          'box': {
            'size': {
              'width': {'flag': true},
            },
          },
        },
      },
    }, current: previous);
    final effective = resolve(document, admitted, current: previous);
    expect((effective['attrs'] as Map)['custom'], {
      'size': {'flag': true},
      'box': {
        'size': {
          'width': {'flag': true},
        },
      },
    });
  });
}
