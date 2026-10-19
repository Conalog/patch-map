package com.conalog.patch_map_example

import android.os.Debug
import android.os.Process
import android.os.SystemClock
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// Example-host measurement only; the published Dart package has no platform channel.
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        MethodChannel(engine.dartExecutor.binaryMessenger, "patchmap-example/measurement")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "cpu" -> result.success(mapOf(
                        "cpuMs" to Process.getElapsedCpuTime(),
                        "elapsedNs" to SystemClock.elapsedRealtimeNanos()
                    ))
                    "memory" -> {
                        val memory = Debug.MemoryInfo()
                        Debug.getMemoryInfo(memory)
                        result.success(mapOf(
                            "pssKiB" to memory.totalPss,
                            "graphicsKiB" to memory.getMemoryStat("summary.graphics"),
                            "nativeHeapAllocatedBytes" to Debug.getNativeHeapAllocatedSize()
                        ))
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
