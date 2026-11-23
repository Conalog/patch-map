import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' show progress;

Widget _host(
  PatchMapController map, {
  int limit = 50,
  bool active = true,
  ValueChanged<PatchMapEditHistoryState>? onHistory,
  ValueChanged<PatchMapInputEvent>? onEvent,
}) => Directionality(
  textDirection: TextDirection.ltr,
  child: Center(
    child: SizedBox.square(
      dimension: 400,
      child: PatchMapView(
        controller: map,
        active: active,
        editHistoryLimit: limit,
        longPressEditEnabled: true,
        onEditHistoryChanged: onHistory,
        onEvent: onEvent,
      ),
    ),
  ),
);

const _ids = ['a', 'b', 'c'];
const _b = PatchMapTarget('b');

Map<String, Object?> _rect(String id, int x, int y) => {
  'type': 'rect',
  'id': id,
  'size': {'width': 20, 'height': 12},
  'attrs': {'x': x, 'y': y},
};

final _scene = [
  _rect('a', 0, 0),
  _rect('b', 45, 35),
  _rect('c', 135, 85),
  {
    'type': 'relations',
    'id': 'link',
    'links': [
      {'source': 'a', 'target': 'b'},
    ],
  },
];

Future<T> _submit<T>(WidgetTester tester, Future<T> request) async {
  await progress(tester);
  return request;
}

Future<void> _draw(WidgetTester tester, PatchMapController map) async {
  expect(
    (await _submit(tester, map.draw(_scene))).outcome,
    PatchMapOutcome.applied,
  );
  map.setCamera(center: const Offset(75, 50), scale: 1, rotation: 0);
  await tester.pump();
}

Map<String, Rect> _bounds(PatchMapController map) => {
  for (final id in [..._ids, 'link']) id: map.getGeometry(id)!.bounds!,
};

Future<void> _align(
  WidgetTester tester,
  PatchMapController map,
  PatchMapAlignment alignment,
) async {
  expect(
    (await _submit(tester, map.alignSelection(alignment))).result.outcome,
    PatchMapOutcome.applied,
  );
}

Future<TestGesture> _hold(
  WidgetTester tester,
  PatchMapController map,
  Offset world,
) async {
  final view = tester.getTopLeft(find.byType(PatchMapView));
  final finger = await tester.startGesture(view + map.toLocal(world)!);
  await tester.pump(const Duration(milliseconds: 310));
  return finger;
}

Future<void> _selectByHold(
  WidgetTester tester,
  PatchMapController map,
  String id,
) async {
  final finger = await _hold(tester, map, map.getGeometry(id)!.center!);
  await finger.up();
  await tester.pump();
}

List<String> _selected(PatchMapController map) =>
    map.selected.map((item) => item.id).toList();

Map<String, Object?> _relation(String id, Object source, Object target) => {
  'type': 'relations',
  'id': id,
  'links': [
    {'source': source, 'target': target},
  ],
};

