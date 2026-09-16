import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/host/font_decoder.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'real bundled variable WOFF2 decodes without native Brotli and keeps SFNT tables',
    () async {
      final bytes = File('assets/fonts/FiraCode-VF.woff2').readAsBytesSync();
      final (result, sfnt) = decodeFontIfWoff(bytes);
      expect(result, WoffDecodeResult.ok);
      expect(sfnt, isNotNull);
      final header = ByteData.sublistView(sfnt!);
      expect(header.getUint32(0), 0x00010000);
      final tables = <String>{};
      for (var i = 0; i < header.getUint16(4); i++) {
        tables.add(
          String.fromCharCodes(sfnt.sublist(12 + i * 16, 16 + i * 16)),
        );
      }
      expect(
        tables,
        containsAll(['fvar', 'gvar', 'cmap', 'hmtx', 'glyf', 'loca']),
      );
      await (FontLoader(
        'PatchMapDecodedFontTest',
      )..addFont(Future.value(ByteData.sublistView(sfnt)))).load();
      final output = File('../../.artifacts/flutter/decoded-font.ttf');
      output.parent.createSync(recursive: true);
      output.writeAsBytesSync(sfnt);
    },
  );
  test(
    'offline SFNT is a valid native font and passes through untouched',
    () async {
      final bytes = File('assets/fonts/FiraCode-VF.ttf').readAsBytesSync();
      final (result, sfnt) = decodeFontIfWoff(bytes);
      expect(result, WoffDecodeResult.notWoff);
      expect(sfnt, same(bytes));
      await (FontLoader(
        'PatchMapOfflineFontTest',
      )..addFont(Future.value(ByteData.sublistView(bytes)))).load();
    },
  );
  test('truncated compressed containers reject without a partial font', () {
    for (final bytes in [
      Uint8List.fromList([0x77, 0x4f, 0x46, 0x46]),
      Uint8List.fromList([0x77, 0x4f, 0x46, 0x32]),
    ]) {
      final (result, sfnt) = decodeFontIfWoff(bytes);
      expect(result, WoffDecodeResult.malformed);
      expect(sfnt, isNull);
    }
  });
}
