import 'dart:collection';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/record_delta.dart';
import 'package:conalog_patch_map/src/rendering/render_publication.dart';
import 'package:flutter_test/flutter_test.dart';
import 'backend_resources_test.dart' as support;

class CountedList<T> extends ListBase<T> {
  CountedList(this.values);
  final List<T> values;
  int reads = 0;
  @override
  int get length => values.length;
  @override
  set length(int value) => throw UnsupportedError('immutable');
  @override
  T operator [](int index) {
    reads++;
    return values[index];
  }

  @override
  void operator []=(int index, T value) => throw UnsupportedError('immutable');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'sparse geometry publication does not rescan all settled component asset targets',
    () async {
      final h = support.Harness(
        (_) async => Uint8List.fromList(utf8.encode(support.good)),
      );
      final doc = const DatasetReader().read([
        {
          'type': 'grid',
          'id': 'g',
          'cells': [List.filled(100, 1)],
          'item': {
            'size': 20,
            'components': [
              {'type': 'icon', 'id': 'icon', 'source': 'good.svg', 'size': 10},
            ],
          },
        },
      ]);
      final original = h.initial(doc);
      await Future.wait(original.assetTargets.keys.map((asset) => asset.ready));
      // SVG uses own their mutable demand independently of shared physical data.
      final counted = original.assetTargets.map(
        (asset, targets) => MapEntry(asset, CountedList(targets)),
      );
      expect(
        counted.values.fold(0, (sum, targets) => sum + targets.length),
        100,
      );
      final before = RenderPublication(
        original.geometry,
        original.pages,
        original.resources,
        targets: counted,
        counts: original.assetCounts,
      );
      h.backend.publish(before, 1, 1);
      await support.tick();
      final id = 'g.0.0';
      final next =
          (await h.backend.prepareUpdate(
                before,
                doc,
                {
                  PatchMapTarget(id): RecordDelta(
                    before: doc.targets[id]!.data,
                    after: Map<String, Object?>.unmodifiable({
                      ...doc.targets[id]!.data,
                      'attrs': const <String, Object?>{'x': 1},
                    }),
                    fields: RecordFields.attrsTransform,
                  ),
                },
                generation: 1,
                animate: true,
              )).publication
              as RenderPublication;
      expect(next.assetTargets, same(before.assetTargets));
      for (final targets in counted.values) {
        targets.reads = 0;
      }
      h.backend.publish(next, 1, 2);
      await support.tick();
      final reads = counted.values.fold(
        0,
        (sum, targets) => sum + targets.reads,
      );
      next.dispose();
      before.dispose();
      original.dispose();
      h.close();
      expect(
        reads,
        0,
        reason:
            'all 100 settled fixed-size icons are unchanged; no intrinsic image needs refresh',
      );
    },
  );

  test(
    'refresh followed by independent pending update keeps refresh dirty slots for publication',
    () async {
      final h = support.Harness(
        (_) async => Uint8List.fromList(utf8.encode(support.good)),
      );
      final doc = const DatasetReader().read([
        {
          'type': 'image',
          'id': 'image',
          'source': 'good.svg',
          'attrs': {'x': 1000},
        },
        {'type': 'rect', 'id': 'other', 'size': 10},
      ]);
      final before = h.initial(doc);
      await before.node(0).assets.single.ready;
      h.backend.publish(before, 1, 1);
      await support
          .tick(); // registers ready intrinsic image for serialized refresh
      final refreshed =
          await h.backend.prepareRefresh(before) as RenderPublication;
      expect(refreshed.changed, contains(0));
      expect(
        refreshed.geometry['image']!.localBounds!.size,
        const Size(20, 10),
      );
      final next =
          (await h.backend.prepareUpdate(
                refreshed,
                doc,
                {
                  const PatchMapTarget('other'): RecordDelta(
                    before: doc.targets['other']!.data,
                    after: Map<String, Object?>.unmodifiable({
                      ...doc.targets['other']!.data,
                      'attrs': const <String, Object?>{'x': 5},
                    }),
                    fields: RecordFields.attrsTransform,
                  ),
                },
                generation: 1,
                animate: true,
              )).publication
              as RenderPublication;
      h.backend.publish(next, 1, 2);
      final candidates = h.backend.spatial
          .candidates(const Rect.fromLTWH(1005, 2, 1, 1))
          .toList();
      final actualChanged = next.changed.toList();
      next.dispose();
      refreshed.dispose();
      before.dispose();
      h.close();
      expect([actualChanged, candidates], [contains(0), contains(0)]);
    },
  );
}
