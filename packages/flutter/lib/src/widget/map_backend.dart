import 'dart:async';
import 'dart:collection';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter/painting.dart' show EdgeInsets;
import 'package:flutter/services.dart' show rootBundle;

import '../api/result.dart';
import '../api/camera.dart';
import '../api/gesture_options.dart';
import '../api/rotation_animation.dart';
import '../api/target.dart';
import '../dataset/colors.dart';
import '../dataset/dataset_reader.dart';
import '../dataset/dataset_styles.dart';
import '../frame/resource_retirement.dart';
import '../geometry/affine.dart';
import '../geometry/geometry_snapshot.dart';
import '../geometry/item_layout.dart';
import '../geometry/layout.dart';
import '../geometry/spatial_index.dart';
import '../presentation/field_operations.dart';
import '../presentation/presentation_layers.dart';
import '../presentation/presentation_admission.dart';
import '../presentation/presentation_resolver.dart';
import '../presentation/record_delta.dart';
import '../rendering/bar_transitions.dart';
import '../rendering/draw_objects.dart';
import '../rendering/retained_update.dart';
import '../rendering/render_publication.dart';
import '../rendering/render_resources.dart';
import '../rendering/selection_overlay.dart';
import '../resources/asset_registry.dart';
import '../resources/images/image_source.dart';
import '../resources/images/image_source_store.dart';
import '../resources/images/image_store.dart';
import '../resources/preparation_queue.dart';
import '../resources/resource_budget.dart';
import '../resources/svg/svg_source.dart';
import '../resources/text/package_fonts.dart';
import '../resources/text/text_spec.dart';
import '../session/session_backend.dart';
import '../viewport/camera.dart';

/// Widget composition root for the native backend. Session alone decides what
/// becomes a publication; renderer and resource owners cannot publish values.
final class MapBackend extends SessionBackend {
  MapBackend({
    required this.palette,
    required this.registry,
    required this.invalidate,
    required this.onAssetFailure,
    required this.onReplacement,
    this.onUnexpectedAssetFailure,
    this.onResourceRefresh,
    PatchMapZoomLimits zoomLimits = const PatchMapZoomLimits(),
    PatchMapRotationAnimationOptions rotationAnimation =
        const PatchMapRotationAnimationOptions(),
  }) : camera = (MapCamera()
         ..setZoomLimits(zoomLimits)
         ..setRotationAnimation(rotationAnimation)) {
    optimizationBudget = ResourceBudget(
      limitBytes: 2 * 1024 * 1024,
      onSpaceAvailable: _optimizationSpace,
    );
    outputBudget = ResourceBudget(
      limitBytes: 256 * 1024 * 1024,
      onSpaceAvailable: () {
        raster.retryDenied();
      },
    );
    sources = ImageSourceStore(
      assetLoader: (key, options) async {
        final bytes = await rootBundle.load(key);
        return Uint8List.sublistView(bytes);
      },
      onSpaceAvailable: () {
        raster.retryDenied();
      },
    );
    raster = RasterImageStore(
      sources: sources,
      outputBudget: outputBudget,
      retirement: retirement,
    );
  }
  final ColorResolver palette;
  final AssetRegistry registry;
  final void Function() invalidate, onReplacement;
  final void Function(List<PatchMapFailure>) onAssetFailure;
  final void Function(Object, StackTrace)? onUnexpectedAssetFailure;
  final void Function()? onResourceRefresh;
  final _intrinsicReady = <String>{};
  final MapCamera camera;
  final spatial = SpatialIndex();
  final retirement = ResourceRetirement();
  final preparations = PreparationQueue();
  final transitions = BarTransitions();
  late final selectionOverlay = SelectionOverlay(palette: palette);
  late final ResourceBudget optimizationBudget, outputBudget;
  late final ImageSourceStore sources;
  late final RasterImageStore raster;
  final _resources = <RenderResources>{};
  RenderPublication? current;
  PresentationOpacity? _presentation;
  int generation = 0, revision = 0, _epoch = 0;
  final _reportedFailures = <DrawAsset>{};
  bool _active = true, _closed = false, _pendingFit = false;
  Completer<void>? _activity;
  List<int>? _visible;
  Object? _cameraKey;
  List<int> _ranks = const [];
  ComponentLayoutMemo? _validatedLayouts;
  RetainedUpdate? _validatedUpdate;

