import 'dart:io';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/resources/text/text_layout.dart';
import 'package:conalog_patch_map/src/resources/text/text_pool.dart';
import 'package:conalog_patch_map/src/resources/text/text_spec.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> data(
  String value, {
  Map<String, Object?> style = const {},
}) => {
  'text': value,
  'tint': 'white',
  'style': {
    'fontFamily': 'FiraCode',
    'fontSize': 'auto',
    'fontWeight': 500,
    'autoFont': {'min': 8, 'max': 14},
    'align': 'center',
    'wordWrap': true,
    'breakWords': false,
    'wordWrapWidth': 'auto',
    ...style,
  },
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final loader = FontLoader('FiraCode')
      ..addFont(
        Future.value(
          ByteData.sublistView(
            File('assets/fonts/FiraCode-VF.ttf').readAsBytesSync(),
          ),
        ),
      );
    await loader.load();
  });
  late TextPool pool;
  late ResourceRetirement retirement;
  setUp(() {
    retirement = ResourceRetirement();
    pool = TextPool(
      palette: ColorResolver(),
      retirement: retirement,
      onReady: () {},
    )..setActive(false);
  });
  tearDown(() {
    pool.close();
    retirement.close();
  });

  test(
    'scope shares Spec and keys for measure then acquire without retaining handles',
    () {
      final input = data('123456');
      pool.withPreparation(() {
        final size = pool.measure(input, const ui.Size(34, 74));
        final a = pool.acquire(input, const ui.Size(34, 74));
        final b = pool.acquire(input, ui.Size(34, 74));
        expect(a.size, size);
        expect(identical(a, b), true);
        expect(a.references, 2);
        expect(pool.specCreates, 1);
        expect(pool.keyCreates, 1);
        pool.release(a);
        pool.release(b);
        expect(a.references, 0);
      });
      final outside = pool.acquire(input, const ui.Size(34, 74));
      expect(pool.specCreates, 2);
      expect(pool.keyCreates, 2);
      pool.release(outside);
    },
  );

  test('content and data identity distinguish scope cache entries', () {
    final input = data('1234');
    final alpha = {
      ...input,
      'style': {...input['style']! as Map, 'alpha': .5},
    };
    pool.withPreparation(() {
      final a = pool.acquire(input, const ui.Size(34, 74));
      final b = pool.acquire(input, const ui.Size(50, 74));
      final c = pool.acquire(alpha, const ui.Size(34, 74));
      final equivalent = pool.acquire({...input}, const ui.Size(34, 74));
      expect(pool.specCreates, 4);
      expect(pool.keyCreates, 4);
      expect(a.spec.bounds, isNot(b.spec.bounds));
      expect(a.spec.color.a, 1);
      expect(c.spec.color.a, .5);
      expect(identical(a, equivalent), true);
      for (final h in [a, b, c, equivalent]) {
        pool.release(h);
      }
    });
  });

  test(
    'nested and throwing scopes restore their caller and release scalar cache',
    () {
      final input = data('1');
      void visit() {
        final h = pool.acquire(input, const ui.Size(34, 74));
        pool.release(h);
      }

      final result = pool.withPreparation(() {
        visit();
        expect(pool.specCreates, 1);
        expect(
          () => pool.withPreparation<void>(() {
            visit();
            throw StateError('injected');
          }),
          throwsStateError,
        );
        expect(pool.specCreates, 2);
        visit();
        expect(pool.specCreates, 2);
        pool.withPreparation(visit);
        expect(pool.specCreates, 3);
        visit();
        expect(pool.specCreates, 3);
        return 17;
      });
      expect(result, 17);
      visit();
      expect(pool.specCreates, 4);
      expect(
        () => pool.withPreparation<void>(() {
          visit();
          throw StateError('outer');
        }),
        throwsStateError,
      );
      visit();
      expect(pool.specCreates, 6);
      expect(pool.keyCreates, 6);
    },
  );

  test(
    'async results are rejected and cannot retain a preparation cache',
    () async {
      final input = data('123');
      expect(
        () => pool.withPreparation(() => Future<void>.value()),
        throwsStateError,
      );
      final a = pool.acquire(input, const ui.Size(34, 74));
      pool.release(a);
      final b = pool.acquire(input, const ui.Size(34, 74));
      pool.release(b);
      expect(pool.specCreates, 2);
      expect(pool.keyCreates, 2);
    },
  );

  test(
    '10000 measure/acquire pairs build half as many Specs and JSON key pairs',
    () {
      final inputs = [for (var i = 0; i < 10000; i++) data('${100000 + i}')];
      for (final input in inputs) {
        pool.measure(input, const ui.Size(34, 74));
        final h = pool.acquire(input, const ui.Size(34, 74));
        pool.release(h);
      }
      expect(pool.specCreates, 20000);
      expect(pool.keyCreates, 20000);
      final paragraphs = pool.paragraphCreates;
      pool.withPreparation(() {
        for (final input in inputs) {
          pool.measure(input, const ui.Size(34, 74));
        }
        for (final input in inputs) {
          final h = pool.acquire(input, const ui.Size(34, 74));
          pool.release(h);
        }
      });
      expect(pool.specCreates, 30000);
      expect(pool.keyCreates, 30000);
      expect(pool.paragraphCreates, paragraphs);
    },
  );

  test(
    'single ASCII and Korean token matches no-wrap layout with one Paragraph',
    () {
      for (final text in ['123456', '패널정보', 'A👩🏽‍💻e\u0301B']) {
        for (final overflow in ['visible', 'hidden', 'ellipsis']) {
          final input = data(
            text,
            style: {'fontSize': 12, 'overflow': overflow},
          );
          final spec = TextSpec.fromData(
            input,
            const ui.Size(15, 80),
            ColorResolver(),
          );
          final reference = TextSpec.fromData(
            data(
              text,
              style: {'fontSize': 12, 'overflow': overflow, 'wordWrap': false},
            ),
            const ui.Size(15, 80),
            ColorResolver(),
          );
          var creates = 0;
          final a = NativeTextLayout(
            spec,
            onParagraphCreated: (_) => creates++,
          ).resolve();
          final b = NativeTextLayout(reference).resolve();
          try {
            expect(a.visibleText, b.visibleText);
            expect(a.size, b.size);
            expect(a.lineCount, b.lineCount);
            if (overflow == 'visible') expect(creates, 1);
          } finally {
            a.dispose();
            b.dispose();
          }
        }
      }
    },
  );

  test('whitespace newline split and auto keep existing wrap decisions', () {
    final cases = {
      'aa bb': 'aa\nbb',
      'a  b': 'a\nb',
      'a\nb': 'a\nb',
      ' a ': ' a',
    };
    for (final entry in cases.entries) {
      final s = TextSpec.fromData(
        data(entry.key, style: {'fontSize': 12, 'wordWrapWidth': 16}),
        const ui.Size(100, 100),
        ColorResolver(),
      );
      final result = NativeTextLayout(s).resolve();
      try {
        expect(result.visibleText, entry.value);
      } finally {
        result.dispose();
      }
    }
    final split = NativeTextLayout(
      TextSpec.fromData(
        {
          ...data('123456', style: {'fontSize': 12}),
          'split': 2,
        },
        const ui.Size(100, 100),
        ColorResolver(),
      ),
    ).resolve();
    expect(split.visibleText, '12\n34\n56');
    split.dispose();
    final auto = NativeTextLayout(
      TextSpec.fromData(
        data('123456'),
        const ui.Size(100, 100),
        ColorResolver(),
      ),
    ).resolve();
    expect(auto.fontSize, 14);
    expect(auto.lineCount, 1);
    auto.dispose();
  });
}
