import 'dart:ui';
import 'dart:collection';
import 'dart:typed_data';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/presentation/record_delta.dart';
import 'package:conalog_patch_map/src/rendering/draw_compiler.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:flutter_test/flutter_test.dart';

import 'draw_plan_test.dart' as support;

Map<String, Object?> _patch(
  Map<String, Object?> before,
  Map<String, Object?> delta,
) => Map.unmodifiable({...before, ...delta});

Map<String, Object?> _number() => {
  'type': 'text',
  'id': 'number',
  'text': '123',
  'style': {'fontSize': 12},
};

final class _Asset extends support.FakeAsset {
  _Asset(super.name, super.events);
  Object? error;
  @override
  Object? get failure => error;
}

/// Source retries may cover the whole transaction. Per-item compilation must
/// only query addressed components, never traverse this global collection.
final class _LookupOnlyTargets extends SetBase<PatchMapTarget> {
  _LookupOnlyTargets(this.values);
  final Set<PatchMapTarget> values;
  @override
  int get length => values.length;
  @override
  bool contains(Object? element) => values.contains(element);
  @override
  PatchMapTarget? lookup(Object? element) => values.lookup(element);
  @override
  Set<PatchMapTarget> toSet() => values.toSet();
  @override
  Iterator<PatchMapTarget> get iterator =>
      throw StateError('global source retry traversal');
  @override
  bool add(PatchMapTarget value) => throw UnsupportedError('read only');
  @override
  bool remove(Object? value) => throw UnsupportedError('read only');
  @override
  void clear() => throw UnsupportedError('read only');
}

RecordDelta _delta(int fields) =>
    RecordDelta(before: const {}, after: const {}, fields: fields);

final class _CountedChanges extends ComponentChanges {
  _CountedChanges(this.data, {this.allowTraversal = true});
  final ComponentChanges data;
  final bool allowTraversal;
  int reads = 0, traversals = 0;
  @override
  int get length => data.length;
  @override
  RecordDelta? operator [](int key) {
    reads++;
    return data[key];
  }

  @override
  Iterator<ComponentChange> get iterator {
    if (!allowTraversal) throw StateError('unexpected hint traversal');
    traversals++;
    return data.iterator;
  }

  @override
  void add(int index, RecordDelta delta) => throw UnsupportedError('read only');
}

final class _Projection {
  _Projection(this.geometry, this.nodes);
  final GeometrySnapshot geometry;
  final List<DrawNode> nodes;
}