  @override
  void validateDocument(DatasetDocument document) {
    _validatedUpdate = null;
    _validatedLayouts = null;
    validateDatasetColors(document.roots, palette);
    // Pure scalar validation before acceptance; no Paragraph/image preparation.
    final checked = HashSet<Map<String, Object?>>.identity();
    GeometrySnapshot.compile(document, (data, content) {
      if (checked.add(data)) TextSpec.fromData(data, content, palette);
      return Size.zero;
    });
  }

  @override
  void validateUpdate(
    DatasetDocument document,
    PresentationBatch batch,
    PresentationRecordLookup lookup,
  ) {
    _validatedUpdate = null;
    const resolver = PresentationResolver();
    _validatedLayouts = null;
    final layouts = ComponentLayoutMemo();
    final owners = <String, RecordDelta>{};
    final components = <PatchMapTarget, RecordDelta>{};
    const scalarLayout =
        ItemLayout.componentGeometryFields & ~RecordFields.text;
    const ownerLayout = RecordFields.size | RecordFields.padding;
    const colors =
        RecordFields.tint |
        RecordFields.fill |
        RecordFields.source |
        RecordFields.style |
        RecordFields.stroke;
    for (final patch in batch.patches) {
      final requested = patch.requestedFields;
      // Admission already checked independent scalar/string fields. Compound
      // checks read effective records only when one of their inputs can change.
      if ((requested & (scalarLayout | ownerLayout | colors)) == 0) continue;
      final before = lookup(patch.target)!;
      final delta = resolver.resolveDelta(
        authoredRecord(document, patch.target),
        before,
        patch,
      );
      final fields = delta.fields, next = delta.after;
      if ((fields & colors) != 0) {
        // Check only changed schema-owned color groups; owner records must not
        // recursively revalidate unchanged children/templates.
        const groups = [
          (RecordFields.tint, 'tint'),
          (RecordFields.fill, 'fill'),
          (RecordFields.source, 'source'),
          (RecordFields.style, 'style'),
          (RecordFields.stroke, 'stroke'),
        ];
        for (var i = 0; i < groups.length; i++) {
          final group = groups[i];
          if ((fields & group.$1) != 0) {
            validateRecordColors(
              next,
              palette,
              path: patch.target.toString(),
              field: group.$2,
            );
          }
        }
      }
      if (patch.target.componentId != null) {
        if ((fields & scalarLayout) != 0) {
          components[patch.target] = delta;
        }
      } else {
        // Preserve all changed owners so compound validation sees final inputs.
        owners[patch.target.id] = delta;
        if (next['type'] == 'text' &&
            (fields &
                    (RecordFields.style |
                        RecordFields.size |
                        RecordFields.margin |
                        RecordFields.split |
                        RecordFields.overflow)) !=
                0) {
          TextSpec.fromData(next, null, palette);
        }
      }
    }
    // Keep changed children in one flat map: a per-item singleton map adds
    // allocation/GC work to large batches without helping scalar validation.
    final resized = <String>{
      for (final entry in owners.entries)
        if (entry.value.after['type'] == 'item' &&
            (entry.value.fields & ownerLayout) != 0)
          entry.key,
    };
    void validate(String id, Map<String, Object?> value) {
      final data = owners[id]?.after ?? lookup(PatchMapTarget(id))!;
      final prior = current?.geometry[id];
      final sameSize = identical(data['size'], prior?.data['size']);
      final sameContent =
          sameSize && identical(data['padding'], prior?.data['padding']);
      final size = sameSize
          ? prior!.item!.size
          : fixedSize(data['size']! as Map);
      final content = sameContent
          ? prior!.item!.content
          : BoxEdges.fromData(data['padding']! as Map).contentBox(size);
      final layout = ItemLayout.prepareComponent(
        value,
        size,
        content,
        value['type'] != 'background' &&
            data['contentOrientation'] == 'upright',
        (value, bounds) {
          TextSpec.fromData(value, bounds, palette);
          return Size.zero;
        },
      );
      layouts.remember(size, content, layout);
    }

    for (final entry in components.entries) {
      if (!resized.contains(entry.key.id)) {
        validate(entry.key.id, entry.value.after);
      }
    }
    for (final id in resized) {
      for (final component in document.targets[id]!.components.keys) {
        final address = PatchMapTarget(id, componentId: component);
        validate(id, components[address]?.after ?? lookup(address)!);
      }
    }
    _validatedLayouts = components.isEmpty && resized.isEmpty ? null : layouts;
  }

