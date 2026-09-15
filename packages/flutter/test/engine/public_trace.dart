import 'dart:convert';
import 'dart:io';
import '../../lib/src/api/values.dart';
import '../../lib/src/engine/controller.dart';
import '../../lib/src/engine/ports.dart';
import '../../lib/src/model/dataset.dart';
import '../../lib/src/semantic/text/layout.dart';

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

JsonMap observePublic(PatchMapController c) => {
  'dataset': c.data.snapshot(),
  'semanticHash': c.dataset.semanticHash,
  'rootIds': c.dataset.roots.map((e) => e['id']).toList(),
  'history': c.history.state,
  'selectionIds': c.selection.ids,
  'editor': c.editor.state,
  'viewport': c.viewport.state,
  'rotation': c.rotation.value,
  'targets': c.targets
      .query({'scope': 'all'})
      .matches
      .map((m) => m.toJson())
      .toList(),
};
final _handles = Expando<Map<String, Object>>();
Future<Object?> command(PatchMapController c, JsonMap command) async {
  final input = command['input'],
      options = (command['options'] as Map?)?.cast<String, dynamic>() ?? {};
  final actionId = options['actionId'] as String?,
      recordHistory = options['recordHistory'] as bool? ?? true;
  final handles = _handles[c] ??= <String, Object>{};
  final refs = (command['refs'] as Map?) ?? {};
  dynamic handle(String key) =>
      handles[refs[key]] ??
      (throw StateError('Missing fixture handle ${refs[key]}'));
  switch (command['op']) {
    case 'callbacks.probe':
      final config = input as Map;
      final target = config['target'] as String;
      final deliveries = <String>[];
      final initialDepth = c.history.state['cursor'] as int;
      void mutate(String fill) {
        c.update({
          'id': target,
          'changes': {'fill': fill},
        });
      }
      if (config['scenario'] == 'history-reentry') {
        var nested = false;
        final a = c.history.onChange((state) {
          deliveries.add('a:${(state['cursor'] as int) - initialDepth}');
          if (!nested) {
            nested = true;
            mutate('#00aa00');
          }
        });
        final b = c.history.onChange(
          (state) =>
              deliveries.add('b:${(state['cursor'] as int) - initialDepth}'),
        );
        try {
          mutate('#aa0000');
        } finally {
          a();
          b();
        }
      } else if (config['scenario'] == 'failure-disposer') {
        void Function() b = () {};
        final a = c.history.onChange((_) {
          deliveries.add('a');
          b();
          throw StateError('fixture callback failure');
        });
        b = c.history.onChange((_) => deliveries.add('disposed'));
        final last = c.history.onChange((_) => deliveries.add('c'));
        try {
          mutate('#0000aa');
        } finally {
          a();
          b();
          last();
        }
        mutate('#aaaa00');
      } else if (config['scenario'] == 'transform-reentry') {
        final session = c.transform.beginSession(
          targets: {'id': target},
          kind: 'move',
          actionId: 'callback-drag',
        );
        session.preview({
          'kind': 'move',
          'delta': [8, 0],
        });
        final release = c.history.onChange((_) {
          try {
            session.edgePan([479, 260], [4, 0]);
            deliveries.add('accepted');
          } catch (_) {
            deliveries.add('settled');
          }
        });
        try {
          session.commit();
        } finally {
          release();
        }
      } else {
        throw StateError('Unknown callback scenario');
      }
      return {'deliveries': deliveries};
    case 'update':
      return c
          .update(
            (input as Map).cast<String, dynamic>(),
            actionId: actionId,
            recordHistory: recordHistory,
            animate: options['animate'] as bool?,
          )
          .toJson();
    case 'updateBatch':
      return c
          .updateBatch(
            {
              ...(input as Map).cast<String, dynamic>(),
              if (refs['targets'] != null) 'targets': handle('targets'),
            },
            actionId: actionId,
            recordHistory: recordHistory,
            animate: options['animate'],
          )
          .toJson();
    case 'transaction':
      return c
          .transaction(
            (input as List)
                .map((v) => (v as Map).cast<String, dynamic>())
                .toList(),
            actionId: actionId,
            recordHistory: recordHistory,
            animate: options['animate'],
            selectedIds: (options['selectedIds'] as List?)?.cast<String>(),
            companion: options['companion'],
            conflictPolicy: options['conflictPolicy'] as String? ?? 'reject',
          )
          .toJson();
    case 'data.replace':
      return c.data
          .replace(
            input,
            datasetRef: options['datasetRef'] as String?,
            strict: options['strict'] == true,
            fit: options['fit'] ?? true,
          )
          .toJson();
    case 'data.replaceAsync':
      return (await c.data.replaceAsync(
        input,
        datasetRef: options['datasetRef'] as String?,
        strict: options['strict'] == true,
        fit: options['fit'] ?? true,
      )).toJson();
    case 'history.undo':
      return c.history.undo().toJson();
    case 'history.redo':
      return c.history.redo().toJson();
    case 'history.clear':
      return c.history.clear().toJson();
    case 'editor.execute':
      return c.editor.execute((input as Map).cast<String, dynamic>()).toJson();
    case 'selection.set':
      return c.selection.set(input as Object);
    case 'selection.clear':
      return c.selection.clear();
    case 'presentation.clear':
      return c.presentation.clear(input as String);
    case 'viewport.fit':
      return c.viewport
          .fit(
            targets: (input as Map?)?['targets'],
            padding: input?['padding'] ?? 16,
          )
          .toJson();
    case 'targets.query':
      final result = c.targets.query((input as Map).cast<String, dynamic>());
      handles[command['id'] as String] = result;
      return {
        'count': result.count,
        'matches': result.matches.map((m) => m.toJson()).toList(),
      };
    case 'targets.get':
      return c.targets.get(input as Object)?.toJson();
    case 'data.serialize':
      return c.data.serialize(input != false);
    case 'selection.add':
      return c.selection.add(input as Object);
    case 'selection.remove':
      return c.selection.remove(input as Object);
    case 'selection.toggle':
      return c.selection.toggle(input as Object);
    case 'presentation.set':
      final value = input as Map;
      return c.presentation.set(value['key'] as String, {
        ...(value['layer'] as Map).cast<String, dynamic>(),
        'scope': handle('scope'),
      }).toJson();
    case 'viewport.panBy':
      return c.viewport.panBy((input as List).cast<num>()).toJson();
    case 'viewport.zoomBy':
      final value = input as Map;
      return c.viewport
          .zoomBy(
            value['factor'] as num,
            (value['anchor'] as List?)?.cast<num>(),
          )
          .toJson();
    case 'viewport.restore':
      return c.viewport
          .restore((input as Map).cast<String, dynamic>())
          .toJson();
    case 'viewport.resize':
      final value = input as Map;
      return c.viewport.resize(
        value['width'] as num,
        value['height'] as num,
        value['pixelRatio'] as num?,
      );
    case 'rotation.set':
      return c.rotation.set(input as num);
    case 'rotation.rotateBy':
      return c.rotation.rotateBy(input as num);
    case 'rotation.reset':
      return c.rotation.reset();
    case 'rotation.start':
      handles[command['id'] as String] = c.rotation.animateTo(
        (input as Map)['angle'] as num,
        durationMs: options['durationMs'] as num? ?? 250,
        path: options['path'] as String? ?? 'raw',
        normalizeOnComplete: options['normalizeOnComplete'] == true,
      );
      return {'started': true};
    case 'rotation.cancel':
      return (handle('animation') as PatchMapRotationAnimation).cancel();
    case 'rotation.finished':
      return (await (handle('animation') as PatchMapRotationAnimation).finished)
          .toJson();
    case 'transform.moveBy':
      final value = input as Map;
      return c.transform
          .moveBy(
            value['targets'] as Object,
            (value['delta'] as List).cast<num>(),
            actionId: actionId,
            recordHistory: recordHistory,
          )
          .toJson();
    case 'transform.resizeBy':
      final value = input as Map, resize = value['resize'] as Map;
      return c.transform
          .resizeBy(
            value['targets'] as Object,
            handle: resize['handle'] as String,
            delta: (resize['delta'] as List).cast<num>(),
            lockAspectRatio: resize['lockAspectRatio'] == true,
            minSize: resize['minSize'] as num? ?? 1,
            actionId: actionId,
            recordHistory: recordHistory,
          )
          .toJson();
    case 'transform.rotateBy':
      final value = input as Map;
      return c.transform
          .rotateBy(
            value['targets'] as Object,
            value['degrees'] as num,
            actionId: actionId,
            recordHistory: recordHistory,
          )
          .toJson();
    case 'transform.beginSession':
      final value = input as Map;
      handles[command['id'] as String] = c.transform.beginSession(
        targets: value['targets'] as Object,
        kind: value['kind'] as String,
        actionId: value['actionId'] as String,
        handle: value['handle'] as String?,
      );
      return {'opened': true};
    case 'transform.preview':
      return (handle('session') as PatchMapTransformSession)
          .preview((input as Map).cast<String, dynamic>())
          .toJson();
    case 'transform.edgePan':
      final value = input as Map;
      return (handle('session') as PatchMapTransformSession)
          .edgePan(
            (value['pointerScreen'] as List).cast<num>(),
            (value['deltaCss'] as List).cast<num>(),
          )
          .toJson();
    case 'transform.commit':
      return (handle('session') as PatchMapTransformSession).commit().toJson();
    case 'transform.cancel':
      return (handle('session') as PatchMapTransformSession).cancel().toJson();
    default:
      throw StateError('Unsupported shared operation ${command['op']}');
  }
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
