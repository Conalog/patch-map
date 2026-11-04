import 'dart:ui';

import 'package:conalog_patch_map/src/api/events.dart';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/item_data.dart';
import 'package:conalog_patch_map/src/interaction/input_query.dart';
import 'package:conalog_patch_map/src/interaction/selection_state.dart';
import 'package:flutter_test/flutter_test.dart';

Size _measure(Map<String, Object?> data, Size? content) => const Size(12, 8);

Map<String, Object?> _text(GeometrySnapshot scene) {
  final layout = scene['i']!.item!;
  return layout.components[layout.indices['text']!].data;
}

Object? _projectedText(PatchMapObject object) =>
    (object.effectiveData['components']! as List)
        .cast<Map<String, Object?>>()
        .singleWhere((value) => value['id'] == 'text')['text'];

void main() {
  test(
    'query and repeated selection export current JSON without layout retention',
    () {
      var scene = GeometrySnapshot.compile(
        const DatasetReader().read([
          {
            'type': 'item',
            'id': 'i',
            'size': 40,
            'components': [
              {'type': 'background', 'id': 'background', 'source': {}},
              {'type': 'text', 'id': 'text', 'text': 'old'},
            ],
          },
        ]),
        _measure,
      );
      final query = InputQuery(
        ports: InputQueryPorts(getSpatialCandidates: (_, _) => [0]),
      );
      final notifications = <PatchMapInputEvent>[];
      final selection = SelectionState(
        currentGeometry: () => scene,
        query: query,
        notify: notifications.add,
      );
      addTearDown(selection.dispose);
      final authored = scene['i']!.data;
      final old = selection.set(['i']).selected.single;
      expect(old.effectiveData, same(authored));
      expect(_projectedText(old), 'old');
      for (final value in ['first', 'second', 'third']) {
        scene = scene.prepare({
          const PatchMapTarget('i', componentId: 'text'): Map.unmodifiable({
            ..._text(scene),
            'text': value,
          }),
        }, _measure).snapshot;
        final data = scene['i']!.data;
        final layout = scene['i']!.item!;
        expect(data, isA<ItemDataView>());
        expect(ItemDataView(data, layout), same(data));
        final hit = query.point(scene, const Offset(5, 5), 0)!;
        expect(hit.authoredData, same(authored));
        expect(hit.effectiveData, same(data));
        expect(_projectedText(hit), value);
        // Query export materialized JSON and dropped the retained layout.
        expect(ItemDataView(data, layout), isNot(same(data)));
        for (var i = 0; i < 3; i++) {
          final selected = selection.selected.single;
          expect(selected.effectiveData, same(data));
          expect(_projectedText(selected), value);
          expect(
            selection.set(['i']).selected.single.effectiveData,
            same(data),
          );
        }
        expect(() => hit.effectiveData['show'] = false, throwsUnsupportedError);
        expect(
          () => (hit.effectiveData['components']! as List).clear(),
          throwsUnsupportedError,
        );
      }
      expect(_projectedText(old), 'old');
      expect(_projectedText(notifications.single.objects.single), 'old');
      expect(_projectedText(selection.selected.single), 'third');
    },
  );
}
