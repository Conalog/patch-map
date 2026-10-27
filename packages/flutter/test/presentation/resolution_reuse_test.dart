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

Map<String, Object?> _resolve(
  DatasetDocument document,
  PresentationPlan plan, {
  Map<String, Object?>? current,
}) {
  final patch = plan.patches.single;
  final authored = authoredRecord(document, patch.target);
  return _resolver.resolvePatch(authored, current ?? authored, patch);
}

void main() {
  test(
    'resolved owned maps stay immutable across nested updates and resets',
    () {
      final document = _scene();
      final authored = authoredRecord(document, _text);
      final firstValue = _resolve(
        document,
        _admit(document, _text, {
          'text': 'first',
          'style': {'fontSize': 24, 'fill': 'red'},
        }),
      );
      final firstStyle = firstValue['style'] as Map<String, Object?>;
      final later = _resolve(
        document,
        _admit(document, _text, {
          'text': 'later',
          'style': {'fontSize': 36, 'fill': 'blue'},
        }, current: firstValue),
        current: firstValue,
      );
      final reset = _resolve(
        document,
        _admit(document, _text, {'style': null}, current: later),
        current: later,
      );
      expect(() => firstValue['text'] = 'mutated', throwsUnsupportedError);
      expect(() => firstStyle['fill'] = 'mutated', throwsUnsupportedError);
      expect(firstValue['text'], 'first');
      expect(firstStyle['fontSize'], 24);
      expect(firstStyle['fill'], 'red');
      expect((later['style'] as Map)['fontSize'], 36);
      expect((later['style'] as Map)['fill'], 'blue');
      expect(reset['style'], authored['style']);
      expect(reset['text'], 'later');
      expect(authored['text'], 'authored');
    },
  );

  test('admitted claims share only detached immutable operation paths', () {
    final callerPath = ['style', 'fill'];
    final operation = FieldOperation(
      FieldOperationKind.childrenSet,
      callerPath,
      'red',
    );
    final shared = PresentationClaim.fromOperation(
      _text,
      operation,
      'red',
      exists: true,
    );
    final external = PresentationClaim(_text, callerPath, 'red', exists: true);
    callerPath[1] = 'fontSize';
    expect(shared.path, ['style', 'fill']);
    expect(external.path, ['style', 'fill']);
    expect(shared.path, same(operation.path));
    expect(() => shared.path.clear(), throwsUnsupportedError);
    expect(() => external.path.clear(), throwsUnsupportedError);

    final admitted = _admit(_scene(), _text, {
      'style': {'fill': 'red'},
    });
    expect(
      admitted.claims.single.path,
      same(admitted.patches.single.operations.single.path),
    );
  });

  test(
    'indexed composition keeps earlier snapshots and reset barriers immutable',
    () {
      final document = _scene();
      const composer = PresentationComposer();
      final original = composer.composeIndexed(
        PresentationPlan([]),
        _admit(document, _text, {'style': null}),
      );
      final barBatch = _admit(document, _bar, {
        'size': {'height': 7},
      });
      final withBar = composer.composeIndexed(original.plan, barBatch);
      final filled = composer.composeIndexed(
        withBar.plan,
        _admit(document, _text, {
          'style': {'fill': 'red'},
        }),
      );
      expect(original.index.keys, [_text]);
      expect(withBar.index[_text], same(original.index[_text]));
      expect(filled.index[_bar], same(withBar.index[_bar]));
      expect(filled.index[_text], isNot(same(withBar.index[_text])));
      expect(filled.index.values, orderedEquals(filled.plan.patches));
      final emptyLater = composer.composeIndexed(
        filled.plan,
        PresentationPlan([]),
      );
      expect(emptyLater.plan, same(filled.plan));
      expect(emptyLater.index.values, orderedEquals(filled.plan.patches));
      expect(() => filled.index.clear(), throwsUnsupportedError);
      expect(() => filled.plan.patches.clear(), throwsUnsupportedError);
      final before = _resolve(document, original.plan);
      final after = {
        for (final patch in filled.plan.patches)
          patch.target: _resolver.resolvePatch(
            authoredRecord(document, patch.target),
            authoredRecord(document, patch.target),
            patch,
          ),
      };
      expect((before['style'] as Map)['fill'], isNot('red'));
      expect((after[_text]!['style'] as Map)['fontSize'], 12);
      expect((after[_text]!['style'] as Map)['fill'], 'red');
      expect(after[_bar]!['size'], {'width': 20, 'height': 7});
    },
  );

  test(
    'reset and later field resolve against the execution base and document',
    () {
      final document = _scene();
      final authored = authoredRecord(document, _text);
      final live = _resolve(
        document,
        _admit(document, _text, {
          'text': 'live',
          'style': {'fontSize': 30},
        }),
      );
      final reset = _admit(document, _text, {'style': null}, current: live);
      final fill = _admit(document, _text, {
        'style': {'fill': 'red'},
      }, current: live);
      final patch = const PresentationComposer()
          .composeIndexed(reset, fill)
          .plan
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
      final merged = const PresentationComposer()
          .composeIndexed(
            earlier,
            _admit(document, _text, {
              'style': {'fill': 'red'},
            }),
          )
          .plan;
      final mergedText = merged.patches.singleWhere((p) => p.target == _text);
      final retainedBar = merged.patches.singleWhere((p) => p.target == _bar);
      expect(mergedText, isNot(same(textPatch)));
      expect(retainedBar, same(barPatch));
      final effective = {
        for (final patch in merged.patches)
          patch.target: _resolver.resolvePatch(
            authoredRecord(document, patch.target),
            authoredRecord(document, patch.target),
            patch,
          ),
      };
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
