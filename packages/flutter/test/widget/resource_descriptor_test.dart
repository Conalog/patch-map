import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';

import 'backend_resources_test.dart' as support;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'released source history is not retained by generation descriptors',
    () async {
      final h = support.Harness(
        (_) async => Uint8List.fromList(utf8.encode(support.good)),
      );
      try {
        for (var i = 0; i < 40; i++) {
          final use = h.resources.acquireAsset(
            'success-$i.svg',
            const Color(0xffffffff),
            initialLoad: false,
          );
          await use.ready;
          expect(h.resources.resolvedSourceCount, 1);
          use.release();
          h.retirement.flush();
          expect(h.resources.resolvedSourceCount, 0);
        }
        expect(h.resources.vectors.entryCount, 0);
        expect(h.sources.entryCount, 0);
        expect(h.sources.referenceCount, 0);
      } finally {
        h.close();
      }
    },
  );

  test(
    'descriptor stays shared until its final tint use is released',
    () async {
      final h = support.Harness(
        (_) async => Uint8List.fromList(utf8.encode(support.good)),
      );
      final first = h.resources.acquireAsset(
        'shared.svg',
        const Color(0xffffffff),
        initialLoad: false,
      );
      final second = h.resources.acquireAsset(
        'shared.svg',
        const Color(0xffff0000),
        initialLoad: false,
      );
      await Future.wait([first.ready, second.ready]);
      expect(h.resources.resolvedSourceCount, 1);
      first.release();
      expect(h.resources.resolvedSourceCount, 1);
      h.resources.close();
      second.release();
      expect(h.resources.resolvedSourceCount, 0);
      h.close();
    },
  );

  test(
    'remembered asset failure does not retain an unowned descriptor',
    () async {
      final h = support.Harness(
        (_) async => Uint8List.fromList(utf8.encode(support.unsupported)),
      );
      try {
        for (var i = 0; i < 2; i++) {
          final use = h.resources.acquireAsset(
            'failure.svg',
            const Color(0xffffffff),
            initialLoad: false,
          );
          await expectLater(use.ready, throwsA(isA<Exception>()));
          use.release();
          h.retirement.flush();
          expect(h.resources.resolvedSourceCount, 0);
        }
      } finally {
        h.close();
      }
    },
  );
}
