import 'dart:async';
import 'dart:convert';
import 'dart:ui';

import '../dataset/colors.dart';
import '../frame/resource_retirement.dart';
import '../geometry/geometry_snapshot.dart';
import '../resources/asset_registry.dart';
import '../resources/bars/bar_masks.dart';
import '../resources/images/image_source_store.dart';
import '../resources/images/image_store.dart';
import '../resources/preparation_queue.dart';
import '../resources/resource_budget.dart';
import '../resources/svg/svg_images.dart';
import '../resources/svg/svg_source.dart';
import '../resources/svg/svg_vectors.dart';
import '../resources/text/package_fonts.dart';
import '../resources/text/text_pool.dart';
import 'draw_compiler.dart';
import 'draw_objects.dart';

/// A generation's resource lifetime. Widget-wide byte/decode/output budgets and
/// the optimization scheduler are injected and survive diagram replacement.
final class RenderResources {
  RenderResources({
    required this.palette,
    required this.registry,
    required this.sources,
    required this.raster,
    required this.optimizationBudget,
    required this.preparations,
    required this.retirement,
    required this.invalidate,
    required this.onAssetChanged,
    required this.onClosed,
    required bool active,
  }) {
    text = TextPool(
      palette: palette,
      retirement: retirement,
      onReady: invalidate,
      fontFamilyResolver: PackageFonts.resolve,
    )..setActive(active);
    vectors = SvgVectorStore(
      sourceLoader: _loadSvg,
      retire: retirement.enqueue,
      beforeParse: _waitActive,
    );
    svgImages = SvgImageStore(
      budget: optimizationBudget,
      retirement: retirement,
      schedule: (create) => preparations.schedule(() {
        if (_closed) {
          throw StateError('SVG generation closed before rasterization');
        }
        return create();
      }),
      onReady: invalidate,
      active: active,
    );
    compiler = DrawCompiler(
      palette: palette,
      text: text,
      assets: acquireAsset,
      barMasks: (radius) => bars?.acquire(radius),
    );
    _active = active;
  }
  final ColorResolver palette;
  final AssetRegistry registry;
  final ImageSourceStore sources;
  final RasterImageStore raster;
  final ResourceBudget optimizationBudget;
  final PreparationQueue preparations;
  final ResourceRetirement retirement;
  final void Function() invalidate;
  final void Function(DrawAsset asset) onAssetChanged;
  final void Function() onClosed;
  Completer<void>? _activity;
  final _initialLoad = <String, bool>{};
  late final TextPool text;
  late final SvgVectorStore vectors;
  late final SvgImageStore svgImages;
  late final DrawCompiler compiler;
  BarMaskPool? bars;
  final _resolved = <Object, _ResolvedSource>{};
  int get resolvedSourceCount => _resolved.length;
  final _counts = <(String, int), int>{};

  final _failures = <(String, int), Object>{};
  final _loadingSources = <ImageSourceLease>{};
  final _uses = <(String, int), Set<_AssetBase>>{};
  Set<_AssetBase> _visibleAssets = {}, _previousVisible = {};
  void beginPaint() {
    final reuse = _previousVisible;
    _previousVisible = _visibleAssets;
    _visibleAssets = reuse..clear();
  }

  void endPaint() {
    for (final use in _previousVisible) {
      if (!_visibleAssets.contains(use) && !use.released) use.hide();
    }
  }

  void applyCounts(Map<(String, int), int> counts) {
    for (final key in {..._counts.keys, ...counts.keys}) {
      final value = counts[key] ?? 0;
      if (_counts[key] == value) continue;
      for (final use in _uses[key] ?? const <_AssetBase>{}) {
        use.updateLogicalCount(value);
      }
    }
    _counts
      ..clear()
      ..addAll(counts);
  }

  int _references = 0;
  bool _closed = false, _active = true;
  void retain() => _references++;
  void release() {
    if (--_references == 0) close();
  }

  void initialize(GeometrySnapshot geometry) {
    final widths = <double, int>{};
    for (final slot in geometry.paintSlots) {
      final node = geometry.nodes[slot];
      final item = node.item;
      if (item == null) continue;
      for (final component in item.components) {
        if (component.type == 'bar') {
          widths.update(component.box.width, (n) => n + 1, ifAbsent: () => 1);
        }
      }
    }
    var representative = 0.0, most = 0;
    for (final entry in widths.entries) {
      if (entry.value > most) {
        representative = entry.key;
        most = entry.value;
      }
    }
    bars = BarMaskPool(
      representativeWidth: representative,
      budget: optimizationBudget,
      retirement: retirement,
      creator: (plan) => preparations.schedule(() {
        if (_closed) throw StateError('Bar generation closed before creation');
        return createBarMasks(plan);
      }),
      onReady: invalidate,
      active: _active,
    );
  }

