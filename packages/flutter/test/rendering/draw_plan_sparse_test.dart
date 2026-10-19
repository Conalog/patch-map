import 'dart:collection';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:conalog_patch_map/src/rendering/draw_plan.dart';
import 'package:flutter_test/flutter_test.dart';
import 'draw_plan_test.dart' as support;

class CountedNodes extends ListBase<DrawNode> {
  CountedNodes(this.values);
  final List<DrawNode> values;
  int reads = 0;
  @override
  int get length => values.length;
  @override
  set length(int _) => throw UnsupportedError('immutable');
  @override
  DrawNode operator [](int index) {
    reads++;
    return values[index];
  }

  @override
  void operator []=(int index, DrawNode value) =>
      throw UnsupportedError('immutable');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('one sparse bar edit visits only affected retained chunk members', () {
    final h = support.Harness(active: false);
    addTearDown(h.close);
    final p = h.read([
      for (var i = 0; i < 10000; i++)
        support.item(
          'i$i',
          i * 44.0,
          components: [support.background(), support.bar()],
        ),
    ]);
    final old = support.component(p.geometry, 'i0', 'bar');
    final change = p.geometry.prepare({
      const PatchMapTarget(
        'i0',
        componentId: 'bar',
      ): Map<String, Object?>.unmodifiable({
        ...old,
        'size': {'width': 20, 'height': 16},
      }),
    }, h.text.measure);
    final nodes = p.nodes.toList();
    for (final e in change.changed.entries) {
      nodes[e.key] = h.compiler.compile(
        e.value,
        initialLoad: false,
        previous: p.nodes[e.key],
      );
    }
    final counted = <CountedNodes>[];
    final pages = <RenderPage>[];
    for (
      var start = 0;
      start < nodes.length;
      start += change.snapshot.nodes.pageSize
    ) {
      final end = (start + change.snapshot.nodes.pageSize).clamp(
        0,
        nodes.length,
      );
      final list = CountedNodes(nodes.sublist(start, end));
      counted.add(list);
      pages.add(RenderPage(list));
    }
    for (final list in counted) {
      list.reads = 0;
    }
    final q = RenderPlan.build(
      change.snapshot,
      pages,
      previous: p.plan,
      changedSlots: change.changed.keys,
    );
    addTearDown(q.dispose);
    final reads = counted.fold<int>(0, (sum, list) => sum + list.reads);
    expect(change.changed.length, 1);
    expect(q.meshBuildCount, 0);
    expect(q.overlapComparisonCount, 0);
    expect(
      reads,
      lessThanOrEqualTo(change.snapshot.nodes.pageSize),
      reason:
          'A sparse dependency-only edit must not revisit every unchanged chunk member',
    );
  });
}