  @override
  bool validateRetainedUpdate(
    DatasetDocument document,
    PresentationBatch batch,
    PresentationRecordLookup lookup,
    SessionPublication publication,
    int acceptedGeneration,
  ) {
    _validatedUpdate = null;
    _validatedLayouts = null;
    if (!_active ||
        !identical(publication, current) ||
        acceptedGeneration != generation) {
      return false;
    }
    final proof = RetainedUpdate.validate(
      document,
      publication as RenderPublication,
      generation,
      revision,
      _epoch,
      batch,
      lookup,
      palette,
    );
    _validatedUpdate = proof;
    return proof != null;
  }

  @override
  Map<PatchMapTarget, RecordDelta>? validatedChanges(
    DatasetDocument document,
    PresentationPlan plan,
    SessionPublication publication,
    int acceptedGeneration,
  ) {
    final proof = _validatedUpdate;
    if (proof == null) return null;
    if (!_active ||
        !identical(publication, current) ||
        !proof.matches(
          document,
          publication as RenderPublication,
          acceptedGeneration,
          revision,
          _epoch,
          plan,
        )) {
      _validatedUpdate = null;
      return null;
    }
    return proof;
  }

  @override
  Map<PatchMapTarget, PresentationPatch>? validatedPatchIndex(
    DatasetDocument document,
    PresentationPlan plan,
    SessionPublication publication,
    int acceptedGeneration,
  ) {
    final proof = validatedChanges(
      document,
      plan,
      publication,
      acceptedGeneration,
    );
    return proof is RetainedUpdate ? proof.patchIndex : null;
  }

  @override
  void releaseValidatedChanges() {
    _validatedUpdate = null;
  }

  @override
  Future<SessionPublication> prepareDocument(
    DatasetDocument document,
    int generation,
  ) async {
    final epoch = _epoch;
    await PackageFonts.ensureLoaded();
    await _waitActive(epoch);
    late final RenderResources resources;
    resources = RenderResources(
      palette: palette,
      registry: registry,
      sources: sources,
      raster: raster,
      optimizationBudget: optimizationBudget,
      preparations: preparations,
      retirement: retirement,
      invalidate: invalidate,
      onAssetChanged: _assetChanged,
      onClosed: () => _resources.remove(resources),
      active: _active,
    );
    _resources.add(resources);
    final owned = <DrawNode>[];
    try {
      return resources.text.withPreparation<RenderPublication>(() {
        final geometry = GeometrySnapshot.compile(
          document,
          resources.text.measure,
        );
        resources.initialize(geometry);
        for (var i = 0; i < geometry.nodes.length; i++) {
          owned.add(
            resources.compiler.compile(
              geometry.nodes[i],
              initialLoad: true,
              relation: geometry.relationFor(geometry.nodes[i].id),
            )..retain(),
          );
        }
        final pages = <RenderPage>[];
        for (
          var start = 0;
          start < owned.length;
          start += geometry.nodes.pageSize
        ) {
          final end = (start + geometry.nodes.pageSize).clamp(0, owned.length);
          pages.add(RenderPage(List.unmodifiable(owned.sublist(start, end))));
        }
        return RenderPublication(geometry, List.unmodifiable(pages), resources);
      });
    } catch (_) {
      resources.close();
      rethrow;
    } finally {
      for (final node in owned) {
        node.release();
      }
    }
  }