  _ResolvedSource _resolve(Object source) => _resolved.putIfAbsent(
    source,
    () => _ResolvedSource(registry.resolve(source)),
  );

  void _releaseSource(Object source, _ResolvedSource entry) {
    if (--entry.references == 0 && identical(_resolved[source], entry)) {
      _resolved.remove(source);
    }
  }

  DrawAsset acquireAsset(
    Object source,
    Color tint, {
    required bool initialLoad,
    bool retry = false,
  }) {
    if (_closed) throw StateError('generation resources closed');
    _ResolvedSource descriptor;
    try {
      descriptor = _resolve(source);
    } on FormatException catch (error) {
      return _FailedAsset(error)..retain();
    } on SvgSourceException catch (error) {
      return _FailedAsset(error)..retain();
    }
    final resolved = descriptor.asset;
    descriptor.references++;
    var transferred = false;
    try {
      final key = (resolved.identity, tint.toARGB32());
      if (retry) _failures.remove(key);
      final oldFailure = _failures[key];
      if (oldFailure != null) {
        return _FailedAsset(oldFailure)
          .._key = key
          ..retain();
      }
      late final _AssetBase created;
      void changed() {
        if (!_closed) {
          if (created.failure != null) _failures[key] = created.failure!;
          invalidate();
          onAssetChanged(created);
        }
      }

      void remove() {
        _uses[key]?.remove(created);
        if (_uses[key]?.isEmpty ?? false) _uses.remove(key);
        _visibleAssets.remove(created);
        _previousVisible.remove(created);
        _releaseSource(source, descriptor);
      }

      // A mutable resolution-demand lease belongs to one draw use. The vector
      // and raster stores still share the physical resources by creation key.
      if (resolved.svg != null) {
        _initialLoad[resolved.src] = initialLoad;
        if (retry) {
          sources.retryFailed(resolved.byteSource.identity);
        }
        final SvgVectorLease vector;
        try {
          vector = vectors.acquire(resolved.svg!, tint: tint);
        } on SvgSourceException catch (error) {
          _failures[key] = error;
          return _FailedAsset(error)
            .._key = key
            ..retain();
        } finally {
          // SvgVectorStore admits its source loader synchronously in acquire.
          // This flag belongs only to that admission, never to source history.
          _initialLoad.remove(resolved.src);
        }
        try {
          created = _SvgAsset(
            svgImages.acquire(vector, sourceReferenceCount: _counts[key] ?? 1),
            changed,
            remove,
          );
        } finally {
          vector.release();
        }
      } else {
        if (retry) raster.retryFailed(resolved.byteSource.identity);
        created = _RasterAsset(
          raster.acquire(resolved.byteSource, initialLoad: initialLoad),
          tint,
          changed,
          remove,
        );
      }
      created._key = key;
      created.markVisible = () => _visibleAssets.add(created);
      (_uses[key] ??= {}).add(created);
      created.retain();
      transferred = true;
      return created;
    } finally {
      if (!transferred) _releaseSource(source, descriptor);
    }
  }

  Future<String> _loadSvg(String canonicalSrc) async {
    final asset = registry.resolve({'src': canonicalSrc, 'parser': 'svg'});
    final lease = sources.acquireSourceBytes(
      asset.byteSource,
      initialLoad: _initialLoad[canonicalSrc] ?? true,
    );
    _loadingSources.add(lease);
    try {
      final result = await lease.ready;
      if (result.failure != null) throw result.failure!;
      return utf8.decode(result.bytes!);
    } finally {
      _loadingSources.remove(lease);
      lease.release();
    }
  }

  void retryDenied() {
    if (!_closed) {
      bars?.retryDenied();
      svgImages.retryDenied();
    }
  }

  Future<void> _waitActive() async {
    while (!_active && !_closed) {
      await (_activity ??= Completer<void>()).future;
    }
    if (_closed) throw StateError("SVG generation closed");
  }

  void setActive(bool active) {
    _active = active;
    if (active) {
      final wake = _activity;
      _activity = null;
      wake?.complete();
    }
    text.setActive(active);
    bars?.setActive(active);
    svgImages.setActive(active);
  }

