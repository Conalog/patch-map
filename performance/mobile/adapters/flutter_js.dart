import 'dart:convert';
import 'dart:ffi';
import 'dart:typed_data';
import 'package:flutter_js/flutter_js.dart';
import 'package:flutter_js/javascriptcore/jscore_runtime.dart';
import 'package:flutter_js/javascriptcore/jscore_bindings.dart' as jsc;

const runtimeName = 'flutter_js-0.8.7';
const transports = ['json', 'native-buffer'];

class Runtime {
  final JavascriptRuntime js = getJavascriptRuntime(xhr: false);
  JSInvokable? binary;
  Runtime(String source) {
    _eval(source);
    if (js is QuickJsRuntime2) {
      binary = js.evaluate('projectBinary').rawResult as JSInvokable;
    }
  }
  String _eval(String source) {
    final result = js.evaluate(source);
    if (result.isError) throw StateError(result.stringResult);
    return result.stringResult;
  }

  Float32List project(List<double> heights, int stride, String transport) {
    if (transport == 'native-buffer') {
      if (binary != null) {
        final input = Float64List.fromList(heights).buffer.asUint8List();
        final bytes = binary!.invoke([input, stride]) as Uint8List;
        return Float32List.view(
          bytes.buffer,
          bytes.offsetInBytes,
          bytes.lengthInBytes ~/ 4,
        );
      }
      // iOS: use the package's exposed JSC bindings, retaining the returned JS
      // object until its bytes have been copied to Dart-owned memory.
      final core = js as JavascriptCoreRuntime;
      final result = core.evaluate(
        'projectBuffer(${jsonEncode(heights)},$stride)',
      );
      if (result.isError) throw StateError(result.stringResult);
      final object = result.rawResult as Pointer;
      final context = core.context.pointer;
      jsc.jSValueProtect(context, object);
      try {
        final length = jsc.jSObjectGetArrayBufferByteLength(
          context,
          object,
          nullptr,
        );
        if (length != heights.length * 42 * 4)
          throw StateError('JSC buffer length mismatch');
        final pointer = jsc.jSObjectGetArrayBufferBytesPtr(
          context,
          object,
          nullptr,
        );
        if (pointer == nullptr) throw StateError('JSC buffer missing');
        // No JSC API call between obtaining the temporary pointer and copying.
        return Float32List.fromList(
          pointer.cast<Float>().asTypedList(length ~/ 4),
        );
      } finally {
        jsc.jSValueUnprotect(context, object);
      }
    }
    final json = _eval('projectJson(${jsonEncode(heights)},$stride)');
    return Float32List.fromList(
      (jsonDecode(json) as List).cast<num>().map((v) => v.toDouble()).toList(),
    );
  }

  void dispose() {
    binary?.free();
    js.dispose();
  }
}
