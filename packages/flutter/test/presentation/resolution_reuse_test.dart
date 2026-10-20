import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/api/update.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/field_operations.dart';
import 'package:conalog_patch_map/src/presentation/presentation_admission.dart';
import 'package:conalog_patch_map/src/presentation/presentation_composer.dart';
import 'package:conalog_patch_map/src/presentation/presentation_resolver.dart';
import 'package:flutter_test/flutter_test.dart';

const _text = PatchMapTarget('g.0.0', componentId: 'text');
const _bar = PatchMapTarget('g.0.0', componentId: 'bar');
const _resolver = PresentationResolver();

DatasetDocument _scene({int fontSize = 12}) => const DatasetReader().read([
  {
    'type': 'grid',
    'id': 'g',
    'cells': [
      [1],
    ],
    'item': {
      'size': 40,
      'components': [
        {
          'type': 'text',
          'id': 'text',
          'text': 'authored',
          'style': {'fontSize': fontSize},
        },
        {'type': 'bar', 'id': 'bar', 'size': 20, 'source': {}},
      ],
    },
  },
]);

PresentationBatch _admit(
  DatasetDocument document,
  PatchMapTarget target,
  Map<String, Object?> values, {
  Map<String, Object?>? current,
}) => const PresentationAdmission().admit(document, [
  PatchMapUpdate(target, values),
], current: current == null ? null : (_) => current);

void main() {
  test(
    'reset and later field resolve against the execution base and document',
    () {
      final document = _scene();
      final authored = authoredRecord(document, _text);
      final live = _resolver.resolve(
        document,
        _admit(document, _text, {
          'text': 'live',
          'style': {'fontSize': 30},
        }),
      )[_text]!;
      final reset = _admit(document, _text, {'style': null}, current: live);
      final fill = _admit(document, _text, {
        'style': {'fill': 'red'},
      }, current: live);
      final patch = const PresentationComposer()
          .compose(reset, fill)
          .patches
          .single;
      final first = _resolver.resolvePatch(authored, live, patch);
      expect((first['style'] as Map)['fontSize'], 12);
      expect((first['style'] as Map)['fill'], 'red');
      expect(first['text'], 'live');
      expect(
        _resolver.resolvePatch(authored, live, patch, remember: false),
        same(first),
      );

      final newerBase = Map<String, Object?>.unmodifiable({
        ...live,
        'text': 'accepted while queued',
      });
      final rebased = _resolver.resolvePatch(
        authored,
        newerBase,
        patch,
        remember: false,
      );
      expect(rebased['text'], 'accepted while queued');
      expect((rebased['style'] as Map)['fontSize'], 12);
      expect((rebased['style'] as Map)['fill'], 'red');
      expect(_resolver.resolvePatch(authored, live, patch), same(first));

      final replacementAuthored = authoredRecord(_scene(fontSize: 18), _text);
      final replacement = _resolver.resolvePatch(
        replacementAuthored,
        newerBase,
        patch,
      );
      expect((replacement['style'] as Map)['fontSize'], 18);
      expect((replacement['style'] as Map)['fill'], 'red');
      expect(replacement['text'], 'accepted while queued');
      expect((first['style'] as Map)['fontSize'], 12);
    },
  );

  test(
    'equal replacement records do not share an identity-scoped resolution',
    () {
      final document = _scene();
      final authored = authoredRecord(document, _text);
      final patch = _admit(document, _text, {'text': 'changed'}).patches.single;
      final first = _resolver.resolvePatch(authored, authored, patch);
      final sameValueBase = Map<String, Object?>.unmodifiable({...authored});
      final rebased = _resolver.resolvePatch(authored, sameValueBase, patch);
      expect(rebased, first);
      expect(rebased, isNot(same(first)));
      final sameValueAuthored = Map<String, Object?>.unmodifiable({
        ...authored,
      });
      final reauthored = _resolver.resolvePatch(
        sameValueAuthored,
        sameValueBase,
        patch,
      );
      expect(reauthored, first);
      expect(reauthored, isNot(same(rebased)));
    },
  );

  test(
    'composition replaces a merged patch and preserves unrelated resolution',
    () {
      final document = _scene();
      final authoredText = authoredRecord(document, _text);
      final authoredBar = authoredRecord(document, _bar);
      final reset = _admit(document, _text, {'style': null});
      final bar = _admit(document, _bar, {
        'size': {'height': 7},
      });
      final textPatch = reset.patches.single, barPatch = bar.patches.single;
      final resetValue = _resolver.resolvePatch(
        authoredText,
        authoredText,
        textPatch,
      );
      final barValue = _resolver.resolvePatch(
        authoredBar,
        authoredBar,
        barPatch,
      );
      final earlier = PresentationPlan([textPatch, barPatch]);
      final merged = const PresentationComposer().compose(
        earlier,
        _admit(document, _text, {
          'style': {'fill': 'red'},
        }),
      );
      final mergedText = merged.patches.singleWhere((p) => p.target == _text);
      final retainedBar = merged.patches.singleWhere((p) => p.target == _bar);
      expect(mergedText, isNot(same(textPatch)));
      expect(retainedBar, same(barPatch));
      final effective = _resolver.resolve(document, merged);
      expect((effective[_text]!['style'] as Map)['fontSize'], 12);
      expect((effective[_text]!['style'] as Map)['fill'], 'red');
      expect(effective[_bar]!['size'], {'width': 20, 'height': 7});
      expect(effective[_bar], same(barValue));
      expect(
        _resolver.resolvePatch(authoredText, authoredText, textPatch),
        same(resetValue),
      );
      expect((resetValue['style'] as Map)['fill'], isNot('red'));
    },
  );
}
