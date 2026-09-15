import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/src/host/native_assets.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'real shared PNG JPEG WebP GIF SVG and TTF OTF WOFF WOFF2 decode',
    () async {
      final fixture =
          jsonDecode(
                File(
                  '../../conformance/fixtures/codecs.json',
                ).readAsStringSync(),
              )
              as Map;
      final session = NativeAssetSession(fontInitializer: () async {});
      session.register(
        (fixture['assets'] as List)
            .map((value) => Map<String, dynamic>.from(value as Map))
            .toList(),
      );
      try {
        // AVIF uses its platform plugin and is exercised by this same fixture in
        // the Android/iOS consumer; this focused test covers SDK/pure Dart codecs.
        for (final alias in [
          'codec-png',
          'codec-jpeg',
          'codec-webp',
          'codec-gif',
          'codec-svg',
          'codec-ttf',
          'codec-otf',
          'codec-woff',
          'codec-woff2',
        ]) {
          final asset = await session.ensure(alias);
          final image =
              (fixture['expected']['decodedImages'] as Map)[alias] as Map?;
          expect(asset.width, image?['width'] ?? 1, reason: alias);
          expect(asset.height, image?['height'] ?? 1, reason: alias);
        }
      } finally {
        await session.dispose();
      }
      expect(session.runtime.probe()['resourceCount'], 0);
    },
  );
}
