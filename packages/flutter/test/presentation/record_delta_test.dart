import 'dart:collection';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/presentation/field_operations.dart';
import 'package:conalog_patch_map/src/presentation/presentation_composer.dart';
import 'package:conalog_patch_map/src/presentation/presentation_resolver.dart';
import 'package:conalog_patch_map/src/presentation/record_delta.dart';
import 'package:flutter_test/flutter_test.dart';

const _target = PatchMapTarget('item');
const _resolver = PresentationResolver();

PresentationPatch _patch(List<FieldOperation> operations) =>
    PresentationPatch(_target, operations);
FieldOperation _set(List<String> path, Object? value) =>
    FieldOperation(FieldOperationKind.childrenSet, path, value);

void main() {
  test(
    'every supported root owns a distinct bit and detects its final change',
    () {
      final roots = {
        'size': RecordFields.size,
        'padding': RecordFields.padding,
        'contentOrientation': RecordFields.contentOrientation,
        'show': RecordFields.show,
        'locked': RecordFields.locked,
        'label': RecordFields.label,
        'source': RecordFields.source,
        'tint': RecordFields.tint,
        'text': RecordFields.text,
        'style': RecordFields.style,
        'split': RecordFields.split,
        'overflow': RecordFields.overflow,
        'placement': RecordFields.placement,
        'margin': RecordFields.margin,
        'animation': RecordFields.animation,
        'animationDuration': RecordFields.animationDuration,
        'opacity': RecordFields.opacity,
        'fill': RecordFields.fill,
        'stroke': RecordFields.stroke,
        'radius': RecordFields.radius,
        'eventMode': RecordFields.eventMode,
        'gap': RecordFields.gap,
      };
      var combined = RecordFields.attrs;
      for (final entry in roots.entries) {
        expect(RecordFields.forPath([entry.key]), entry.value);
        expect(
          _patch([
            _set([entry.key], 2),
          ]).requestedFields,
          entry.value,
        );
        expect(combined & entry.value, 0);
        combined |= entry.value;
        expect(
          recordChangedFields({entry.key: 1}, {entry.key: 2}, RecordFields.all),
          entry.value,
        );
      }
      expect(combined, RecordFields.all);
    },
  );

  test(
    'actual final fields exclude equal operations and cancelled changes',
    () {
      final before = <String, Object?>{
        'text': 'old',
        'show': true,
        'style': {'fill': 'red'},
      };
      final delta = _resolver.resolveDelta(
        before,
        before,
        _patch([
          _set(['text'], 'temporary'),
          _set(['text'], 'old'),
          _set(['show'], true),
          _set(['style', 'fill'], 'blue'),
        ]),
      );
      expect(delta.before, same(before));
      expect(delta.after['text'], 'old');
      expect(delta.fields, RecordFields.style);
      expect(() => delta.after.clear(), throwsUnsupportedError);
    },
  );

  test('size representations compare equally without replacing raw maps', () {
    for (final pair in <(Object, Object)>[
      (20, {'width': 20, 'height': 20}),
      (
        {'width': 20, 'height': '50%'},
        {
          'width': {'value': 20, 'unit': 'px'},
          'height': {'value': 50, 'unit': '%'},
        },
      ),
      ({'value': 50, 'unit': '%'}, {'width': '50%', 'height': '50%'}),
    ]) {
      final before = <String, Object?>{'size': pair.$1};
      final delta = _resolver.resolveDelta(
        before,
        before,
        _patch([
          _set(['size'], pair.$2),
        ]),
      );
      expect(delta.fields, 0);
      expect(delta.after['size'], same(pair.$2));
      expect(before['size'], same(pair.$1));
    }
    expect(
      recordChangedFields(
        {'size': 20},
        {
          'size': {'width': 20, 'height': 21},
        },
        RecordFields.size,
      ),
      RecordFields.size,
    );
  });

  test(
    'size comparison retains missing axes, units and raw metadata meaning',
    () {
      for (final (before, after, equal) in <(Object?, Object?, bool)>[
        (20, {'value': 20, 'unit': 'px'}, true),
        ('50%', {'value': 50, 'unit': '%'}, true),
        ('50%', '50.0%', true),
        ('50%', {'value': 50, 'unit': 'px'}, false),
        ({}, {'width': null, 'height': null}, true),
        ({'width': 20}, {'width': 20, 'height': null}, true),
        ({'width': 20}, {'width': 20, 'height': 0}, false),
        (
          {
            'width': {'value': 20},
            'height': 10,
          },
          {'width': 20, 'height': 10},
          false,
        ),
        (
          {
            'width': {'value': 20},
            'height': 10,
          },
          {
            'width': {'value': 20, 'unit': null},
            'height': 10,
          },
          true,
        ),
        (
          {
            'value': 20,
            'unit': 'px',
            'metadata': {'revision': 1},
          },
          {
            'value': 20,
            'unit': 'px',
            'metadata': {'revision': 2},
          },
          true,
        ),
        (
          {
            'width': 20,
            'height': 30,
            'metadata': {'revision': 1},
          },
          {
            'width': 20,
            'height': 30,
            'metadata': {'revision': 2},
          },
          true,
        ),
        (
          {
            'value': {'x': 1},
            'unit': 'px',
          },
          {
            'value': {'x': 1},
            'unit': 'px',
          },
          true,
        ),
        (
          {
            'value': {'x': 1},
            'unit': 'px',
            'metadata': 1,
          },
          {
            'value': {'x': 1},
            'unit': 'px',
            'metadata': 2,
          },
          false,
        ),
        ('calc(5px + 20%)', 'calc(5px + 20%)', true),
        ('calc(5px + 20%)', 'calc(5px + 25%)', false),
      ]) {
        for (final (left, right) in [(before, after), (after, before)]) {
          expect(
            recordChangedFields(
              {'size': left},
              {'size': right},
              RecordFields.size,
            ),
            equal ? 0 : RecordFields.size,
            reason: '$left / $right',
          );
        }
      }
      expect(
        recordChangedFields({}, {'size': null}, RecordFields.size),
        RecordFields.size,
      );
    },
  );

  test('size axis comparison does not traverse unrelated raw metadata', () {
    final before = _ReadGuard(
      {
        'metadata': {
          'unrelated': [1, 2, 3],
        },
        'width': '100%',
        'height': '25%',
      },
      forbidden: {'metadata'},
    );
    final after = _ReadGuard(
      {
        'metadata': {
          'unrelated': [1, 2, 3],
        },
        'width': '100%',
        'height': '50%',
      },
      forbidden: {'metadata'},
    );
    expect(
      recordChangedFields({'size': before}, {'size': after}, RecordFields.size),
      RecordFields.size,
    );
  });

  test(
    'attrs classify transforms, alpha, order and extension independently',
    () {
      final before = <String, Object?>{
        'attrs': {
          'x': 0,
          'alpha': 1,
          'zIndex': 0,
          'metadata': {'label': 'old'},
        },
      };
      for (final (path, value, fields) in [
        (['attrs', 'x'], 2, RecordFields.attrsTransform),
        (['attrs', 'alpha'], 0.5, RecordFields.attrsAlpha),
        (['attrs', 'zIndex'], 1, RecordFields.attrsZIndex),
        (['attrs', 'metadata', 'label'], 'new', RecordFields.attrsExtension),
      ]) {
        expect(
          _resolver
              .resolveDelta(before, before, _patch([_set(path, value)]))
              .fields,
          fields,
        );
      }
      final delta = _resolver.resolveDelta(
        const {'attrs': <String, Object?>{}},
        before,
        _patch([
          FieldOperation(FieldOperationKind.reset, ['attrs'], null),
          _set(['attrs', 'x'], 0),
        ]),
      );
      expect(
        delta.fields,
        RecordFields.attrsAlpha |
            RecordFields.attrsZIndex |
            RecordFields.attrsExtension,
      );
    },
  );

  test('comparison skips unrequested root and attrs dependencies', () {
    final before = _ReadGuard(
      {'text': 'before'},
      forbidden: {'style', 'attrs'},
    );
    final after = _ReadGuard({'text': 'after'}, forbidden: {'style', 'attrs'});
    expect(
      recordChangedFields(before, after, RecordFields.text),
      RecordFields.text,
    );
    final oldAttrs = _ReadGuard({'x': 0}, forbidden: {'metadata'});
    final newAttrs = _ReadGuard({'x': 1}, forbidden: {'metadata'});
    expect(
      recordChangedFields(
        {'attrs': oldAttrs},
        {'attrs': newAttrs},
        RecordFields.attrsTransform,
      ),
      RecordFields.attrsTransform,
    );
  });

  test('memo carries fields and invalidates on base or authored identity', () {
    final authored = <String, Object?>{
      'text': 'authored',
      'style': {'fill': 'red'},
    };
    final before = _ReadGuard({...authored});
    final patch = _patch([
      _set(['text'], 'next'),
    ]);
    final first = _resolver.resolveDelta(authored, before, patch);
    final reads = before.reads;
    final memo = _resolver.resolveDelta(authored, before, patch);
    expect(memo, same(first));
    expect(
      _resolver.resolveDelta(authored, before, patch, remember: false),
      same(first),
    );
    expect(memo.after, same(first.after));
    expect(memo.fields, RecordFields.text);
    expect(before.reads, reads);
    final rebased = _resolver.resolveDelta(authored, first.after, patch);
    expect(rebased.fields, 0);
    expect(rebased.after, same(first.after));

    final reset = _patch([
      FieldOperation(FieldOperationKind.reset, ['style'], null),
      _set(['style', 'fill'], 'blue'),
    ]);
    final resetFirst = _resolver.resolveDelta(authored, before, reset);
    final newerAuthored = <String, Object?>{
      ...authored,
      'style': {'fill': 'blue'},
    };
    final resetNext = _resolver.resolveDelta(newerAuthored, before, reset);
    expect(resetFirst.fields, RecordFields.style);
    expect(resetNext.fields, RecordFields.style);
    expect(resetNext.after, isNot(same(resetFirst.after)));
  });

  test('composed reset then child assignment compares with execution base', () {
    final authored = <String, Object?>{
      'style': {'fontSize': 12, 'fill': 'red'},
    };
    final live = <String, Object?>{
      'style': {'fontSize': 30, 'fill': 'blue'},
    };
    final earlier = PresentationPlan([
      _patch([
        FieldOperation(FieldOperationKind.reset, ['style'], null),
      ]),
    ]);
    final later = PresentationPlan([
      _patch([
        _set(['style', 'fontSize'], 30),
        _set(['style', 'fill'], 'blue'),
      ]),
    ]);
    final merged = const PresentationComposer()
        .composeIndexed(earlier, later)
        .plan;
    final delta = _resolver.resolveDelta(authored, live, merged.patches.single);
    expect(delta.fields, 0);
    expect(delta.after, live);
    final rebased = _resolver.resolveDelta(
      authored,
      authored,
      merged.patches.single,
    );
    expect(rebased.fields, RecordFields.style);
    expect(rebased.after, live);
  });
}

class _ReadGuard extends MapBase<String, Object?> {
  _ReadGuard(this.valuesMap, {this.forbidden = const {}});
  final Map<String, Object?> valuesMap;
  final Set<String> forbidden;
  int reads = 0;
  @override
  Object? operator [](Object? key) {
    if (forbidden.contains(key)) throw StateError('unexpected read of $key');
    reads++;
    return valuesMap[key];
  }

  @override
  Iterable<String> get keys => valuesMap.keys;
  @override
  void operator []=(String key, Object? value) =>
      throw UnsupportedError('test');
  @override
  void clear() => throw UnsupportedError('test');
  @override
  Object? remove(Object? key) => throw UnsupportedError('test');
}
