import 'package:conalog_patch_map/src/api/presentation.dart';
import 'package:conalog_patch_map/src/api/result.dart';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/presentation_layers.dart';
import 'package:flutter_test/flutter_test.dart';

DatasetDocument scene() => const DatasetReader().read([
  {
    'type': 'group',
    'id': 'group',
    'children': [
      {
        'type': 'item',
        'id': 'item',
        'size': 10,
        'attrs': {'alpha': 0.7},
        'components': [
          {
            'type': 'text',
            'id': 'text',
            'text': 'base',
            'attrs': {'alpha': 0.8},
          },
          {
            'type': 'bar',
            'id': 'bar',
            'size': 5,
            'source': {'fill': 'blue'},
          },
        ],
      },
      {
        'type': 'grid',
        'id': 'grid',
        'cells': [
          [1, 0],
        ],
        'inactiveCellStrategy': 'hide',
        'item': {
          'size': 10,
          'components': [
            {'type': 'text', 'id': 'text', 'text': 'cell'},
          ],
        },
      },
      {'type': 'rect', 'id': 'rect', 'size': 10},
      {'type': 'text', 'id': 'label', 'text': 'label'},
      {'type': 'image', 'id': 'image', 'source': 'a.svg'},
      {'type': 'relations', 'id': 'relations', 'links': []},
      {'type': 'item', 'id': 'empty', 'size': 10},
    ],
  },
  {'type': 'rect', 'id': 'outside', 'size': 10},
]);
PatchMapPresentationLayer layer({
  Iterable<PatchMapTarget> scope = const [PatchMapTarget('group')],
  Iterable<PatchMapTarget> targets = const [],
  double? matchedAlpha,
  double? unmatchedAlpha = 0.5,
}) => PatchMapPresentationLayer(
  scope: scope,
  targets: targets,
  matchedAlpha: matchedAlpha,
  unmatchedAlpha: unmatchedAlpha,
);

