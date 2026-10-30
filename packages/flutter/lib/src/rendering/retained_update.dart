import 'dart:collection';
import 'dart:ui';

import '../api/target.dart';
import '../dataset/colors.dart';
import '../dataset/dataset_reader.dart';
import '../dataset/dataset_styles.dart';
import '../geometry/affine.dart';
import '../geometry/geometry_snapshot.dart';
import '../geometry/item_data.dart';
import '../geometry/item_layout.dart';
import '../presentation/field_operations.dart';
import '../presentation/presentation_admission.dart';
import '../presentation/presentation_resolver.dart';
import '../presentation/record_delta.dart';
import 'bar_transitions.dart';
import 'draw_objects.dart';
import 'draw_plan.dart';
import 'render_publication.dart';
import '../resources/text/text_spec.dart';

/// The validated entries themselves cross session -> resource prep -> commit.
/// The Map adapter is solely the existing session's immutable record interface;
/// it never constructs a target-keyed Map or another component staging model.
final class RetainedUpdate extends MapBase<PatchMapTarget, RecordDelta> {
  RetainedUpdate._(
    this.document,
    this.baseline,
    this.generation,
    this.revision,
    this.epoch,
    this.batch,
  );
  final DatasetDocument document;
  final RenderPublication baseline;
  final int generation, revision, epoch;
  final PresentationBatch? batch;
  final _all = <_Entry>[];
  final _records = <MapEntry<PatchMapTarget, RecordDelta>>[];
  final _items = <_Item>[];
  late final Map<PatchMapTarget, PresentationPatch> patchIndex = _PatchIndex(
    _all,
  );
  bool _prepared = false, _committed = false, _disposed = false;
  GeometrySnapshot? _geometry;
  GeometrySnapshot get geometry => _geometry!;
  Iterable<int> get slots => _items.map((item) => item.slot);
  final oldBounds = <int, Rect?>{};
  final staticProofs = <int, Object?>{};
  List<int>? _presentationGeometryChanges;
  Iterable<int> get presentationGeometryChanges =>
      _presentationGeometryChanges ?? const [];

  static RetainedUpdate? validate(
    DatasetDocument document,
    RenderPublication publication,
    int generation,
    int revision,
    int epoch,
    PresentationBatch batch,
    PresentationRecordLookup lookup,
    ColorResolver palette,
  ) {
    // Preflight all bindings before resolving any record. A broad last input
    // cannot cause earlier deltas/layouts to be recomputed by fallback.
    final result = RetainedUpdate._(
      document,
      publication,
      generation,
      revision,
      epoch,
      batch,
    );
    for (final patch in batch.patches) {
      if (patch.target.componentId == null) return null;
      if ((patch.requestedFields &
              (RecordFields.source | RecordFields.attrsZIndex)) !=
          0) {
        return null;
      }
      final slot = publication.geometry.topology.slots[patch.target.id]!;
      final draw = publication.node(slot), item = draw.geometry.item!;
      final index = item.indices[patch.target.componentId]!;
      final before = lookup(patch.target)!;
      if (!identical(before, item.components[index].data)) {
        return null;
      }
      final prior = draw.components[index];
      if (prior.content.assets.isNotEmpty &&
          (patch.requestedFields &
                  (RecordFields.tint | RecordFields.attrsAlpha)) !=
              0) {
        return null;
      }
      result._all.add(
        _Entry(
          patch,
          patch.target,
          slot,
          index,
          before,
          draw,
          item,
          item.components[index],
        ),
      );
    }
    final items = <int, _Item>{};
    for (final entry in result._all) {
      final patch = entry.patch!, before = entry.before;
      final item = entry.owner, draw = entry.draw, slot = entry.slot;

      final delta = const PresentationResolver().resolveDelta(
        authoredRecord(document, patch.target),
        before,
        patch,
        remember: false,
      );
      entry.delta = delta;
      _validateColors(delta.after, delta.fields, patch.target, palette);
      if (identical(delta.before, delta.after)) continue;
      result._records.add(MapEntry(patch.target, delta));
      final owner = items.putIfAbsent(slot, () {
        final value = _Item(slot, draw, item);
        result._items.add(value);
        return value;
      });
      owner.entries.add(entry);
      if (entry.prior.type == 'text') {
        // Pure style validation only. No zero-size/placeholder layout is reused
        // by the actual text preparation, which runs after whole validation.
        if ((delta.fields &
                (RecordFields.style |
                    RecordFields.margin |
                    RecordFields.split |
                    RecordFields.overflow)) !=
            0) {
          TextSpec.fromData(delta.after, item.content.size, palette);
        }
      } else if ((delta.fields & ItemLayout.componentGeometryFields) != 0) {
        final values = ItemLayout.prepareComponentValues(
          delta.after,
          item.size,
          item.content,
          (_, _) => throw StateError('non-text layout'),
          previous: entry.prior,
          previousContent: item.content,
        );
        entry.box = values.box;
        entry.transform = values.transform;
      }
    }

    return result;
  }