  @override
  bool needsRetry(SessionPublication publication, PresentationPatch patch) {
    if (!patch.operations.any((op) => op.path.first == 'source')) return false;
    final before = publication as RenderPublication;
    final slot = before.geometry.topology.slots[patch.target.id];
    if (slot == null) return false;
    final node = before.node(slot);
    final component = patch.target.componentId;
    final assets = component == null
        ? node.content?.assets ?? const <DrawAsset>[]
        : node.components
              .where((value) => value.layout.id == component)
              .expand((value) => value.content.assets);
    return assets.any((asset) => asset.failure != null);
  }

  @override
  Future<PreparedUpdate> prepareUpdate(
    SessionPublication before,
    DatasetDocument document,
    Map<PatchMapTarget, RecordDelta> changes, {
    required int generation,
    required bool animate,
    PresentationPlan? intent,
  }) async {
    final epoch = _epoch;
    final previous = before as RenderPublication,
        resources = previous.resources;
    final layouts = _validatedLayouts;
    _validatedLayouts = null;
    if (changes is RetainedUpdate) {
      final proof = changes;
      final valid =
          identical(_validatedUpdate, proof) &&
          _active &&
          intent != null &&
          identical(previous, current) &&
          proof.matches(
            document,
            previous,
            generation,
            revision,
            _epoch,
            intent,
          );
      _validatedUpdate = null;
      if (valid) {
        resources.text.withPreparation(proof.prepare);
        return PreparedUpdate(
          RenderPublication.retained(previous, proof, animate: animate),
        );
      }
    }
    final sourceTargets = {
      for (final patch in intent?.patches ?? const <PresentationPatch>[])
        if (patch.operations.any(
          (operation) => operation.path.first == 'source',
        ))
          patch.target,
    };
    if (identical(previous, current) && _active && sourceTargets.isEmpty) {
      final staged = resources.text.withPreparation(() {
        final update = RetainedUpdate.fromChanges(
          document,
          previous,
          generation,
          revision,
          _epoch,
          changes,
          layouts,
        );
        update?.prepare();
        return update;
      });
      if (staged != null) {
        return PreparedUpdate(
          RenderPublication.retained(previous, staged, animate: animate),
        );
      }
    }
    late GeometryChange projection;
    final owned = <int, DrawNode>{};
    final failures = <String, List<PatchMapFailure>>{};
    try {
      projection = resources.text.withPreparation(() {
        final prepared = previous.geometry.prepareChanges(
          changes,
          resources.text.measure,
          layoutsMemo: layouts,
        );
        for (final entry in prepared.changed.entries) {
          final node = resources.compiler.compile(
            entry.value,
            initialLoad: false,
            previous: previous.node(entry.key),
            relation: prepared.snapshot.relationFor(entry.value.id),
            retrySources: sourceTargets,
            fields: prepared.fields[entry.key] ?? 0,
            componentChanges: prepared.componentChanges[entry.key],
          )..retain();
          owned[entry.key] = node;
        }
        return prepared;
      });
      // Only new/changed asset references block an ordinary item update. The
      // initial diagram never waits for these futures.
      final waiting = <Future<void>>[];
      Future<void> waitAssets(String id, List<DrawAsset> assets) async {
        try {
          for (final asset in assets) {
            await asset.ready;
          }
        } catch (error) {
          if (error is! ImageResourceFailure &&
              error is! SvgSourceException &&
              error is! FormatException) {
            rethrow;
          }
          failures[id] = [
            PatchMapFailure(
              'IMAGE_PREPARATION',
              error.toString(),
              target: PatchMapTarget(id),
            ),
          ];
        }
      }

      for (final entry in owned.entries) {
        final oldAssets = previous.node(entry.key).assets;
        if (identical(oldAssets, entry.value.assets)) continue;
        List<DrawAsset>? pending;
        for (final asset in entry.value.assets) {
          if (!oldAssets.contains(asset) &&
              !(pending?.contains(asset) ?? false)) {
            (pending ??= []).add(asset);
          }
        }
        if (pending != null) {
          waiting.add(waitAssets(entry.value.geometry.id, pending));
        }
      }
      // Pure number/bar updates have no resource futures to allocate or await.
      if (waiting.isNotEmpty) await Future.wait(waiting);
      await _waitActive(epoch);
      if (failures.isNotEmpty) {
        // A failed inherited projection also rejects the changed ancestor that
        // required it. Retry only the successful independent changes.
        final denied = <String>{...failures.keys};
        for (final failed in failures.keys.toList()) {
          var parent = document.targets[failed]?.parentId;
          while (parent != null) {
            if (changes.keys.any((key) => key.id == parent)) denied.add(parent);
            parent = document.targets[parent]?.parentId;
          }
        }
        for (final id in denied) {
          failures.putIfAbsent(
            id,
            () => [
              PatchMapFailure(
                'IMAGE_PREPARATION',
                'Dependent item preparation failed',
                target: PatchMapTarget(id),
              ),
            ],
          );
        }
        final successful = {
          for (final entry in changes.entries)
            if (!denied.contains(entry.key.id)) entry.key: entry.value,
        };
        if (successful.isEmpty) {
          retain(previous);
          return PreparedUpdate(previous, failures: failures);
        }
        final retried = await prepareUpdate(
          previous,
          document,
          successful,
          generation: generation,
          animate: animate,
          intent: intent,
        );
        return PreparedUpdate(
          retried.publication,
          failures: {...failures, ...retried.failures},
        );
      }
      // Ordinary image changes wait for their ready intrinsic geometry before
      // the item's submitted revision. First drawing keeps asynchronous refresh.
      final readySizes = <String, Size>{};
      for (final node in owned.values) {
        final value = node.content;
        if (node.geometry.target.type == 'image' &&
            node.geometry.data['size'] == null &&
            value is AssetContent &&
            value.asset.intrinsicSize != null) {
          readySizes[node.geometry.id] = value.asset.intrinsicSize!;
        }
      }
      if (readySizes.isNotEmpty) {
        final refreshed = projection.snapshot.reprojectImages(
          readySizes.keys,
          resources.text.measure,
          measureImage: (id, data) => readySizes[id],
        );
        if (refreshed.changed.isNotEmpty) {
          for (final entry in refreshed.changed.entries) {
            final old = owned[entry.key];
            owned[entry.key] = resources.compiler.compile(
              entry.value,
              initialLoad: false,
              previous: old ?? previous.node(entry.key),
              relation: refreshed.snapshot.relationFor(entry.value.id),
            )..retain();
            old?.release();
          }
          projection = GeometryChange(
            refreshed.snapshot,
            Map.unmodifiable({...projection.changed, ...refreshed.changed}),
          );
        }
      }
      final pages = List<RenderPage>.of(previous.pages);
      final changedPages = owned.keys
          .map((slot) => slot ~/ previous.geometry.nodes.pageSize)
          .toSet();
      for (final page in changedPages) {
        final start = page * previous.geometry.nodes.pageSize;
        pages[page] = RenderPage(
          List.unmodifiable([
            for (
              var offset = 0;
              offset < previous.pages[page].nodes.length;
              offset++
            )
              owned[start + offset] ?? previous.pages[page].nodes[offset],
          ]),
        );
      }
      Map<DrawAsset, List<PatchMapTarget>>? targets;
      for (final entry in owned.entries) {
        final old = previous.node(entry.key).assetTargets,
            next = entry.value.assetTargets;
        if (identical(old, next)) continue;
        targets ??= Map.of(previous.assetTargets);
        for (final (asset, target) in old) {
          final remaining = targets[asset]!
              .where((value) => value != target)
              .toList();
          if (remaining.isEmpty) {
            targets.remove(asset);
          } else {
            targets[asset] = List.unmodifiable(remaining);
          }
        }
        for (final (asset, target) in next) {
          targets[asset] = List.unmodifiable([...?targets[asset], target]);
        }
      }
      Map<(String, int), int>? counts;
      for (final entry in owned.entries) {
        if (identical(previous.node(entry.key).assets, entry.value.assets)) {
          continue;
        }
        final old = previous
            .node(entry.key)
            .assets
            .map((a) => a.creationKey)
            .toList();
        final next = entry.value.assets.map((a) => a.creationKey).toList();
        if (old.length == next.length &&
            Iterable<int>.generate(
              old.length,
            ).every((i) => old[i] == next[i])) {
          continue;
        }
        counts ??= Map.of(previous.assetCounts);
        for (final key in old) {
          if (key != null) {
            final count = counts[key]! - 1;
            if (count == 0) {
              counts.remove(key);
            } else {
              counts[key] = count;
            }
          }
        }
        for (final key in next) {
          if (key != null) counts.update(key, (n) => n + 1, ifAbsent: () => 1);
        }
      }
      resources.text.trimUnused();
      return PreparedUpdate(
        RenderPublication(
          projection.snapshot,
          List.unmodifiable(pages),
          resources,
          previousPlan: previous.plan,
          changed: List.unmodifiable({
            if (!identical(previous, current)) ...previous.changed,
            ...projection.changed.keys,
          }),
          animate: animate,
          componentChanges: identical(previous, current)
              ? projection.componentChanges
              : const {},
          targets: targets == null
              ? previous.assetTargets
              : Map.unmodifiable(targets),
          counts: counts == null
              ? previous.assetCounts
              : Map.unmodifiable(counts),
        ),
      );
    } finally {
      for (final node in owned.values) {
        node.release();
      }
    }
  }

