import 'dart:io';
import 'dart:ui' as ui;
import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/resources/text/glyph_atlas.dart';
import 'package:conalog_patch_map/src/resources/text/text_pool.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> until(bool Function() check) async {
  final end = DateTime.now().add(const Duration(seconds: 8));
  while (!check()) {
    if (DateTime.now().isAfter(end)) fail('timeout');
    await Future<void>.delayed(const Duration(milliseconds: 1));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final loader = FontLoader('FiraCode');
    loader.addFont(
      Future.value(
        ByteData.sublistView(
          File('assets/fonts/FiraCode-VF.ttf').readAsBytesSync(),
        ),
      ),
    );
    await loader.load();
  });
  test(
    'unsupported style cannot inherit the prior atlas route through identity reuse',
    () {
      final retirement = ResourceRetirement();
      final pool = TextPool(
        palette: ColorResolver(),
        retirement: retirement,
        onReady: () {},
      );
      pool.setActive(false);
      final first = pool.acquire({
        'text': '12',
        'style': {'fontFamily': 'FiraCode', 'fontSize': 14},
      }, null);
      final second = pool.acquire({
        'text': '12',
        'style': {
          'fontFamily': 'FiraCode',
          'fontSize': 14,
          'fontVariant': 'small-caps',
        },
      }, null);
      final eligible = second.atlasEligible;
      pool.release(first);
      pool.release(second);
      pool.close();
      retirement.close();
      expect(eligible, false);
    },
  );
  testWidgets(
    'last async atlas completion cannot publish an already evicted entry',
    (tester) async {
      await tester.runAsync(() async {
        final retirement = ResourceRetirement();
        final cache = GlyphAtlasCache(
          retirement: retirement,
          onReady: () {},
          maxUnusedBytes: 0,
        );
        final first = cache.acquire((
          family: 'FiraCode',
          size: 14.0,
          weight: 500,
        ));
        await until(() => !first.pending);
        expect(first.pages, hasLength(3));
        late GlyphAtlas second;
        var created = 0;
        final previous = ui.Image.onCreate;
        ui.Image.onCreate = (image) {
          previous?.call(image);
          if (++created == 3) {
            cache.release(second);
            cache.release(first);
          }
        };
        try {
          second = cache.acquire((family: 'FiraCode', size: 15.0, weight: 500));
          await until(() => !second.pending);
          cache.close();
          retirement.close();
          final residual = cache.residentBytes;
          final leaked =
              second.pages?.where((p) => !p.image.debugDisposed).toList() ?? [];
          for (final page in leaked) {
            page.image.dispose();
          }
          expect(cache.entries, 0);
          expect(
            residual,
            0,
            reason:
                'evicted async result must retire instead of leaving orphan pages',
          );
        } finally {
          ui.Image.onCreate = previous;
          cache.close();
          retirement.close();
        }
      });
    },
  );
}
