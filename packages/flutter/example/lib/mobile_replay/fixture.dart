import 'dart:convert';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/services.dart';

/// Captured WebView renderer inputs, not a second implementation of its metrics.
final class MobileReplayFixture {
  MobileReplayFixture(this.raw);
  final Map<String, dynamic> raw;

  static Future<MobileReplayFixture> load() async => MobileReplayFixture(
    jsonDecode(await rootBundle.loadString('assets/mobile_replay.json'))
        as Map<String, dynamic>,
  );

  Map<String, Object?> get colors => Map.from(raw['theme'] as Map);
  Map<String, Object?> get symbols => Map.from(raw['symbols'] as Map);
  List<String> get panelStates =>
      (raw['panels'] as Map).keys.cast<String>().toList();
  List<Map<String, Object?>> panel(String state) =>
      nativeComponents(records(raw['panels'][state]));
  Map<String, Object?> inverter(String state, {bool adapt = true}) {
    final value = Map<String, Object?>.from(raw['inverters'][state] as Map);
    if (!adapt) return value;
    value['components'] = nativeComponents(records(value['components']));
    return value;
  }

  static List<Map<String, Object?>> nativeComponents(
    List<Map<String, Object?>> components,
  ) => [
    for (final component in components)
      {
        ...component,
        // The consumer emits both overflow:'ellipsis' and ellipsis:true.
        // Only the former is part of PatchMap's native schema.
        if (component['style'] case final Map style)
          'style': {...style}..remove('ellipsis'),
        // Deployed WebView 0.10 uses style.fill independently of tint. The
        // approved release/1.0 native projection uses tint as the final color.
        // These captured texts have no tint, so make their intended fill explicit.
        if (component['type'] == 'text' && !component.containsKey('tint'))
          if (component['style'] case {'fill': final Object fill}) 'tint': fill,
      },
  ];

  Map<String, Object?> initialInverter({bool complete = true}) {
    final initial = inverter('pending', adapt: complete);
    if (!complete) return initial;
    return {
      ...initial,
      'components': [
        for (final component in records(initial['components']))
          {
            ...component,
            // WebView's validateSchema:false permits incomplete hidden icons.
            // Native draw validates all components, even hidden placeholders.
            // Hidden legacy never appears; other icons receive real sizes on update.
            if (component['type'] == 'icon' && !component.containsKey('size'))
              'size': 0,
          },
      ],
    };
  }

  static List<Map<String, Object?>> records(Object? value) => (value as List)
      .map((entry) => Map<String, Object?>.from(entry as Map))
      .toList();

  // IDs, cell count and spacing are modeled. The 40×80 panel template follows
  // the prior source-exported authoring fixture; no randomized overlaps.
  List<Map<String, Object?>> scene({
    bool alternate = false,
    bool complete = true,
  }) => [
    {
      'type': 'group',
      'id': 'plant',
      'children': [
        {
          'type': 'grid',
          'id': 'panel-grid',
          'label': 'PG',
          'cells': [
            List.filled(alternate ? 5 : 4, 1),
            List.filled(alternate ? 5 : 4, 1),
          ],
          'gap': 4,
          'inactiveCellStrategy': 'hide',
          'attrs': {'x': 96, 'y': 32, 'display': 'panelGroup'},
          'item': {
            'size': {'width': 40, 'height': 80},
            'padding': 3,
            'components': [
              {
                'type': 'background',
                'id': 'background',
                'source': {
                  'type': 'rect',
                  'fill': 'white',
                  'borderWidth': 2,
                  'borderColor': 'primary.dark',
                  'radius': 6,
                },
              },
              ...panel('loading'),
            ],
          },
        },
        {
          'type': 'item',
          'id': 'inverter-map-1',
          ...initialInverter(complete: complete),
          'attrs': {'x': 0, 'y': 32, 'display': 'inverter', 'zIndex': 20},
        },
        {
          'type': 'item',
          'id': 'router-map-1',
          'size': 48,
          'padding': 3,
          'attrs': {'x': 0, 'y': 132, 'display': 'router'},
          'components': withIds(records(raw['routers']['online'])),
        },
        {
          'type': 'item', 'id': alternate ? 'edge-map-2' : 'edge-map-1',
          'size': 48, 'padding': 3,
          'attrs': {'x': 0, 'y': 212, 'display': 'edge', 'zIndex': 100},
          // EDGE_LAYOUT is a merge over authored background/icon, not a complete
          // item. Materialize that merge before native draw, retaining power.
          'components': [
            for (final component in withIds(
              records(raw['edgeLayout']['components']),
            ))
              {
                ...component,
                if (component['type'] == 'background')
                  'source': {
                    'type': 'rect',
                    'fill': 'white',
                    'radius': 6,
                    'borderWidth': 2,
                    ...component['source'] as Map,
                  },
                if (component['id'] == 'icon') ...{
                  'source': 'device',
                  'size': 24,
                },
              },
          ],
        },
      ],
    },
  ];

  static List<Map<String, Object?>> withIds(
    List<Map<String, Object?>> components,
  ) => [
    for (final component in components)
      {'id': component['id'] ?? component['type'], ...component},
  ];

  static List<PatchMapUpdate> componentUpdates(
    String id,
    List<Map<String, Object?>> components,
  ) => [
    for (final component in components)
      PatchMapUpdate(
        PatchMapTarget(
          id,
          componentId: (component['id'] ?? component['type']) as String,
        ),
        {...component}
          ..remove('id')
          ..remove('type'),
      ),
  ];

  List<PatchMapUpdate> panelUpdates({String? state, bool alternate = false}) =>
      [
        for (var row = 0; row < 2; row++)
          for (var col = 0; col < (alternate ? 5 : 4); col++)
            ...componentUpdates(
              'panel-grid.$row.$col',
              panel(state ?? panelStates[(row * 4 + col) % panelStates.length]),
            ),
      ];

  List<PatchMapUpdate> inverterUpdates(String state) {
    final values = inverter(state);
    final components = records(values.remove('components'));
    return [
      PatchMapUpdate(const PatchMapTarget('inverter-map-1'), values),
      ...componentUpdates('inverter-map-1', components),
    ];
  }
}
