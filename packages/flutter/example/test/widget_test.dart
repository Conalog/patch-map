import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map_example/main.dart';

void main() {
  testWidgets(
    'development host mounts with an explicit implementation status',
    (tester) async {
      await tester.pumpWidget(const PatchMapExampleApp());

      expect(find.text('PatchMap development'), findsOneWidget);
      expect(
        find.text(
          'Package environment is ready.\nMap renderer is not implemented yet.',
        ),
        findsOneWidget,
      );
      expect(find.byType(Scaffold), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    },
  );
}