  void close() {
    if (_closed) return;
    _closed = true;
    final wake = _activity;
    _activity = null;
    wake?.complete();
    onClosed();
    for (final lease in _loadingSources.toList()) {
      lease.release();
    }
    _loadingSources.clear();
    for (final uses in _uses.values.toList()) {
      for (final asset in uses.toList()) {
        asset.cancelPending();
      }
    }
    text.close();
    bars?.close();
    svgImages.close();
    vectors.close();
    _resolved.clear();
    _initialLoad.clear();
    _counts.clear();
    _failures.clear();
  }
}

final class _ResolvedSource {
  _ResolvedSource(this.asset);
  final ResolvedAsset asset;
  int references = 0;
}

abstract class _AssetBase implements DrawAsset {
  _AssetBase(this.changed, this.remove);
  final void Function() changed, remove;
  int _references = 0;
  bool released = false;
  Object? _failure;
  StackTrace? _failureStack;
  @override
  StackTrace? get failureStack => _failureStack;
  void cancelPending() {}
  (String, int)? _key;
  void Function()? markVisible;
  @override
  (String, int)? get creationKey => _key;
  @override
  void updateLogicalCount(int count) {}
  @override
  void hide() {}
  @override
  Object? get failure => _failure;
  @override
  void retain() {
    if (released) throw StateError('asset released');
    _references++;
  }

  @override
  void release() {
    if (--_references == 0) {
      released = true;
      dispose();
      remove();
    }
  }

  void dispose();
  Future<void> observe(Future<void> value) {
    final result = value.then(
      (_) {
        if (!released) {
          try {
            changed();
          } catch (_) {
            /* Observation cannot change resource outcome. */
          }
        }
      },
      onError: (Object e, StackTrace s) {
        _failure = e;
        _failureStack = s;
        if (!released) {
          try {
            changed();
          } catch (_) {
            /* Observation cannot change resource outcome. */
          }
        }
        Error.throwWithStackTrace(e, s);
      },
    );
    result.ignore();
    return result;
  }
}

final class _SvgAsset extends _AssetBase {
  _SvgAsset(this.lease, super.changed, super.remove) {
    ready = observe(lease.vectorReady.then((_) {}));
  }
  final SvgImageLease lease;
  @override
  void updateLogicalCount(int count) => lease.updateLogicalCount(count);
  @override
  void hide() => lease.hide();
  final _paint = Paint()..filterQuality = FilterQuality.medium;
  @override
  late final Future<void> ready;
  @override
  Size? get intrinsicSize => lease.vector?.size;
  @override
  void dispose() => lease.release();
  @override
  void cancelPending() {
    if (intrinsicSize == null) lease.release();
  }

  @override
  void paint(Canvas canvas, Rect destination, double physicalScale) {
    markVisible?.call();
    final image = lease.resolve(
      logicalSize: destination.size,
      scale: physicalScale,
      devicePixelRatio: 1,
    );
    if (image != null) {
      canvas.drawImageRect(
        image,
        Offset.zero & Size(image.width.toDouble(), image.height.toDouble()),
        destination,
        _paint,
      );
    } else {
      lease.vector?.paint(canvas, destination);
    }
  }
}

final class _RasterAsset extends _AssetBase {
  _RasterAsset(this.lease, Color tint, super.changed, super.remove)
    : _paint = Paint()
        ..filterQuality = FilterQuality.medium
        ..colorFilter = ColorFilter.mode(tint, BlendMode.modulate) {
    ready = observe(
      lease.ready.then((result) {
        if (result.failure != null) throw result.failure!;
        _image = result.image;
      }),
    );
  }
  final RasterImageLease lease;
  Image? _image;
  final Paint _paint;
  @override
  late final Future<void> ready;
  @override
  Size? get intrinsicSize => _image == null
      ? null
      : Size(_image!.width.toDouble(), _image!.height.toDouble());
  @override
  void dispose() => lease.release();
  @override
  void cancelPending() {
    if (intrinsicSize == null) lease.release();
  }

  @override
  void paint(Canvas canvas, Rect destination, double physicalScale) {
    final image = _image;
    if (image != null) {
      canvas.drawImageRect(
        image,
        Offset.zero & Size(image.width.toDouble(), image.height.toDouble()),
        destination,
        _paint,
      );
    }
  }
}

final class _FailedAsset extends _AssetBase {
  _FailedAsset(Object error) : super(() {}, () {}) {
    _failure = error;
    ready = Future<void>.error(error)..ignore();
  }
  @override
  late final Future<void> ready;
  @override
  Size? get intrinsicSize => null;
  @override
  void dispose() {}
  @override
  void paint(Canvas canvas, Rect destination, double physicalScale) {}
}
