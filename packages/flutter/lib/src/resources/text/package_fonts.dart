import 'package:flutter/services.dart';

/// Bundled font registration is process-wide, like Flutter's font registry.
/// It stores one completion, not Paragraphs or map-owned native resources.
abstract final class PackageFonts {
  static const bundledFamily = 'conalog_patch_map.FiraCode';
  static Future<void>? _ready;
  static bool _loaded = false;

  static Future<void> ensureLoaded() =>
      _loaded ? Future.value() : (_ready ??= _load());
  static Future<void> _load() async {
    try {
      final loader = FontLoader(bundledFamily)
        ..addFont(
          rootBundle.load(
            'packages/conalog_patch_map/assets/fonts/FiraCode-VF.ttf',
          ),
        );
      await loader.load();
      _loaded = true;
      _ready = null;
    } catch (_) {
      _ready = null;
      rethrow;
    }
  }

  static String resolve(String family) =>
      family == 'FiraCode' ? bundledFamily : family;
}
