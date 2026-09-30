import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:patch_map_example/main.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('native foundation mounts, decodes assets and tears down', (
    tester,
  ) async {
    await tester.pumpWidget(const PatchMapExampleApp());
    await tester.pumpAndSettle();
    expect(find.text('PatchMap development'), findsOneWidget);
    expect(
      find.text(
        'Package environment is ready.\nMap renderer is not implemented yet.',
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);

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
      final image = await picture.picture.toImage(
        picture.size.width.ceil(),
        picture.size.height.ceil(),
      );
      try {
        final pixels = await image.toByteData();
        expect(pixels, isNotNull);
        expect(pixels!.buffer.asUint8List().any((value) => value != 0), isTrue);
      } finally {
        image.dispose();
      }

      final font = await rootBundle.load(
        'packages/conalog_patch_map/assets/fonts/FiraCode-VF.ttf',
      );
      expect(font.getUint32(0), 0x00010000);
      await ui.loadFontFromList(
        font.buffer.asUint8List(font.offsetInBytes, font.lengthInBytes),
        fontFamily: 'NativeFoundationFiraCode',
      );
    } finally {
      picture.picture.dispose();
    }

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    expect(find.byType(PatchMapExampleApp), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
