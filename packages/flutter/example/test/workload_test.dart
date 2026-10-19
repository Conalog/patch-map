import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map_example/measurement.dart';
import 'package:patch_map_example/workload.dart';

Map<String, Object?> map(Object? value) =>
    (value! as Map).cast<String, Object?>();
Map<String, Object?> grid(Map<String, Object?> group) =>
    (group['children'] as List)
        .map(map)
        .singleWhere((c) => c['type'] == 'grid');
Map<String, Object?> device(Map<String, Object?> group) =>
    (group['children'] as List)
        .map(map)
        .singleWhere((c) => c['type'] == 'image');
Map<String, Object?> component(Map<String, Object?> template, String id) =>
    (template['components'] as List).map(map).singleWhere((c) => c['id'] == id);
double percent(Object? value) =>
    double.parse((value as String).replaceAll('%', '')) / 100;

// Independent application-JSON bounds check, including a conservative stroke
// outset. No runtime-private geometry/rendering import or copied renderer.
Rect project(Rect local, Map<String, Object?> attrs) {
  final angle = ((attrs['angle'] as num?) ?? 0) * math.pi / 180;
  final cosine = math.cos(angle), sine = math.sin(angle);
  final x = ((attrs['x'] as num?) ?? 0).toDouble();
  final y = ((attrs['y'] as num?) ?? 0).toDouble();
  final points = [
    for (final p in [
      local.topLeft,
      local.topRight,
      local.bottomRight,
      local.bottomLeft,
    ])
      Offset(x + cosine * p.dx - sine * p.dy, y + sine * p.dx + cosine * p.dy),
  ];
  return Rect.fromLTRB(
    points.map((p) => p.dx).reduce(math.min),
    points.map((p) => p.dy).reduce(math.min),
    points.map((p) => p.dx).reduce(math.max),
    points.map((p) => p.dy).reduce(math.max),
  );
}

({List<Rect> panels, Rect device, Rect all}) bounds(
  Map<String, Object?> group,
) {
  final g = grid(group),
      template = map(g['item']),
      size = map(template['size']);
  final w = (size['width'] as num).toDouble(),
      h = (size['height'] as num).toDouble();
  final gap = (g['gap'] as num).toDouble(), origin = map(g['attrs']);
  final attrs = map(group['attrs']);
  final stroke =
      (map(component(template, 'bg')['source'])['borderWidth'] as num)
          .toDouble();
  final cells = g['cells'] as List;
  final panels = [
    for (var r = 0; r < cells.length; r++)
      for (var c = 0; c < (cells[r] as List).length; c++)
        project(
          Rect.fromLTWH(
            (origin['x'] as num).toDouble() + c * (w + gap),
            (origin['y'] as num).toDouble() + r * (h + gap),
            w,
            h,
          ).inflate(stroke / 2),
          attrs,
        ),
  ];
  final d = device(group), dsize = map(d['size']), da = map(d['attrs']);
  final db = project(
    Rect.fromLTWH(
      (da['x'] as num).toDouble(),
      (da['y'] as num).toDouble(),
      (dsize['width'] as num).toDouble(),
      (dsize['height'] as num).toDouble(),
    ),
    attrs,
  );
  return (
    panels: panels,
    device: db,
    all: panels.fold(db, (a, b) => a.expandToInclude(b)),
  );
}

bool touches(Rect a, Rect b) =>
    a.left <= b.right &&
    b.left <= a.right &&
    a.top <= b.bottom &&
    b.top <= a.bottom;