  @override
  Future<SessionPublication> prepareRefresh(SessionPublication before) async {
    _validatedUpdate = null;
    final pub = before as RenderPublication;
    final ids = Set<String>.of(_intrinsicReady);
    _intrinsicReady.clear();
    final change = pub.geometry.reprojectImages(
      ids,
      pub.resources.text.measure,
      measureImage: (id, data) {
        final slot = pub.geometry.topology.slots[id];
        if (slot == null) return null;
        final content = pub.node(slot).content;
        return content is AssetContent ? content.asset.intrinsicSize : null;
      },
    );
    if (change.changed.isEmpty) {
      retain(pub);
      return pub;
    }
    final owned = <int, DrawNode>{};
    try {
      for (final entry in change.changed.entries) {
        owned[entry.key] = pub.resources.compiler.compile(
          entry.value,
          initialLoad: false,
          previous: pub.node(entry.key),
          relation: change.snapshot.relationFor(entry.value.id),
        )..retain();
      }
      final pages = List<RenderPage>.of(pub.pages);
      for (final page
          in owned.keys
              .map((slot) => slot ~/ pub.geometry.nodes.pageSize)
              .toSet()) {
        final start = page * pub.geometry.nodes.pageSize;
        pages[page] = RenderPage(
          List.unmodifiable([
            for (
              var offset = 0;
              offset < pub.pages[page].nodes.length;
              offset++
            )
              owned[start + offset] ?? pub.pages[page].nodes[offset],
          ]),
        );
      }
      return RenderPublication(
        change.snapshot,
        List.unmodifiable(pages),
        pub.resources,
        previousPlan: pub.plan,
        changed: List.unmodifiable({
          if (!identical(pub, current)) ...pub.changed,
          ...change.changed.keys,
        }),
        counts: pub.assetCounts,
        targets: pub.assetTargets,
      );
    } finally {
      for (final node in owned.values) {
        node.release();
      }
    }
  }

