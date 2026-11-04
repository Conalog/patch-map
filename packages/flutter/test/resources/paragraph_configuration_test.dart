import 'dart:io';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/resources/text/paragraph_configuration.dart';
import 'package:conalog_patch_map/src/resources/text/text_layout.dart';
import 'package:conalog_patch_map/src/resources/text/text_spec.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

TextSpec _spec(String text, [Map<String, Object?> style = const {}]) =>
    TextSpec.fromData(
      {
        'text': text,
        'style': {'fontFamily': 'FiraCode', 'fontSize': 16, ...style},
      },
      const ui.Size(65, 40),
      ColorResolver(),
    );

Future<Uint8List> _pixels(OwnedTextLayout layout) async {
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder)..translate(12, 12);
  layout.paint(canvas, ui.Offset.zero);
  final picture = recorder.endRecording();
  final image = await picture.toImage(300, 180);
  try {
    return (await image.toByteData())!.buffer.asUint8List();
  } finally {
    image.dispose();
    picture.dispose();
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

  test('different strings reuse native arguments, not native Paragraphs', () {
    var resolutions = 0;
    final preparation = ParagraphPreparation(
      fontFamilyResolver: (family) {
        resolutions++;
        return family;
      },
    );
    const style = {
      'fontFamily': ['FiraCode', 'sans-serif'],
    };
    final first = _spec('1234', style);
    final second = _spec('5678', style);
    final configuration = preparation.forParameters(first.parameters);
    configuration.prepareSize(16);
    final paragraphStyle = configuration.paragraphStyle;
    final textStyle = configuration.style(stroke: false);
    final constraint = configuration.constraints(40);
    final fallback = configuration.fallback;
    final shared = preparation.forParameters(second.parameters)
      ..prepareSize(16);
    expect(shared, same(configuration));
    expect(shared.paragraphStyle, same(paragraphStyle));
    expect(shared.style(stroke: false), same(textStyle));
    expect(shared.constraints(40), same(constraint));
    expect(shared.fallback, same(fallback));
    expect(resolutions, 2);
    expect(() => shared.fallback.clear(), throwsUnsupportedError);
    expect(shared.constraints(41), isNot(same(constraint)));
    shared.prepareSize(12);
    expect(shared.paragraphStyle, isNot(same(paragraphStyle)));
    expect(shared.style(stroke: false), isNot(same(textStyle)));

    final a = NativeTextLayout(first, preparation: preparation).resolve();
    final b = NativeTextLayout(second, preparation: preparation).resolve();
    expect(a.paragraph, isNot(same(b.paragraph)));
    expect(a.size, b.size);
    preparation.clear();
    expect(
      preparation.forParameters(first.parameters),
      isNot(same(configuration)),
    );
    expect(a.paragraph.debugDisposed, false);
    a.dispose();
    b.dispose();
  });

  test('paint alpha and owner font resolution cannot leak across reuse', () {
    final preparation = ParagraphPreparation();
    final a = _spec('A', {
      'alpha': .5,
      'stroke': {'color': 'white', 'width': 2},
    });
    final b = _spec('B', {
      'alpha': .5001,
      'stroke': {'color': 'white', 'width': 2},
    });
    expect(a.paintKey, b.paintKey);
    final first = preparation.forParameters(a.parameters);
    expect(preparation.forParameters(b.parameters), isNot(same(first)));
    final other = ParagraphPreparation(fontFamilyResolver: (_) => 'serif');
    expect(other.forParameters(a.parameters).family, 'serif');
    expect(first.family, 'FiraCode');
  });

  test(
    'warm arguments preserve pixels, fitting, wrapping and stroke alpha',
    () async {
      final preparation = ParagraphPreparation();
      final styles = <Map<String, Object?>>[
        {},
        {
          'fontFamily': ['missing-font', 'FiraCode'],
          'align': 'center',
        },
        {
          'fontSize': 'auto',
          'autoFont': {'min': 8, 'max': 14},
          'wordWrap': true,
          'wordWrapWidth': 'auto',
          'breakWords': true,
        },
        {
          'fontStyle': 'italic',
          'fontWeight': 700,
          'letterSpacing': 1,
          'lineHeight': 24,
          'align': 'right',
          'overflow': 'ellipsis',
        },
        {
          'fill': '#aa88ff',
          'alpha': .5,
          'stroke': {'color': '#3366ff', 'width': 2, 'join': 'round'},
        },
        {'fontSize': 0},
        {},
      ];
      for (final style in styles) {
        for (final text in ['1234', '5678', '1', '한글 A\n123456789', '']) {
          final spec = _spec(text, style);
          final fresh = NativeTextLayout(spec).resolve();
          final shared = NativeTextLayout(
            spec,
            preparation: preparation,
          ).resolve();
          try {
            expect(shared.fontSize, fresh.fontSize);
            expect(shared.size, fresh.size);
            expect(shared.longestLine, fresh.longestLine);
            expect(shared.visibleText, fresh.visibleText);
            expect(shared.lineCount, fresh.lineCount);
            expect(await _pixels(shared), await _pixels(fresh));
          } finally {
            shared.dispose();
            fresh.dispose();
          }
        }
      }
    },
  );

  test(
    'failed creation releases Paragraph and keeps reusable arguments valid',
    () {
      final preparation = ParagraphPreparation();
      final spec = _spec('1234');
      ui.Paragraph? failed;
      expect(
        () => NativeTextLayout(
          spec,
          preparation: preparation,
          onParagraphCreated: (p) {
            failed = p;
            throw StateError('injected');
          },
        ).resolve(),
        throwsStateError,
      );
      expect(failed!.debugDisposed, true);
      final result = NativeTextLayout(spec, preparation: preparation).resolve();
      expect(result.visibleText, '1234');
      result.dispose();
    },
  );
}
