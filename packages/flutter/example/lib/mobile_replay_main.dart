import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/material.dart';

import 'mobile_replay/fixture.dart';
import 'mobile_replay/replay.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(MobileReplayApp(fixture: await MobileReplayFixture.load()));
}

/// A separate entry point keeps consumer policy out of the 10k benchmark.
class MobileReplayApp extends StatefulWidget {
  const MobileReplayApp({super.key, required this.fixture});
  final MobileReplayFixture fixture;
  @override
  State<MobileReplayApp> createState() => _MobileReplayAppState();
}

class _MobileReplayAppState extends State<MobileReplayApp> {
  late final replay = MobileReplay(widget.fixture);
  String status = '모바일 호출 흐름 준비 중';
  String panelState = 'dataChart', inverterState = 'pending';
  bool busy = false, routerVisible = true;

  Future<void> run(Future<void> Function() operation) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await operation();
      if (mounted) setState(() => status = replay.log.lastOrNull ?? '완료');
    } catch (error) {
      if (mounted) setState(() => status = '$error');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void action(VoidCallback callback) {
    try {
      callback();
      status = replay.log.lastOrNull ?? '완료';
    } catch (error) {
      status = '$error';
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    theme: ThemeData(
      colorSchemeSeed: const Color(0xff0c73bf),
      useMaterial3: true,
    ),
    home: Scaffold(
      appBar: AppBar(title: const Text('모바일 연동 재현')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 2,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  DropdownButton<String>(
                    value: panelState,
                    items: [
                      for (final state in widget.fixture.panelStates)
                        DropdownMenuItem(value: state, child: Text(state)),
                    ],
                    onChanged: busy
                        ? null
                        : (value) => run(() async {
                            panelState = value!;
                            await replay.metrics(replay.generation, panelState);
                          }),
                  ),
                  DropdownButton<String>(
                    value: inverterState,
                    items: [
                      for (final state in [
                        'pending',
                        'registered',
                        'monitoring',
                        'failed',
                      ])
                        DropdownMenuItem(
                          value: state,
                          child: Text('INV $state'),
                        ),
                    ],
                    onChanged: busy
                        ? null
                        : (value) => run(() async {
                            inverterState = value!;
                            MobileReplay.check(
                              await replay.map.updateValues(
                                widget.fixture.inverterUpdates(inverterState),
                              ),
                            );
                            replay.record('인버터: $inverterState');
                          }),
                  ),
                  FilledButton(
                    onPressed: busy
                        ? null
                        : () => run(() async {
                            final old = replay.generation;
                            await replay.replace(
                              replay.beginDateChange(),
                              next: !replay.alternate,
                            );
                            await replay.metrics(old, 'noData');
                            inverterState = 'pending';
                          }),
                    child: const Text('날짜 / 도면 교체'),
                  ),
                  OutlinedButton(
                    onPressed: busy
                        ? null
                        : () => action(() {
                            replay.highlight([
                              'panel-grid.0.0',
                              'panel-grid.0.1',
                            ]);
                          }),
                    child: const Text('필터 강조'),
                  ),
                  OutlinedButton(
                    onPressed: busy
                        ? null
                        : () => action(() {
                            replay.highlight(['inverter-map-1']);
                          }),
                    child: const Text('메모 강조'),
                  ),
                  TextButton(
                    onPressed: busy
                        ? null
                        : () => action(() => replay.highlight([])),
                    child: const Text('강조 해제'),
                  ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Checkbox(
                        value: replay.highlightedOnly,
                        onChanged: busy || replay.highlighted.isEmpty
                            ? null
                            : (v) => action(() => replay.setSelectionScope(v!)),
                      ),
                      const Text('강조 안에서만 선택'),
                    ],
                  ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Checkbox(
                        value: routerVisible,
                        onChanged: busy
                            ? null
                            : (v) => action(() {
                                routerVisible = v!;
                                replay.setVisible('router', routerVisible);
                              }),
                      ),
                      const Text('Router 표시'),
                    ],
                  ),
                  TextButton(
                    onPressed: busy
                        ? null
                        : () => action(() {
                            replay.focusSelection();
                          }),
                    child: const Text('시트 위로 포커스'),
                  ),
                  TextButton(
                    onPressed: busy
                        ? null
                        : () => action(() {
                            MobileReplay.check(replay.map.fit());
                            replay.record('fit (회전 유지)');
                          }),
                    child: const Text('전체 맞춤'),
                  ),
                  TextButton(
                    onPressed: busy
                        ? null
                        : () => action(() {
                            final id =
                                replay.map.selected.firstOrNull?.id ??
                                'panel-grid.0.0';
                            replay.record(
                              '$id: world=${replay.map.getGeometry(id)?.bounds}, local=${replay.screenBounds(id)}',
                            );
                          }),
                    child: const Text('위치 조회'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PatchMapView(
                controller: replay.map,
                colors: widget.fixture.colors,
                symbols: widget.fixture.symbols,
                onAttached: (_) =>
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) {
                        run(() async {
                          await replay.replace(replay.beginDateChange());
                        });
                      }
                    }),
                eventFilter: replay.allows,
                onEvent: (event) {
                  replay.onEvent(event);
                  if (event.kind == PatchMapInputKind.tap && mounted) {
                    setState(() => status = replay.log.lastOrNull ?? status);
                  }
                },
                onImageFailure: (failures) {
                  replay.imageFailures.addAll(failures);
                  if (mounted) {
                    setState(
                      () => status = failures.map((e) => e.message).join('\n'),
                    );
                  }
                },
                selectionStyle: const PatchMapSelectionStyle(
                  color: Color(0xffef4444),
                  displayMode: PatchMapSelectionDisplayMode.elementOnly,
                ),
                loadingBuilder: (_) =>
                    const Center(child: CircularProgressIndicator()),
              ),
            ),
            SizedBox(
              height: 112,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(8),
                child: Text(
                  '$status\n선택: ${replay.map.selected.map((e) => e.id).join(', ')}\n'
                  '실제 WebView 생성 결과·SVG / 배치·ID·시각은 재현용. 운영 서버 캡처 아님.',
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