  @override
  void publish(
    SessionPublication publication,
    int nextGeneration,
    int nextRevision,
  ) {
    final next = publication as RenderPublication, previous = current;
    final retained =
        previous != null &&
        next.commitRetained(transitions, retirement.enqueue);
    final componentChanges = next.takeComponentChanges();
    if (nextGeneration != generation || previous == null) {
      transitions.clear();
      spatial.reset([
        for (var i = 0; i < next.geometry.nodes.length; i++)
          next.geometry.nodes[i].paintBounds ?? Rect.zero,
      ]);
      _pendingFit = true;
    } else {
      for (final slot in next.changed) {
        final old = retained
                ? next.retainedOldBounds![slot]
                : previous.geometry.nodes[slot].paintBounds,
            now = next.geometry.nodes[slot].paintBounds;
        if (old != now) spatial.update(slot, now ?? Rect.zero);
      }
      if (!retained) {
        transitions.replace(
          previous.geometry,
          next.geometry,
          next.changed,
          animate: next.animate,
          componentChanges: componentChanges,
        );
      }
    }
    next.finishRetained();
    current = next;
    final retirePresentation = next.plan.setPresentation(_presentation);
    if (retirePresentation != null) retirement.enqueue(retirePresentation);
    next.resources.applyCounts(next.assetCounts);
    _reportedFailures.removeWhere(
      (asset) => !next.assetTargets.containsKey(asset),
    );
    generation = nextGeneration;
    revision = nextRevision;
    if (previous == null ||
        !identical(previous.geometry.paintSlots, next.geometry.paintSlots)) {
      _ranks = List.filled(next.geometry.nodes.length, 0);
      for (var i = 0; i < next.geometry.paintSlots.length; i++) {
        _ranks[next.geometry.paintSlots[i]] = i;
      }
    }
    _visible = null;
    if (_pendingFit && camera.hasSize) _fitReplacement();
    // Resource completion may precede publication. Report after the session has
    // transferred its publication; host reentry must not run inside publish.
    final inspect = <DrawAsset>{};
    if (previous == null || !identical(previous.resources, next.resources)) {
      inspect.addAll(next.assetTargets.keys);
    } else if (!identical(previous.assetTargets, next.assetTargets)) {
      for (final slot in next.changed) {
        for (final asset in next.node(slot).assets) {
          if (!previous.assetTargets.containsKey(asset)) inspect.add(asset);
        }
      }
    }
    if (inspect.isNotEmpty) {
      scheduleMicrotask(() {
        if (!_closed && identical(current, next)) {
          for (final asset in inspect) {
            _assetChanged(asset);
          }
        }
      });
    }
  }

