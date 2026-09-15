import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:patch_map/patch_map.dart';

void main() => runApp(const BarDemoApp());

/// Interactive device demo. Each of 50 grids contains 4 × 25 bars.
class BarDemoApp extends StatelessWidget {
  const BarDemoApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: ThemeData(colorSchemeSeed: const Color(0xff2563eb)),
    home: const _BarDemoPage(),
  );
}

class _BarDemoPage extends StatefulWidget {
  const _BarDemoPage();
  @override
  State<_BarDemoPage> createState() => _BarDemoPageState();
}

class _BarDemoPageState extends State<_BarDemoPage> {
  static const count = 5000;
  final _targets = List.generate(
    count,
    (i) => 'g${i ~/ 100}.${i % 100 ~/ 25}.${i % 25}',
  );
  final _heights = Float64List(count)..fillRange(0, count, 10);
  PatchMapController? _controller;
  void Function()? _stopViewport;
  bool _ready = false, _animate = true;
  int _seed = 0x5eed, _updates = 0;
  String _status = '맵을 준비하고 있습니다';
  String _camera = '';

  @override
  void initState() {
    super.initState();
    unawaited(_create());
  }

  Future<void> _create() async {
    try {
      final controller = await PatchMap.create(
        fit: false,
        historyLimit: 0,
        selection: {'box': false},
        data: [
          for (var g = 0; g < 50; g++)
            {
              'id': 'g$g',
              'type': 'grid',
              'attrs': {'x': g % 5 * 270, 'y': g ~/ 5 * 110},
              'cells': [for (var row = 0; row < 4; row++) List.filled(25, 1)],
              'gap': {'x': 2, 'y': 4},
              'item': {
                'size': {'width': 8, 'height': 20},
                'components': [
                  {
                    'id': 'bar',
                    'type': 'bar',
                    'size': {'width': 8, 'height': 10},
                    'placement': 'bottom',
                    'source': {
                      'type': 'rect',
                      'fill': g.isEven ? '#2563eb' : '#0d9488',
                      'radius': 3,
                    },
                    'animation': true,
                    'animationDuration': 200,
                  },
                ],
              },
            },
        ],
      );
      if (!mounted) {
        await controller.destroy();
        return;
      }
      setState(() => _controller = controller);
      _stopViewport = controller.viewport.onSettled((state) {
        if (!mounted) return;
        final center = state['centerWorld'] as List;
        setState(() {
          _camera =
              '${((state['scale'] as num) * 100).round()}% · '
              '${(center[0] as num).round()}, ${(center[1] as num).round()}';
        });
      });
      await controller.ready;
      if (!mounted) return;
      controller.viewport.fit();
      setState(() {
        _ready = true;
        _status = '5,000개 bar 준비 완료';
      });
    } catch (error) {
      if (mounted) setState(() => _status = '$error');
    }
  }

  void _changeHeights() {
    final controller = _controller;
    if (!_ready || controller == null) return;
    for (var i = 0; i < count; i++) {
      _seed = (_seed * 1664525 + 1013904223) & 0xffffffff;
      var height = 1.0 + _seed % 20;
      if (height == _heights[i]) height = height % 20 + 1;
      _heights[i] = height;
    }
    try {
      final result = controller.updateBatch(
        {
          'targets': _targets,
          'bar': {'componentId': 'bar', 'height': _heights},
        },
        animate: _animate,
        recordHistory: false,
      );
      setState(() {
        _updates++;
        _status = '변경 $_updates회 · ${result.appliedCount}개 · ${result.status}';
      });
    } catch (error) {
      setState(() => _status = '$error');
    }
  }

  @override
  void dispose() {
    _stopViewport?.call();
    final controller = _controller;
    if (controller != null) unawaited(controller.destroy());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('PatchMap · 5,000 bars')),
    body: SafeArea(
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Text('4 × 25 grid 50개 · 드래그 이동 · 두 손가락 확대/축소'),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: _ready ? _changeHeights : null,
                    child: const Text('전체 높이 랜덤 변경'),
                  ),
                ),
                const SizedBox(width: 8),
                const Text('애니메이션'),
                Switch(
                  value: _animate,
                  onChanged: (value) => setState(() => _animate = value),
                ),
              ],
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              TextButton(
                onPressed: _ready ? () => _controller!.viewport.fit() : null,
                child: const Text('전체 보기'),
              ),
              IconButton(
                tooltip: '축소',
                onPressed: _ready
                    ? () => _controller!.viewport.zoomBy(0.8)
                    : null,
                icon: const Icon(Icons.remove),
              ),
              IconButton(
                tooltip: '확대',
                onPressed: _ready
                    ? () => _controller!.viewport.zoomBy(1.25)
                    : null,
                icon: const Icon(Icons.add),
              ),
              Text(_camera, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
          Expanded(
            child: _controller == null
                ? const Center(child: CircularProgressIndicator())
                : PatchMapView(
                    controller: _controller!,
                    onError: (error) {
                      if (mounted) setState(() => _status = '$error');
                    },
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(_status, maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    ),
  );
}
