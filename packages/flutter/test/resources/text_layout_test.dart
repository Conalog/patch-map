import 'dart:io';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/resources/text/text_layout.dart';
import 'package:conalog_patch_map/src/resources/text/text_spec.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart' show Characters;
import 'package:flutter_test/flutter_test.dart';

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

  TextSpec spec(
    String text, {
    Map<String, Object?> style = const {},
    ui.Size? content,
    Object? margin,
    int split = 0,
  }) => TextSpec.fromData(
    {
      'text': text,
      'style': {
        'fontFamily': 'FiraCode',
        'fontSize': 16,
        'fontWeight': 400,
        ...style,
      },
      'margin': ?margin,
      'split': split,
    },
    content,
    ColorResolver(),
  );

  test(
    'native Paragraph shapes loaded FiraCode and general Korean/English',
    () {
      for (final text in ['12345', 'Panel A - 12.5%', '한글과 English', 'a\nb']) {
        final result = NativeTextLayout(spec(text)).resolve();
        try {
          expect(result.visibleText, text);
          expect(result.size.width, greaterThan(0));
          expect(result.size.height, greaterThan(0));
          expect(
            result.paragraphWidth,
            greaterThanOrEqualTo(result.longestLine),
          );
          expect(result.lineCount, text.contains('\n') ? 2 : 1);
        } finally {
          result.dispose();
        }
      }
      final one = NativeTextLayout(spec('1')).resolve();
      final five = NativeTextLayout(spec('12345')).resolve();
      expect(five.longestLine, closeTo(one.longestLine * 5, .05));
      one.dispose();
      five.dispose();
    },
  );

  test(
    'auto size is opt-in and defaults to the original 1 through 100 range',
    () {
      final fixed = NativeTextLayout(
        spec(
          '1',
          style: {
            'fontSize': 18,
            'autoFont': {'min': 8, 'max': 14},
          },
          content: const ui.Size(1000, 1000),
        ),
      ).resolve();
      final auto = NativeTextLayout(
        spec(
          '1',
          style: {'fontSize': 'auto'},
          content: const ui.Size(1000, 1000),
        ),
      ).resolve();
      try {
        expect(fixed.fontSize, 18);
        expect(auto.fontSize, 100);
      } finally {
        fixed.dispose();
        auto.dispose();
      }
    },
  );

  test(
    'consumer auto font selects the largest fitting integer after margins',
    () {
      const content = ui.Size(45, 26);
      final autoSpec = spec(
        '12345',
        content: content,
        margin: 4,
        style: {
          'fontSize': 'auto',
          'fontWeight': '500',
          'autoFont': {'min': 8, 'max': 14},
          'align': 'center',
          'wordWrap': true,
          'breakWords': true,
          'wordWrapWidth': 'auto',
        },
      );
      expect(autoSpec.bounds, const ui.Size(37, 18));
      var expected = 8;
      for (var size = 8; size <= 14; size++) {
        final trial = NativeTextLayout(
          spec(
            '12345',
            content: content,
            margin: 4,
            style: {
              'fontSize': size,
              'fontWeight': '500',
              'align': 'center',
              'wordWrap': true,
              'breakWords': true,
              'wordWrapWidth': 'auto',
            },
          ),
        ).resolve();
        if (trial.size.width <= 37 && trial.size.height <= 18) expected = size;
        trial.dispose();
      }
      final created = <ui.Paragraph>[];
      final result = NativeTextLayout(
        autoSpec,
        onParagraphCreated: created.add,
      ).resolve();
      expect(result.fontSize, expected);
      expect(created.where((p) => !p.debugDisposed), [result.paragraph]);
      result.dispose();
      expect(created.every((p) => p.debugDisposed), isTrue);
    },
  );

  test(
    'empty auto uses maximum and a nonfitting value falls back to minimum',
    () {
      final empty = NativeTextLayout(
        spec(
          '',
          style: {
            'fontSize': 'auto',
            'autoFont': {'min': 8, 'max': 14},
          },
          content: ui.Size.zero,
        ),
      ).resolve();
      final full = NativeTextLayout(
        spec(
          '12345',
          style: {
            'fontSize': 'auto',
            'autoFont': {'min': 8, 'max': 14},
          },
          content: ui.Size.zero,
        ),
      ).resolve();
      expect(empty.fontSize, 14);
      expect(empty.size, ui.Size.zero);
      expect(empty.lineCount, 0);
      expect(full.fontSize, 8);
      expect(full.size.width, greaterThan(0));
      empty.dispose();
      full.dispose();
    },
  );

  test(
    'font CSS strings follow Pixi parseInt instead of invented DPI conversion',
    () {
      for (final entry in {
        '12px': 12.0,
        '12pt': 12.0,
        '1.6em': 1.0,
        '160%': 160.0,
      }.entries) {
        expect(spec('a', style: {'fontSize': entry.key}).fontSize, entry.value);
      }
      expect(
        () => spec('a', style: {'fontSize': 'medium'}),
        throwsFormatException,
      );
      expect(
        () => spec('a', style: {'fontSize': 'auto'}),
        throwsFormatException,
      );
    },
  );

  test('zero font remains zero without substituting a default', () {
    final value = spec('123', style: {'fontSize': 0});
    final result = NativeTextLayout(value).resolve();
    try {
      expect(result.fontSize, 0);
      expect(result.size, const ui.Size(0, 1));
      expect(
        value.unsupportedFields,
        contains('fontSize.zeroNativeLineHeight'),
      );
    } finally {
      result.dispose();
    }
  });

  test('native letter spacing and explicit line height affect metrics', () {
    final plain = NativeTextLayout(spec('123\n456')).resolve();
    final styled = NativeTextLayout(
      spec(
        '123\n456',
        style: {
          'fontSize': 16,
          'fontWeight': '500',
          'fontStyle': 'italic',
          'letterSpacing': 2,
          'lineHeight': 32,
        },
      ),
    ).resolve();
    try {
      expect(styled.longestLine, greaterThan(plain.longestLine));
      expect(styled.size.height, greaterThan(plain.size.height));
      expect(styled.lineCount, 2);
    } finally {
      plain.dispose();
      styled.dispose();
    }
  });

  test('explicit newlines and grapheme split preserve complete characters', () {
    final split = NativeTextLayout(
      spec('A👩🏽‍💻e\u0301가B', split: 2),
    ).resolve();
    final negative = NativeTextLayout(spec('A\nB', split: -3)).resolve();
    expect(split.visibleText, 'A👩🏽‍💻\ne\u0301가\nB');
    expect(split.lineCount, 3);
    expect(negative.visibleText, 'A\nB');
    split.dispose();
    negative.dispose();
  });

  test(
    'word wrap honors breakWords false instead of native emergency breaks',
    () {
      final keep = NativeTextLayout(
        spec(
          '123456789',
          style: {'wordWrap': true, 'wordWrapWidth': 20, 'breakWords': false},
        ),
      ).resolve();
      final breaking = NativeTextLayout(
        spec(
          '123456789',
          style: {'wordWrap': true, 'wordWrapWidth': 20, 'breakWords': true},
        ),
      ).resolve();
      expect(keep.lineCount, 1);
      expect(keep.size.width, greaterThan(20));
      expect(breaking.lineCount, greaterThan(1));
      expect(breaking.visibleText.replaceAll('\n', ''), '123456789');
      final words = NativeTextLayout(
        spec('aa bb cc', style: {'wordWrap': true, 'wordWrapWidth': 45}),
      ).resolve();
      expect(words.visibleText, contains('\n'));
      keep.dispose();
      breaking.dispose();
      words.dispose();
    },
  );

  test('whiteSpace only collapses when wrapping is enabled', () {
    final normal = NativeTextLayout(
      spec(
        'a  b\nc',
        style: {'wordWrap': true, 'wordWrapWidth': 200, 'whiteSpace': 'normal'},
      ),
    ).resolve();
    final preLine = NativeTextLayout(
      spec(
        'a  b\nc',
        style: {
          'wordWrap': true,
          'wordWrapWidth': 200,
          'whiteSpace': 'pre-line',
        },
      ),
    ).resolve();
    final plain = NativeTextLayout(
      spec('a  b\nc', style: {'whiteSpace': 'normal'}),
    ).resolve();
    expect(normal.visibleText, 'a b c');
    expect(preLine.visibleText, 'a b\nc');
    expect(plain.visibleText, 'a  b\nc');
    normal.dispose();
    preLine.dispose();
    plain.dispose();
  });

  test('overflow hidden and ellipsis fit by height and preserve graphemes', () {
    const source = 'A👩🏽‍💻e\u0301가BCDEFGHIJKLMN';
    for (final overflow in ['hidden', 'ellipsis']) {
      final created = <ui.Paragraph>[];
      final result = NativeTextLayout(
        spec(
          source,
          content: const ui.Size(55, 30),
          style: {'overflow': overflow},
        ),
        onParagraphCreated: created.add,
      ).resolve();
      expect(result.size.width, lessThanOrEqualTo(55));
      expect(result.size.height, lessThanOrEqualTo(30));
      expect(result.visibleText, isNot(source));
      final prefix = result.visibleText.endsWith('…')
          ? result.visibleText.substring(0, result.visibleText.length - 1)
          : result.visibleText;
      expect(Characters(source).take(Characters(prefix).length).join(), prefix);
      if (overflow == 'ellipsis') {
        expect(result.visibleText.endsWith('…'), isTrue);
      }
      expect(created.where((p) => !p.debugDisposed), [result.paragraph]);
      result.dispose();
      expect(created.every((p) => p.debugDisposed), isTrue);
    }
    final none = NativeTextLayout(
      spec('a', content: ui.Size.zero, style: {'overflow': 'ellipsis'}),
    ).resolve();
    expect(none.visibleText, '');
    expect(none.size, ui.Size.zero);
    none.dispose();
  });

  test(
    'center alignment uses paragraph width separately from longest line',
    () {
      final result = NativeTextLayout(
        spec('12345\n1', style: {'align': 'center'}),
      ).resolve();
      final lines = result.paragraph.computeLineMetrics();
      expect(result.paragraphWidth, result.longestLine.ceilToDouble());
      expect(lines.last.left, greaterThan(0));
      expect(
        lines.last.left + lines.last.width / 2,
        closeTo(result.paragraphWidth / 2, .1),
      );
      result.dispose();
    },
  );

  test(
    'metric and paint keys separate color changes and detach family inputs',
    () {
      final families = ['FiraCode', 'sans-serif'];
      final style = <String, Object?>{
        'fontFamily': families,
        'fontSize': 18,
        'fill': 'red',
      };
      final first = TextSpec.fromData(
        {'text': '12', 'style': style},
        null,
        ColorResolver(),
      );
      final second = TextSpec.fromData(
        {
          'text': '12',
          'style': {...style, 'fill': 'blue'},
        },
        null,
        ColorResolver(),
      );
      expect(first.metricKey, second.metricKey);
      expect(first.paintKey, isNot(second.paintKey));
      families.clear();
      style.clear();
      expect(first.fontFamilies, ['FiraCode', 'sans-serif']);
      expect(() => first.fontFamilies.add('other'), throwsUnsupportedError);
    },
  );

  test(
    'stroke, shadow, tint and alpha produce explicit paint values and ownership',
    () {
      final value = TextSpec.fromData(
        {
          'text': 'A',
          'tint': '#808080',
          'style': {
            'fontSize': 18,
            'fill': '#ff0000',
            'alpha': .5,
            'stroke': {'color': 'white', 'width': 2, 'join': 'round'},
            'dropShadow': {
              'color': 'black',
              'alpha': .5,
              'angle': 0,
              'distance': 5,
              'blur': 1,
            },
          },
        },
        null,
        ColorResolver(),
      );
      expect(value.color.toARGB32(), 0x80800000);
      expect(value.strokeColor!.toARGB32(), 0x80808080);
      expect(value.shadow!.color.a, closeTo(.25, .005));
      expect(value.shadow!.offset, const ui.Offset(5, 0));
      final created = <ui.Paragraph>[];
      final result = NativeTextLayout(
        value,
        onParagraphCreated: created.add,
      ).resolve();
      expect(result.strokeParagraph, isNotNull);
      expect(created.where((p) => !p.debugDisposed).length, 2);
      final recorder = ui.PictureRecorder();
      result.paint(ui.Canvas(recorder), ui.Offset.zero);
      recorder.endRecording().dispose();
      result.dispose();
      result.dispose();
      expect(created.every((p) => p.debugDisposed), isTrue);
    },
  );

  test(
    'advanced unsupported fields remain visible as immutable diagnostics',
    () {
      final value = spec(
        'a',
        style: {
          'fontVariant': 'small-caps',
          'textBaseline': 'top',
          'trim': true,
          'leading': 2,
          'cornerRadius': 1,
          'tagStyles': {'a': {}},
          'filters': [{}],
        },
      );
      expect(
        value.unsupportedFields,
        containsAll([
          'fontVariant',
          'textBaseline',
          'trim',
          'leading',
          'cornerRadius',
          'tagStyles',
          'filters',
        ]),
      );
      expect(() => value.unsupportedFields.clear(), throwsUnsupportedError);
      expect(
        () => spec('a', style: {'fontWeight': 'bolder'}),
        throwsFormatException,
      );
    },
  );

  test(
    'creation failure disposes both temporary and retained search candidates',
    () {
      final created = <ui.Paragraph>[];
      expect(
        () => NativeTextLayout(
          spec(
            '123',
            content: const ui.Size(100, 100),
            style: {'fontSize': 'auto'},
          ),
          onParagraphCreated: (paragraph) {
            created.add(paragraph);
            if (created.length == 3) throw StateError('injected');
          },
        ).resolve(),
        throwsStateError,
      );
      expect(created.length, 3);
      expect(created.every((p) => p.debugDisposed), isTrue);
    },
  );
}
