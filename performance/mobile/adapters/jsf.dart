import 'dart:convert';
import 'dart:typed_data';
import 'package:jsf/jsf.dart';

const runtimeName = 'jsf-1.1.0';
const transports = ['json', 'arraybuffer-api'];

class Runtime {
  final JsRuntime js = JsRuntime();
  Runtime(String source) {
    js.eval(source);
  }
  Float32List project(List<double> heights, int stride, String transport) {
    if (transport == 'arraybuffer-api') {
      // JSF 1.1.0 converts ArrayBuffer via tagged JSON internally, not binary FFI.
      final bytes = js.call('projectBuffer', [heights, stride]) as Uint8List;
      return Float32List.view(
        bytes.buffer,
        bytes.offsetInBytes,
        bytes.lengthInBytes ~/ 4,
      );
    }
    final json =
        js.eval('projectJson(${jsonEncode(heights)},$stride)') as String;
    return Float32List.fromList(
      (jsonDecode(json) as List).cast<num>().map((v) => v.toDouble()).toList(),
    );
  }

  void dispose() => js.dispose();
}
