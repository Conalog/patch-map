import 'dart:math';

import 'package:conalog_patch_map/conalog_patch_map.dart';

enum MapLayout { grid, random }

enum UpdateWorkload { number, bar, mixed }

/// Host JSON only: 100 panels per grid, ordered groups in five columns. Random
/// varies templates/values, never placement. Both modes keep bar and number
/// visible together as an integrated maximum-load case, not a consumer replay.
final class MapWorkload {
  MapWorkload(this.layout, {this.count = 10000, this.seed = defaultSeed}) {
    if (count < 0) {
      throw RangeError.value(count, 'count', 'must be nonnegative');
    }
    final random = Random(seed);
    final roots = <Map<String, Object?>>[],
        targets = <String>[],
        devices = <String>[];
    final groups = (count + 99) ~/ 100;
    for (var group = 0; group < groups; group++) {
      final mixed = layout == MapLayout.random;
      // Keep size/padding paired: three content widths × three percent widths.
      final sizeSlot = !mixed
          ? 0
          : switch (group % 10) {
              0 => 1,
              1 => 2,
              _ => 0,
            };
      final width = const [40, 32, 52][sizeSlot];
      final height = const [80, 64, 92][sizeSlot];
      final padding = sizeSlot == 1 ? 2 : 3;
      final widthSlot = !mixed
          ? group % 3
          : sizeSlot == 0
          ? _weightedWidth(random.nextInt(10))
          : (group ~/ 10) % 3;
      final panels = min(100, count - group * 100);
      final cells = <List<int>>[];
      for (var start = 0; start < panels; start += 10) {
        final length = min(10, panels - start), row = start ~/ 10;
        cells.add(List.filled(length, 1));
        for (var column = 0; column < length; column++) {
          targets.add('grid-$group.$row.$column');
        }
      }
      final panelHeight = cells.length * height + (cells.length - 1) * 4;
      final device = 'device-$group';
      devices.add(device);
      roots.add({
        'type': 'group',
        'id': 'panel-group-$group',
        'label': 'PG ${group + 1}',
        'attrs': {
          'x': (group % 5) * groupPitchX + groupInset,
          'y': (group ~/ 5) * groupPitchY + groupInset,
        },
        'children': [
          {
            'type': 'grid',
            'id': 'grid-$group',
            'cells': cells,
            'inactiveCellStrategy': 'hide',
            'gap': 4,
            'attrs': {
              'x': panelInsetX,
              'y': panelInsetY,
              'display': 'panelGroup',
            },
            'item': _item(
              width: width,
              height: height,
              padding: padding,
              backgroundRadius: mixed ? const [4, 6, 8][group % 3] : 6,
              borderWidth: mixed ? 1 + group % 3 : 2,
              borderColor: mixed
                  ? const ['#063559', '#94a3b8', '#64748b'][group % 3]
                  : '#063559',
              radius: mixed ? 1 + group % 4 : 3,
              widthPercent: widthPercents[widthSlot],
              heightPercent: mixed
                  ? 15 + random.nextInt(76)
                  : 15 + group * 37 % 76,
              color: colors[mixed ? random.nextInt(colors.length) : group % 3],
              text: _number(group, -1),
            ),
          },
          {
            'type': 'image',
            'id': device,
            'source': 'device',
            'size': {'width': 60, 'height': 70},
            'attrs': {'x': 0, 'y': panelInsetY + panelHeight / 2 - 35},
          },
        ],
      });
    }
    data = List.unmodifiable(roots);
    ids = List.unmodifiable(targets);
    deviceIds = List.unmodifiable(devices);
  }

  final MapLayout layout;
  final int count, seed;
  late final List<Map<String, Object?>> data;

  /// Panels only; SVG devices are deliberately excluded from all updates.
  late final List<String> ids;
  late final List<String> deviceIds;
  static const defaultSeed = 3476;
  static const groupPitchX = 800, groupPitchY = 1120, groupInset = 64;
  static const panelInsetX = 96, panelInsetY = 32;
  static const widthPercents = [100, 60, 25];
  static const colors = ['#0c73bf', '#063559', '#636363', '#2ecc71', '#e74c3c'];
  static const _powersOfTen = [1, 10, 100, 1000, 10000, 100000, 1000000];

  static int _weightedWidth(int slot) => slot < 6
      ? 0
      : slot < 8
      ? 1
      : 2;

