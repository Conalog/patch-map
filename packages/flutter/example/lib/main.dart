import 'dart:async';
import 'dart:math' as math;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/material.dart';

import 'measurement.dart';
import 'workload.dart';

const _benchmark = bool.fromEnvironment('PATCHMAP_BENCHMARK');
const _samples = int.fromEnvironment('PATCHMAP_SAMPLES', defaultValue: 5);
const _changedPercent = int.fromEnvironment(
  'PATCHMAP_CHANGED_PERCENT',
  defaultValue: 100,
);
const _warmup = int.fromEnvironment('PATCHMAP_WARMUP', defaultValue: 2);
const _layoutFilter = String.fromEnvironment(
  'PATCHMAP_LAYOUT',
  defaultValue: 'all',
);
const _viewFilter = String.fromEnvironment(
  'PATCHMAP_VIEW',
  defaultValue: 'all',
);
const _workloadFilter = String.fromEnvironment(
  'PATCHMAP_WORKLOAD',
  defaultValue: 'all',
);

void main() => runApp(const PatchMapExampleApp());

class PatchMapExampleApp extends StatelessWidget {
  const PatchMapExampleApp({
    super.key,
    this.itemCount = 10000,
    this.autoStart = true,
  });
  final int itemCount;
  final bool autoStart;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'PatchMap 10k native',
    theme: ThemeData(useMaterial3: true),
    home: _Experiment(count: itemCount, autoStart: autoStart),
  );
}

class _Experiment extends StatefulWidget {
  const _Experiment({required this.count, required this.autoStart});
  final int count;
  final bool autoStart;
  @override
  State<_Experiment> createState() => _ExperimentState();
}

