import 'dart:io';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/resources/text/glyph_atlas.dart';
import 'package:conalog_patch_map/src/resources/text/text_layout.dart';
import 'package:conalog_patch_map/src/resources/text/text_pool.dart';
import 'package:conalog_patch_map/src/resources/text/text_spec.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> _data(
  String text, {
  Map<String, Object?> style = const {},
  Map<String, Object?> fields = const {},
}) => {
  'text': text,
  'style': {
    'fontFamily': 'FiraCode',
    'fontWeight': 500,
    'fontSize': 'auto',
    'autoFont': {'min': 8, 'max': 14},
    'align': 'center',
    'wordWrap': true,
    'breakWords': false,
    'wordWrapWidth': 'auto',
    ...style,
  },
  ...fields,
};

const _content = ui.Size(40, 20);

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

  _PoolHarness pool({int entries = 800, int codeUnits = 131072}) {
    final h = _PoolHarness(entries: entries, codeUnits: codeUnits);
    addTearDown(h.close);
    return h;
  }

  test(
    'numeric proof matches loaded FiraCode native layout for distinct 1 through 12 digit values',
    () {
      final h = pool();
      final loaded = NativeTextLayout(
        TextSpec.fromData(
          _data('0', style: {'fontSize': 14}),
          _content,
          h.palette,
        ),
      ).resolve();
      try {
        // The bundled Fira advance is about .615em; Ahem fallback is 1em.
        expect(loaded.longestLine, inExclusiveRange(7, 10));
      } finally {
        loaded.dispose();
      }
      const bounds = [
        ui.Size(40, 20),
        ui.Size(84, 24),
        ui.Size(16, 8),
        ui.Size(200, 60),
      ];
      for (final content in bounds) {
        for (var length = 1; length <= 12; length++) {
          final values = [
            List.filled(length, '0').join(),
            List.filled(length, '9').join(),
            List.generate(length, (i) => '${(i * 3 + 1) % 10}').join(),
          ];
          for (final value in values) {
            final handle = h.acquire(_data(value), content);
            final native = NativeTextLayout(
              TextSpec.fromData(_data(value), content, h.palette),
            ).resolve();
            try {
              expect(
                handle.metrics.fontSize,
                native.fontSize,
                reason: '$content / $value',
              );
              expect(
                handle.size.width,
                closeTo(native.size.width, .001),
                reason: '$content / $value',
              );
              expect(
                handle.size.height,
                closeTo(native.size.height, .001),
                reason: '$content / $value',
              );
              expect(
                handle.metrics.longestLine,
                closeTo(native.longestLine, .02),
                reason: '$content / $value',
              );
              expect(
                handle.metrics.lines,
                native.lineCount,
                reason: '$content / $value',
              );
            } finally {
              native.dispose();
              h.release(handle);
            }
          }
        }
      }
      expect(h.owner.numericMetricEntries, 48);
      expect(h.owner.metricMisses, 48);
      expect(h.owner.metricHits, 96);
    },
  );

  test(
    '10000 distinct ASCII number changes share measurement per length and style group',
    () {
      final h = pool(entries: 8, codeUnits: 64);
      var afterFirstTwo = 0;
      for (var i = 0; i < 10000; i++) {
        final digits = i.toString().padLeft(i.isEven ? 5 : 6, '0');
        final handle = h.acquire(
          _data(digits, style: {'fill': i.isEven ? 'red' : 'blue'}),
          _content,
        );
        h.release(handle);
        if (i == 1) {
          afterFirstTwo = h.owner.paragraphCreates;
        }
      }
      expect(afterFirstTwo, greaterThan(0));
      expect(h.owner.paragraphCreates, afterFirstTwo);
      expect(h.owner.metricMisses, 2);
      expect(h.owner.metricHits, 9998);
      expect(h.owner.numericMetricEntries, 2);
      expect(h.owner.entries, 10000);
      expect(h.owner.unusedEntries, 10000);
      expect(h.owner.liveParagraphLayouts, 2);
      expect(
        h.owner.atlases.builds,
        0,
      ); // This test measures no raster or GPU work.
      h.owner.trimUnused();
      expect(h.owner.entries, 8);
      expect(h.owner.unusedEntries, 8);
      expect(
        h.owner.liveParagraphLayouts,
        2,
      ); // Deferred to frame-safe retirement.
      h.retirement.flush();
      expect(h.owner.liveParagraphLayouts, 0);
    },
  );

  test(
    'nonproof text formats and changed font/style never enter numeric metric cache',
    () {
      final h = pool();
      final cases = <Map<String, Object?>>[
        for (final text in ['12.3', '-12', '12%', 'ABC', '12\n34', '++', '...'])
          _data(text),
        _data('12', style: {'fontSize': 12}),
        _data('12', style: {'fontFamily': 'sans-serif'}),
        _data(
          '12',
          style: {
            'fontFamily': ['FiraCode', 'sans-serif'],
          },
        ),
        _data('12', style: {'fontWeight': 400}),
        _data('12', style: {'fontStyle': 'italic'}),
        _data(
          '12',
          style: {
            'autoFont': {'min': 9, 'max': 14},
          },
        ),
        _data(
          '12',
          style: {
            'autoFont': {'min': 8, 'max': 15},
          },
        ),
        _data('12', style: {'letterSpacing': .5}),
        _data('12', style: {'lineHeight': 20}),
        _data('12', style: {'padding': 1}),
        _data(
          '12',
          style: {
            'stroke': {'color': 'black', 'width': 1},
          },
        ),
        _data('12', style: {'dropShadow': true}),
        _data('12', style: {'wordWrap': false}),
        _data('12', style: {'breakWords': true}),
        _data('12', style: {'align': 'left'}),
        _data('12', style: {'overflow': 'hidden'}),
        _data('12', style: {'wordWrapWidth': 20}),
        _data('12', fields: {'split': 1}),
        _data('12', style: {'fontVariant': 'small-caps'}),
      ];
      for (final data in cases) {
        final handle = h.acquire(data, _content);
        expect(handle.hasParagraph, true, reason: '$data');
        h.release(handle);
      }
      expect(h.owner.numericMetricEntries, 0);
      expect(h.owner.metricHits, 0);
      expect(h.owner.metricMisses, 0);
      expect(h.owner.paragraphCreates, greaterThanOrEqualTo(cases.length));
    },
  );

  test(
    'atlas eligibility is independent of the narrower numeric metric proof',
    () {
      final h = pool();
      for (final data in [
        _data('12.3'),
        _data('-12'),
        _data('12%'),
        _data('12', style: {'fontSize': 12, 'fontWeight': 400}),
      ]) {
        final handle = h.acquire(data, const ui.Size(200, 60));
        expect(handle.atlasEligible, true, reason: '$data');
        h.release(handle);
      }
      for (final data in [
        _data('ABC'),
        _data('++'),
        _data('...'),
        _data('12\n34', style: {'whiteSpace': 'pre-line'}),
        _data('12', style: {'fontStyle': 'italic'}),
        _data('12', style: {'letterSpacing': .5}),
        _data(
          '12',
          style: {
            'stroke': {'color': 'black', 'width': 1},
          },
        ),
        _data('12', style: {'dropShadow': true}),
        _data(
          '12',
          style: {
            'fontFamily': ['FiraCode', 'sans-serif'],
          },
        ),
        _data('12', style: {'fontVariant': 'small-caps'}),
      ]) {
        final handle = h.acquire(data, const ui.Size(200, 60));
        expect(handle.atlasEligible, false, reason: '$data');
        h.release(handle);
      }
      final overflow = h.acquire(_data('123456789012'), const ui.Size(1, 1));
      expect(overflow.atlasEligible, false);
      h.release(overflow);
    },
  );

  test(
    'identical whole strings share Paragraph and close honors outstanding leases',
    () {
      final h = pool();
      final data = _data(
        'Panel 한글',
        style: {'fontSize': 18, 'wordWrap': false},
      );
      final first = h.acquire(data, const ui.Size(200, 60));
      final count = h.owner.paragraphCreates;
      final second = h.acquire(data, const ui.Size(200, 60));
      expect(identical(first, second), true);
      expect(first.references, 2);
      expect(h.owner.paragraphCreates, count);
      h.release(first);
      expect(second.references, 1);
      h.owner.close();
      expect(h.owner.liveParagraphLayouts, 1);
      expect(second.hasParagraph, true);
      expect(() => h.owner.acquire(data, _content), throwsStateError);
      h.release(second);
      expect(h.owner.entries, 0);
      expect(h.owner.liveParagraphLayouts, 1);
      expect(h.retirement.pendingCount, 1);
      h.retirement.flush();
      expect(h.owner.liveParagraphLayouts, 0);
      expect(second.hasParagraph, false);
    },
  );

  test(
    'unused Paragraph entries evict FIFO only at transaction trim and never evict a lease',
    () {
      final h = pool(entries: 2);
      final pinned = h.acquire(
        _data('pinned', style: {'fontSize': 12}),
        _content,
      );
      final handles = [
        for (final text in ['AA', 'BBB', 'CCCC'])
          h.acquire(_data(text, style: {'fontSize': 12}), _content),
      ];
      for (final handle in handles) {
        h.release(handle);
      }
      expect(h.owner.entries, 4);
      expect(h.owner.unusedEntries, 3);
      expect(handles.every((handle) => handle.hasParagraph), true);
      h.owner.trimUnused();
      expect(h.owner.entries, 3);
      expect(h.owner.unusedEntries, 2);
      expect(handles.first.hasParagraph, false);
      expect(handles.skip(1).every((handle) => handle.hasParagraph), true);
      expect(pinned.references, 1);
      expect(pinned.hasParagraph, true);
      h.retirement.flush();
      expect(h.owner.liveParagraphLayouts, 3);
      h.release(pinned);
    },
  );

  test(
    'unused code-unit limit is enforced at trim independently of entry count',
    () {
      final h = pool(entries: 100, codeUnits: 5);
      final first = h.acquire(_data('AA', style: {'fontSize': 12}), _content);
      final second = h.acquire(
        _data('BBBB', style: {'fontSize': 12}),
        _content,
      );
      h.release(first);
      h.release(second);
      expect(h.owner.unusedEntries, 2);
      h.owner.trimUnused();
      expect(h.owner.unusedEntries, 1);
      expect(first.hasParagraph, false);
      expect(second.hasParagraph, true);
    },
  );

  test(
    'metric-hit fallback creates a native Paragraph at resolved size once',
    () {
      final h = pool();
      final first = h.acquire(_data('123456'), _content);
      final next = h.acquire(_data('654321'), _content);
      expect(next.hasParagraph, false);
      final count = h.owner.paragraphCreates;
      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder);
      try {
        h.owner.draw(next, canvas, ui.Offset.zero, 1);
        expect(next.hasParagraph, true);
        expect(
          h.owner.paragraphCreates - count,
          2,
        ); // One wrap measure + one final layout.
        final after = h.owner.paragraphCreates;
        h.owner.draw(next, canvas, ui.Offset.zero, 1);
        expect(h.owner.paragraphCreates, after);
        expect(h.owner.paragraphDraws, 2);
        final native = NativeTextLayout(
          next.spec,
        ).resolve(resolvedFontSize: next.metrics.fontSize);
        try {
          expect(native.fontSize, next.metrics.fontSize);
          expect(native.size, next.metrics.size);
          expect(native.lineCount, next.metrics.lines);
        } finally {
          native.dispose();
        }
      } finally {
        recorder.endRecording().dispose();
        h.release(first);
        h.release(next);
      }
    },
  );

  test(
    'atlas optimization failure is remembered without repeating native preparation',
    () async {
      final retirement = ResourceRetirement();
      final cache = GlyphAtlasCache(retirement: retirement, onReady: () {});
      addTearDown(() {
        cache.close();
        retirement.close();
      });
      const style = (family: 'FiraCode', size: 10000.0, weight: 500);
      final first = cache.acquire(style);
      await _until(() => !first.pending);
      expect(first.failed, true);
      expect(cache.failures, 1);
      expect(cache.builds, 0);
      expect(cache.residentBytes, 0);
      final second = cache.acquire(style);
      expect(identical(first, second), true);
      await Future<void>.delayed(Duration.zero);
      expect(cache.failures, 1);
      expect(cache.running, 0);
      cache.release(first);
      cache.release(second);
      cache.close();
      expect(cache.entries, 0);
      expect(cache.retiringBytes, 0);
    },
  );

  testWidgets(
    'widget engine creates actual atlas images at 3 6 12 and retires them safely',
    (tester) async {
      await tester.runAsync(() async {
        final retirement = ResourceRetirement();
        var ready = 0;
        final cache = GlyphAtlasCache(
          retirement: retirement,
          onReady: () => ready++,
          maxUnusedBytes: 0,
        );
        const style = (family: 'FiraCode', size: 14.0, weight: 500);
        final first = cache.acquire(style);
        final second = cache.acquire(style);
        try {
          await _until(() => !first.pending);
          expect(
            first.failed,
            false,
            reason:
                'FiraCode glyph image creation must work in this test engine',
          );
          expect(cache.builds, 1);
          expect(cache.failures, 0);
          expect(ready, 1);
          final pages = first.pages!;
          expect(pages.map((page) => page.density), [3, 6, 12]);
          expect(first.page(.5)!.density, 3);
          expect(first.page(3)!.density, 3);
          expect(first.page(3.01)!.density, 6);
          expect(first.page(6)!.density, 6);
          expect(first.page(6.01)!.density, 12);
          expect(first.page(100)!.density, 12);
          final bytes = pages.fold<int>(
            0,
            (sum, page) => sum + page.image.width * page.image.height * 4,
          );
          expect(cache.residentBytes, bytes);
          expect(bytes, greaterThan(0));
          expect(pages.every((page) => !page.image.debugDisposed), true);
          cache.release(first);
          expect(cache.entries, 1);
          expect(second.references, 1);
          cache.release(second);
          expect(cache.entries, 0);
          expect(cache.residentBytes, 0);
          expect(cache.retiringBytes, bytes);
          expect(pages.every((page) => !page.image.debugDisposed), true);
          retirement.flush();
          expect(cache.retiringBytes, 0);
          expect(pages.every((page) => page.image.debugDisposed), true);
        } finally {
          if (first.references > 0) {
            while (first.references > 0) {
              cache.release(first);
            }
          }
          cache.close();
          retirement.close();
        }
      });
    },
  );

  testWidgets(
    'close during atlas rasterization disposes late temporary images without onReady',
    (tester) async {
      await tester.runAsync(() async {
        final retirement = ResourceRetirement();
        var ready = 0;
        final cache = GlyphAtlasCache(
          retirement: retirement,
          onReady: () => ready++,
        );
        final created = <ui.Image>[];
        final previous = ui.Image.onCreate;
        ui.Image.onCreate = (image) {
          created.add(image);
          previous?.call(image);
        };
        final atlas = cache.acquire((
          family: 'FiraCode',
          size: 15.0,
          weight: 500,
        ));
        try {
          await Future<void>.value();
          expect(cache.running, 1);
          cache.close();
          cache.release(atlas);
          await _until(() => cache.running == 0);
          retirement.flush();
          expect(ready, 0);
          expect(cache.entries, 0);
          expect(cache.residentBytes, 0);
          expect(cache.retiringBytes, 0);
          expect(atlas.pending, false);
          expect(created, isNotEmpty);
          expect(created.every((image) => image.debugDisposed), true);
        } finally {
          cache.close();
          if (atlas.references > 0) {
            cache.release(atlas);
          }
          await _until(() => cache.running == 0);
          retirement.close();
          ui.Image.onCreate = previous;
        }
      });
    },
  );

  testWidgets('ready glyph pages draw without allocating another Paragraph', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final h = _PoolHarness();
      h.owner.setActive(true);
      final first = h.acquire(_data('1234'), _content);
      final next = h.acquire(_data('5678'), _content);
      ui.Picture? picture;
      ui.Image? image;
      try {
        await _until(
          () => h.owner.atlases.running == 0 && h.owner.atlases.builds == 1,
        );
        final creates = h.owner.paragraphCreates;
        final recorder = ui.PictureRecorder();
        h.owner.draw(next, ui.Canvas(recorder), const ui.Offset(4, 4), 4);
        picture = recorder.endRecording();
        image = await picture.toImage(80, 40);
        final rgba = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
        expect(rgba, isNotNull);
        expect(
          [
            for (var i = 3; i < rgba!.lengthInBytes; i += 4) rgba.getUint8(i),
          ].any((alpha) => alpha > 0),
          true,
        );
        expect(h.owner.atlasDraws, 1);
        expect(h.owner.paragraphDraws, 0);
        expect(h.owner.paragraphCreates, creates);
        expect(next.hasParagraph, false);
      } finally {
        image?.dispose();
        picture?.dispose();
        h.release(first);
        h.release(next);
        h.close();
      }
    });
  });

  testWidgets(
    'oversized final atlas level disposes partial images and keeps native fallback usable',
    (tester) async {
      await tester.runAsync(() async {
        final h = _PoolHarness();
        h.owner.setActive(true);
        final created = <ui.Image>[];
        final previous = ui.Image.onCreate;
        ui.Image.onCreate = (image) {
          created.add(image);
          previous?.call(image);
        };
        final data = _data('12', style: {'fontSize': 64});
        final handle = h.acquire(data, const ui.Size(1000, 1000));
        try {
          expect(handle.atlasEligible, true);
          await _until(
            () => h.owner.atlases.running == 0 && h.owner.atlases.failures == 1,
          );
          expect(h.owner.atlases.builds, 0);
          expect(h.owner.atlases.residentBytes, 0);
          expect(
            created,
            hasLength(2),
          ); // 3x and 6x succeed; 12x exceeds 4096px.
          expect(created.every((image) => image.debugDisposed), true);
          final before = h.owner.paragraphCreates;
          final recorder = ui.PictureRecorder();
          h.owner.draw(handle, ui.Canvas(recorder), ui.Offset.zero, 12);
          recorder.endRecording().dispose();
          expect(h.owner.paragraphDraws, 1);
          expect(h.owner.atlasDraws, 0);
          expect(h.owner.paragraphCreates, before);
          final shared = h.acquire(data, const ui.Size(1000, 1000));
          expect(identical(shared, handle), true);
          await Future<void>.delayed(Duration.zero);
          expect(h.owner.atlases.failures, 1);
          h.release(shared);
        } finally {
          h.release(handle);
          h.close();
          ui.Image.onCreate = previous;
        }
      });
    },
  );
}

