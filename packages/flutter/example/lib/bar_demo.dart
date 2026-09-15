import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:patch_map/patch_map.dart';

import 'shared_fixtures.dart';

final _scene =
    jsonDecode(sharedFixtureJson['scenes/panel-groups']!)
        as Map<String, dynamic>;

void main() => runApp(const BarDemoApp());

/// Interactive device demo. Service panel groups: 50 grids of 5 × 20 panels.
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
  static final rows = _scene['rows'] as int;
  static final columns = _scene['columns'] as int;
  static final groups = _scene['groups'] as int;
  static final count = groups * rows * columns;
  static final _grid = _scene['grid'] as Map<String, dynamic>;
  static final _item = _grid['item'] as Map<String, dynamic>;
  static final _size = _item['size'] as Map<String, dynamic>;
  static final fullHeight =
      ((_size['height'] as num) - 2 * (_item['padding'] as num)).toDouble();
  final _targets = List.generate(
    count,
    (i) =>
        'g${i ~/ (rows * columns)}.${i % (rows * columns) ~/ columns}.${i % columns}',
  );
  final _heights = Float64List(count)..fillRange(0, count, fullHeight);
  final _fullHeights = Float64List(count)..fillRange(0, count, fullHeight);
  final _visible = List.filled(count, true);
  final _hidden = List.filled(count, false);
  final _percentages = List.filled(count, 100);
  final _texts = List.filled(count, '0');
  bool _textMode = false;
  PatchMapController? _controller;
  void Function()? _stopViewport;
  bool _ready = false, _animate = true;
  int _seed = _scene['seed'] as int, _updates = 0;
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
        theme: _scene['theme'] as Map<String, dynamic>,
        data: [
          for (var g = 0; g < groups; g++)
            {
              ..._grid,
              'id': 'g$g',
              'attrs': {
                ..._grid['attrs'] as Map<String, dynamic>,
                'x':
                    g %
                    (_scene['groupColumns'] as int) *
                    (columns * (_size['width'] as num) +
                        (columns - 1) * (_grid['gap'] as num) +
                        (_scene['groupGap'] as num)),
                'y':
                    g ~/
                    (_scene['groupColumns'] as int) *
                    (rows * (_size['height'] as num) +
                        (rows - 1) * (_grid['gap'] as num) +
                        (_scene['groupGap'] as num)),
              },
              'cells': [
                for (var row = 0; row < rows; row++) List.filled(columns, 1),
              ],
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
        _status = '5,000개 panel 준비 완료';
      });
    } catch (error) {
      if (mounted) setState(() => _status = '$error');
    }
  }

  void _setMode(bool textMode) {
    final controller = _controller;
    if (!_ready || controller == null || textMode == _textMode) return;
    try {
      final result = controller.updateBatch(
        {
          'targets': _targets,
          'bar': {
            'componentId': 'bar',
            'height': textMode ? _fullHeights : _heights,
          },
          'text': {
            'componentId': 'text',
            'changes': {'show': textMode ? _visible : _hidden},
            'text': _texts,
          },
        },
        animate: false,
        recordHistory: false,
      );
      setState(() {
        if (result.status == 'committed' || result.status == 'unchanged') {
          _textMode = textMode;
        }
        _status =
            '${textMode ? "텍스트" : "높이"} 모드 · ${result.appliedCount}개 · ${result.status}';
      });
    } catch (error) {
      setState(() => _status = '$error');
    }
  }

  void _changeValues() {
    final controller = _controller;
    if (!_ready || controller == null) return;
    for (var i = 0; i < count; i++) {
      _seed = (_seed * 1664525 + 1013904223) & 0xffffffff;
      if (_textMode) {
        var value = 1 + _seed % 9999;
        if ('$value' == _texts[i]) value = value % 9999 + 1;
        _texts[i] = '$value';
      } else {
        var percent = 1 + _seed % 100;
        if (percent == _percentages[i]) percent = percent % 100 + 1;
        _percentages[i] = percent;
        _heights[i] = fullHeight * percent / 100;
      }
    }
    try {
      final result = controller.updateBatch(
        {
          'targets': _targets,
          if (_textMode)
            'text': {'componentId': 'text', 'text': _texts}
          else
            'bar': {'componentId': 'bar', 'height': _heights},
        },
        animate: !_textMode && _animate,
        recordHistory: false,
      );
      setState(() {
        _updates++;
        _status =
            '${_textMode ? "텍스트" : "높이"} 변경 $_updates회 · ${result.appliedCount}개 · ${result.status}';
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
    appBar: AppBar(title: const Text('PatchMap · 5,000 panels')),
    body: SafeArea(
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Text('5 × 20 panelGroup 50개 · 드래그 이동 · 두 손가락 확대/축소'),
          ),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Bar 높이')),
              ButtonSegment(value: true, label: Text('Text 값')),
            ],
            selected: {_textMode},
            onSelectionChanged: _ready
                ? (value) => _setMode(value.single)
                : null,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: _ready ? _changeValues : null,
                    child: Text(_textMode ? '전체 텍스트 랜덤 변경' : '전체 높이 랜덤 변경'),
                  ),
                ),
                const SizedBox(width: 8),
                const Text('애니메이션'),
                Switch(
                  value: _animate,
                  onChanged: _textMode
                      ? null
                      : (value) => setState(() => _animate = value),
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
