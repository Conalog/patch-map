import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:patch_map/patch_map.dart';
import 'bar_demo.dart' as panels;
import 'demo_commands.dart' as commands;
import 'shared_fixtures.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ComparisonApp());
}

final demoCatalog = jsonDecode(sharedFixtureJson['scenes/feature-lab']!) as Map;
final demoScenarios = (demoCatalog['scenarios'] as List).cast<Map>();

class ComparisonApp extends StatelessWidget {
  const ComparisonApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'PatchMap 기능 실험실',
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
  PatchMapController? controller, secondary;
  Map<String, dynamic>? fixture;
  String scenarioId = 'service', status = 'Loading native map';
  int commandIndex = 0, generation = 0, seed = 0x51a7;
  bool busy = false, attached = true, box = false, multiple = true;
  final logs = <Map<String, dynamic>>[];
  final textInput = TextEditingController(text: '직접 입력 · 한글 😀');
  final angleInput = TextEditingController(text: '90');
  final jsonInput = TextEditingController();
  Map<String, dynamic>? lastPointer, lastHover, lastSelectionEvent;
  String? displayMode;
  String brushTrigger = 'toggle';
  Map get scenario => demoScenarios.firstWhere((s) => s['id'] == scenarioId);
  List<Map<String, dynamic>> get steps =>
      ((scenario['commands'] ?? fixture?['commands'] ?? []) as List)
          .cast<Map<String, dynamic>>();
  String pretty(Object? value) =>
      const JsonEncoder.withIndent('  ').convert(value);

  @override
  void initState() {
    super.initState();
    unawaited(_reset());
  }

  Future<void> _reset() async {
    final request = ++generation;
    setState(() {
      busy = true;
      attached = true;
    });
    try {
      final nextFixture =
          jsonDecode(sharedFixtureJson[scenario['fixture']]!)
              as Map<String, dynamic>;
      final surface = nextFixture['surface'] as Map;
      final next = await PatchMap.create(
        data: nextFixture['dataset'],
        width: (surface['width'] as num).toDouble(),
        height: (surface['height'] as num).toDouble(),
        fit: false,
        theme: (nextFixture['theme'] as Map?)?.cast<String, dynamic>(),
        selection: {
          'allowMultiple': multiple,
          'brush': {
            'longPress': brushTrigger == 'manual'
                ? false
                : {'behavior': brushTrigger, 'delayMs': 500},
          },
          'box': box ? {'activationModifier': 'none'} : false,
        },
        pointer: {
          'tooltip': {'pinOnContextMenu': true},
        },
        assets: (nextFixture['assets'] as List? ?? [])
            .map((v) => Map<String, dynamic>.from(v as Map))
            .toList(),
      );
      if (!mounted || request != generation) {
        await next.destroy();
        return;
      }
      final old = controller, oldSecondary = secondary;
      setState(() {
        controller = next;
        secondary = null;
        fixture = nextFixture;
        commandIndex = 0;
        displayMode = null;
        seed = 0x51a7;
        logs.clear();
        lastPointer = null;
        lastHover = null;
        lastSelectionEvent = null;
        status = 'Loading · $scenarioId';
      });
      await old?.destroy();
      await oldSecondary?.destroy();
      next.selection.brush.onChange((_) {
        if (mounted && controller == next) setState(() {});
      });
      next.selection.onChange((_) {
        if (mounted && controller == next) setState(() {});
      });
      next.pointer.onHover((value) {
        lastHover = value;
      });
      next.selection.onPointerChange((value) {
        lastSelectionEvent = value;
      });
      next.pointer.onTooltip((value) {
        if (mounted && controller == next) setState(() => lastPointer = value);
      });
      await next.ready;
      if (scenario['initialFit'] != null && mounted && request == generation)
        next.viewport.fit(targets: scenario['initialFit']);
      if (mounted && request == generation)
        setState(() {
          busy = false;
          status = 'Ready · $scenarioId';
        });
    } catch (error) {
      if (mounted && request == generation)
        setState(() {
          status = '$error';
          busy = false;
        });
    }
  }