Future<void> _until(bool Function() predicate) async {
  final deadline = DateTime.now().add(const Duration(seconds: 8));
  while (!predicate()) {
    if (DateTime.now().isAfter(deadline))
      fail('native preparation did not settle within 8 seconds');
    await Future<void>.delayed(const Duration(milliseconds: 1));
  }
}

class _PoolHarness {
  _PoolHarness({int entries = 800, int codeUnits = 131072}) {
    owner = TextPool(
      palette: palette,
      retirement: retirement,
      onReady: () {},
      maxUnusedEntries: entries,
      maxUnusedCodeUnits: codeUnits,
    );
    owner.setActive(false);
  }
  final palette = ColorResolver();
  final retirement = ResourceRetirement();
  late final TextPool owner;
  final _leases = <TextHandle>[];
  TextHandle acquire(Map<String, Object?> data, ui.Size? content) {
    final handle = owner.acquire(data, content);
    _leases.add(handle);
    return handle;
  }

  void release(TextHandle handle) {
    final index = _leases.indexWhere(
      (candidate) => identical(candidate, handle),
    );
    if (index < 0) {
      throw StateError('test does not own this lease');
    }
    _leases.removeAt(index);
    owner.release(handle);
  }

  void close() {
    owner.close();
    for (final handle in _leases) {
      owner.release(handle);
    }
    _leases.clear();
    retirement.close();
    expect(owner.liveParagraphLayouts, 0);
    expect(owner.entries, 0);
    expect(owner.atlases.residentBytes, 0);
    expect(owner.atlases.retiringBytes, 0);
  }
}