  void resize(Size size) {
    if (camera.resize(size)) _visible = null;
    if (_pendingFit && camera.hasSize) _fitReplacement();
  }

  void _fitReplacement() {
    // A new diagram starts from an unrotated camera. Ordinary fit commands
    // retain rotation; reset only at this replacement publication boundary.
    camera.set(
      center: Offset.zero,
      scale: 1,
      rotation: 0,
      source: PatchMapCameraChangeSource.replacement,
    );
    final bounds = current?.geometry.bounds;
    if (bounds != null && !bounds.isEmpty) {
      camera.fit(
        bounds,
        padding: const EdgeInsets.all(12),
        source: PatchMapCameraChangeSource.replacement,
      );
    }
    _pendingFit = false;
    camera.markReplacement();
    _visible = null;
  }

  List<int> visibleSlots() {
    final pub = current;
    if (pub == null) return const [];
    final key = (camera.center, camera.scale, camera.rotation, camera.size);
    if (_visible != null && _cameraKey == key) return _visible!;
    _cameraKey = key;
    final query = camera.visibleWorldBounds,
        candidates = spatial.candidates(query);
    final slots = candidates.where((slot) {
      final node = pub.geometry.nodes[slot];
      return node.visible &&
          !node.isContainer &&
          node.paintBounds != null &&
          boundsOverlap(node.paintBounds!, query);
    }).toList()..sort((a, b) => _ranks[a].compareTo(_ranks[b]));
    return _visible = slots;
  }