void main() {
  test(
    'both layouts contain 100 exact 10x10 grids in five columns and 100 separate real devices',
    () {
      for (final layout in MapLayout.values) {
        final scene = MapWorkload(layout);
        expect(scene.data.length, 100);
        final actual = <String>[], actualDevices = <String>[];
        for (var g = 0; g < scene.data.length; g++) {
          final root = scene.data[g], cells = grid(root)['cells'] as List;
          expect(root['type'], 'group');
          expect(map(root['attrs']), {
            'x': (g % 5) * 800 + 64,
            'y': (g ~/ 5) * 1120 + 64,
          });
          expect(cells.length, 10);
          for (var r = 0; r < 10; r++) {
            expect(cells[r], List.filled(10, 1));
            for (var c = 0; c < 10; c++) {
              actual.add('grid-$g.$r.$c');
            }
          }
          final d = device(root);
          expect(d['source'], 'device');
          expect(d['size'], {'width': 60, 'height': 70});
          actualDevices.add(d['id'] as String);
        }
        expect(scene.ids, actual);
        expect(scene.ids.toSet().length, 10000);
        expect(scene.deviceIds, actualDevices);
        expect(scene.deviceIds.toSet().length, 100);
        expect(
          scene.ids.toSet().intersection(scene.deviceIds.toSet()),
          isEmpty,
        );
        expect(scene.updates(UpdateWorkload.number, 0).length, 10000);
        expect(scene.updates(UpdateWorkload.bar, 0).length, 10000);
        expect(scene.updates(UpdateWorkload.mixed, 0).length, 20000);
      }
    },
  );

  test(
    'every panel, group and device has a disjoint conservative world AABB',
    () {
      for (final layout in MapLayout.values) {
        final scene = MapWorkload(layout);
        final groups = scene.data.map(bounds).toList();
        var overlaps = 0;
        for (var g = 0; g < groups.length; g++) {
          final current = groups[g];
          final slot = Rect.fromLTWH(
            (g % 5) * 800.0,
            (g ~/ 5) * 1120.0,
            800,
            1120,
          );
          expect(slot.contains(current.all.topLeft), isTrue);
          expect(slot.contains(current.all.bottomRight), isTrue);
          for (var i = 0; i < current.panels.length; i++) {
            if (touches(current.panels[i], current.device)) overlaps++;
            for (var j = i + 1; j < current.panels.length; j++) {
              if (touches(current.panels[i], current.panels[j])) overlaps++;
            }
          }
          for (var j = g + 1; j < groups.length; j++) {
            // Disjoint enclosing group AABBs prove every cross-group pair disjoint.
            if (touches(current.all, groups[j].all)) overlaps++;
          }
        }
        expect(
          overlaps,
          0,
          reason: '${layout.name} must have no panel/device/group overlap',
        );
      }
    },
  );

  test(
    'representative templates have measured size, width, radius and font-style domains',
    () {
      for (final layout in MapLayout.values) {
        final scene = MapWorkload(layout);
        final sizeCounts = <(int, int, int), int>{};
        final widths = <double>{},
            radii = <Object?>{},
            barColors = <Object?>{},
            bgStyles = <String>{};
        final metricStyles = <String>{}, initialLengths = <int>{};
        for (final root in scene.data) {
          final g = grid(root), t = map(g['item']), size = map(t['size']);
          final w = size['width'] as int,
              h = size['height'] as int,
              padding = t['padding'] as int;
          sizeCounts.update(
            (w, h, padding),
            (n) => n + 100,
            ifAbsent: () => 100,
          );
          expect(g['gap'], 4);
          final bar = component(t, 'bar'), source = map(bar['source']);
          widths.add((w - 2 * padding) * percent(map(bar['size'])['width']));
          radii.add(source['radius']);
          barColors.add(bar['tint']);
          expect(bar['show'], isTrue);
          expect(source['fill'], 'white');
          expect(bar['animation'], isTrue);
          expect(bar['animationDuration'], 200);
          final bg = map(component(t, 'bg')['source']);
          bgStyles.add(jsonEncode(bg));
          expect(bg['fill'], '#636363');
          final text = component(t, 'text'), style = map(text['style']);
          metricStyles.add(jsonEncode(style));
          initialLengths.add((text['text'] as String).length);
          expect(text['show'], isTrue);
          expect(text['tint'], 'white');
          expect(text['placement'], 'center');
          expect(text['margin'], 4);
          expect(style, {
            'fontFamily': 'FiraCode',
            'fontWeight': 500,
            'fontSize': 'auto',
            'autoFont': {'min': 8, 'max': 14},
            'align': 'center',
            'fill': 'white',
            'wordWrap': true,
            'breakWords': false,
            'wordWrapWidth': 'auto',
          });
        }
        expect(metricStyles.length, 1);
        expect(initialLengths, {1, 2, 3, 4, 5, 6});
        if (layout == MapLayout.grid) {
          expect(sizeCounts, {(40, 80, 3): 10000});
          expect(widths, {34.0, 20.4, 8.5});
          expect(radii, {3});
          expect(bgStyles.length, 1);
          expect(barColors, MapWorkload.colors.take(3).toSet());
          for (final root in scene.data) {
            final bg = map(component(map(grid(root)['item']), 'bg')['source']);
            expect(bg['radius'], 6);
            expect(bg['borderWidth'], 2);
            expect(bg['borderColor'], '#063559');
          }
        } else {
          expect(sizeCounts, {
            (40, 80, 3): 8000,
            (32, 64, 2): 1000,
            (52, 92, 3): 1000,
          });
          expect(widths.length, 9);
          expect(radii, {1, 2, 3, 4});
          expect(barColors, MapWorkload.colors.toSet());
          expect(bgStyles.length, 3);
        }
      }
    },
  );

  test(
    'number/bar/mixed values are valid sparse independent streams and never update devices',
    () {
      final scene = MapWorkload(MapLayout.random);
      final numbers = scene.updates(UpdateWorkload.number, 2),
          bars = scene.updates(UpdateWorkload.bar, 2);
      final mixed = scene.updates(UpdateWorkload.mixed, 2);
      expect(
        numbers.map((u) => u.values),
        mixed.where((u) => u.target.componentId == 'text').map((u) => u.values),
      );
      expect(
        bars.map((u) => u.values),
        mixed.where((u) => u.target.componentId == 'bar').map((u) => u.values),
      );
      final lengths = <int, int>{};
      for (var i = 0; i < scene.ids.length; i++) {
        final number = numbers[i], bar = bars[i];
        expect(number.target.id, scene.ids[i]);
        expect(number.target.componentId, 'text');
        expect(number.values.keys, ['text']);
        final text = number.values['text'] as String;
        expect(RegExp(r'^\d{1,6}$').hasMatch(text), isTrue);
        expect(text.length, i % 6 + 1);
        lengths.update(text.length, (n) => n + 1, ifAbsent: () => 1);
        expect(bar.target.id, scene.ids[i]);
        expect(bar.target.componentId, 'bar');
        expect(bar.values.keys.toSet(), {'size', 'tint'});
        expect(map(bar.values['size']).keys, ['height']);
        expect(
          percent(map(bar.values['size'])['height']),
          inInclusiveRange(.15, .9),
        );
        expect(MapWorkload.colors, contains(bar.values['tint']));
        expect(scene.deviceIds, isNot(contains(bar.target.id)));
      }
      expect(lengths, {1: 1667, 2: 1667, 3: 1667, 4: 1667, 5: 1666, 6: 1666});
    },
  );

  test(
    'seed plus sequence is reproducible and both layouts get identical update inputs',
    () {
      for (final layout in MapLayout.values) {
        final first = MapWorkload(layout, count: 217);
        expect(first.data, MapWorkload(layout, count: 217).data);
        expect(
          first.data,
          isNot(MapWorkload(layout, count: 217, seed: 732).data),
        );
        final original = jsonEncode(first.data);
        for (final kind in UpdateWorkload.values) {
          expect(
            first.updates(kind, 2).map((u) => u.values),
            first.updates(kind, 2).map((u) => u.values),
          );
        }
        expect(jsonEncode(first.data), original);
      }
      final gridScene = MapWorkload(MapLayout.grid, count: 217),
          randomScene = MapWorkload(MapLayout.random, count: 217);
      expect(gridScene.ids, randomScene.ids);
      expect(gridScene.deviceIds, randomScene.deviceIds);
      expect(gridScene.seed, MapWorkload.defaultSeed);
      for (final kind in UpdateWorkload.values) {
        expect(
          gridScene
              .updates(kind, 2)
              .map((u) => (u.target.id, u.target.componentId)),
          randomScene
              .updates(kind, 2)
              .map((u) => (u.target.id, u.target.componentId)),
        );
        expect(
          gridScene.updates(kind, 2).map((u) => u.values),
          randomScene.updates(kind, 2).map((u) => u.values),
        );
      }
      expect(
        gridScene.updates(UpdateWorkload.number, 1).first.values,
        isNot(gridScene.updates(UpdateWorkload.number, 2).first.values),
      );
    },
  );

  test(
    'partial and empty counts preserve exact panel counts without placeholder targets',
    () {
      for (final layout in MapLayout.values) {
        for (final count in [0, 1, 4, 17, 80, 99, 100, 101, 120]) {
          final scene = MapWorkload(layout, count: count);
          final actual = scene.data.expand(
            (root) =>
                (grid(root)['cells'] as List).expand((row) => row as List),
          );
          expect(actual.length, count);
          expect(scene.ids.length, count);
          expect(scene.deviceIds.length, (count + 99) ~/ 100);
        }
      }
      expect(() => MapWorkload(MapLayout.grid, count: -1), throwsRangeError);
    },
  );

  test(
    'benchmark sends all records while exactly the selected panels change',
    () {
      for (final layout in MapLayout.values) {
        final scene = MapWorkload(layout);
        for (final percent in [0, 1, 100]) {
          Set<String>? selected;
          for (final kind in UpdateWorkload.values) {
            final first = scene.benchmarkUpdates(
              kind,
              0,
              changedPercent: percent,
            );
            final next = scene.benchmarkUpdates(
              kind,
              1,
              changedPercent: percent,
            );
            final third = scene.benchmarkUpdates(
              kind,
              2,
              changedPercent: percent,
            );
            expect(first.length, kind == UpdateWorkload.mixed ? 20000 : 10000);
            final changed = <String>{}, changedAgain = <String>{};
            for (var i = 0; i < first.length; i++) {
              expect(next[i].target, first[i].target);
              if (jsonEncode(first[i].values) != jsonEncode(next[i].values)) {
                changed.add(first[i].target.id);
              }
              if (jsonEncode(next[i].values) != jsonEncode(third[i].values)) {
                changedAgain.add(first[i].target.id);
              }
            }
            expect(changed.length, percent * 100);
            expect(changedAgain, changed);
            if (selected != null) expect(changed, selected);
            selected = changed;
            expect(
              next.map((u) => jsonEncode(u.values)),
              scene
                  .benchmarkUpdates(kind, 1, changedPercent: percent)
                  .map((u) => jsonEncode(u.values)),
            );
          }
        }
      }
    },
  );

  test(
    'benchmark fraction validation and representative focus handle partial scenes',
    () {
      expect(MapWorkload(MapLayout.grid).benchmarkFocusTarget, 'grid-47.4.4');
      for (final count in [0, 1, 4, 99, 100, 101, 10000]) {
        final scene = MapWorkload(MapLayout.grid, count: count);
        expect(scene.changedPanelCount(1), count ~/ 100);
        if (count == 0) {
          expect(scene.benchmarkFocusTarget, isNull);
        } else {
          expect(scene.ids, contains(scene.benchmarkFocusTarget));
        }
        expect(
          () => scene.benchmarkUpdates(
            UpdateWorkload.number,
            0,
            changedPercent: 2,
          ),
          throwsArgumentError,
        );
      }
    },
  );

  test('p95 uses nearest rank and empty samples remain explicit zero', () {
    expect(percentile([]), 0);
    expect(percentile(List.generate(100, (index) => index + 1.0)), 95);
  });
}
