import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

/// Engine startup can precede the Android window's first metrics delivery.
/// Wait before constructing a scene with a DPR or recording environment data.
Future<void> awaitNativeSurface() async {
  final limit = DateTime.now().add(const Duration(seconds: 10));
  while (true) {
    final views = ui.PlatformDispatcher.instance.views;
    if (views.length == 1 &&
        views.single.physicalSize.width > 0 &&
        views.single.physicalSize.height > 0 &&
        SchedulerBinding.instance.lifecycleState ==
            ui.AppLifecycleState.resumed) {
      return;
    }
    if (DateTime.now().isAfter(limit)) {
      throw TimeoutException(
        'Native surface metrics/resumed lifecycle unavailable',
      );
    }
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }
}

/// Read outside measured windows. A thermally affected sample fails the run;
/// it is never silently removed from an otherwise successful distribution.
const _thermal = MethodChannel('patch_map_example/thermal');
Future<int> thermalStatus() async =>
    (await _thermal.invokeMethod<int>('status'))!;
Future<void> awaitCoolDevice() async {
  final limit = DateTime.now().add(const Duration(minutes: 4));
  var announced = false;
  while (await thermalStatus() != 0) {
    if (!announced) {
      print('THERMAL waiting for Android THERMAL_STATUS_NONE');
      announced = true;
    }
    if (DateTime.now().isAfter(limit))
      throw TimeoutException('Device did not cool');
    await Future<void>.delayed(const Duration(seconds: 5));
  }
}
