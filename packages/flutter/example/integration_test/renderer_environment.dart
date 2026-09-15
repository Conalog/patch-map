import 'dart:async';
import 'package:flutter/services.dart';

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