  /// A composed/rebased batch has already been validated and resolved by the
  /// session. Bind those deltas without a second resolution or staging model.
  static RetainedUpdate? fromChanges(
    DatasetDocument document,
    RenderPublication publication,
    int generation,
    int revision,
    int epoch,
    Map<PatchMapTarget, RecordDelta> changes,
    ComponentLayoutMemo? memo,
  ) {
    final result = RetainedUpdate._(
      document,
      publication,
      generation,
      revision,
      epoch,
      null,
    );
    for (final change in changes.entries) {
      final target = change.key, delta = change.value;
      if (target.componentId == null ||
          (delta.fields & (RecordFields.source | RecordFields.attrsZIndex)) !=
              0) {
        return null;
      }
      final slot = publication.geometry.topology.slots[target.id]!;
      final draw = publication.node(slot), item = draw.geometry.item!;
      final index = item.indices[target.componentId]!;
      if (!identical(delta.before, item.components[index].data)) return null;
      if (draw.components[index].content.assets.isNotEmpty &&
          (delta.fields & (RecordFields.tint | RecordFields.attrsAlpha)) != 0) {
        return null;
      }
      result._all.add(
        _Entry(
          null,
          target,
          slot,
          index,
          delta.before,
          draw,
          item,
          item.components[index],
        )..delta = delta,
      );
    }
    final items = <int, _Item>{};
    for (final entry in result._all) {
      final delta = entry.delta;
      result._records.add(MapEntry(entry.target, delta));
      final item = items.putIfAbsent(entry.slot, () {
        final value = _Item(entry.slot, entry.draw, entry.owner);
        result._items.add(value);
        return value;
      });
      item.entries.add(entry);
      if (entry.prior.type != 'text' &&
          (delta.fields & ItemLayout.componentGeometryFields) != 0) {
        final checked = memo?.reuse(
          delta.after,
          entry.owner.size,
          entry.owner.content,
          entry.prior.upright,
        );
        final values = checked == null
            ? ItemLayout.prepareComponentValues(
                delta.after,
                entry.owner.size,
                entry.owner.content,
                (_, _) => throw StateError('non-text layout'),
                previous: entry.prior,
                previousContent: entry.owner.content,
              )
            : (box: checked.box, transform: checked.transform);
        entry.box = values.box;
        entry.transform = values.transform;
      }
    }
    return result;
  }