void main() {
  const link = PatchMapTarget('link');
  const firstLinks = [
    {'source': 'b', 'target': 'c'},
  ];
  const secondLinks = [
    {'source': 'a', 'target': 'c'},
  ];

  const draft = PatchMapTarget('draft');
  const newRelation = {'type': 'relations', 'id': 'draft', 'links': []};
  const selfLink = [
    {'source': 'b', 'target': 'b'},
  ];

  testWidgets(
    'creates a relation with local link steps and one global addition',
    (tester) async {
      final map = PatchMapController();
      await tester.pumpWidget(_host(map));
      await _draw(tester, map);
      map.select(['a'], recordHistory: true);

      final creation = map.beginRelationCreation(newRelation);
      expect(map.getValue(draft), isNull);
      expect(
        (await _submit(tester, creation)).outcome,
        PatchMapOutcome.applied,
      );
      expect(map.getValue(draft)!['links'], isEmpty);
      expect(map.editHistoryState.undoDepth, 0);
      expect(
        map.previewRelationLinks(draft.id, firstLinks).outcome,
        PatchMapOutcome.applied,
      );
      expect(map.getValue(draft)!['links'], isEmpty);
      expect(
        (await _submit(
          tester,
          map.updateRelationLinkSteps(draft.id, [selfLink, firstLinks]),
        )).outcome,
        PatchMapOutcome.applied,
      );
      map.clearRelationLinkPreview();
      expect(map.editHistoryState.undoDepth, 2);
      await _submit(tester, map.undo());
      expect(map.getValue(draft)!['links'], selfLink);
      await _submit(tester, map.redo());
      expect(map.getValue(draft)!['links'], firstLinks);
      expect(
        (await map.finishRelationEdit(draft.id)).outcome,
        PatchMapOutcome.applied,
      );
      expect(map.editHistoryState.undoDepth, 2);
      expect(_selected(map), [draft.id]);

      // A later edit must still match the added target after replaying creation.
      await _submit(tester, map.updateRelation(draft.id, links: secondLinks));
      await _submit(tester, map.undo());
      await _submit(tester, map.undo());
      expect(map.getValue(draft), isNull);
      expect(_selected(map), ['a']);
      await _submit(tester, map.redo());
      expect(map.getValue(draft)!['links'], firstLinks);
      expect(
        (await _submit(tester, map.redo())).result.outcome,
        PatchMapOutcome.applied,
      );
      expect(map.getValue(draft)!['links'], secondLinks);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('cancelling or finishing an empty draft preserves global redo', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    map.select(['a'], recordHistory: true);
    map.select(['b'], recordHistory: true);
    await _submit(tester, map.undo());
    final globalState = map.editHistoryState;

    await _submit(tester, map.beginRelationCreation(newRelation));
    await _submit(tester, map.updateRelationLinkSteps(draft.id, [firstLinks]));
    map.select(['c']);
    expect(
      (await _submit(
        tester,
        map.updateValues([
          PatchMapUpdate(draft, {'locked': true}),
        ]),
      )).outcome,
      PatchMapOutcome.applied,
    );
    expect(
      (await _submit(tester, map.cancelRelationCreation(draft.id))).outcome,
      PatchMapOutcome.applied,
    );
    expect(map.rootIds, isNot(contains(draft.id)));
    expect(_selected(map), ['a']);
    expect(map.editHistoryState, globalState);

    await _submit(tester, map.beginRelationCreation(newRelation));
    await _submit(tester, map.finishRelationEdit(draft.id));
    expect(map.getValue(draft), isNull);
    expect(map.editHistoryState, globalState);
    expect(
      (await _submit(tester, map.redo())).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(_selected(map), ['b']);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'publishes paint link steps atomically and replays them locally',
    (tester) async {
      final map = PatchMapController();
      await tester.pumpWidget(_host(map));
      await _draw(tester, map);
      final original = map.getValue(link)!['links'];
      expect(
        (await map.updateRelationLinkSteps('link', [firstLinks])).outcome,
        PatchMapOutcome.rejected,
      );
      map.beginRelationEdit('link');
      expect(
        (await map.updateRelationLinkSteps('link', [
          firstLinks,
          [
            {'source': 'a'},
          ],
        ])).outcome,
        PatchMapOutcome.rejected,
      );
      expect(map.getValue(link)!['links'], original);
      expect(map.editHistoryState.undoDepth, 0);

      final request = map.updateRelationLinkSteps('link', [
        firstLinks,
        firstLinks,
        secondLinks,
      ]);
      expect(map.getValue(link)!['links'], original);
      expect(map.editHistoryState.isBusy, isTrue);
      expect((await _submit(tester, request)).outcome, PatchMapOutcome.applied);
      expect(map.getValue(link)!['links'], secondLinks);
      expect(map.editHistoryState.undoDepth, 2);
      await _submit(tester, map.undo());
      expect(map.getValue(link)!['links'], firstLinks);
      await _submit(tester, map.undo());
      expect(map.getValue(link)!['links'], original);
      await _submit(tester, map.redo());
      await _submit(tester, map.redo());
      expect(map.getValue(link)!['links'], secondLinks);
      expect(
        (await map.finishRelationEdit('link')).outcome,
        PatchMapOutcome.applied,
      );
      expect(map.editHistoryState.undoDepth, 1);
      await _submit(tester, map.undo());
      expect(map.getValue(link)!['links'], original);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('scopes live steps and commits the applied links as one edit', (
    tester,
  ) async {
    final map = PatchMapController();
    final history = <PatchMapEditHistoryState>[];
    await tester.pumpWidget(_host(map, onHistory: history.add));
    await _draw(tester, map);
    final initialLinks = map.getValue(link)!['links'];
    map.select(['link'], recordHistory: true);

    expect(map.beginRelationEdit('link').outcome, PatchMapOutcome.applied);
    expect((await map.undo()).result.outcome, PatchMapOutcome.unchanged);
    expect((await map.redo()).result.outcome, PatchMapOutcome.unchanged);
    expect(
      map.select(['a'], recordHistory: true).failures.single.code,
      'EDIT_BUSY',
    );
    expect(map.select(['a']).outcome, PatchMapOutcome.applied);
    await _submit(tester, map.updateRelation('link', links: firstLinks));
    await _submit(tester, map.updateRelation('link', links: secondLinks));
    await _submit(tester, map.updateRelation('link', links: []));
    expect(history.last.undoDepth, 3);
    expect(map.getValue(link)!['links'], isEmpty);

    await _submit(tester, map.undo());
    expect(map.getValue(link)!['links'], secondLinks);
    await _submit(tester, map.undo());
    expect(map.getValue(link)!['links'], firstLinks);
    await _submit(tester, map.redo());
    expect(map.getValue(link)!['links'], secondLinks);
    expect(history.last.redoDepth, 1);

    expect(
      (await map.finishRelationEdit('link')).outcome,
      PatchMapOutcome.applied,
    );
    await tester.pump();
    expect(history.last.undoDepth, 2);
    expect(history.last.redoDepth, 0);
    expect(_selected(map), ['link']);
    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(map.getValue(link)!['links'], initialLinks);
    expect(_selected(map), ['link']);
    expect((await map.undo()).result.outcome, PatchMapOutcome.applied);
    expect(_selected(map), isEmpty);
    await map.redo();
    await _submit(tester, map.redo());
    expect(map.getValue(link)!['links'], secondLinks);
    expect(tester.takeException(), isNull);
  });

  testWidgets('net-zero edits preserve both branches and relation identity', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map, limit: 2));
    await _draw(tester, map);
    await _submit(tester, map.updateRelation('link', links: firstLinks));
    await _submit(tester, map.updateRelation('link', links: secondLinks));
    await _submit(tester, map.undo());
    final global = map.editHistoryState;
    expect(global.undoDepth, 1);
    expect(global.redoDepth, 1);

    map.beginRelationEdit('link');
    await _submit(tester, map.updateRelation('link', links: []));
    await _submit(tester, map.updateRelation('link', links: secondLinks));
    await _submit(tester, map.updateRelation('link', links: firstLinks));
    expect(map.editHistoryState.undoDepth, 2);
    expect(
      (await map.finishRelationEdit('link')).outcome,
      PatchMapOutcome.unchanged,
    );
    expect(map.editHistoryState, global);
    expect(
      (await _submit(tester, map.redo())).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(map.getValue(link)!['links'], secondLinks);
    await _submit(tester, map.undo());
    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(map.getValue(link)!['links'], _scene.last['links']);
  });

  testWidgets('commits empty relation deletion with all original links', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map, limit: 2));
    final originalLinks = [
      {'source': 'a', 'target': 'b'},
      {'source': 'b', 'target': 'c'},
    ];
    await _submit(
      tester,
      map.draw([
        ..._scene.take(3),
        {
          'type': 'group',
          'id': 'group',
          'children': [
            _rect('sibling', 0, 0),
            {..._scene.last, 'links': originalLinks},
          ],
        },
      ]),
    );
    map.select(['link']);
    map.beginRelationEdit('link');
    await _submit(tester, map.updateRelation('link', links: firstLinks));
    await _submit(tester, map.updateRelation('link', links: secondLinks));
    await _submit(tester, map.updateRelation('link', links: []));
    expect(map.editHistoryState.undoDepth, 2);
    await _submit(
      tester,
      map.updateValues([
        const PatchMapUpdate(link, {'locked': true, 'label': 'live'}),
      ]),
    );
    expect(
      (await map.finishRelationEdit(
        'link',
        removeIfEmpty: true,
      )).failures.single.code,
      'LOCKED_TARGET',
    );
    expect(map.editHistoryState.undoDepth, 2);
    expect(map.getValue(link)!['links'], isEmpty);
    await _submit(
      tester,
      map.updateValues([
        const PatchMapUpdate(link, {'locked': false}),
      ]),
    );
    final completion = map.finishRelationEdit('link', removeIfEmpty: true);
    expect(map.editHistoryState.isBusy, isTrue);
    expect(
      (await _submit(tester, completion)).outcome,
      PatchMapOutcome.applied,
    );
    expect(map.getValue(link), isNull);
    expect(map.editHistoryState.undoDepth, 1);
    expect(_selected(map), isEmpty);

    for (var repeat = 0; repeat < 2; repeat++) {
      expect(
        (await _submit(tester, map.undo())).result.outcome,
        PatchMapOutcome.applied,
      );
      expect(map.getValue(link)!['links'], originalLinks);
      expect(map.getValue(link)!['label'], 'live');
      final children =
          map.getValue(const PatchMapTarget('group'))!['children'] as List;
      expect(children.map((child) => (child as Map)['id']), [
        'sibling',
        'link',
      ]);
      expect(_selected(map), ['link']);
      expect(
        (await _submit(tester, map.redo())).result.outcome,
        PatchMapOutcome.applied,
      );
      expect(map.getValue(link), isNull);
      expect(_selected(map), isEmpty);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('relation scope survives suspension and clears on replacement', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map, limit: 0));
    await _draw(tester, map);
    expect(
      map.beginRelationEdit('link').failures.single.code,
      'HISTORY_DISABLED',
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);

    expect(map.beginRelationEdit('link').outcome, PatchMapOutcome.applied);
    expect(map.beginRelationEdit('link').failures.single.code, 'EDIT_BUSY');
    expect(
      (await map.removeRelation('link')).failures.single.code,
      'EDIT_BUSY',
    );
    expect(
      (await map.updateRelation(
        'link',
        metadata: {'parent': 'p'},
      )).failures.single.code,
      'EDIT_BUSY',
    );
    await _submit(tester, map.updateRelation('link', links: firstLinks));
    await tester.pumpWidget(_host(map, active: false));
    expect(map.editHistoryState.canUndo, isFalse);
    await tester.pumpWidget(_host(map));
    expect(map.editHistoryState.canUndo, isTrue);
    expect((await map.draw('invalid')).outcome, PatchMapOutcome.rejected);
    expect(map.editHistoryState.canUndo, isTrue);

    await _draw(tester, map);
    expect(map.editHistoryState.undoDepth, 0);
    expect(
      (await map.finishRelationEdit('link')).failures.single.code,
      'INVALID_TARGET',
    );
    expect(map.beginRelationEdit('link').outcome, PatchMapOutcome.applied);
  });

  testWidgets(
    'finishing an empty relation merges deletion with the last unlink',
    (tester) async {
      final map = PatchMapController();
      await tester.pumpWidget(_host(map));
      await _draw(tester, map);
      const target = PatchMapTarget('link');
      final oldLinks = map.getValue(target)!['links'];
      final emptied = await _submit(
        tester,
        map.updateRelation('link', links: []),
      );
      expect(emptied.outcome, PatchMapOutcome.applied);
      expect(map.getValue(target)!['links'], isEmpty);
      expect(map.getSelectableRelationsFor('a'), isEmpty);
      expect(
        (await _submit(
          tester,
          map.updateValues([
            const PatchMapUpdate(target, {'label': 'latest label'}),
          ]),
        )).outcome,
        PatchMapOutcome.applied,
      );

      map.select(['link']);
      final deleted = await _submit(
        tester,
        map.removeRelation('link', mergeEmptyLinkEdit: true),
      );
      expect(deleted.outcome, PatchMapOutcome.applied);
      expect(map.getValue(target), isNull);
      expect(map.editHistoryState.undoDepth, 1);
      expect(
        (await _submit(tester, map.undo())).result.outcome,
        PatchMapOutcome.applied,
      );
      expect(map.getValue(target)!['links'], oldLinks);
      expect(map.getValue(target)!['label'], 'latest label');
      expect(_selected(map), ['link']);
      expect(map.getSelectableRelationsFor('a').single.id, 'link');
      expect(
        (await _submit(tester, map.redo())).result.outcome,
        PatchMapOutcome.applied,
      );
      expect(map.getValue(target), isNull);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('edits and removes nested relations in the document history', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    final camera = map.camera;
    final addition = await _submit(
      tester,
      map.addObjects([
        {
          'type': 'group',
          'id': 'wiring',
          'children': [
            _rect('sibling', 20, 30),
            {
              ..._relation('string', 'a', 'b'),
              'attrs': {
                'display': 'string',
                'metadata': {'parent': 'inverter-a', 'color': 'blue'},
              },
            },
            _rect('last-sibling', 25, 30),
          ],
        },
      ], selectAdded: false),
    );
    expect(addition.outcome, PatchMapOutcome.applied);
    const string = PatchMapTarget('string');
    const group = PatchMapTarget('wiring');
    List<Object?> children() => [
      for (final child in map.getValue(group)!['children'] as List)
        (child as Map)['id'],
    ];
    Map stringMetadata() =>
        (map.getValue(string)!['attrs'] as Map)['metadata'] as Map;

    map.select(['string', 'b']);
    final prior = map.updateValues([
      const PatchMapUpdate(string, {'label': 'retained label'}),
      const PatchMapUpdate(group, {'label': 'retained group'}),
    ]);
    final changed = map.updateRelation(
      'string',
      links: [
        {'source': 'a', 'target': 'c'},
      ],
      metadata: {'parent': 'inverter-b'},
    );
    expect(
      (await map.updateValues([
        const PatchMapUpdate(string, {'label': 'concurrent'}),
      ])).failures.single.code,
      'EDIT_BUSY',
    );
    expect((await _submit(tester, prior)).outcome, PatchMapOutcome.applied);
    expect((await _submit(tester, changed)).outcome, PatchMapOutcome.applied);
    expect(stringMetadata(), {'parent': 'inverter-b', 'color': 'blue'});
    expect(map.getValue(string)!['label'], 'retained label');
    expect(map.getSelectableRelationsFor('c').single.id, 'string');
    expect(map.getSelectableRelationsFor('b').single.id, 'link');
    expect(_selected(map), ['string', 'b']);
    expect(map.editHistoryState.undoDepth, 2);

    expect(
      (await _submit(tester, map.removeRelation('string'))).outcome,
      PatchMapOutcome.applied,
    );
    expect(map.getValue(string), isNull);
    expect(map.getValue(group)!['label'], 'retained group');
    expect(children(), ['sibling', 'last-sibling']);
    expect(map.getGeometry('last-sibling')!.origin, const Offset(25, 30));
    expect(map.getSelectableRelationsFor('c'), isEmpty);
    expect(_selected(map), ['b']);
    expect(map.camera, camera);

    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(children(), ['sibling', 'string', 'last-sibling']);
    expect(map.getValue(string)!['label'], 'retained label');
    expect(_selected(map), ['string', 'b']);
    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(stringMetadata()['parent'], 'inverter-a');
    expect(map.getSelectableRelationsFor('c'), isEmpty);
    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(map.rootIds, [..._ids, 'link']);

    for (var i = 0; i < 3; i++) {
      expect(
        (await _submit(tester, map.redo())).result.outcome,
        PatchMapOutcome.applied,
      );
    }
    expect(children(), ['sibling', 'last-sibling']);
    expect(_selected(map), ['b']);
    expect(tester.takeException(), isNull);
  });

  testWidgets('rejects invalid or locked relation edits and stale replay', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    const target = PatchMapTarget('link');
    expect(
      (await map.updateRelation('link')).outcome,
      PatchMapOutcome.unchanged,
    );
    expect(
      (await map.updateRelation(
        'link',
        links: [
          {'target': 'b'},
        ],
      )).outcome,
      PatchMapOutcome.rejected,
    );
    expect((await map.removeRelation('a')).outcome, PatchMapOutcome.rejected);
    expect(map.editHistoryState.undoDepth, 0);

    expect(
      (await _submit(
        tester,
        map.updateRelation('link', metadata: {'parent': 'inverter'}),
      )).outcome,
      PatchMapOutcome.applied,
    );
    await _submit(
      tester,
      map.updateValues([
        const PatchMapUpdate(target, {'locked': true}),
      ]),
    );
    expect(
      (await map.removeRelation('link')).failures.single.code,
      'LOCKED_TARGET',
    );
    expect(
      (await _submit(tester, map.undo())).result.failures.single.code,
      'EDIT_CONFLICT',
    );
    expect(map.editHistoryState.undoDepth, 1);
    expect(map.getValue(target), isNotNull);
    await _submit(
      tester,
      map.updateValues([
        const PatchMapUpdate(target, {'locked': false}),
      ]),
    );
    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
  });

  testWidgets('allows link edits on a relation with legacy scalar metadata', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    expect(
      (await _submit(
        tester,
        map.draw([
          ..._scene,
          {
            ..._relation('legacy', 'a', 'b'),
            'attrs': {'metadata': 'legacy'},
          },
        ]),
      )).outcome,
      PatchMapOutcome.applied,
    );
    expect(
      (await map.updateRelation(
        'legacy',
        metadata: {'parent': 'inverter'},
      )).failures.single.code,
      'INVALID_DATA',
    );
    expect(
      (await _submit(
        tester,
        map.updateRelation(
          'legacy',
          links: [
            {'source': 'a', 'target': 'c'},
          ],
        ),
      )).outcome,
      PatchMapOutcome.applied,
    );
    expect(map.getSelectableRelationsFor('c').single.id, 'legacy');
    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(map.getSelectableRelationsFor('c'), isEmpty);
    expect(
      (map.getValue(const PatchMapTarget('legacy'))!['attrs']
          as Map)['metadata'],
      'legacy',
    );
  });

  testWidgets('queries exact related endpoints and records opt-in selection', (
    tester,
  ) async {
    final map = PatchMapController();
    final notifiedDepths = <int>[];
    await tester.pumpWidget(
      _host(
        map,
        onEvent: (event) {
          if (event.kind == PatchMapInputKind.selectionChange) {
            notifiedDepths.add(map.editHistoryState.undoDepth);
          }
        },
      ),
    );
    expect(map.getSelectableRelationsFor('a'), isEmpty);
    expect(
      (await _submit(
        tester,
        map.draw([
          _rect('b', 45, 0),
          _rect('c', 135, 0),
          {
            'type': 'group',
            'id': 'parent',
            'children': [
              _rect('a', 0, 0),
              _relation('string', {'id': 'a'}, 'b'),
              {..._relation('hidden', 'a', 'b'), 'show': false},
              {..._relation('locked', 'a', 'b'), 'locked': true},
            ],
          },
          _relation('group-link', 'parent', 'c'),
        ]),
      )).outcome,
      PatchMapOutcome.applied,
    );
    final connected = map.getSelectableRelationsFor('a');
    expect(connected.map((relation) => relation.id), ['string']);
    expect(map.getSelectableRelationsFor('b').single.id, 'string');
    expect(map.getSelectableRelationsFor('parent').single.id, 'group-link');
    expect(map.getSelectableRelationsFor('missing'), isEmpty);

    map.select(['c']);
    expect(map.editHistoryState.undoDepth, 0);
    expect(
      map.select([connected.single.id], recordHistory: true).outcome,
      PatchMapOutcome.applied,
    );
    map.select([connected.single.id], recordHistory: true);
    expect(_selected(map), ['string']);
    expect(map.editHistoryState.undoDepth, 1);
    await tester.pump();
    expect(notifiedDepths, [0, 1]);

    expect((await map.undo()).result.outcome, PatchMapOutcome.applied);
    expect(_selected(map), ['c']);
    expect((await map.redo()).result.outcome, PatchMapOutcome.applied);
    expect(_selected(map), ['string']);
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('adds roots together without replacing the live diagram', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    map.setCamera(center: const Offset(35, 72), scale: 1.7, rotation: .3);
    map.select(['a']);
    final camera = map.camera;
    final prior = map.updateValues([
      const PatchMapUpdate(_b, {'label': 'live'}),
    ]);
    final draft = [
      _rect('new', 90, 55),
      {
        'type': 'relations',
        'id': 'string',
        'links': [
          {'source': 'b', 'target': 'new'},
        ],
      },
    ];
    final addition = map.addObjects(draft);
    draft.first['id'] = 'not-published';
    expect(map.rootIds, [..._ids, 'link']);
    expect(map.editHistoryState.isBusy, isTrue);
    expect((await _submit(tester, prior)).outcome, PatchMapOutcome.applied);
    expect((await _submit(tester, addition)).outcome, PatchMapOutcome.applied);
    expect(map.rootIds, [..._ids, 'link', 'new', 'string']);
    expect(_selected(map), ['new', 'string']);
    expect(map.editHistoryState.undoDepth, 1);
    expect(map.camera, camera);
    expect(map.getGeometry('string')!.bounds, isNotNull);
    expect(map.getSelectableRelationsFor('new').single.id, 'string');

    final undo = map.undo();
    final removedWrite = await map.updateValues([
      const PatchMapUpdate(PatchMapTarget('new'), {'label': 'stale'}),
    ]);
    expect(removedWrite.failures.single.code, 'EDIT_BUSY');
    expect(
      (await _submit(tester, undo)).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(map.rootIds, [..._ids, 'link']);
    expect(map.getGeometry('new'), isNull);
    expect(map.getValue(const PatchMapTarget('string')), isNull);
    expect(map.getSelectableRelationsFor('new'), isEmpty);
    expect(_selected(map), ['a']);

    final invalid = await map.addObjects([
      _rect('other', 0, 0),
      _rect('b', 0, 0),
    ]);
    expect(invalid.failures.single.code, 'DUPLICATE_ID');
    expect(map.getGeometry('other'), isNull);
    expect(map.editHistoryState.redoDepth, 1);
    final redone = await _submit(tester, map.redo());
    expect(redone.result.outcome, PatchMapOutcome.applied);
    expect(redone.positions, isEmpty);
    expect(map.getGeometry('new')!.origin, const Offset(90, 55));
    expect(map.getValue(_b)!['label'], 'live');
    expect(map.getSelectableRelationsFor('new').single.id, 'string');
    expect(_selected(map), ['new', 'string']);
    expect(map.camera, camera);
    expect(tester.takeException(), isNull);
  });

  testWidgets('can add roots to an empty diagram without recording history', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map, limit: 0));
    expect(
      (await _submit(tester, map.draw([]))).outcome,
      PatchMapOutcome.applied,
    );
    final added = await _submit(
      tester,
      map.addObjects([_rect('a', 10, 20)], selectAdded: false),
    );
    expect(added.outcome, PatchMapOutcome.applied);
    expect(map.getGeometry('a')!.origin, const Offset(10, 20));
    expect(_selected(map), isEmpty);
    expect((await map.undo()).result.outcome, PatchMapOutcome.unchanged);
  });

  testWidgets('records completed point, range and clear selections', (
    tester,
  ) async {
    final map = PatchMapController();
    final history = <PatchMapEditHistoryState>[];
    await tester.pumpWidget(_host(map, onHistory: history.add));
    await _draw(tester, map);
    final original = _bounds(map), camera = map.camera;
    map.select(['c']);
    map.clearSelection();
    expect(map.editHistoryState.undoDepth, 0);

    await _selectByHold(tester, map, 'a');
    expect(_selected(map), ['a']);
    expect(history.last.undoDepth, 1);
    final range = await _hold(tester, map, const Offset(30, 25));
    final view = tester.getTopLeft(find.byType(PatchMapView));
    await range.moveTo(view + map.toLocal(const Offset(165, 105))!);
    await tester.pump();
    expect(_selected(map), ['a']);
    expect(map.editHistoryState.undoDepth, 1);
    await range.up();
    await tester.pump();
    expect(_selected(map), unorderedEquals(['b', 'c']));
    expect(history.last.undoDepth, 2);

    final blank = view + map.toLocal(const Offset(-55, -45))!;
    await tester.tapAt(blank);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.tapAt(blank);
    await tester.pump();
    expect(_selected(map), isEmpty);
    expect(history.last.undoDepth, 3);

    final undo = await map.undo();
    expect(undo.result.outcome, PatchMapOutcome.applied);
    expect(undo.positions, isEmpty);
    expect(_selected(map), unorderedEquals(['b', 'c']));
    expect((await map.undo()).result.outcome, PatchMapOutcome.applied);
    expect(_selected(map), ['a']);
    expect((await map.redo()).result.outcome, PatchMapOutcome.applied);
    expect(_selected(map), unorderedEquals(['b', 'c']));
    expect(map.editHistoryState.redoDepth, 1);

    await _selectByHold(tester, map, 'a');
    expect(map.editHistoryState.redoDepth, 0);
    expect(map.editHistoryState.undoDepth, 3);
    await _selectByHold(tester, map, 'a');
    expect(map.editHistoryState.undoDepth, 3);
    expect(_bounds(map), original);
    expect(map.camera, camera);
  });

  testWidgets('cancelled point selection preserves the redo branch', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    await _selectByHold(tester, map, 'a');
    await _selectByHold(tester, map, 'b');
    await map.undo();
    await tester.pump();

    final finger = await _hold(tester, map, map.getGeometry('c')!.center!);
    expect(_selected(map), ['c']);
    expect((await map.redo()).result.failures.single.code, 'EDIT_BUSY');
    await finger.cancel();
    await tester.pump();
    expect(_selected(map), ['a']);
    expect(map.editHistoryState.undoDepth, 1);
    expect(map.editHistoryState.redoDepth, 1);
    await map.redo();
    expect(_selected(map), ['b']);
  });

  testWidgets('holding an unselected object then moving it records two steps', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    map.select(['a']);
    final original = _bounds(map);
    final finger = await _hold(tester, map, map.getGeometry('b')!.center!);
    expect(_selected(map), ['b']);
    expect(map.editHistoryState.undoDepth, 0);
    await finger.moveBy(const Offset(20, 24));
    await finger.up();
    await progress(tester);
    final moved = _bounds(map);
    expect(moved['b']!.topLeft, original['b']!.topLeft + const Offset(20, 24));
    expect(map.editHistoryState.undoDepth, 2);

    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(_bounds(map), original);
    expect(_selected(map), ['b']);
    await map.undo();
    expect(_selected(map), ['a']);
    await map.redo();
    expect(_selected(map), ['b']);
    expect(_bounds(map), original);
    await _submit(tester, map.redo());
    expect(_bounds(map), moved);
  });

  testWidgets('undoes and redoes drag, alignment and spacing in order', (
    tester,
  ) async {
    final map = PatchMapController();
    final history = <PatchMapEditHistoryState>[];
    final undoDepthAtSelection = <int>[];
    await tester.pumpWidget(
      _host(
        map,
        onHistory: history.add,
        onEvent: (event) {
          if (event.kind == PatchMapInputKind.selectionChange) {
            undoDepthAtSelection.add(map.editHistoryState.undoDepth);
          }
        },
      ),
    );
    await _draw(tester, map);
    final initial = _bounds(map), camera = map.camera;
    map.select(_ids);
    final view = tester.getTopLeft(find.byType(PatchMapView));
    final start = map.toLocal(map.getGeometry('a')!.center!)!;
    final finger = await tester.startGesture(view + start);
    await tester.pump(const Duration(milliseconds: 310));
    await finger.moveBy(const Offset(24, 18));
    await tester.pump();
    expect(map.editHistoryState.undoDepth, 0);
    expect(_bounds(map), initial);
    await finger.up();
    await progress(tester);
    expect(map.editHistoryState.undoDepth, 1);
    final dragged = _bounds(map);

    await _align(tester, map, PatchMapAlignment.top);
    final aligned = _bounds(map);
    await _align(tester, map, PatchMapAlignment.distributeHorizontally);
    final spaced = _bounds(map);
    expect(map.editHistoryState.undoDepth, 3);
    map.clearSelection();
    undoDepthAtSelection.clear();

    final undo = map.undo();
    expect(map.editHistoryState.isBusy, isTrue);
    expect(map.editHistoryState.canUndo, isFalse);
    expect((await map.undo()).result.failures.single.code, 'EDIT_BUSY');
    final undone = await _submit(tester, undo);
    expect(undone.result.outcome, PatchMapOutcome.applied);
    expect(_bounds(map), aligned);
    expect(undone.positions.keys, ['b']);
    expect(map.selected.map((item) => item.id), _ids);
    expect(undoDepthAtSelection, [2]);

    for (final expected in [dragged, initial]) {
      expect(
        (await _submit(tester, map.undo())).result.outcome,
        PatchMapOutcome.applied,
      );
      expect(_bounds(map), expected);
    }
    expect(map.editHistoryState.canUndo, isFalse);
    expect((await map.undo()).result.outcome, PatchMapOutcome.unchanged);
    for (final expected in [dragged, aligned, spaced]) {
      expect(
        (await _submit(tester, map.redo())).result.outcome,
        PatchMapOutcome.applied,
      );
      expect(_bounds(map), expected);
    }
    expect(history.last, map.editHistoryState);
    expect(map.editHistoryState.canUndo, isTrue);
    expect(map.editHistoryState.canRedo, isFalse);
    expect(map.camera, camera);
  });

  testWidgets(
    'branches only on a changed successful edit and evicts the oldest',
    (tester) async {
      final map = PatchMapController();
      await tester.pumpWidget(_host(map, limit: 2));
      await _draw(tester, map);
      map.select(_ids);
      await _align(tester, map, PatchMapAlignment.left);
      final earliest = _bounds(map);
      await _align(tester, map, PatchMapAlignment.top);
      await _align(tester, map, PatchMapAlignment.distributeHorizontally);
      expect(map.editHistoryState.undoDepth, 2);
      await _submit(tester, map.undo());
      await _submit(tester, map.undo());
      expect(_bounds(map), earliest);
      expect(map.editHistoryState.redoDepth, 2);

      expect(
        (await map.alignSelection(PatchMapAlignment.left)).result.outcome,
        PatchMapOutcome.unchanged,
      );
      map.select(['a']);
      expect(
        (await map.alignSelection(PatchMapAlignment.top)).result.outcome,
        PatchMapOutcome.rejected,
      );
      expect(map.editHistoryState.redoDepth, 2);
      map.select(_ids);
      await _align(tester, map, PatchMapAlignment.bottom);
      expect(map.editHistoryState.undoDepth, 1);
      expect(map.editHistoryState.redoDepth, 0);
    },
  );

  testWidgets(
    'preserves independent updates and rejects a queued stale replay',
    (tester) async {
      final map = PatchMapController();
      await tester.pumpWidget(_host(map));
      await _draw(tester, map);
      map.select(['a', 'b']);
      await _align(tester, map, PatchMapAlignment.left);

      expect(
        (await _submit(
          tester,
          map.updateValues(const [
            PatchMapUpdate(_b, {
              'label': 'fresh',
              'attrs': {'y': 95},
            }),
          ]),
        )).outcome,
        PatchMapOutcome.applied,
      );
      expect(map.editHistoryState.canUndo, isTrue);
      final undo = await _submit(tester, map.undo());
      expect(undo.positions['b'], const Offset(45, 95));
      expect(map.getValue(_b)!['label'], 'fresh');
      expect(map.editHistoryState.canRedo, isTrue);

      final overwrite = map.updateValues(const [
        PatchMapUpdate(_b, {
          'attrs': {'x': 70},
        }),
      ]);
      final redo = map.redo();
      await progress(tester);
      expect((await overwrite).outcome, PatchMapOutcome.applied);
      expect((await redo).result.failures.single.code, 'MOVE_CONFLICT');
      expect(map.getGeometry('b')!.origin, const Offset(70, 95));
      expect(map.editHistoryState.undoDepth, 0);
      expect(map.editHistoryState.redoDepth, 0);
    },
  );

  testWidgets('locked targets reject replay without advancing the cursor', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    map.select(_ids);
    await _align(tester, map, PatchMapAlignment.left);
    final aligned = _bounds(map);
    final lock = map.updateValues(const [
      PatchMapUpdate(_b, {'locked': true}),
    ]);
    final undo = map.undo();
    await progress(tester);
    expect((await lock).outcome, PatchMapOutcome.applied);
    expect((await undo).result.failures.single.code, 'MOVE_CONFLICT');
    expect(_bounds(map), aligned);
    expect(map.editHistoryState.undoDepth, 1);
    await _submit(
      tester,
      map.updateValues(const [
        PatchMapUpdate(_b, {'locked': false}),
      ]),
    );
    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
  });

  testWidgets('retains history while inactive and on rejected replacements', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    map.select(_ids);
    await _align(tester, map, PatchMapAlignment.left);
    expect(
      (await map.draw([
        {'type': 'bad'},
      ])).outcome,
      PatchMapOutcome.rejected,
    );
    expect(map.editHistoryState.canUndo, isTrue);
    await tester.pumpWidget(_host(map, active: false));
    expect(map.editHistoryState.undoDepth, 1);
    expect(map.editHistoryState.canUndo, isFalse);
    expect((await map.undo()).result.failures.single.code, 'NOT_READY');
    await tester.pumpWidget(_host(map));
    expect(map.editHistoryState.canUndo, isTrue);

    final undo = map.undo();
    final replacement = map.draw(_scene);
    await progress(tester);
    expect((await undo).result.interruption, PatchMapInterruption.replaced);
    expect((await replacement).outcome, PatchMapOutcome.applied);
    expect(map.editHistoryState.undoDepth, 0);
    expect(map.editHistoryState.redoDepth, 0);
    map.select(_ids);
    await _align(tester, map, PatchMapAlignment.top);
    await tester.pumpWidget(const SizedBox());
    expect(map.editHistoryState.undoDepth, 0);
    expect((await map.undo()).result.failures.single.code, 'DETACHED');
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    expect((await map.undo()).result.outcome, PatchMapOutcome.unchanged);
  });

  testWidgets('zero limit still applies edits without retaining history', (
    tester,
  ) async {
    final map = PatchMapController();
    final history = <PatchMapEditHistoryState>[];
    await tester.pumpWidget(_host(map, limit: 0, onHistory: history.add));
    await _draw(tester, map);
    map.select(_ids);
    await _align(tester, map, PatchMapAlignment.top);
    expect(history, isEmpty);
    expect(map.editHistoryState.undoDepth, 0);
    expect((await map.undo()).result.outcome, PatchMapOutcome.unchanged);
  });
}
