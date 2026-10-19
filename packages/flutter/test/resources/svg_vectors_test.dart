import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/resources/svg/svg_source.dart';
import 'package:conalog_patch_map/src/resources/svg/svg_vectors.dart';
import 'package:flutter_svg/flutter_svg.dart' as svg;
import 'package:flutter_test/flutter_test.dart';

const multicolor =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" viewBox="0 0 20 10">'
    '<rect width="10" height="10" fill="#ff0000"/>'
    '<rect x="10" width="10" height="10" fill="#0000ff"/></svg>';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final resolver = SvgSourceResolver();
  Future<String> builtin(String src) async {
    final asset = builtinSvgAssetPath(src)!;
    return File(
      asset.replaceFirst('packages/conalog_patch_map/', ''),
    ).readAsString();
  }

  test(
    'canonical aliases detach configuration and share resolved creation identity',
    () {
      final data = <String, Object?>{
        'height': 24,
        'width': 16,
        'resolution': 4,
      };
      final source = SvgSourceResolver(
        symbols: {
          'status': {'src': 'path/../status.svg', 'data': data},
          'alias': 'status',
        },
      );
      final first = source.resolve('alias');
      data.clear();
      expect(first.canonicalSrc, 'status.svg');
      expect(first.width, 16);
      expect(first.height, 24);
      expect(first.resolution, 4);
      expect(
        first.identity,
        source.resolve({
          'src': 'status.svg',
          'data': {'resolution': 4, 'width': 16, 'height': 24},
        }).identity,
      );
      final overridden = source.resolve({
        'src': 'status',
        'data': {'width': 40},
      });
      expect(overridden.width, 40);
      expect(overridden.height, 24);
      expect(() => first.data['width'] = 1, throwsUnsupportedError);
      expect(first.toJson()['parser'], 'svg');
      expect(
        resolver.resolve('object').canonicalSrc,
        'patch-map-builtin://images/object.svg',
      );
      expect(
        builtinSvgAssetPath(resolver.resolve('object').canonicalSrc),
        'packages/conalog_patch_map/assets/icons/object.svg',
      );
    },
  );

  test(
    'unresolved aliases, incompatible parsers and unsupported fragment selection are explicit',
    () {
      for (final source in <Object>[
        'inverter',
        'unregistered',
        'patch-map-builtin://images/no.svg',
      ]) {
        expect(
          () => resolver.resolve(source),
          throwsA(sourceDiagnostic('unresolved-alias')),
        );
      }
      expect(
        () => SvgSourceResolver(symbols: {'a': 'b', 'b': 'a'}).resolve('a'),
        throwsA(sourceDiagnostic('alias-cycle')),
      );
      expect(
        () => resolver.resolve({'src': 'a.svg', 'parser': 'texture'}),
        throwsA(sourceDiagnostic('unsupported-parser')),
      );
      expect(
        () => resolver.resolve('a.svg#symbol'),
        throwsA(sourceDiagnostic('unsupported-fragment')),
      );
      expect(
        () => resolver.resolve({
          'src': 'a.svg',
          'data': {'width': 0},
        }),
        throwsA(sourceDiagnostic('invalid-data')),
      );
      expect(
        () => resolver.resolve('a.png'),
        throwsA(sourceDiagnostic('unsupported-source')),
      );
      expect(
        () => resolver.resolve({'src': 'a.svg', 'data': null}),
        throwsA(sourceDiagnostic('invalid-data')),
      );
      final cyclic = <String, Object?>{};
      cyclic['self'] = cyclic;
      expect(
        () => resolver.resolve({'src': 'a.svg', 'data': cyclic}),
        throwsA(sourceDiagnostic('invalid-data')),
      );
    },
  );

  test(
    'actual object, warning and wifi assets parse on the original 72 canvas',
    () async {
      var loads = 0, parses = 0;
      final store = SvgVectorStore(
        sourceLoader: (src) {
          loads++;
          return builtin(src);
        },
        pictureLoader: (xml, tint) {
          parses++;
          return loadSvgPicture(xml, tint);
        },
      );
      final vectors = <SvgVector>[];
      for (final name in ['object', 'warning', 'wifi']) {
        final spec = resolver.resolve(name);
        final first = store.acquire(spec), second = store.acquire(spec);
        final vector = await first.ready;
        vectors.add(vector);
        expect(await second.ready, same(vector));
        expect(vector.intrinsicSize, const ui.Size(72, 72));
        expect(vector.size, const ui.Size(72, 72));
        expect(first.sharedReferenceCount, 2);
        first.release();
        expect(vector.picture.debugDisposed, isFalse);
        second.release();
        expect(vector.picture.debugDisposed, isTrue);
      }
      expect(loads, 3);
      expect(parses, 3);
      expect(store.entryCount, 0);
      expect(store.sourceCount, 0);
      expect(store.pendingCount, 0);
      expect(store.referenceCount, 0);
      store.close();
    },
  );

  test(
    'tint preserves multicolor pixels and alpha without a per-instance layer',
    () async {
      final store = SvgVectorStore(sourceLoader: (_) async => multicolor);
      final lease = store.acquire(
        resolver.resolve('colors.svg'),
        tint: const ui.Color(0x8080ff80),
      );
      final vector = await lease.ready;
      final recorder = ui.PictureRecorder();
      vector.paint(ui.Canvas(recorder), const ui.Rect.fromLTWH(0, 0, 40, 30));
      final picture = recorder.endRecording();
      final image = await picture.toImage(40, 30);
      try {
        final bytes = (await image.toByteData(
          format: ui.ImageByteFormat.rawStraightRgba,
        ))!;
        final left = (15 * 40 + 10) * 4, right = (15 * 40 + 30) * 4;
        expect(
          [for (var i = 0; i < 4; i++) bytes.getUint8(left + i)],
          [128, 0, 0, 128],
        );
        expect(
          [for (var i = 0; i < 4; i++) bytes.getUint8(right + i)],
          [0, 0, 128, 128],
        );
      } finally {
        image.dispose();
        picture.dispose();
        lease.release();
        store.close();
      }
    },
  );

  test(
    'different tints share source loading and identical tints share a picture',
    () async {
      var loads = 0, parses = 0;
      final retired = <void Function()>[];
      final store = SvgVectorStore(
        sourceLoader: (_) async {
          loads++;
          return multicolor;
        },
        pictureLoader: (xml, tint) {
          parses++;
          return loadSvgPicture(xml, tint);
        },
        retire: retired.add,
      );
      final spec = resolver.resolve('colors.svg');
      final first = store.acquire(spec), retained = first.retain();
      final same = store.acquire(spec),
          tint = store.acquire(spec, tint: const ui.Color(0xff80ff80));
      final vector = await first.ready, colored = await tint.ready;
      expect(await same.ready, sameVector(vector));
      expect(await retained.ready, sameVector(vector));
      expect(colored.picture, isNot(sameVector(vector.picture)));
      expect(loads, 1);
      expect(parses, 2);
      expect(store.referenceCount, 4);
      expect(first.release(), isTrue);
      expect(first.release(), isFalse);
      retained.release();
      same.release();
      tint.release();
      expect(retired.length, 2);
      expect(vector.picture.debugDisposed, isFalse);
      expect(store.entryCount, 0);
      expect(store.sourceCount, 0);
      for (final dispose in retired) {
        dispose();
        dispose();
      }
      expect(vector.picture.debugDisposed, isTrue);
      expect(colored.picture.debugDisposed, isTrue);
      store.close();
    },
  );

  test(
    'independent data dimensions remain distinct while raw source loads once',
    () async {
      var loads = 0;
      final store = SvgVectorStore(
        sourceLoader: (_) async {
          loads++;
          return multicolor;
        },
      );
      final first = store.acquire(
        resolver.resolve({
          'src': 'colors.svg',
          'data': {'width': 60, 'height': 70, 'resolution': 4},
        }),
      );
      final second = store.acquire(
        resolver.resolve({
          'src': 'colors.svg',
          'data': {'width': 24},
        }),
      );
      final vector = await first.ready, other = await second.ready;
      expect(loads, 1);
      expect(vector.size, const ui.Size(60, 70));
      expect(other.size, const ui.Size(24, 10));
      expect(vector.intrinsicSize, const ui.Size(20, 10));
      expect(vector.source.resolution, 4);
      first.release();
      second.release();
      store.close();
    },
  );

  test(
    'logical cancellation retains pending ownership until real parse settlement',
    () async {
      final started = Completer<SvgPicture>(), finish = Completer<void>();
      final store = SvgVectorStore(
        sourceLoader: (_) async => multicolor,
        pictureLoader: (xml, tint) async {
          final info = await loadSvgPicture(xml, tint);
          started.complete(info);
          await finish.future;
          return info;
        },
      );
      final lease = store.acquire(resolver.resolve('colors.svg'));
      final info = await started.future;
      final cancelled = expectLater(lease.ready, throwsStateError);
      lease.release();
      expect(store.pendingCount, 1);
      expect(store.entryCount, 1);
      expect(store.sourceCount, 1);
      expect(info.picture.debugDisposed, isFalse);
      finish.complete();
      await cancelled;
      expect(info.picture.debugDisposed, isTrue);
      expect(store.pendingCount, 0);
      expect(store.entryCount, 0);
      expect(store.sourceCount, 0);
      store.close();
    },
  );

  test(
    'close rejects late attachment but keeps already ready leases until safe release',
    () async {
      final started = Completer<SvgPicture>(), finish = Completer<void>();
      final store = SvgVectorStore(
        sourceLoader: (_) async => multicolor,
        pictureLoader: (xml, tint) async {
          final info = await loadSvgPicture(xml, tint);
          started.complete(info);
          await finish.future;
          return info;
        },
      );
      final lease = store.acquire(resolver.resolve('late.svg'));
      final info = await started.future;
      final closed = expectLater(lease.ready, throwsStateError);
      store.close();
      store.close();
      expect(
        () => store.acquire(resolver.resolve('late.svg')),
        throwsStateError,
      );
      expect(() => lease.retain(), throwsStateError);
      finish.complete();
      await closed;
      expect(info.picture.debugDisposed, isTrue);
      lease.release();
      final live = SvgVectorStore(sourceLoader: (_) async => multicolor);
      final ready = live.acquire(resolver.resolve('live.svg'));
      final vector = await ready.ready;
      live.close();
      expect(vector.picture.debugDisposed, isFalse);
      ready.release();
      expect(vector.picture.debugDisposed, isTrue);
    },
  );

  test(
    'source cancellation waits for source settlement and skips unstarted parsing',
    () async {
      final source = Completer<String>();
      var parses = 0;
      final store = SvgVectorStore(
        sourceLoader: (_) => source.future,
        pictureLoader: (xml, tint) {
          parses++;
          return loadSvgPicture(xml, tint);
        },
      );
      final lease = store.acquire(resolver.resolve('source.svg'));
      final cancelled = expectLater(lease.ready, throwsStateError);
      lease.release();
      store.close();
      expect(store.pendingCount, 1);
      expect(store.sourceCount, 1);
      source.complete(multicolor);
      await cancelled;
      expect(parses, 0);
      expect(store.pendingCount, 0);
      expect(store.sourceCount, 0);
    },
  );

  test(
    'source and actual parser failures remove physical entries and allow explicit retry',
    () async {
      var attempts = 0;
      final store = SvgVectorStore(
        sourceLoader: (_) async {
          if (attempts++ == 0) throw StateError('source failed');
          return multicolor;
        },
      );
      final spec = resolver.resolve('retry.svg');
      final failed = store.acquire(spec);
      await expectLater(failed.ready, throwsStateError);
      expect(store.pendingCount, 0);
      expect(store.entryCount, 0);
      expect(store.sourceCount, 0);
      expect(() => failed.retain(), throwsStateError);
      failed.release();
      final retry = store.acquire(spec);
      await retry.ready;
      expect(attempts, 2);
      retry.release();
      store.close();
      final cachedBefore = svg.svg.cache.count;
      final invalid = SvgVectorStore(sourceLoader: (_) async => '<svg><');
      final bad = invalid.acquire(resolver.resolve('invalid.svg'));
      await expectLater(bad.ready, throwsA(sourceDiagnostic('invalid-svg')));
      expect(invalid.entryCount, 0);
      expect(invalid.sourceCount, 0);
      expect(invalid.pendingCount, 0);
      expect(svg.svg.cache.count, cachedBefore);
      bad.release();
      invalid.close();
    },
  );

  test('unsupported loader data is diagnosed before loading', () {
    var loads = 0;
    final store = SvgVectorStore(
      sourceLoader: (_) async {
        loads++;
        return multicolor;
      },
    );
    expect(
      () => store.acquire(
        resolver.resolve({
          'src': 'a.svg',
          'data': {
            'replace': {'red': 'blue'},
          },
        }),
      ),
      throwsA(sourceDiagnostic('unsupported-data')),
    );
    expect(loads, 0);
    expect(store.entryCount, 0);
    store.close();
  });

  test(
    'existing compiler resolves local symbols, gradients and clipping without a new XML parser',
    () async {
      const xml =
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" viewBox="0 0 20 10">'
          '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/>'
          '<stop offset="1" stop-color="blue"/></linearGradient>'
          '<clipPath id="clip"><rect width="10" height="10"/></clipPath>'
          '<symbol id="mark" viewBox="0 0 20 10"><rect width="20" height="10" fill="url(#g)"/></symbol></defs>'
          '<g clip-path="url(#clip)"><use href="#mark" width="20" height="10"/></g></svg>';
      final store = SvgVectorStore(sourceLoader: (_) async => xml);
      final lease = store.acquire(resolver.resolve('symbol.svg'));
      final vector = await lease.ready;
      final image = await vector.picture.toImage(20, 10);
      try {
        final bytes = (await image.toByteData(
          format: ui.ImageByteFormat.rawStraightRgba,
        ))!;
        expect(bytes.getUint8((5 * 20 + 3) * 4 + 3), 255);
        expect(bytes.getUint8((5 * 20 + 15) * 4 + 3), 0);
        expect(
          bytes.getUint8((5 * 20 + 1) * 4),
          greaterThan(bytes.getUint8((5 * 20 + 8) * 4)),
        );
      } finally {
        image.dispose();
        lease.release();
        store.close();
      }
    },
  );

  test(
    'unsupported SVG features fail preparation instead of partial publication',
    () async {
      final store = SvgVectorStore(
        sourceLoader: (_) async =>
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">'
            '<foreignObject width="20" height="10"><div>content</div></foreignObject></svg>',
      );
      final lease = store.acquire(resolver.resolve('unsupported.svg'));
      await expectLater(
        lease.ready,
        throwsA(sourceDiagnostic('unsupported-svg')),
      );
      expect(store.entryCount, 0);
      expect(store.pendingCount, 0);
      lease.release();
      store.close();
    },
  );

  test(
    'real compiler/XML input failures are typed without a broad Error catch',
    () async {
      const head =
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">';
      const failures = <String, String>{
        '$head<': 'invalid-svg',
        '$head<g></svg>': 'invalid-svg',
        '<notSvg/>': 'invalid-svg',
        '<svg/>': 'invalid-svg',
        '$head<svg width="1" height="1"/></svg>': 'unsupported-svg',
        '$head<defs><linearGradient id="g" x1="not-a-number"><stop offset="0" stop-color="red"/></linearGradient></defs>'
                '<rect width="20" height="10" fill="url(#g)"/></svg>':
            'invalid-svg',
        '$head<defs><linearGradient id="g" href="#missing"/></defs>'
                '<rect width="20" height="10" fill="url(#g)"/></svg>':
            'invalid-svg',
        '$head<defs><linearGradient id="g" href="#g"/></defs>'
                '<rect width="20" height="10" fill="url(#g)"/></svg>':
            'invalid-svg',
        '$head<rect width="20" height="10" fill="rgb(not-a-color)"/></svg>':
            'invalid-svg',
        '$head<path d="M0 0 Lnot-a-number"/></svg>': 'invalid-svg',
        '$head<rect width="20" height="10" transform="matrix(1)"/></svg>':
            'invalid-svg',
      };
      for (final entry in failures.entries) {
        await expectLater(
          loadSvgPicture(entry.key, const ui.Color(0xffffffff)),
          throwsA(sourceDiagnostic(entry.value)),
          reason: entry.key,
        );
      }
    },
  );

  test(
    'unsupported XML-looking comments and CDATA do not become authored SVG elements',
    () async {
      final value = await loadSvgPicture(
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">'
        '<!-- <foreignObject><div>ignored</div></foreignObject> -->'
        '<![CDATA[<foreignObject/>]]><rect width="20" height="10" fill="blue"/></svg>',
        const ui.Color(0xffffffff),
      );
      final image = await value.picture.toImage(20, 10);
      try {
        final bytes = (await image.toByteData(
          format: ui.ImageByteFormat.rawRgba,
        ))!;
        expect(
          [for (var i = 0; i < 4; i++) bytes.getUint8((5 * 20 + 10) * 4 + i)],
          [0, 0, 255, 255],
        );
      } finally {
        image.dispose();
        value.picture.dispose();
      }
    },
  );

  test(
    'source, beforeParse and injected picture/codec StateError retain original identity',
    () async {
      // Even the same message used by a compiler input diagnostic must not be
      // converted when thrown by lifecycle or injected native preparation code.
      for (final stage in ['source', 'beforeParse', 'picture']) {
        final error = StateError('Invalid SVG data');
        final store = SvgVectorStore(
          sourceLoader: (_) async {
            if (stage == 'source') throw error;
            return multicolor;
          },
          beforeParse: () async {
            if (stage == 'beforeParse') throw error;
          },
          pictureLoader: (xml, tint) async {
            if (stage == 'picture') throw error;
            return loadSvgPicture(xml, tint);
          },
        );
        final lease = store.acquire(resolver.resolve('$stage.svg'));
        await expectLater(lease.ready, throwsA(same(error)));
        expect(store.pendingCount, 0);
        expect(store.entryCount, 0);
        expect(store.sourceCount, 0);
        lease.release();
        store.close();
      }
    },
  );
}

Matcher sourceDiagnostic(String code) =>
    isA<SvgSourceException>().having((error) => error.code, 'code', code);
Matcher sameVector(Object value) => same(value);
