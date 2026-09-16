// Shared by the interactive native demo and the Dart VM conformance runner.
// Keep this adapter free of Flutter imports so VM traces use the same commands.
import 'dart:convert';
import 'package:patch_map/src/api/values.dart';
import 'package:patch_map/src/engine/controller.dart';
import 'package:patch_map/src/model/dataset.dart';

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

/// Execute an expected failure as a test outcome, not as a broken demo action.
Future<Map<String, dynamic>> runCheckedCommand(
  PatchMapController c,
  Map<String, dynamic> input,
) async {
  final before = observePublic(c);
  final expected = input['expect'] as Map? ?? {};
  Object? result;
  String? failure;
  try {
    result = await command(c, input);
  } catch (error) {
    final invalid =
        error is ArgumentError ||
        error is PatchMapException &&
            [
              'INVALID_ARGUMENT',
              'INVALID_INPUT',
              'STALE_TARGET',
            ].contains(error.code);
    result = {
      'thrown': {'kind': invalid ? 'invalid-argument' : 'unexpected-error'},
      'message': '$error',
    };
    if (expected['throws'] == null) failure = '$error';
  }
  final after = observePublic(c);
  if (expected['throws'] != null &&
      (result is! Map ||
          (result['thrown'] as Map?)?['kind'] !=
              (expected['throws'] as Map)['kind'])) {
    failure = 'Expected ${expected['throws']}, received $result';
  }
  if (expected['status'] != null &&
      (result is! Map || result['status'] != expected['status'])) {
    failure = 'Expected ${expected['status']}, received $result';
  }
  for (final pair in {
    'semanticHashUnchanged': 'semanticHash',
    'snapshotUnchanged': 'dataset',
    'historyUnchanged': 'history',
  }.entries) {
    if (expected[pair.key] == true &&
        jsonEncode(before[pair.value]) != jsonEncode(after[pair.value]))
      failure = '${pair.key} failed';
  }
  return {
    'commandId': input['id'],
    'ok': failure == null,
    'result': result,
    if (failure != null) 'failure': failure,
  };
}