  static Map<String, Object?> _item({
    required int width,
    required int height,
    required int padding,
    required int backgroundRadius,
    required int borderWidth,
    required String borderColor,
    required int radius,
    required int widthPercent,
    required int heightPercent,
    required String color,
    required String text,
  }) => {
    'size': {'width': width, 'height': height},
    'padding': padding,
    'components': [
      {
        'type': 'background',
        'id': 'bg',
        'source': {
          'type': 'rect',
          'fill': '#636363',
          'radius': backgroundRadius,
          'borderWidth': borderWidth,
          'borderColor': borderColor,
        },
        'attrs': {'zIndex': 0},
      },
      {
        'type': 'bar',
        'id': 'bar',
        'show': true,
        'source': {
          'type': 'rect',
          'fill': 'white',
          'radius': radius,
          'borderWidth': 0,
          'borderColor': '#00000000',
        },
        'tint': color,
        'size': {'width': '$widthPercent%', 'height': '$heightPercent%'},
        'placement': 'bottom',
        'animation': true,
        'animationDuration': 200,
        'attrs': {'zIndex': 1},
      },
      {
        'type': 'text',
        'id': 'text',
        'show': true,
        'text': text,
        'placement': 'center',
        'margin': 4,
        'tint': 'white',
        'attrs': {'zIndex': 2},
        'style': {
          'fontFamily': 'FiraCode',
          'fontWeight': 500,
          'fontSize': 'auto',
          'autoFont': {'min': 8, 'max': 14},
          'align': 'center',
          'fill': 'white',
          'wordWrap': true,
          'breakWords': false,
          'wordWrapWidth': 'auto',
        },
      },
    ],
  };

  // The experiment cycles its numeric digit budget with index modulo six.
  // Keep all six lengths represented, without padding zeros or nonnumeric units.
  String _number(int index, int sequence) {
    final digits = index % 6 + 1;
    final minimum = digits == 1 ? 0 : _powersOfTen[digits - 1];
    final span = _powersOfTen[digits] - minimum;
    return '${minimum + (seed * 104729 + index * 37 + (sequence + 1) * 53) % span}';
  }

  /// Full request cardinality, with a deterministic subset changing after the
  /// first normalization request. Partial fixtures round the panel count down.
  int changedPanelCount(int percent) {
    if (percent != 0 && percent != 1 && percent != 100) {
      throw ArgumentError.value(
        percent,
        'changedPercent',
        'expected 0, 1 or 100',
      );
    }
    return count * percent ~/ 100;
  }

  late final List<int> _benchmarkRanks = () {
    final shuffled = List.generate(count, (i) => i)..shuffle(Random(seed));
    final ranks = List.filled(count, 0);
    for (var rank = 0; rank < count; rank++) {
      ranks[shuffled[rank]] = rank;
    }
    return ranks;
  }();

  /// A real panel nearest the middle group, rather than the inter-group aisle.
  String? get benchmarkFocusTarget {
    if (ids.isEmpty) return null;
    final groups = (count + 99) ~/ 100;
    final centerX = min(4, groups - 1) / 2;
    final centerY = ((groups - 1) ~/ 5) / 2;
    var best = 0, distance = double.infinity;
    for (var group = 0; group < groups; group++) {
      final dx = group % 5 - centerX, dy = group ~/ 5 - centerY;
      final next = dx * dx + dy * dy;
      if (next < distance) {
        best = group;
        distance = next;
      }
    }
    return ids[best * 100 + min(44, count - best * 100 - 1)];
  }

  List<PatchMapUpdate> benchmarkUpdates(
    UpdateWorkload kind,
    int sequence, {
    required int changedPercent,
  }) {
    final changed = changedPanelCount(changedPercent);
    final updates = <PatchMapUpdate>[];
    for (var index = 0; index < ids.length; index++) {
      final revision = _benchmarkRanks[index] < changed ? sequence : 0;
      if (kind != UpdateWorkload.bar) {
        updates.add(
          PatchMapUpdate(PatchMapTarget(ids[index], componentId: 'text'), {
            'text': _number(index, revision),
          }),
        );
      }
      if (kind != UpdateWorkload.number) {
        updates.add(
          PatchMapUpdate(PatchMapTarget(ids[index], componentId: 'bar'), {
            'size': {
              'height': '${15 + (seed + index * 37 + revision * 29) % 76}%',
            },
            'tint': colors[(seed + index * 17 + revision) % colors.length],
          }),
        );
      }
    }
    return updates;
  }

  List<PatchMapUpdate> updates(UpdateWorkload kind, int sequence) {
    final random = Random(seed + 104729 * (sequence + 1));
    return [
      for (var index = 0; index < ids.length; index++) ...[
        if (kind != UpdateWorkload.bar)
          PatchMapUpdate(PatchMapTarget(ids[index], componentId: 'text'), {
            'text': _number(index, sequence),
          }),
        if (kind != UpdateWorkload.number)
          PatchMapUpdate(PatchMapTarget(ids[index], componentId: 'bar'), {
            // Sparse height retains the template width; tint retains its radius.
            'size': {'height': '${15 + random.nextInt(76)}%'},
            'tint': colors[random.nextInt(colors.length)],
          }),
      ],
    ];
  }
}