class _ExperimentState extends State<_Experiment>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  final _controller = PatchMapController();
  final Measurements _measurements = Measurements();
  MapWorkload? _scene;
  MapLayout _layout = MapLayout.grid;
  UpdateWorkload _mode = UpdateWorkload.number;
  Size _viewport = Size.zero;
  Timer? _stress;
  late final AnimationController _motion =
      AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 400),
      )..addListener(() {
        _controller.setCamera(
          center: Offset.lerp(_motionFrom, _motionTo, _motion.value),
        );
      });
  Offset _motionFrom = Offset.zero, _motionTo = Offset.zero;
  int _sequence = 0, _inFlight = 0, _epoch = 0;
  bool _attached = true, _busy = false, _running = false, _first = true;
  String _status = 'Ready; tap an item to toggle selection.';
  Measurement? _last;

  bool _pendingStart = false, _startScheduled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeMetrics() => _scheduleStart();

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _epoch++;
    _stress?.cancel();
    _motion.dispose();
    _measurements.close();
    super.dispose();
  }

  void _onAttached(PatchMapController controller) {
    _pendingStart = widget.autoStart;
    _scheduleStart();
  }

  void _scheduleStart() {
    if (!_pendingStart || _startScheduled || !mounted) return;
    _startScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((timestamp) {
      _startScheduled = false;
      if (!mounted || !_pendingStart || !_attached) return;
      final view = View.of(context);
      final valid =
          !_viewport.isEmpty &&
          _viewport.isFinite &&
          !view.physicalSize.isEmpty &&
          view.physicalSize.isFinite &&
          view.devicePixelRatio.isFinite &&
          view.devicePixelRatio > 0 &&
          MediaQuery.devicePixelRatioOf(context) == view.devicePixelRatio;
      if (!valid) return; // Layout/metrics changes schedule the next attempt.
      if (timestamp == Duration.zero) {
        _scheduleStart();
        WidgetsBinding.instance.scheduleFrame();
        return;
      }
      _pendingStart = false;
      if (_benchmark && _first) {
        _first = false;
        unawaited(_runBenchmark());
      } else {
        unawaited(_replace());
      }
    });
  }

  Future<Measurement> _record(
    String id,
    Future<PatchMapResult> Function() submit, {
    Map<String, Object?> tags = const {},
    bool emit = false,
    Future<void> Function()? activity,
  }) async {
    final epoch = _epoch;
    final sample = await _measurements.request(
      id,
      submit,
      tags: tags,
      emit: emit,
      activity: activity,
    );
    if (mounted && epoch == _epoch) {
      void updateStatus() {
        _last = sample;
        final failures = sample.result.failures;
        _status =
            '$id: ${sample.result.outcome.name}'
            '${failures.isEmpty ? '' : ' (${failures.first.code}: ${failures.first.message})'}';
      }

      // Automated samples must not inherit a status repaint from the previous
      // request. The final benchmark setState publishes the latest status.
      if (_running) {
        updateStatus();
      } else {
        setState(updateStatus);
      }
    }
    return sample;
  }

  Future<void> _replace({
    bool emit = false,
    UpdateWorkload? mode,
    bool preserveCamera = false,
    bool record = true,
  }) async {
    if (_busy || !_controller.isAttached) return;
    final epoch = _epoch;
    final center = preserveCamera
        ? _controller.toWorld(_viewport.center(Offset.zero))
        : null;
    final origin = _controller.toWorld(Offset.zero);
    final unit = _controller.toWorld(const Offset(1, 0));
    final vector = origin != null && unit != null ? unit - origin : null;
    final scale = vector != null && vector.distance > 0
        ? 1 / vector.distance
        : null;
    final rotation = vector == null ? null : -math.atan2(vector.dy, vector.dx);
    setState(() => _busy = true);
    final generation = Stopwatch()..start();
    final candidate = MapWorkload(
      _layout,
      count: widget.count,
      mode: mode ?? _mode,
    );
    generation.stop();
    try {
      final result = record
          ? (await _record(
              'draw',
              () => _controller.draw(candidate.data),
              emit: emit,
              tags: {
                'stage': _scene == null ? 'firstPreparation' : 'replacement',
                'layout': _layout.name,
                'mode': candidate.mode.name,
                'fixture': MapWorkload.fixtureId,
                'count': widget.count,
                'devices': candidate.deviceIds.length,
                'seed': candidate.seed,
                ..._cameraMetadata(),
                'generationUs': generation.elapsedMicroseconds,
              },
            )).result
          : await _controller.draw(candidate.data);
      if (!mounted || epoch != _epoch) return;
      if (result.outcome == PatchMapOutcome.applied ||
          result.outcome == PatchMapOutcome.partialFailure) {
        _scene = candidate;
        _mode = candidate.mode;
        _sequence = 0;
        if (center != null && scale != null) {
          _controller.setCamera(
            center: center,
            scale: scale,
            rotation: rotation,
          );
        } else {
          _controller.fit(padding: const EdgeInsets.all(12));
        }
      }
    } catch (error) {
      if (mounted) setState(() => _status = '$error');
    } finally {
      if (mounted && epoch == _epoch) setState(() => _busy = false);
    }
  }

  Future<void> _manualUpdate(UpdateWorkload kind) async {
    if (_busy || _inFlight > 0) return;
    if (_scene?.mode != kind) {
      // Scene admission and camera restoration finish before the update clock.
      await _replace(mode: kind, preserveCamera: true, record: false);
    }
    if (!mounted || _scene?.mode != kind) return;
    await _update(kind);
  }

  Future<Measurement?> _update(
    UpdateWorkload kind, {
    bool emit = false,
    String stage = 'manual',
    String view = 'manual',
    int? sequence,
    bool pan = false,
    int? changedPercent,
  }) async {
    final scene = _scene;
    if (scene == null || !_controller.isAttached || _busy) return null;
    final number = sequence ?? _sequence++;
    final generation = Stopwatch()..start();
    final values = changedPercent == null
        ? scene.updates(kind, number)
        : scene.benchmarkUpdates(kind, number, changedPercent: changedPercent);
    generation.stop();
    _inFlight++;
    try {
      return await _record(
        '${scene.layout.name}/$view/${kind.name}/$number',
        () => _controller.updateValues(values),
        emit: emit,
        activity: pan ? () => _panContinuously(number.isEven ? 1 : -1) : null,
        tags: {
          'stage': stage,
          'layout': scene.layout.name,
          'view': view,
          'workload': kind.name,
          'mode': scene.mode.name,
          'fixture': MapWorkload.fixtureId,
          'sequence': number,
          'items': scene.count,
          'devices': scene.deviceIds.length,
          'seed': scene.seed,
          ..._cameraMetadata(),
          'updates': values.length,
          if (changedPercent != null) ...{
            'changedPercent': changedPercent,
            'changedPanels': scene.changedPanelCount(changedPercent),
          },
          'generationUs': generation.elapsedMicroseconds,
          'concurrentPanMs': pan ? 400 : 0,
        },
      );
    } catch (error) {
      if (mounted) setState(() => _status = '$error');
      return null;
    } finally {
      _inFlight--;
    }
  }

  void _stressToggle() {
    if (_stress != null) {
      _stress!.cancel();
      setState(() => _stress = null);
      return;
    }
    setState(() {
      _stress = Timer.periodic(const Duration(milliseconds: 250), (_) {
        if (_inFlight < 2) {
          unawaited(_update(_mode));
        }
      });
    });
  }

  void _zoom() {
    final center = _controller.toWorld(_viewport.center(Offset.zero));
    if (center != null) {
      // A 40-unit panel is 30 logical pixels wide, independently of how many
      // groups the diagram contains. A multiple of fit is still far away at 10k.
      _controller.setCamera(center: center, scale: .75);
    }
  }

  void _pan(double direction) {
    final center = _controller.toWorld(_viewport.center(Offset.zero));
    final shifted = _controller.toWorld(
      _viewport.center(Offset.zero) + Offset(100 * direction, 50 * direction),
    );
    if (center != null && shifted != null) {
      _controller.setCamera(center: shifted);
    }
  }

  Future<void> _panContinuously(double direction) async {
    final center = _controller.toWorld(_viewport.center(Offset.zero));
    final end = _controller.toWorld(
      _viewport.center(Offset.zero) + Offset(100 * direction, 50 * direction),
    );
    if (center == null || end == null) return;
    _motionFrom = center;
    _motionTo = end;
    try {
      await _motion.forward(from: 0).orCancel;
    } on TickerCanceled {
      // Host removal terminates measurement motion, not a map command obligation.
    }
  }

  void _toggleAttachment() {
    _epoch++;
    _pendingStart = false;
    _stress?.cancel();
    _motion.stop(canceled: true);
    setState(() {
      _stress = null;
      _attached = !_attached;
      _busy = false;
      if (!_attached) _scene = null;
    });
  }

  Map<String, Object?> _cameraMetadata() {
    final origin = _controller.toWorld(Offset.zero);
    final unit = _controller.toWorld(const Offset(1, 0));
    final center = _controller.toWorld(_viewport.center(Offset.zero));
    final worldUnit = origin != null && unit != null
        ? (unit - origin).distance
        : 0.0;
    return {
      'viewport': {'width': _viewport.width, 'height': _viewport.height},
      'dpr': MediaQuery.devicePixelRatioOf(context),
      'cameraCenter': center == null ? null : {'x': center.dx, 'y': center.dy},
      'cameraScale': worldUnit > 0 ? 1 / worldUnit : null,
    };
  }

  Future<void> _runBenchmark() async {
    if (_running) return;
    final epoch = ++_epoch;
    setState(() => _running = true);
    logRecord({
      'event': 'metadata',
      'seed': MapWorkload.defaultSeed,
      'fixture': MapWorkload.fixtureId,
      'updatePattern': 'seeded-exact-change-v1',
      'filters': {
        'layout': _layoutFilter,
        'view': _viewFilter,
        'workload': _workloadFilter,
      },
      'measurementProtocol': 'settled-frame-window-v2',
      'changedPercent': _changedPercent,
      'inputCardinality':
          'all panels on every request; mixed has two records per panel',
      'visibility':
          'number: full bar and number; bar: no text; mixed: bar and number',
      'items': widget.count,
      'warmup': _warmup < 2 ? 2 : _warmup,
      'samples': _samples < 1 ? 1 : _samples,
      'animationMs': 200,
      'response':
          'input updateValues/draw call to Future completion; payload generation separate',
      'frames':
          'whole-app frame-number window; no artificial frame; CPU through selected raster timing delivery',
    });
    try {
      // Reject unsupported compile-time values before drawing or measuring.
      MapWorkload(_layout, count: 0).changedPanelCount(_changedPercent);
      final layouts = MapLayout.values
          .where(
            (value) => _layoutFilter == 'all' || value.name == _layoutFilter,
          )
          .toList();
      final views = [
        'overview',
        'zoom-pan',
      ].where((value) => _viewFilter == 'all' || value == _viewFilter).toList();
      final workloads = UpdateWorkload.values
          .where(
            (value) =>
                _workloadFilter == 'all' || value.name == _workloadFilter,
          )
          .toList();
      if (layouts.isEmpty || views.isEmpty || workloads.isEmpty) {
        throw ArgumentError('Unknown benchmark filter');
      }
      for (final layout in layouts) {
        if (!mounted || epoch != _epoch) return;
        setState(() => _layout = layout);
        for (final view in views) {
          for (final kind in workloads) {
            await _replace(emit: true, mode: kind);
            if (!mounted || epoch != _epoch) return;
            if (_scene?.layout != layout || _scene?.mode != kind) {
              throw StateError('Drawing rejected; benchmark stopped');
            }
            if (view == 'overview') {
              _controller.fit();
            } else {
              final target = _scene!.benchmarkFocusTarget;
              if (target != null) _controller.focus([target]);
              _controller.setCamera(scale: .75);
            }
            await WidgetsBinding.instance.endOfFrame;
            if (!mounted || epoch != _epoch) return;
            logRecord({
              'event': 'camera',
              'completion': 'host endOfFrame; no display/GPU completion proof',
              if (view == 'zoom-pan')
                'focusTarget': _scene!.benchmarkFocusTarget,
              'layout': layout.name,
              'view': view,
              'workload': kind.name,
              ..._cameraMetadata(),
            });
            await Future<void>.delayed(const Duration(milliseconds: 350));
            final responses = <double>[], frames = <double>[];
            final warmup = _warmup < 2 ? 2 : _warmup;
            final samples = _samples < 1 ? 1 : _samples;
            for (var i = 0; i < warmup + samples; i++) {
              if (!mounted || epoch != _epoch) return;
              final sample = await _update(
                kind,
                emit: true,
                view: view,
                stage: i < warmup ? 'warmup' : 'measurement',
                sequence: i,
                pan: view == 'zoom-pan',
                changedPercent: _changedPercent,
              );
              if (sample == null) throw StateError('Update unavailable');
              if (!sample.timingsComplete) {
                throw StateError(
                  'Frame timing window incomplete; benchmark stopped',
                );
              }
              if (sample.result.outcome != PatchMapOutcome.applied &&
                  sample.result.outcome != PatchMapOutcome.unchanged) {
                throw StateError(
                  'Update ${sample.result.outcome.name}; benchmark stopped',
                );
              }
              if (i >= warmup &&
                  _changedPercent == 0 &&
                  sample.result.outcome != PatchMapOutcome.unchanged) {
                throw StateError('0% measurement changed after normalization');
              }
              if (i >= warmup) {
                responses.add(sample.responseMs);
                frames.addAll(
                  sample.frames.map(
                    (frame) => frame.totalSpan.inMicroseconds / 1000,
                  ),
                );
              }
            }
            logRecord({
              'event': 'summary',
              'changedPercent': _changedPercent,
              'changedPanels': _scene!.changedPanelCount(_changedPercent),
              'layout': layout.name,
              'view': view,
              'workload': kind.name,
              'samples': responses.length,
              'responseP95Ms': percentile(responses),
              'frameCount': frames.length,
              'frameP95Ms': percentile(frames),
            });
          }
        }
      }
      logRecord({'event': 'complete'});
    } catch (error) {
      logRecord({'event': 'error', 'message': '$error'});
    } finally {
      if (mounted) setState(() => _running = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('PatchMap 10k native')),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(8),
          child: Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              DropdownButton<MapLayout>(
                value: _layout,
                onChanged: _running || _busy
                    ? null
                    : (value) {
                        if (value != null) {
                          setState(() => _layout = value);
                          unawaited(_replace());
                        }
                      },
                items: [
                  for (final layout in MapLayout.values)
                    DropdownMenuItem(
                      value: layout,
                      child: Text(
                        layout == MapLayout.grid
                            ? 'Regular groups'
                            : 'Varied groups',
                      ),
                    ),
                ],
              ),
              for (final kind in UpdateWorkload.values)
                FilledButton.tonal(
                  onPressed:
                      _running || _busy || _inFlight > 0 || _scene == null
                      ? null
                      : () => unawaited(_manualUpdate(kind)),
                  child: Text(kind.name),
                ),
              TextButton(
                onPressed: _running ? null : () => _controller.fit(),
                child: const Text('Overview'),
              ),
              TextButton(
                onPressed: _running ? null : _zoom,
                child: const Text('Panel zoom'),
              ),
              TextButton(
                onPressed: _running ? null : () => _pan(1),
                child: const Text('Pan'),
              ),
              TextButton(
                onPressed: _running || _scene == null ? null : _stressToggle,
                child: Text(_stress == null ? 'Stress ON' : 'Stress OFF'),
              ),
              TextButton(
                onPressed: _busy || _running
                    ? null
                    : () => unawaited(_replace()),
                child: const Text('Replace'),
              ),
              TextButton(
                onPressed: _running ? null : _toggleAttachment,
                child: Text(_attached ? 'Remove' : 'Reconnect'),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 96,
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  '${widget.count} items | mode: ${_mode.name} | $_status\n'
                  'Future ${_last?.responseMs.toStringAsFixed(2) ?? "—"} ms | '
                  'window frames ${_last?.frames.length ?? 0} | p95 ${_last?.p95Ms.toStringAsFixed(2) ?? "—"} ms | '
                  'total frames ${_measurements.totalFrames}\n'
                  'Drag/wheel/pinch to navigate. Whole-app FrameTiming; API qualification pending.',
                  key: const Key('metrics'),
                  maxLines: 5,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              _viewport = constraints.biggest;
              _scheduleStart();
              return _attached
                  ? PatchMapView(
                      controller: _controller,
                      onAttached: _onAttached,
                      onEvent: (event) {
                        if (event.kind == PatchMapInputKind.tap &&
                            event.target != null) {
                          _controller.toggleSelection([event.target!.id]);
                        }
                      },
                    )
                  : const Center(child: Text('Map removed'));
            },
          ),
        ),
      ],
    ),
  );
}
