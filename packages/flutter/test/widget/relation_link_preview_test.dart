import 'dart:ui' as ui;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/rendering.dart' show RenderRepaintBoundary;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

const _relation = PatchMapTarget('relation');
const _horizontal = [
  {'source': 'a', 'target': 'b'},
];
const _diagonal = [
  {'source': 'a', 'target': 'c'},
];

Map<String, Object?> _rect(
  String id,
  int x,
  int y, {
  int size = 10,
  String fill = '#0000ff',
}) => {
  'type': 'rect',
  'id': id,
  'size': {'width': size, 'height': size},
  'attrs': {'x': x, 'y': y},
  'fill': fill,
};

Future<void> _draw(
  WidgetTester tester,
  PatchMapController map,
  List<Map<String, Object?>> links, {
  bool? showSelfLinks,
}) async {
  final result = map.draw([
    _rect('a', 0, 0),
    _rect('b', 100, 0),
    _rect('c', 100, 100),
    {
      'type': 'relations',
      'id': _relation.id,
      'links': links,
      'style': {
        'color': '#ff0000',
        'width': 8,
        'showSelfLinks': ?showSelfLinks,
      },
    },
    _rect('cover', 45, 45, size: 20, fill: '#00ff00'),
  ]);
  await support.progress(tester);
  expect((await result).outcome, PatchMapOutcome.applied);
  map.setCamera(center: const Offset(50, 50), scale: 1);
  await tester.pump();
}

Future<List<int>> _pixel(
  WidgetTester tester,
  PatchMapController map,
  Offset world,
) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find
        .descendant(
          of: find.byType(PatchMapView),
          matching: find.byType(RepaintBoundary),
        )
        .first,
  );
  final point = map.toLocal(world)!;
  return (await tester.runAsync(() async {
    final image = await boundary.toImage();
    try {
      final bytes = (await image.toByteData(
        format: ui.ImageByteFormat.rawStraightRgba,
      ))!;
      final offset = (point.dy.floor() * image.width + point.dx.floor()) * 4;
      return [
        for (var channel = 0; channel < 4; channel++)
          bytes.getUint8(offset + channel),
      ];
    } finally {
      image.dispose();
    }
  }))!;
}

void main() {
  const oldLine = Offset(55, 5), newLine = Offset(25, 25);
  const red = [255, 0, 0, 255], green = [0, 255, 0, 255];

  testWidgets(
    'hidden self-links keep endpoint membership and stay hidden in previews',
    (tester) async {
      const self = [
        {'source': 'a', 'target': 'a'},
      ];
      const loopPoint = Offset(30, 5);
      final map = PatchMapController();
      await tester.pumpWidget(support.host(map));
      await _draw(tester, map, self, showSelfLinks: false);

      expect(map.getValue(_relation)!['links'], self);
      expect(map.getSelectableRelationsFor('a').single.id, _relation.id);
      expect(
        map.getGeometry(_relation.id)!.bounds,
        map.getGeometry('a')!.bounds,
      );
      expect(map.getGeometry(_relation.id)!.paintBounds, isNull);
      expect((await _pixel(tester, map, loopPoint)).last, 0);

      map.previewRelationLinks(_relation.id, _horizontal);
      await tester.pump();
      expect(await _pixel(tester, map, oldLine), red);
      expect(map.getValue(_relation)!['links'], self);
      map.clearRelationLinkPreview();
      await tester.pump();
      expect((await _pixel(tester, map, oldLine)).last, 0);

      final update = map.updateValues(const [
        PatchMapUpdate(_relation, {
          'style': {'showSelfLinks': true},
        }),
      ]);
      await support.progress(tester);
      expect((await update).outcome, PatchMapOutcome.applied);
      expect(await _pixel(tester, map, loopPoint), red);

      await _draw(tester, map, _horizontal, showSelfLinks: false);
      expect(await _pixel(tester, map, oldLine), red);
      map.previewRelationLinks(_relation.id, self);
      await tester.pump();
      expect((await _pixel(tester, map, oldLine)).last, 0);
      expect((await _pixel(tester, map, loopPoint)).last, 0);
      expect(map.getValue(_relation)!['links'], _horizontal);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('previews replace committed pixels in relation paint order', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(support.host(map));
    await _draw(tester, map, _horizontal);
    final value = map.getValue(_relation);
    final geometry = map.getGeometry(_relation.id)?.paintBounds;
    expect(await _pixel(tester, map, oldLine), red);
    expect((await _pixel(tester, map, newLine)).last, 0);

    expect(
      map.previewRelationLinks(_relation.id, _diagonal).outcome,
      PatchMapOutcome.applied,
    );
    await tester.pump();
    expect(await _pixel(tester, map, newLine), red);
    expect(await _pixel(tester, map, const Offset(55, 55)), green);
    expect((await _pixel(tester, map, oldLine)).last, 0);
    expect(map.getValue(_relation), same(value));
    expect(map.getGeometry(_relation.id)?.paintBounds, geometry);
    expect(map.getSelectableRelationsFor('c'), isEmpty);
    expect(map.editHistoryState.undoDepth, 0);

    map.previewRelationLinks(_relation.id, const []);
    await tester.pump();
    expect((await _pixel(tester, map, newLine)).last, 0);
    expect((await _pixel(tester, map, oldLine)).last, 0);
    map.clearRelationLinkPreview();
    await tester.pump();
    expect(await _pixel(tester, map, oldLine), red);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'empty relation previews participate in culling and clear on suspension',
    (tester) async {
      final map = PatchMapController();
      await tester.pumpWidget(support.host(map));
      await _draw(tester, map, const []);
      expect((await _pixel(tester, map, newLine)).last, 0);
      map.previewRelationLinks(_relation.id, _diagonal);
      await tester.pump();
      expect(await _pixel(tester, map, newLine), red);
      await tester.pumpWidget(support.host(map, active: false));
      await tester.pumpWidget(support.host(map));
      await tester.pump();
      expect((await _pixel(tester, map, newLine)).last, 0);

      map.previewRelationLinks(_relation.id, _diagonal);
      await tester.pump();
      await _draw(tester, map, const []);
      expect((await _pixel(tester, map, newLine)).last, 0);
      expect(tester.takeException(), isNull);
    },
  );
}
