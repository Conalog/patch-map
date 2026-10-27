import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/material.dart';

import 'mobile_replay/fixture.dart';
import 'mobile_replay/sync_replay.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(MobileSyncApp(fixture: await MobileReplayFixture.load()));
}

class MobileSyncApp extends StatefulWidget {
  const MobileSyncApp({super.key, required this.fixture});
  final MobileReplayFixture fixture;

  @override
  State<MobileSyncApp> createState() => _MobileSyncAppState();
}

class _MobileSyncAppState extends State<MobileSyncApp> {
  late final replay = SyncReplay(widget.fixture);
  bool busy = false;
  String? error;

  Future<void> run(Future<void> Function() operation) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await operation();
    } catch (exception) {
      if (mounted) setState(() => error = '$exception');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    replay.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    home: Scaffold(
      appBar: AppBar(title: const Text('지도 · 앱 완료 동기화')),
      body: SafeArea(
        child: Column(
          children: [
            Wrap(
              spacing: 8,
              children: [
                for (final entry in const {
                  SyncReplayCase.normal: '정상 완료',
                  SyncReplayCase.partial: '부분 실패',
                  SyncReplayCase.superseded: '최신 요청 대체',
                  SyncReplayCase.replaced: '도면 교체 중단',
                }.entries)
                  OutlinedButton(
                    onPressed: busy || replay.phase == SyncReplayPhase.preparing
                        ? null
                        : () => run(() => replay.run(entry.key)),
                    child: Text(entry.value),
                  ),
              ],
            ),
            Expanded(
              child: PatchMapView(
                controller: replay.map,
                colors: widget.fixture.colors,
                symbols: widget.fixture.symbols,
                onAttached: (_) =>
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) run(() => replay.replace());
                    }),
                onImageFailure: replay.imageFailures.addAll,
                loadingBuilder: (_) =>
                    const Center(child: CircularProgressIndicator()),
              ),
            ),
            SizedBox(
              height: 220,
              child: AnimatedBuilder(
                animation: replay,
                builder: (context, _) => SingleChildScrollView(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('앱 상태: ${replay.phase.name} / 도면 ${replay.epoch}'),
                      if (error != null) Text(error!),
                      if (replay.phase == SyncReplayPhase.ready ||
                          replay.phase == SyncReplayPhase.partial)
                        for (final entry in replay.rows.entries)
                          Text(
                            '${entry.key}: 숫자 ${entry.value.text}, 막대 ${entry.value.height}'
                            '${replay.failedItems.contains(entry.key) ? ' · 실패, 이전 값 유지' : ''}',
                          )
                      else
                        const Text('동기화 대기 · 이전 앱 값을 최신 값으로 표시하지 않음'),
                      const Divider(),
                      for (final receipt in replay.receipts.reversed.take(5))
                        Text(
                          '도면 ${receipt.epoch} / 요청 ${receipt.request}: '
                          '${receipt.result.outcome.name}, 대체=${receipt.result.superseded}'
                          '${receipt.result.interruption == null ? '' : ', ${receipt.result.interruption!.name}'}',
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