  void paint(
    Canvas canvas,
    double pixelRatio, {
    Iterable<String> selectedIds = const [],
  }) {
    final publication = current;
    if (publication == null) return;
    publication.resources.beginPaint();
    canvas.save();
    canvas.transform(camera.paintMatrix);
    try {
      publication.plan.paint(
        canvas,
        visibleSlots: visibleSlots(),
        cameraRotation: camera.rotation,
        physicalScale: camera.scale * pixelRatio,
        barRectangle: transitions.rectangle,
      );
      selectionOverlay.paint(
        canvas,
        publication.geometry,
        selectedIds,
        cameraScale: camera.scale,
        cameraRotation: camera.rotation,
      );
    } finally {
      canvas.restore();
      publication.resources.endPaint();
    }
  }

  bool onFrame(Duration timestamp) {
    final bars = transitions.advance(timestamp);
    final rotation = camera.advanceRotation(timestamp);
    return bars || rotation;
  }

  void _assetChanged(DrawAsset asset) {
    final pub = current, failure = asset.failure;
    if (_closed || pub == null) return;
    final targets = pub.assetTargets[asset];
    if (failure == null) {
      if (asset.intrinsicSize == null || targets == null) return;
      var changed = false;
      for (final target in targets) {
        final node = pub.geometry[target.id];
        if (target.componentId == null &&
            node?.target.type == 'image' &&
            node!.data['size'] == null &&
            node.localBounds?.size != asset.intrinsicSize) {
          changed = _intrinsicReady.add(target.id) || changed;
        }
      }
      if (changed) onResourceRefresh?.call();
      return;
    }
    if (targets == null || !_reportedFailures.add(asset)) return;
    if (failure is! ImageResourceFailure &&
        failure is! SvgSourceException &&
        failure is! FormatException) {
      onUnexpectedAssetFailure?.call(
        failure,
        asset.failureStack ?? StackTrace.current,
      );
      return;
    }
    onAssetFailure(
      List.unmodifiable([
        for (final target in targets)
          PatchMapFailure(
            'IMAGE_PREPARATION',
            failure.toString(),
            target: target,
          ),
      ]),
    );
  }

  void _optimizationSpace() {
    for (final resources in _resources) {
      resources.retryDenied();
    }
  }

  @override
  void setPresentation(PresentationOpacity? opacity) {
    if (identical(_presentation, opacity)) return;
    _presentation = opacity;
    final retire = current?.plan.setPresentation(opacity);
    if (retire != null) retirement.enqueue(retire);
  }

  @override
  void hide() {
    camera.cancelRotation();
    camera.discardChanges();
    _validatedUpdate = null;
    _validatedLayouts = null;
    _epoch++;
    _wakeActivity();
    onReplacement();
    current = null;
    _reportedFailures.clear();
    _intrinsicReady.clear();
    for (final resource in _resources.toList()) {
      resource.close();
    }
    _visible = null;
    transitions.clear();
  }

  @override
  void setActive(bool active) {
    _validatedUpdate = null;
    _active = active;
    _wakeActivity();
    preparations.setActive(active);
    sources.setActive(active);
    raster.setActive(active);
    for (final resource in _resources) {
      resource.setActive(active);
    }
    if (!active) {
      transitions.clear();
      camera.cancelRotation();
    }
  }

  Future<void> _waitActive(int epoch) async {
    while (!_closed && epoch == _epoch && !_active) {
      await (_activity ??= Completer<void>()).future;
    }
    if (_closed || epoch != _epoch) {
      throw StateError('map preparation belongs to a closed generation');
    }
  }

  void _wakeActivity() {
    _activity?.complete();
    _activity = null;
  }

  @override
  void retain(SessionPublication publication) {
    (publication as RenderPublication).references++;
  }

  @override
  void retire(SessionPublication publication) {
    final value = publication as RenderPublication;
    if (--value.references == 0) retirement.enqueue(value.dispose);
  }

  @override
  void close() {
    if (_closed) return;
    _closed = true;
    _presentation = null;
    hide();
    _resources.clear();
    preparations.close();
    raster.close();
    sources.close();
    optimizationBudget.close();
    outputBudget.close();
    spatial.clear();
    selectionOverlay.dispose();
    retirement.close();
  }
}