  bool matches(
    DatasetDocument candidateDocument,
    RenderPublication publication,
    int candidateGeneration,
    int candidateRevision,
    int candidateEpoch,
    PresentationPlan plan,
  ) {
    if (_prepared ||
        _disposed ||
        !identical(candidateDocument, document) ||
        !identical(publication, baseline) ||
        generation != candidateGeneration ||
        revision != candidateRevision ||
        epoch != candidateEpoch) {
      return false;
    }
    if (!identical(plan, batch)) {
      if (plan.patches.length != _all.length) {
        return false;
      }
      for (var i = 0; i < _all.length; i++) {
        if (!identical(plan.patches[i], _all[i].patch)) {
          return false;
        }
      }
      for (final item in _items) {
        if (!identical(item.draw.geometry.item, item.layout)) {
          return false;
        }
        for (final entry in item.entries) {
          if (!identical(item.layout.components[entry.index], entry.prior) ||
              !identical(entry.prior.data, entry.delta.before)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  void prepare() {
    if (_prepared || _disposed) throw StateError('retained update reused');
    _prepared = true;
    final resources = baseline.resources;
    final envelopes = <int, Rect?>{};
    try {
      for (final item in _items) {
        var envelopeChanged = false, staticChanged = false;
        for (final entry in item.entries) {
          final data = entry.delta.after, prior = entry.prior;

          entry.content = resources.compiler.prepareRetainedContent(
            item.draw.geometry,
            data,
            item.draw.components[entry.index],
            entry.delta.fields,
          );
          if (prior.type == 'text' &&
              (entry.delta.fields & ItemLayout.componentGeometryFields) != 0) {
            final values = ItemLayout.prepareComponentValues(
              data,
              item.layout.size,
              item.layout.content,
              (_, _) => (entry.content! as TextContent).handle.size,
              previous: prior,
              previousContent: item.layout.content,
            );
            entry.box = values.box;
            entry.transform = values.transform;
          }
          entry.transformChanged = !prior.transform.sameTransform(
            entry.transform,
          );
          entry.geometryChanged =
              entry.transformChanged || prior.box != entry.box;
          envelopeChanged |=
              prior.type != 'bar' &&
              (entry.geometryChanged ||
                  prior.visible != (data['show'] != false));
          staticChanged |= prior.visible != (data['show'] != false);
          if (prior.type == 'background') {
            staticChanged |=
                entry.geometryChanged ||
                !identical(
                  entry.content,
                  item.draw.components[entry.index].content,
                );
          }
        }
        item.bounds = envelopeChanged
            ? item.layout.projectedPaintBounds(item.draw.geometry.world, (
                index,
              ) {
                final entry = item.entryAt(index);
                return entry == null
                    ? null
                    : (
                        data: entry.delta.after,
                        box: entry.box,
                        transform: entry.transform,
                      );
              })
            : item.draw.geometry.paintBounds;
        if (envelopeChanged && baseline.plan.hasPresentationCache) {
          (_presentationGeometryChanges ??= []).add(item.slot);
        }
        if (item.bounds != item.draw.geometry.paintBounds) {
          envelopes[item.slot] = item.bounds;
          staticChanged = true;
        }
        if (staticChanged) {
          staticProofs[item.slot] =
              RenderPlan.prepareRetainedMember(item.draw, {
                for (final entry in item.entries)
                  entry.index: (
                    entry.delta.after,
                    entry.box,
                    entry.transform,
                    entry.content!,
                  ),
              }, item.bounds);
        }
      }
      _geometry = baseline.geometry.stageRetainedBounds(envelopes);
    } catch (_) {
      dispose();
      rethrow;
    }
  }

  void commit(
    BarTransitions transitions,
    bool animate,
    void Function(void Function()) retire,
  ) {
    if (!_prepared || _committed || _disposed) {
      throw StateError('invalid retained commit');
    }
    for (final item in _items) {
      oldBounds[item.slot] = item.draw.geometry.paintBounds;
      for (final entry in item.entries) {
        if (entry.prior.type == 'bar') {
          transitions.replaceRetained(
            item.slot,
            entry.prior.id,
            entry.prior.box,
            entry.box,
            entry.delta.after,
            animate: animate,
          );
        }
      }
    }
    for (final item in _items) {
      final ownedLayout = item.draw.ownRetainedLayout();
      for (final entry in item.entries) {
        final component = item.draw.components[entry.index];
        component.commitValues(entry.transform, entry.content!, retire);
        final owned = ownedLayout.components[entry.index];
        owned.data = entry.delta.after;
        owned.box = entry.box;
        owned.transform = entry.transform;
      }
      final target = item.draw.geometry;
      target.data = ItemDataView(target.data, ownedLayout);
      target.paintBounds = item.bounds;
      item.draw.commitRetainedGeometry(
        target,
        item.entries
            .where((entry) => entry.geometryChanged)
            .map((entry) => (entry.index, entry.transformChanged)),
      );
    }
    _committed = true;
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    for (final item in _items) {
      for (final entry in item.entries) {
        entry.content?.release();
        entry.content = null;
      }
    }
    // The session still reads immutable records after publish to advance its
    // effective values. No resource lease or second staging model survives.
  }

  @override
  Iterable<MapEntry<PatchMapTarget, RecordDelta>> get entries => _records;
  @override
  Iterable<PatchMapTarget> get keys => _records.map((entry) => entry.key);
  @override
  int get length => _records.length;
  @override
  bool get isEmpty => _records.isEmpty;
  @override
  RecordDelta? operator [](Object? key) {
    for (final entry in _records) {
      if (entry.key == key) return entry.value;
    }
    return null;
  }

  @override
  void operator []=(PatchMapTarget key, RecordDelta value) =>
      throw UnsupportedError('validated proof');
  @override
  void clear() => throw UnsupportedError('validated proof');
  @override
  RecordDelta? remove(Object? key) => throw UnsupportedError('validated proof');
}

final class _Entry {
  _Entry(
    this.patch,
    this.target,
    this.slot,
    this.index,
    this.before,
    this.draw,
    this.owner,
    this.prior,
  ) : box = prior.box,
      transform = prior.transform;
  final PresentationPatch? patch;
  final PatchMapTarget target;
  final int slot, index;
  final Map<String, Object?> before;
  late final RecordDelta delta;
  final DrawNode draw;
  final ItemLayout owner;
  final ComponentLayout prior;
  Rect box;
  Affine transform;
  DrawContent? content;
  bool transformChanged = false, geometryChanged = false;
}

final class _Item {
  _Item(this.slot, this.draw, this.layout);
  final int slot;
  final DrawNode draw;
  final ItemLayout layout;
  final entries = <_Entry>[];
  Rect? bounds;
  Map<int, _Entry>? _byIndex;
  _Entry? entryAt(int index) =>
      (_byIndex ??= {for (final entry in entries) entry.index: entry})[index];
}

/// A fresh direct batch already has canonical addresses/patches. Build a target
/// index only if another request actually needs pending-record lookup.
final class _PatchIndex extends MapBase<PatchMapTarget, PresentationPatch> {
  _PatchIndex(this.entriesList);
  final List<_Entry> entriesList;
  Map<PatchMapTarget, PresentationPatch>? _lookup;
  @override
  PresentationPatch? operator [](Object? key) {
    final lookup = _lookup ??= _build();
    return lookup[key];
  }

  Map<PatchMapTarget, PresentationPatch> _build() {
    return {for (final entry in entriesList) entry.target: entry.patch!};
  }

  @override
  Iterable<PatchMapTarget> get keys => entriesList.map((entry) => entry.target);
  @override
  int get length => entriesList.length;
  @override
  void operator []=(PatchMapTarget key, PresentationPatch value) =>
      throw UnsupportedError('validated patch index');
  @override
  void clear() => throw UnsupportedError('validated patch index');
  @override
  PresentationPatch? remove(Object? key) =>
      throw UnsupportedError('validated patch index');
}

void _validateColors(
  Map<String, Object?> data,
  int fields,
  PatchMapTarget target,
  ColorResolver palette,
) {
  const groups = [(RecordFields.tint, 'tint'), (RecordFields.style, 'style')];
  for (final (mask, field) in groups) {
    if ((fields & mask) == 0) continue;
    validateRecordColors(data, palette, path: target.toString(), field: field);
  }
}
