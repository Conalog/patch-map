package com.conalog.patch_map_example

import android.os.Build
import android.os.PowerManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Read-only benchmark evidence; no work runs unless the test asks.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "patch_map_example/thermal")
            .setMethodCallHandler { call, result ->
                if (call.method != "status") {
                    result.notImplemented()
                } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                    result.error("unsupported", "Thermal qualification requires Android 10+", null)
                } else {
                    val power = getSystemService(POWER_SERVICE) as PowerManager
                    result.success(power.currentThermalStatus)
                }
            }
    }
}
