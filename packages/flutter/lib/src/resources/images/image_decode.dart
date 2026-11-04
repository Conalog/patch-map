import 'dart:typed_data';
import 'dart:ui' as ui;

/// Inspect creates an owned native compressed buffer/descriptor, without a
/// codec. decode is invoked only after the store validates dimensions and
/// reserves predicted pixels and output bytes. Each result transfers ownership.
abstract interface class RasterImageDescriptor {
  int get width;
  int get height;
  Future<ui.Image> decode();
  void dispose();
}

typedef ImageInspector =
    Future<RasterImageDescriptor> Function(Uint8List bytes);

Future<RasterImageDescriptor> inspectRasterImage(Uint8List bytes) async {
  final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
  try {
    final descriptor = await ui.ImageDescriptor.encoded(buffer);
    return _NativeDescriptor(buffer, descriptor);
  } catch (_) {
    buffer.dispose();
    rethrow;
  }
}

final class _NativeDescriptor implements RasterImageDescriptor {
  _NativeDescriptor(this.buffer, this.descriptor);
  final ui.ImmutableBuffer buffer;
  final ui.ImageDescriptor descriptor;
  var _disposed = false;
  @override
  int get width => descriptor.width;
  @override
  int get height => descriptor.height;
  @override
  Future<ui.Image> decode() async {
    final codec = await descriptor.instantiateCodec();
    try {
      return (await codec.getNextFrame()).image;
    } finally {
      codec.dispose();
    }
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    descriptor.dispose();
    buffer.dispose();
  }
}