void main() {
  test('keys multiply and clearing zero needs no division', () {
    final document = scene(), owner = PresentationLayers();
    expect(owner.layerCount, 0);
    expect(owner.opacity, isNull);
    expect(owner.set('dim', layer(), document).changed, true);
    expect(owner.opacity!.alpha('item', 'text'), 0.5);
    for (final id in ['item', 'group', 'grid', 'empty', 'outside']) {
      expect(owner.opacity!.alpha(id), 1);
    }
    expect(owner.opacity!.affects('item'), true);
    expect(owner.opacity!.affects('group'), false);
    for (final id in ['rect', 'label', 'image', 'relations']) {
      expect(owner.opacity!.alpha(id), 0.5);
    }
    owner.set('zero', layer(unmatchedAlpha: 0), document);
    owner.set('quarter', layer(unmatchedAlpha: 0.25), document);
    expect(owner.opacity!.alpha('item', 'text'), 0);
    owner.clear('zero');
    expect(owner.opacity!.alpha('item', 'text'), 0.125);
    final reverse = PresentationLayers();
    reverse.set('quarter', layer(unmatchedAlpha: 0.25), document);
    reverse.set('dim', layer(), document);
    expect(reverse.opacity!.alpha('item', 'text'), 0.125);
    expect(owner.clear('absent').outcome, PatchMapOutcome.unchanged);
    expect(owner.layerCount, 2);
    owner.clear('dim');
    expect(owner.opacity!.alpha('rect'), 0.25);
    owner.clear('quarter');
    expect(owner.layerCount, 0);
    expect(owner.opacity, isNull);
    expect(owner.set('new', layer(), scene()).changed, true);
  });
  test('invalid final scope and malformed input reject atomically', () {
    final document = scene(), owner = PresentationLayers();
    owner.set('key', layer(), document);
    final before = owner.opacity;
    for (final input in [
      layer(scope: const [PatchMapTarget('group'), PatchMapTarget('missing')]),
      layer(scope: const [PatchMapTarget('item', componentId: 'missing')]),
      layer(scope: const [PatchMapTarget('grid', componentId: 'text')]),
      layer(scope: const [PatchMapTarget(' ')]),
      layer(targets: const [PatchMapTarget('item', componentId: '')]),
      layer(unmatchedAlpha: double.nan),
      layer(matchedAlpha: double.infinity),
      layer(unmatchedAlpha: -0.1),
      layer(matchedAlpha: 1.1),
      layer(unmatchedAlpha: null),
    ]) {
      final result = owner.set('key', input, document);
      expect(result.outcome, PatchMapOutcome.rejected);
      expect(result.failures, isNotEmpty);
      expect(result.changed, false);
      expect(owner.layerCount, 1);
      expect(identical(owner.opacity, before), true);
    }
    expect(owner.set(' ', layer(), document).outcome, PatchMapOutcome.rejected);
    expect(owner.clear('').outcome, PatchMapOutcome.rejected);
    expect(identical(owner.opacity, before), true);
    final wrongDocument = owner.set('key', layer(), scene());
    expect(wrongDocument.failures.single.code, 'INCOMPATIBLE_DOCUMENT');
    expect(identical(owner.opacity, before), true);
  });
  test(
    'duplicates dedup and outside logical targets are ignored and counted',
    () {
      final document = scene(), owner = PresentationLayers();
      final result = owner.set(
        'key',
        layer(
          scope: const [PatchMapTarget('item'), PatchMapTarget('item')],
          targets: const [
            PatchMapTarget('item'),
            PatchMapTarget('item'),
            PatchMapTarget('item', componentId: 'text'),
            PatchMapTarget('missing'),
            PatchMapTarget('missing'),
            PatchMapTarget('outside'),
          ],
          matchedAlpha: 0.2,
        ),
        document,
      );
      expect(result.scopeCount, 1);
      expect(result.targetCount, 4);
      expect(result.matchedCount, 1);
      expect(result.ignoredTargetCount, 3);
      expect(result.failures, isEmpty);
      expect(owner.opacity!.alpha('item', 'text'), 0.2);
      expect(owner.opacity!.alpha('outside'), 1);
      owner.set(
        'key',
        layer(targets: const [PatchMapTarget('item')], matchedAlpha: 0.2),
        document,
      );
      expect(owner.opacity!.alpha('item', 'text'), 0.5);
    },
  );
  test('overlap multiplies once and matched expanded membership wins', () {
    final document = scene(), owner = PresentationLayers();
    owner.set(
      'key',
      layer(
        scope: const [
          PatchMapTarget('group'),
          PatchMapTarget('item'),
          PatchMapTarget('item', componentId: 'text'),
          PatchMapTarget('grid'),
          PatchMapTarget('grid.0.0'),
        ],
        targets: const [PatchMapTarget('item', componentId: 'text')],
        matchedAlpha: 0.25,
      ),
      document,
    );
    expect(owner.opacity!.alpha('item', 'text'), 0.25);
    expect(owner.opacity!.alpha('item', 'bar'), 0.5);
    expect(owner.opacity!.alpha('grid.0.0', 'text'), 0.5);
    expect(owner.opacity!.alpha('grid.0.1', 'text'), 0.5);
    owner.set(
      'key',
      layer(
        scope: const [
          PatchMapTarget('group'),
          PatchMapTarget('item', componentId: 'text'),
        ],
        targets: const [PatchMapTarget('group')],
        matchedAlpha: 0.25,
      ),
      document,
    );
    expect(owner.opacity!.alpha('item', 'text'), 0.25);
    expect(owner.opacity!.alpha('rect'), 0.25);
  });
  test('same sets and effective neutral changes preserve opacity identity', () {
    final document = scene(), owner = PresentationLayers();
    owner.set('key', layer(), document);
    final before = owner.opacity;
    final same = owner.set(
      'key',
      layer(
        scope: const [PatchMapTarget('group'), PatchMapTarget('group')],
        targets: const [PatchMapTarget('missing')],
      ),
      document,
    );
    expect(same.outcome, PatchMapOutcome.unchanged);
    expect(same.ignoredTargetCount, 1);
    expect(identical(owner.opacity, before), true);
    expect(
      owner.set('neutral', layer(unmatchedAlpha: 1), document).changed,
      true,
    );
    expect(identical(owner.opacity, before), true);
    owner.clear('neutral');
    expect(identical(owner.opacity, before), true);
    owner.set('zero', layer(unmatchedAlpha: 0), document);
    final zero = owner.opacity;
    owner.set('key', layer(unmatchedAlpha: 0.2), document);
    expect(identical(owner.opacity, zero), true);
    owner.clear('zero');
    expect(owner.opacity!.alpha('rect'), 0.2);
    owner.reset();
    owner.set('identity', layer(unmatchedAlpha: 1), document);
    expect(owner.opacity, isNull);
    expect(owner.layerCount, 1);
  });
  test('inputs detach and authored data remains unchanged', () {
    final document = scene();
    final original = document.targets['item']!.data;
    final component = document.targets['item']!.components['text']!;
    final scope = [const PatchMapTarget('item')];
    final targets = [const PatchMapTarget('item')];
    final input = layer(scope: scope, targets: targets, matchedAlpha: 0.25);
    scope.clear();
    targets.clear();
    expect(input.scope, [const PatchMapTarget('item')]);
    expect(input.targets, [const PatchMapTarget('item')]);
    expect(() => input.scope.clear(), throwsUnsupportedError);
    expect(() => input.targets.clear(), throwsUnsupportedError);
    final owner = PresentationLayers();
    owner.set('key', input, document);
    expect(owner.opacity!.alpha('item', 'text'), 0.25);
    expect(identical(document.targets['item']!.data, original), true);
    expect(
      identical(document.targets['item']!.components['text'], component),
      true,
    );
    expect((original['attrs'] as Map)['alpha'], 0.7);
    expect((component['attrs'] as Map)['alpha'], 0.8);
    expect(component['text'], 'base');
    final failures = [const PatchMapFailure('NOT_READY', 'not ready')];
    final result = PatchMapPresentationResult(
      PatchMapOutcome.rejected,
      failures: failures,
    );
    failures.clear();
    expect(result.failures.single.code, 'NOT_READY');
    expect(() => result.failures.clear(), throwsUnsupportedError);
  });
  test('missing paint defaults to one and empty scope stays effect free', () {
    final document = scene(), owner = PresentationLayers();
    owner.set(
      'key',
      layer(
        scope: const [PatchMapTarget('item'), PatchMapTarget('rect')],
        targets: const [PatchMapTarget('item')],
        matchedAlpha: 0.3,
        unmatchedAlpha: null,
      ),
      document,
    );
    expect(owner.opacity!.alpha('item', 'text'), 0.3);
    expect(owner.opacity!.alpha('rect'), 1);
    owner.reset();
    final result = owner.set(
      'empty',
      layer(scope: const [], targets: const [PatchMapTarget('missing')]),
      document,
    );
    expect(result.scopeCount, 0);
    expect(result.ignoredTargetCount, 1);
    expect(owner.opacity, isNull);
  });
  test(
    'floating point composition follows keys independent of insert order',
    () {
      final document = scene();
      final forward = PresentationLayers(), reverse = PresentationLayers();
      final factors = {'a': 0.1, 'b': 0.2, 'c': 0.3};
      for (final key in factors.keys) {
        forward.set(key, layer(unmatchedAlpha: factors[key]), document);
      }
      for (final key in factors.keys.toList().reversed) {
        reverse.set(key, layer(unmatchedAlpha: factors[key]), document);
      }
      expect(forward.opacity!.alpha('rect'), reverse.opacity!.alpha('rect'));
    },
  );
  test(
    'reset releases layers and document binding without changing held values',
    () {
      final owner = PresentationLayers();
      owner.set('key', layer(), scene());
      final held = owner.opacity!;
      owner.reset();
      expect(owner.layerCount, 0);
      expect(owner.opacity, isNull);
      expect(held.alpha('rect'), 0.5);
      expect(owner.set('next', layer(), scene()).changed, true);
      owner.reset();
      owner.reset();
      expect(owner.clear('next').outcome, PatchMapOutcome.unchanged);
    },
  );
}
