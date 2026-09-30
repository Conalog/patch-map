// Importing the extracted public library is intentional: the foundation has no
// public runtime declarations yet.
// ignore: unused_import
import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'dart:ui' as ui;

import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('installed bundled SVG and native font load', () async {
    final picture = await vg.loadPicture(
      const SvgAssetLoader(
        'assets/icons/object.svg',
        packageName: 'conalog_patch_map',
      ),
      null,
    );
    try {
      expect(picture.size.width, greaterThan(0));
      expect(picture.size.height, greaterThan(0));
      final bytes = await rootBundle.load(
        'packages/conalog_patch_map/assets/fonts/FiraCode-VF.ttf',
      );
      expect(bytes.getUint32(0), 0x00010000);
      expect(bytes.lengthInBytes, greaterThan(100000));
      await ui.loadFontFromList(
        bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
        fontFamily: 'InstalledFiraCode',
      );
    } finally {
      picture.picture.dispose();
    }
  });
}