  Future<void> _action(
    String label,
    FutureOr<Object?> Function(PatchMapController) run,
  ) async {
    final c = controller, request = generation;
    if (c == null || busy) return;
    if (!attached) {
      setState(() => status = '뷰를 먼저 재연결하세요.');
      return;
    }
    if (!label.startsWith('서비스 ')) displayMode = null;
    setState(() => busy = true);
    try {
      final result = await run(c);
      if (!mounted || request != generation) return;
      setState(() {
        final value = result is PatchMapResult ? result.toJson() : result;
        logs.add({'action': label, 'result': value});
        if (logs.length > 100) logs.removeAt(0);
        status = '$label: ${jsonEncode(value)}';
      });
    } catch (error) {
      if (mounted && request == generation)
        setState(() {
          status = '$label 실패: $error';
          logs.add({'action': label, 'error': '$error'});
          if (logs.length > 100) logs.removeAt(0);
        });
    } finally {
      if (mounted && request == generation) setState(() => busy = false);
    }
  }

  Future<void> _step() => _action('단계 ${commandIndex + 1}', (c) async {
    if (commandIndex >= steps.length) return '모든 단계 완료';
    final result = await commands.runCheckedCommand(c, steps[commandIndex]);
    if (result['ok'] == true) commandIndex++;
    return result;
  });

  Future<void> _runAll() => _action('남은 단계 실행', (c) async {
    final results = <Map<String, dynamic>>[];
    while (commandIndex < steps.length && mounted && controller == c) {
      final result = await commands.runCheckedCommand(c, steps[commandIndex]);
      results.add(result);
      if (result['ok'] != true) return {'ok': false, 'steps': results};
      commandIndex++;
      // Render each accepted step; no permanent timer or per-frame inspector.
      await WidgetsBinding.instance.endOfFrame;
    }
    return {'ok': true, 'steps': results};
  });

  Future<void> _replay(int index) async {
    if (busy) return;
    await _reset();
    if (!mounted || controller == null || busy) return;
    await _action('선택 단계까지 재현', (c) async {
      while (commandIndex <= index) {
        final result = await commands.runCheckedCommand(c, steps[commandIndex]);
        if (result['ok'] != true) return result;
        commandIndex++;
        await WidgetsBinding.instance.endOfFrame;
      }
      return {'ok': true, 'commandId': steps[index]['id']};
    });
  }

