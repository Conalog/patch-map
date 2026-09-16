import 'dart:convert';
import 'dart:io';
import '../../example/lib/demo_commands.dart';
import 'package:patch_map/src/api/values.dart';
import 'package:patch_map/src/engine/controller.dart';
import 'package:patch_map/src/engine/ports.dart';
import 'package:patch_map/src/model/dataset.dart';
import 'package:patch_map/src/semantic/text/layout.dart';

class _Surface implements PatchMapSurfacePort {
  @override
  bool prepare(PatchMapRenderSnapshot snapshot) => true;
  @override
  void requestFrame() {}
  @override
  Future<void> dispose() async {}
  @override
  Future<PatchMapCaptureResult> capture(
    PatchMapRenderSnapshot snapshot,
  ) => throw StateError(
    'Pixel capture requires native integration; this runner validates public semantics',
  );
}

Future<JsonMap> runFixture(JsonMap fixture) async {
  final surface = fixture['surface'] as Map;
  final c = await PatchMapController.create(
    data: fixture['dataset'],
    width: (surface['width'] as num).toDouble(),
    height: (surface['height'] as num).toDouble(),
    pixelRatio: (surface['pixelRatio'] as num).toDouble(),
    fit: false,
    textLayouter: layoutGeometryText,
  );
  c.attach(_Surface());
  c.frameConfirmed(c.revisions);
  final events = <JsonMap>[];
  c.history.onChange(
    (state) => events.add({'type': 'history', 'state': state}),
  );
  c.selection.onChange((ids) => events.add({'type': 'selection', 'ids': ids}));
  try {
    final initial = observePublic(c),
        steps = <JsonMap>[],
        failures = <JsonMap>[];
    for (final raw in fixture['commands'] as List) {
      final cmd = (raw as Map).cast<String, dynamic>(),
          before = observePublic(c),
          eventStart = events.length;
      final expected = cmd['expect'] as Map? ?? {};
      Object? result;
      try {
        result = await command(c, cmd);
      } catch (error) {
        if (!expected.containsKey('throws'))
          failures.add({
            'commandId': cmd['id'],
            'message': 'Unexpected exception: $error',
          });
        result = {
          'thrown': {
            'kind':
                error is PatchMapException &&
                        [
                          'INVALID_ARGUMENT',
                          'INVALID_INPUT',
                          'STALE_TARGET',
                        ].contains(error.code) ||
                    error is ArgumentError
                ? 'invalid-argument'
                : 'unexpected-error',
          },
        };
      }
      final after = observePublic(c);
      if (expected.containsKey('throws') &&
          (result is! Map ||
              (result['thrown'] as Map?)?['kind'] !=
                  (expected['throws'] as Map)['kind']))
        failures.add({
          'commandId': cmd['id'],
          'message':
              'Expected exception ${expected['throws']}, received $result',
        });
      if (expected.containsKey('status') &&
          (result is! Map || result['status'] != expected['status']))
        failures.add({
          'commandId': cmd['id'],
          'message':
              'Expected ${expected['status']}, got ${jsonEncode(result)}',
        });
      for (final entry in {
        'semanticHashUnchanged': 'semanticHash',
        'snapshotUnchanged': 'dataset',
        'historyUnchanged': 'history',
      }.entries) {
        if (expected[entry.key] == true &&
            jsonEncode(before[entry.value]) != jsonEncode(after[entry.value]))
          failures.add({
            'commandId': cmd['id'],
            'message': '${entry.key} failed',
          });
      }
      steps.add({
        'commandId': cmd['id'],
        'result': result,
        'observation': after,
        'events': events.sublist(eventStart),
      });
    }
    return {
      'fixtureId': fixture['id'],
      'initial': initial,
      'steps': steps,
      'failures': failures,
    };
  } finally {
    await c.destroy();
  }
}

Future<void> main(List<String> args) async {
  if (args.isEmpty)
    throw ArgumentError('Pass one or more conformance fixture paths');
  final results = <JsonMap>[];
  for (final path in args) {
    results.add(
      await runFixture(
        (jsonDecode(File(path).readAsStringSync()) as Map)
            .cast<String, dynamic>(),
      ),
    );
  }
  stdout.writeln(jsonEncode(results));
  if (results.any((result) => (result['failures'] as List).isNotEmpty))
    exitCode = 1;
}
