import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'patch_map_view_test.dart' as support;

void main() {
  testWidgets(
    'font completion while paused must not begin generation resource compilation',
    (tester) async {
      final bytes = ByteData.sublistView(
        File('assets/fonts/FiraCode-VF.ttf').readAsBytesSync(),
      );
      final font = Completer<ByteData?>();
      var fontRequested = false;
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      messenger.setMockMessageHandler('flutter/assets', (message) async {
        final key = utf8.decode(
          message!.buffer.asUint8List(
            message.offsetInBytes,
            message.lengthInBytes,
          ),
        );
        if (key.endsWith('FiraCode-VF.ttf')) {
          fontRequested = true;
          return font.future;
        }
        return null;
      });
      final c = PatchMapController();
      await tester.pumpWidget(support.host(c));
      final pending = c.draw([
        {'type': 'image', 'id': 'image', 'source': 'delayed.svg', 'size': 20},
      ]);
      await support.progress(tester, 1);
      expect(fontRequested, true);
      final dynamic state = tester.state(find.byType(PatchMapView));
      expect(state.backend.sources.entryCount, 0);
      await tester.pumpWidget(support.host(c, active: false));
      font.complete(bytes);
      await support.progress(tester, 3);
      final entries = state.backend.sources.entryCount;
      final references = state.backend.sources.referenceCount;
      expect(state.session.active, false);
      expect(references, 0);
      await tester.pumpWidget(const SizedBox());
      await pending;
      await support.progress(tester, 1);
      messenger.setMockMessageHandler('flutter/assets', null);
      expect(
        entries,
        0,
        reason:
            'font loading may settle while inactive, but new scene resource compilation must wait for resume',
      );
    },
  );
}
