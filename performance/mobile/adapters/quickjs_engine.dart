import 'dart:convert';
import 'dart:typed_data';
import 'package:quickjs_engine/quickjs_engine.dart';

const runtimeName = 'quickjs_engine-0.1.5';
const transports = ['json', 'native-buffer'];

class Runtime {
  final JavascriptRuntime js = getJavascriptRuntime(xhr: false);
  late final JSInvokable binary;
  Runtime(String source) {
    _eval(source);
    binary = js.evaluate('projectBinary').rawResult as JSInvokable;
  }
  String _eval(String source) {
    final result = js.evaluate(source);
    if (result.isError) throw StateError(result.stringResult);
    return result.stringResult;
  }

  Float32List project(List<double> heights, int stride, String transport) {
    if (transport == 'native-buffer') {
      final input = Float64List.fromList(heights).buffer.asUint8List();
      final bytes = binary.invoke([input, stride]) as Uint8List;
      return Float32List.view(
        bytes.buffer,
        bytes.offsetInBytes,
        bytes.lengthInBytes ~/ 4,
      );
    }
    final json = _eval('projectJson(${jsonEncode(heights)},$stride)');
    return Float32List.fromList(
      (jsonDecode(json) as List).cast<num>().map((v) => v.toDouble()).toList(),
    );
  }

  void dispose() {
    binary.free();
    js.dispose();
  }
}
