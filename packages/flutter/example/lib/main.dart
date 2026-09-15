import 'dart:convert';
import 'package:flutter/material.dart';
import 'shared_fixtures.dart';
import 'package:patch_map/patch_map.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ComparisonApp());
}

class ComparisonApp extends StatelessWidget {
  const ComparisonApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'PatchMap Native',
    theme: ThemeData(
      colorSchemeSeed: const Color(0xff2563eb),
      useMaterial3: true,
    ),
    home: const ComparisonPage(),
  );
}

class ComparisonPage extends StatefulWidget {
  const ComparisonPage({super.key});
  @override
  State<ComparisonPage> createState() => _ComparisonPageState();
}

class _ComparisonPageState extends State<ComparisonPage> {
  PatchMapController? controller;
  Map<String, dynamic>? fixture;
  String fixtureId = 'gallery', status = 'Loading native map';
  int commandIndex = 0, seed = 0x51a7, generation = 0;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    _reset();
  }

  Future<void> _reset() async {
    final request = ++generation;
    setState(() {
      busy = true;
    });
    try {
      final nextFixture =
          jsonDecode(sharedFixtureJson[fixtureId]!) as Map<String, dynamic>;
      final surface = nextFixture['surface'] as Map;
      final next = await PatchMap.create(
        data: nextFixture['dataset'],
        width: (surface['width'] as num).toDouble(),
        height: (surface['height'] as num).toDouble(),
        fit: false,
        assets: (nextFixture['assets'] as List? ?? [])
            .map((v) => Map<String, dynamic>.from(v as Map))
            .toList(),
      );
      if (!mounted || request != generation) {
        await next.destroy();
        return;
      }
      final old = controller;
      setState(() {
        controller = next;
        fixture = nextFixture;
        commandIndex = 0;
        seed = 0x51a7;
        status = 'Native Canvas · $fixtureId';
        busy = false;
      });
      await old?.destroy();
      next.selection.onChange((_) {
        if (mounted) setState(() {});
      });
      await next.ready;
      if (mounted && request == generation)
        setState(() {
          status = 'Ready · $fixtureId';
        });
    } catch (error) {
      if (mounted && request == generation)
        setState(() {
          status = error.toString();
          busy = false;
        });
    }
  }

  void _action(Object? Function(PatchMapController) run) {
    final c = controller;
    if (c == null || busy) return;
    try {
      final result = run(c);
      setState(() {
        status = result is PatchMapResult
            ? jsonEncode(result.toJson())
            : '$result';
      });
    } catch (error) {
      setState(() {
        status = error.toString();
      });
    }
  }

  Future<Object?> _execute(Map<String, dynamic> command) async {
    final c = controller!;
    final input = command['input'];
    final options = command['options'] as Map? ?? {};
    final result = switch (command['op']) {
      'update' => c.update(
        Map<String, dynamic>.from(input as Map),
        actionId: options['actionId'] as String?,
        animate: options['animate'] as bool?,
        recordHistory: options['recordHistory'] as bool? ?? true,
      ),
      'updateBatch' => c.updateBatch(
        Map<String, dynamic>.from(input as Map),
        actionId: options['actionId'] as String?,
        animate: options['animate'],
        recordHistory: options['recordHistory'] as bool? ?? true,
      ),
      'transaction' => c.transaction(
        (input as List).cast<Map<String, dynamic>>(),
        recordHistory: options['recordHistory'] as bool? ?? true,
        actionId: options['actionId'] as String?,
      ),
      'history.undo' => c.history.undo(),
      'history.redo' => c.history.redo(),
      'selection.set' => c.selection.set(input),
      'editor.execute' => c.editor.execute(
        Map<String, dynamic>.from(input as Map),
      ),
      'rotation.set' => c.rotation.set(input as num),
      'rotation.animateTo' =>
        await c.rotation
            .animateTo(
              input as num,
              path: options['path'] as String? ?? 'raw',
              normalizeOnComplete: options['normalizeOnComplete'] == true,
            )
            .finished,
      'viewport.panBy' => c.viewport.panBy((input as List).cast<num>()),
      'viewport.zoomBy' => c.viewport.zoomBy(
        input['factor'] as num,
        (input['anchor'] as List?)?.cast<num>(),
      ),
      'viewport.fit' => c.viewport.fit(
        targets: (input as Map?)?['targets'],
        padding: input?['padding'] ?? 16,
      ),
      'capture.png' => await c.capture.png(),
      _ => throw StateError('Unknown command ${command['op']}'),
    };
    return result is PatchMapResult ? result.toJson() : result;
  }

  Future<void> _step() async {
    final commands = fixture?['commands'] as List? ?? [];
    if (busy || commandIndex >= commands.length) return;
    try {
      final result = await _execute(
        commands[commandIndex] as Map<String, dynamic>,
      );
      if (mounted)
        setState(() {
          commandIndex++;
          status = jsonEncode(result);
        });
    } catch (error) {
      final expected = (commands[commandIndex] as Map)['expect'] as Map?;
      if (mounted)
        setState(() {
          if ((expected?['throws'] as Map?)?['kind'] == 'invalid-argument' &&
              error is PatchMapException &&
              const [
                'INVALID_ARGUMENT',
                'INVALID_INPUT',
              ].contains(error.code)) {
            commandIndex++;
            status = 'Expected rejection: $error';
          } else {
            status = '$error';
          }
        });
    }
  }

  void _heights() => _action((c) {
    final ids = c.targets
        .query({'scope': 'instances'})
        .matches
        .where((m) => m.componentId == null)
        .map((m) => m.id)
        .toList();
    final heights = ids.map((_) {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return 6 + seed % 44;
    }).toList();
    return c.updateBatch({
      'targets': ids,
      'bar': {'componentId': 'bar', 'height': heights},
    }, animate: true);
  });
  Future<void> _capture() async {
    final c = controller;
    if (c == null) return;
    try {
      final png = await c.capture.png();
      if (!mounted) return;
      setState(() => status = 'PNG ${png.size.join(' × ')} logical px');
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Captured map'),
          content: Image.memory(base64Decode(png.dataUrl.split(',').last)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (error) {
      if (mounted) setState(() => status = error.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = controller;
    return Scaffold(
      appBar: AppBar(title: const Text('PatchMap · Native Canvas')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  Expanded(
                    child: DropdownButton<String>(
                      value: fixtureId,
                      isExpanded: true,
                      items:
                          [
                                'gallery',
                                'updates',
                                'editor',
                                'codecs',
                                'alpha-parity',
                              ]
                              .map(
                                (id) => DropdownMenuItem(
                                  value: id,
                                  child: Text(id),
                                ),
                              )
                              .toList(),
                      onChanged: busy
                          ? null
                          : (id) {
                              if (id != null) {
                                fixtureId = id;
                                _reset();
                              }
                            },
                    ),
                  ),
                  TextButton(
                    onPressed: busy ? null : _reset,
                    child: const Text('Reset'),
                  ),
                ],
              ),
            ),
            Wrap(
              spacing: 4,
              children: [
                TextButton(
                  onPressed: busy ? null : _step,
                  child: const Text('Step'),
                ),
                TextButton(
                  onPressed: busy ? null : _heights,
                  child: const Text('Heights'),
                ),
                TextButton(
                  onPressed: () => _action((c) => c.history.undo()),
                  child: const Text('Undo'),
                ),
                TextButton(
                  onPressed: () => _action((c) => c.history.redo()),
                  child: const Text('Redo'),
                ),
                TextButton(
                  onPressed: () async {
                    final c = controller;
                    if (c == null) return;
                    await _execute({
                      'op': 'rotation.animateTo',
                      'input': c.rotation.value + 90,
                    });
                    if (mounted)
                      setState(() => status = 'Rotation ${c.rotation.value}°');
                  },
                  child: const Text('Rotate +90°'),
                ),
                TextButton(
                  onPressed: () => _action((c) => c.rotation.reset()),
                  child: const Text('Reset angle'),
                ),
                TextButton(
                  onPressed: () => _action((c) => c.viewport.fit()),
                  child: const Text('Fit'),
                ),
                TextButton(onPressed: _capture, child: const Text('Capture')),
              ],
            ),
            Expanded(
              child: Center(
                child: c == null
                    ? const CircularProgressIndicator()
                    : FittedBox(
                        fit: BoxFit.contain,
                        child: SizedBox(
                          width: (fixture?['surface']['width'] as num? ?? 480)
                              .toDouble(),
                          height: (fixture?['surface']['height'] as num? ?? 520)
                              .toDouble(),
                          child: PatchMapView(
                            key: ValueKey(c),
                            controller: c,
                            onError: (error) {
                              if (mounted)
                                setState(() => status = error.toString());
                            },
                          ),
                        ),
                      ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    status,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    key: const Key('status'),
                  ),
                  if (c != null)
                    Text(
                      'hash ${c.dataset.semanticHash}\nselection ${c.selection.ids} · step $commandIndex',
                      style: const TextStyle(
                        fontSize: 11,
                        fontFamily: 'monospace',
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    generation++;
    controller?.destroy();
    super.dispose();
  }
}