  Future<void> _capture() => _action('PNG 캡처', (c) async {
    final png = await c.capture.png();
    if (mounted)
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('PNG ${png.size.join(' × ')}'),
          content: Image.memory(base64Decode(png.dataUrl.split(',').last)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('닫기'),
            ),
          ],
        ),
      );
    return {'size': png.size};
  });

  Future<void> _inspect() async {
    final c = controller;
    if (c == null || busy) return;
    final value = pretty({
      ...commands.observePublic(c),
      'debug': c.debug.snapshot(),
      'pointer': lastPointer,
      'hover': lastHover,
      'selectionEvent': lastSelectionEvent,
      'log': logs,
    });
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('현재 상태 · 실행 기록'),
        content: SizedBox(
          width: 650,
          child: SingleChildScrollView(
            child: SelectableText(
              value,
              style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Clipboard.setData(ClipboardData(text: value)),
            child: const Text('복사'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('닫기'),
          ),
        ],
      ),
    );
  }

  Widget _button(String label, VoidCallback run) =>
      OutlinedButton(onPressed: busy ? null : run, child: Text(label));
  Widget _map(PatchMapController c) {
    final bounds = c.viewport.state['screenBounds'] as List;
    return Center(
      child: FittedBox(
        child: SizedBox(
          width: (bounds[2] as num).toDouble(),
          height: (bounds[3] as num).toDouble(),
          child: PatchMapView(
            key: ValueKey(c),
            controller: c,
            resizeMode: PatchMapResizeMode.manual,
            onError: (error) {
              if (mounted) setState(() => status = '렌더 오류: $error');
            },
          ),
        ),
      ),
    );
  }

  Future<void> _serviceDisplay(String mode) => _action('서비스 $mode', (c) {
    final modes = fixture!['displayModes'] as Map;
    final patch = (jsonDecode(jsonEncode(modes[mode])) as Map)
        .cast<String, dynamic>();
    final ids = c.targets
        .query({'type': 'grid-cell', 'scope': 'instances'})
        .matches
        .map((m) => m.id)
        .toList();
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    if (mode == 'text')
      (patch['text'] as Map)['text'] = List.generate(
        ids.length,
        (i) => '${100 + (seed + i * 17) % 900}',
      );
    if (mode == 'bar')
      (patch['bar'] as Map)['height'] = List.generate(
        ids.length,
        (i) => 1 + (seed + i * 17) % 74,
      );
    if (displayMode == mode && (mode == 'bar' || mode == 'text')) {
      final value = (patch[mode] as Map)[mode == 'bar' ? 'height' : 'text'];
      patch.clear();
      patch[mode] = {
        if (mode == 'text') 'componentId': 'text',
        mode == 'bar' ? 'height' : 'text': value,
      };
    }
    for (final component in patch.values.cast<Map>()) {
      for (final key in component.keys.toList()) {
        final value = component[key];
        if (key == 'componentId') continue;
        if (key == 'changes') {
          component[key] = (value as Map).map(
            (k, v) => MapEntry(k, List.filled(ids.length, v)),
          );
        } else if (value is! List) {
          component[key] = List.filled(ids.length, value);
        }
      }
    }
    final result = c.updateBatch(
      {'targets': ids, ...patch},
      animate: mode == 'bar',
      recordHistory: false,
    );
    displayMode = ['committed', 'unchanged'].contains(result.status)
        ? mode
        : null;
    return result;
  });

  Widget _controls() => ListView(
    key: const Key('demo-controls'),
    padding: const EdgeInsets.all(12),
    children: [
      if (controller != null) ...[
        Text(
          '브러시 ${controller!.selection.brush.state.enabled ? "켜짐" : "꺼짐"} · ${controller!.selection.brush.state.drawing ? "선택 중" : "대기"}',
          key: const Key('brush-state'),
        ),
        Wrap(
          spacing: 6,
          children: [
            _button('브러시 켜기', () => controller!.selection.brush.enable()),
            _button('브러시 끄기', () => controller!.selection.brush.disable()),
            _button('브러시 토글', () => controller!.selection.brush.toggle()),
            DropdownButton<String>(
              value: brushTrigger,
              items: const [
                DropdownMenuItem(value: 'toggle', child: Text('롱프레스 토글')),
                DropdownMenuItem(value: 'hold', child: Text('누르는 동안 브러시')),
                DropdownMenuItem(value: 'manual', child: Text('버튼으로만 제어')),
              ],
              onChanged: busy
                  ? null
                  : (v) {
                      brushTrigger = v!;
                      _reset();
                    },
            ),
          ],
        ),
        const Text(
          '패널을 0.5초 길게 눌러 브러시 모드를 전환합니다. 켜진 상태에서 쓸어 선택하고, 선택된 패널에서 시작하면 해제합니다.',
        ),
      ],
      Text(scenario['hint'] as String),
      if (scenario['kind'] == 'service') ...[
        const Text(
          'patch-service e6e3e0093 · 50그룹 / 5 × 20 · 예제 배치·측정값',
          style: TextStyle(fontSize: 11),
        ),
        Wrap(
          spacing: 6,
          children: [
            _button(
              '첫 그룹',
              () => _action(
                '첫 그룹',
                (c) => c.viewport.fit(
                  targets: ['g0', 'text', 'combiner-0', 'inverter-0'],
                ),
              ),
            ),
            _button('전체 Bar 높이', () => _serviceDisplay('bar')),
            _button('전체 Text 값', () => _serviceDisplay('text')),
            _button('데이터 없음', () => _serviceDisplay('noData')),
            _button('통신 상태', () => _serviceDisplay('wifi')),
            _button('오류 상태', () => _serviceDisplay('error')),
          ],
        ),
      ],
      const SizedBox(height: 12),
      Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          _button(
            'Heights',
            () => _action('높이 변경', (c) {
              seed = (seed * 1664525 + 1013904223) & 0xffffffff;
              final ids = c.targets
                  .query({'type': 'grid-cell', 'scope': 'instances'})
                  .matches
                  .map((m) => m.id)
                  .toList();
              return scenarioId == 'animation' || ids.isEmpty
                  ? c.update({
                      'id': 'item',
                      'bar': {'height': 6 + seed % 75},
                    }, animate: true)
                  : c.updateBatch({
                      'targets': ids,
                      'bar': {
                        'height': List.generate(
                          ids.length,
                          (i) => 6 + (seed + i * 17) % 44,
                        ),
                      },
                    }, animate: true);
            }),
          ),
          _button('Undo', () => _action('Undo', (c) => c.history.undo())),
          _button('Redo', () => _action('Redo', (c) => c.history.redo())),
          _button(
            'Rotate +90°',
            () => _action(
              '회전',
              (c) async =>
                  (await c.rotation.animateTo(c.rotation.value + 90).finished)
                      .toJson(),
            ),
          ),
          _button(
            'Reset angle',
            () => _action('각도 초기화', (c) => c.rotation.reset()),
          ),
          _button('Fit', () => _action('전체 보기', (c) => c.viewport.fit())),
          _button('확대', () => _action('확대', (c) => c.viewport.zoomBy(1.25))),
          _button('축소', () => _action('축소', (c) => c.viewport.zoomBy(0.8))),
          _button(
            '오른쪽 이동',
            () => _action('이동', (c) => c.viewport.panBy([40, 0])),
          ),
          _button('선택 해제', () => _action('선택 해제', (c) => c.selection.clear())),
          _button('Capture', _capture),
          _button('상태·기록', _inspect),
        ],
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: TextField(
              controller: angleInput,
              keyboardType: const TextInputType.numberWithOptions(
                signed: true,
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: '회전 각도 (예: 720, -90)',
              ),
            ),
          ),
          _button(
            '각도 적용',
            () => _action(
              '지정 회전',
              (c) async =>
                  (await c.rotation
                          .animateTo(num.parse(angleInput.text))
                          .finished)
                      .toJson(),
            ),
          ),
        ],
      ),
      Row(
        children: [
          Expanded(
            child: TextField(
              controller: textInput,
              decoration: const InputDecoration(labelText: 'text 요소 값'),
            ),
          ),
          _button(
            '텍스트 적용',
            () => _action(
              '텍스트',
              (c) => c.update({
                'id': 'text',
                'changes': {'text': textInput.text},
              }),
            ),
          ),
        ],
      ),
      SwitchListTile(
        title: const Text('드래그로 박스 선택'),
        subtitle: const Text('변경 시 장면이 초기화됩니다'),
        value: box,
        onChanged: busy
            ? null
            : (v) {
                box = v;
                _reset();
              },
      ),
      SwitchListTile(
        title: const Text('다중 선택 허용'),
        value: multiple,
        onChanged: busy
            ? null
            : (v) {
                multiple = v;
                _reset();
              },
      ),
      const Divider(),
      const Text(
        '수명주기 · 실제 앱 조작',
        style: TextStyle(fontWeight: FontWeight.bold),
      ),
      Wrap(
        spacing: 6,
        children: [
          _button('빈 데이터', () => _action('빈 데이터', (c) => c.data.replace([]))),
          _button(
            attached ? '뷰 분리' : '뷰 재연결',
            () => setState(() => attached = !attached),
          ),
          _button(
            secondary == null ? '두 번째 맵' : '두 번째 맵 해제',
            () => _action('다중 인스턴스', (c) async {
              if (secondary != null) {
                final old = secondary!;
                setState(() => secondary = null);
                await old.destroy();
                return '해제됨';
              }
              final next = await PatchMap.create(
                data: fixture!['dataset'],
                width: 480,
                height: 520,
                fit: false,
                theme: (fixture!['theme'] as Map?)?.cast<String, dynamic>(),
                assets: (fixture!['assets'] as List? ?? [])
                    .map((a) => Map<String, dynamic>.from(a as Map))
                    .toList(),
              );
              if (!mounted || c != controller) {
                await next.destroy();
                return '취소됨';
              }
              setState(() => secondary = next);
              await next.ready;
              if (scenario['initialFit'] != null)
                next.viewport.fit(targets: scenario['initialFit']);
              return '독립 인스턴스 생성됨';
            }),
          ),
          _button(
            '5천·1만 패널 데모',
            () => Navigator.push(
              context,
              MaterialPageRoute<void>(
                builder: (_) => const panels.BarDemoApp(),
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),
      const Text('직접 명령 실행 · public API 어댑터'),
      TextField(
        controller: jsonInput,
        minLines: 3,
        maxLines: 8,
        decoration: const InputDecoration(
          hintText: '{"id":"custom","op":"rotation.set","input":45}',
          border: OutlineInputBorder(),
        ),
      ),
      _button(
        'JSON 실행',
        () => _action(
          '직접 명령',
          (c) => commands.runCheckedCommand(
            c,
            (jsonDecode(jsonInput.text) as Map).cast<String, dynamic>(),
          ),
        ),
      ),
    ],
  );

  Widget _steps() => ListView(
    padding: const EdgeInsets.all(12),
    children: [
      Text(
        '순서가 있는 시나리오입니다. 단계를 누르면 초기화 후 그 단계까지 재현합니다. 자유 조작 후에는 Reset으로 원래 상태를 복원하세요.',
      ),
      Wrap(
        spacing: 8,
        children: [_button('Step', _step), _button('남은 단계 실행', _runAll)],
      ),
      if (steps.isEmpty)
        const Padding(
          padding: EdgeInsets.all(16),
          child: Text('자동 단계가 없는 시각·수동 시나리오입니다. 조작 탭의 안내를 따라 확인하세요.'),
        ),
      for (var i = 0; i < steps.length; i++)
        ExpansionTile(
          key: ValueKey('$scenarioId-${steps[i]['id']}'),
          leading: Icon(
            i < commandIndex
                ? Icons.check_circle
                : Icons.radio_button_unchecked,
            color: i < commandIndex ? Colors.green : null,
          ),
          title: Text('${i + 1}. ${steps[i]['id']}'),
          subtitle: Text('${steps[i]['op']}'),
          children: [
            SelectableText(
              pretty(steps[i]),
              style: const TextStyle(fontSize: 11),
            ),
            _button('여기까지 재현', () => _replay(i)),
          ],
        ),
    ],
  );

  Widget _checklist() {
    final requirements =
        (jsonDecode(sharedFixtureJson['manifest']!) as Map)['requirements']
            as List;
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        const Text(
          '72개 계약 체크리스트\n데모 실행은 전체 회귀 테스트 통과를 의미하지 않습니다. OS 입력·네트워크 실패·정리 경쟁 등은 아래 연결된 자동 테스트 또는 수동 절차로 검증합니다.',
        ),
        for (final raw in requirements)
          ExpansionTile(
            title: Text(raw['id'] as String),
            children: [
              Padding(
                padding: const EdgeInsets.all(8),
                child: SelectableText(
                  '${raw['document']}\n\n${(raw['cases'] as List).join('\n')}',
                ),
              ),
            ],
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = controller;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('PatchMap 기능 실험실'),
          actions: [
            IconButton(
              tooltip: '회전 중지',
              onPressed: controller == null
                  ? null
                  : () => controller!.rotation.set(controller!.rotation.value),
              icon: const Icon(Icons.stop_circle_outlined),
            ),
            IconButton(
              tooltip: '상태·기록',
              onPressed: busy ? null : _inspect,
              icon: const Icon(Icons.data_object),
            ),
          ],
        ),
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    Expanded(
                      child: DropdownButton<String>(
                        key: const Key('scenario-selector'),
                        isExpanded: true,
                        value: scenarioId,
                        items: demoScenarios
                            .map(
                              (s) => DropdownMenuItem(
                                value: s['id'] as String,
                                child: Text(s['title'] as String),
                              ),
                            )
                            .toList(),
                        onChanged: busy
                            ? null
                            : (id) {
                                if (id != null) {
                                  scenarioId = id;
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
              Expanded(
                flex: 5,
                child: ColoredBox(
                  color: const Color(0xffe2e8f0),
                  child: !attached
                      ? const Center(child: Text('뷰가 분리되었습니다. 조작 탭에서 재연결하세요.'))
                      : c == null
                      ? const Center(child: CircularProgressIndicator())
                      : Row(
                          children: [
                            Expanded(child: _map(c)),
                            if (secondary != null)
                              Expanded(child: _map(secondary!)),
                          ],
                        ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      status,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      key: const Key('status'),
                    ),
                    if (c != null)
                      Text(
                        'selection ${c.selection.ids.length}개 ${c.selection.ids.take(4).toList()} · step $commandIndex / ${steps.length}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11),
                      ),
                  ],
                ),
              ),
              const TabBar(
                tabs: [
                  Tab(text: '조작'),
                  Tab(text: '시나리오'),
                  Tab(text: '전체 체크리스트'),
                ],
              ),
              Expanded(
                flex: 4,
                child: TabBarView(
                  children: [_controls(), _steps(), _checklist()],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    generation++;
    controller?.destroy();
    secondary?.destroy();
    textInput.dispose();
    angleInput.dispose();
    jsonInput.dispose();
    super.dispose();
  }
}