Future<Uint8List> _pixels(DrawNode node) async {
  final recorder = PictureRecorder();
  support.paintReferenceNode(
    node,
    Canvas(recorder),
    cameraRotation: 0,
    physicalScale: 1,
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(80, 80);
  try {
    final bytes = await image.toByteData(format: ImageByteFormat.rawRgba);
    return Uint8List.fromList(bytes!.buffer.asUint8List());
  } finally {
    image.dispose();
    picture.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late support.Harness h;
  late DrawCompiler compiler;
  late List<_Asset> assets;
  late List<bool> retries;
  setUp(() {
    h = support.Harness(active: false);
    h.text.setActive(false);
    assets = [];
    retries = [];
    compiler = DrawCompiler(
      palette: h.palette,
      text: h.text,
      assets: (source, tint, {required initialLoad, retry = false}) {
        retries.add(retry);
        final asset = _Asset(source as String, h.events);
        assets.add(asset);
        return asset;
      },
    );
    addTearDown(h.close);
  });

  _Projection initial() {
    final document = const DatasetReader().read([
      support.item(
        'i',
        8,
        components: [
          support.background(),
          support.bar(),
          _number(),
          support.icon('asset'),
        ],
      ),
    ]);
    final geometry = GeometrySnapshot.compile(document, h.text.measure);
    final node = compiler.compile(geometry['i']!, initialLoad: true);
    node.retain();
    addTearDown(node.release);
    return _Projection(geometry, [node]);
  }

  DrawNode compile(
    _Projection before,
    Map<PatchMapTarget, Map<String, Object?>> changes, {
    int fields = 0,
    ComponentChanges? componentChanges,
  }) {
    final geometry = before.geometry.prepare(
      changes,
      (_, _) => const Size(18, 14),
    );
    final node = compiler.compile(
      geometry.snapshot['i']!,
      initialLoad: false,
      previous: before.nodes.single,
      fields: fields,
      componentChanges: componentChanges,
    );
    node.retain();
    addTearDown(node.release);
    return node;
  }

  test(
    'sparse bar geometry keeps sibling content and asset metadata',
    () async {
      final p = initial(), old = p.nodes.single;
      final oldPixels = await _pixels(old);
      // Populated upright caches must not repeatedly search all hints. World
      // preparation consumes the same map once; no published node retains it.
      final worldChanges = _CountedChanges(
        ComponentChanges.single(1, _delta(0)),
      );
      final unchanged = DrawNode(
        old.geometry,
        old.components,
        old.content,
        previous: old,
        componentChanges: worldChanges,
      );
      unchanged.retain();
      addTearDown(unchanged.release);
      expect(worldChanges.traversals, 1);
      expect(worldChanges.reads, 0);
      final keys = h.text.keyCreates;
      final next = compile(
        p,
        {
          const PatchMapTarget('i', componentId: 'bar'): _patch(
            old.components[1].layout.data,
            {
              'size': {'width': 8, 'height': 12},
              'placement': 'top',
            },
          ),
        },
        componentChanges: ComponentChanges.single(
          1,
          _delta(RecordFields.size | RecordFields.placement),
        ),
      );
      expect(next.components[1].content, same(old.components[1].content));
      for (final index in [0, 2, 3]) {
        expect(next.components[index], isNot(same(old.components[index])));
        expect(
          next.components[index].content,
          same(old.components[index].content),
        );
        expect(
          next.components[index].matrix,
          same(old.components[index].matrix),
        );
      }
      expect(next.assets, same(old.assets));
      expect(next.assetTargets, same(old.assetTargets));
      expect(h.text.keyCreates, keys);
      expect(assets, hasLength(1));
      expect(old.components[1].layout.box.width, 20);
      expect(next.components[1].layout.box.width, 8);
      final reference = compiler.compile(next.geometry, initialLoad: false);
      reference.retain();
      addTearDown(reference.release);
      final pixels = await _pixels(next);
      expect(pixels, orderedEquals(await _pixels(reference)));
      expect(pixels, isNot(orderedEquals(oldPixels)));
      expect(await _pixels(old), orderedEquals(oldPixels));
    },
  );

  test('text and asset placement, transform and visibility reuse content', () {
    final p = initial(), old = p.nodes.single;
    final keys = h.text.keyCreates;
    final next = compile(
      p,
      {
        for (final index in [2, 3])
          PatchMapTarget(
            'i',
            componentId: old.components[index].layout.id,
          ): _patch(old.components[index].layout.data, {
            'placement': 'top',
            'show': false,
            'attrs': {'x': 4, 'angle': 15},
          }),
      },
      componentChanges:
          (ComponentChanges.single(
            2,
            _delta(
              RecordFields.placement |
                  RecordFields.show |
                  RecordFields.attrsTransform,
            ),
          )..add(
            3,
            _delta(
              RecordFields.placement |
                  RecordFields.show |
                  RecordFields.attrsTransform,
            ),
          )),
    );
    for (final index in [2, 3]) {
      expect(
        next.components[index].content,
        same(old.components[index].content),
      );
      expect(next.components[index].layout.visible, false);
      expect(old.components[index].layout.visible, true);
    }
    expect(h.text.keyCreates, keys);
    expect(assets, hasLength(1));
    expect(next.assets, same(old.assets));
  });

  test(
    'tint and component alpha invalidate only their content dependencies',
    () {
      final p = initial(), old = p.nodes.single;
      final keys = h.text.keyCreates;
      final next = compile(
        p,
        {
          const PatchMapTarget('i', componentId: 'number'): _patch(
            old.components[2].layout.data,
            {'tint': 'red'},
          ),
          const PatchMapTarget('i', componentId: 'icon'): _patch(
            old.components[3].layout.data,
            {
              'attrs': {'alpha': .5},
            },
          ),
        },
        componentChanges: (ComponentChanges.single(2, _delta(RecordFields.tint))
          ..add(3, _delta(RecordFields.attrsAlpha))),
      );
      expect(next.components[0], isNot(same(old.components[0])));
      expect(next.components[0].content, same(old.components[0].content));
      expect(next.components[0].matrix, same(old.components[0].matrix));
      expect(next.components[1], isNot(same(old.components[1])));
      expect(next.components[1].content, same(old.components[1].content));
      expect(next.components[1].matrix, same(old.components[1].matrix));
      expect(
        next.components[2].content,
        isNot(same(old.components[2].content)),
      );
      expect(
        (next.components[2].content as TextContent).handle.spec.color,
        const Color(0xffff0000),
      );
      expect(
        (old.components[2].content as TextContent).handle.spec.text,
        '123',
      );
      expect(h.text.keyCreates, keys + 1);
      expect(assets, hasLength(2));
      expect(next.assets, isNot(same(old.assets)));
    },
  );

  test('every text content dependency prepares a new content lease', () {
    final p = initial(), old = p.nodes.single;
    for (final (delta, fields) in <(Map<String, Object?>, int)>[
      ({'text': '456'}, RecordFields.text),
      (
        {
          'style': {'fontSize': 15},
        },
        RecordFields.style,
      ),
      ({'split': 1}, RecordFields.split),
      ({'overflow': 'hidden'}, RecordFields.overflow),
      (
        {
          'margin': {'top': 1, 'right': 2, 'bottom': 1, 'left': 2},
        },
        RecordFields.margin,
      ),
      (
        {
          'attrs': {'alpha': .5},
        },
        RecordFields.attrsAlpha,
      ),
    ]) {
      final keys = h.text.keyCreates;
      final next = compile(p, {
        const PatchMapTarget('i', componentId: 'number'): _patch(
          old.components[2].layout.data,
          delta,
        ),
      }, componentChanges: ComponentChanges.single(2, _delta(fields)));
      expect(
        next.components[2].content,
        isNot(same(old.components[2].content)),
      );
      expect(h.text.keyCreates, keys + 1);
      expect(next.components[3], isNot(same(old.components[3])));
      expect(next.components[3].content, same(old.components[3].content));
      expect(next.components[3].matrix, same(old.components[3].matrix));
    }
    expect(assets, hasLength(1));
  });

  test(
    'world and orientation changes retain content and update projections',
    () {
      final p = initial(), old = p.nodes.single;
      final keys = h.text.keyCreates;
      final next = compile(
        p,
        {
          const PatchMapTarget('i'): _patch(old.geometry.data, {
            'attrs': {'x': 18, 'y': 12, 'angle': 20, 'scaleX': 2},
            'contentOrientation': 'normal',
          }),
        },
        fields: RecordFields.attrsTransform | RecordFields.contentOrientation,
        componentChanges: const ComponentChanges.empty(),
      );
      for (var i = 0; i < old.components.length; i++) {
        expect(next.components[i].content, same(old.components[i].content));
      }
      expect(next.components[2].layout.upright, false);
      expect(old.components[2].layout.upright, true);
      expect(next.matrix[12], 18);
      expect(old.matrix[12], 8);
      expect(h.text.keyCreates, keys);
      expect(assets, hasLength(1));
    },
  );

  test('parent opacity and content bounds invalidate dependent resources', () {
    final p = initial(), old = p.nodes.single;
    final keys = h.text.keyCreates;
    final all = ComponentChanges.single(0, _delta(0));
    for (var index = 1; index < old.components.length; index++) {
      all.add(index, _delta(0));
    }
    final hints = _CountedChanges(all, allowTraversal: false);
    final bounds = compile(
      p,
      {
        const PatchMapTarget('i'): _patch(old.geometry.data, {
          'padding': {'top': 3, 'right': 3, 'bottom': 3, 'left': 3},
        }),
      },
      fields: RecordFields.padding,
      componentChanges: hints,
    );
    expect(
      hints.reads,
      hints.length,
      reason: 'Broad invalidation uses one point lookup per component',
    );
    expect(bounds.components[0].content, same(old.components[0].content));
    expect(bounds.components[1].content, same(old.components[1].content));
    expect(
      bounds.components[2].content,
      isNot(same(old.components[2].content)),
    );
    expect(bounds.components[3].content, same(old.components[3].content));
    expect(h.text.keyCreates, keys + 1);
    expect(assets, hasLength(1));
    final faded = compile(
      p,
      {
        const PatchMapTarget('i'): _patch(old.geometry.data, {
          'attrs': {'x': 8, 'y': 8, 'alpha': .5},
        }),
      },
      fields: RecordFields.attrsAlpha,
      componentChanges: const ComponentChanges.empty(),
    );
    for (var i = 0; i < old.components.length; i++) {
      expect(
        faded.components[i].content,
        isNot(same(old.components[i].content)),
      );
    }
    expect(assets, hasLength(2));
  });

  test(
    'reordering uses new paint order and preserves content by component id',
    () {
      final p = initial(), old = p.nodes.single;
      final next = compile(
        p,
        {
          const PatchMapTarget('i', componentId: 'bar'): _patch(
            old.components[1].layout.data,
            {
              'attrs': {'zIndex': 4},
            },
          ),
        },
        componentChanges: ComponentChanges.single(
          1,
          _delta(RecordFields.attrsZIndex),
        ),
      );
      expect(next.components.map((c) => c.layout.id), [
        'bg',
        'number',
        'icon',
        'bar',
      ]);
      for (final component in next.components) {
        expect(
          component.content,
          same(
            old.components
                .firstWhere((prior) => prior.layout.id == component.layout.id)
                .content,
          ),
        );
      }
      expect(old.components.map((c) => c.layout.id), [
        'bg',
        'bar',
        'number',
        'icon',
      ]);
      expect(assets, hasLength(1));
    },
  );

  test(
    'same failed source request retries without losing previous asset lease',
    () {
      final p = initial(), old = p.nodes.single;
      assets.single.error = StateError('failed');
      final next = compiler.compile(
        old.geometry,
        initialLoad: false,
        previous: old,
        fields: 0,
        componentChanges: ComponentChanges.single(3, _delta(0)),
        retrySources: _LookupOnlyTargets({
          const PatchMapTarget('i', componentId: 'icon'),
        }),
      );
      next.retain();
      addTearDown(next.release);
      expect(assets, hasLength(2));
      expect(retries, [false, true]);
      expect(
        next.components.last.content,
        isNot(same(old.components.last.content)),
      );
      expect(old.assets.single, same(assets.first));
      expect(next.assets.single, same(assets.last));
      expect(assets.first.references, 1);
    },
  );
}
