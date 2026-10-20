import 'dart:ui';

import '../dataset/colors.dart';
import '../api/target.dart';
import '../geometry/item_layout.dart';
import '../geometry/affine.dart';
import '../geometry/layout.dart';
import '../geometry/scene_geometry.dart';
import '../resources/text/text_pool.dart';
import '../resources/bars/bar_masks.dart';
import 'draw_objects.dart';
import 'rectangle_paint.dart';
import 'relation_paint.dart';
import '../geometry/relation_geometry.dart';

typedef DrawAssetFactory =
    DrawAsset Function(
      Object source,
      Color tint, {
      required bool initialLoad,
      bool retry,
    });

/// Compiles only changed render nodes. Cache entries borrow live content; their
/// final reference removes them, so historical component values cannot accumulate.
final class DrawCompiler {
  DrawCompiler({
    required this.palette,
    required this.text,
    required this.assets,
    this.barMasks,
  });
  final ColorResolver palette;
  final TextPool text;
  final DrawAssetFactory assets;
  final BarMaskHandle? Function(double radius)? barMasks;
  final _components = <Object, DrawContent>{};

  DrawNode compile(
    TargetGeometry node, {
    required bool initialLoad,
    DrawNode? previous,
    RelationGeometry? relation,
    Set<PatchMapTarget> retrySources = const {},
  }) {
    final acquired = <DrawContent>[];
    final components = <DrawComponent>[];
    DrawContent? content;
    try {
      final item = node.item;
      if (item != null) {
        double? worldScale;
        for (final layout in item.components) {
          final data = layout.data;
          final source = data['source'];
          final rectangle =
              layout.type == 'bar' ||
              layout.type == 'background' &&
                  source is Map<String, Object?> &&
                  source['type'] == 'rect';
          // Rectangle content owns paint/mask resources, not size or placement.
          // Sharing ends with its last content lease; no historical style cache.
          final Object key = rectangle
              ? (
                  layout.type,
                  source,
                  data['tint'],
                  _opacity(data, node.opacity),
                )
              : (
                  layout,
                  node.opacity,
                  item.content.size,
                  layout.type == 'icon' || layout.type == 'background'
                      ? worldScale ??= _worldScale(node.world)
                      : 0.0,
                );
          final retry = retrySources.contains(
            PatchMapTarget(node.id, componentId: layout.id),
          );
          var value = _components[key];
          if (retry &&
              value != null &&
              value.assets.any((asset) => asset.failure != null)) {
            value = null;
          }
          if (value == null) {
            value = switch (layout.type) {
              'text' => TextContent(
                text,
                text.acquire(
                  _textOpacity(data, node.opacity, component: true),
                  item.content.size,
                ),
              ),
              'bar' => _bar(data, node.opacity),
              'background' => _background(
                data,
                node.opacity,
                initialLoad,
                retry,
              ),
              'icon' => AssetContent(
                assets(
                  data['source']!,
                  _tint(data, node.opacity),
                  initialLoad: initialLoad,
                  retry: retry,
                ),
              ),
              _ => throw StateError('Unknown admitted component'),
            };
            _components[key] = value;
            final cached = value;
            value.onDisposed = () {
              if (identical(_components[key], cached)) _components.remove(key);
            };
          }
          value.retain();
          acquired.add(value);
          final index = components.length;
          final prior =
              previous != null &&
                  index < previous.components.length &&
                  previous.components[index].layout.id == layout.id
              ? previous.components[index]
              : null;
          components.add(
            identical(prior?.layout, layout) && identical(prior?.content, value)
                ? prior!
                : DrawComponent(layout, value, previous: prior),
          );
        }
      } else {
        if (node.target.type == 'image' &&
            previous?.content != null &&
            !(retrySources.contains(PatchMapTarget(node.id)) &&
                previous!.assets.any((asset) => asset.failure != null)) &&
            identical(node.data['source'], previous!.geometry.data['source']) &&
            node.data['opacity'] == previous.geometry.data['opacity'] &&
            node.opacity == previous.geometry.opacity) {
          content = previous.content;
        } else {
          content = switch (node.target.type) {
            'relations' =>
              relation == null
                  ? null
                  : RelationContent(
                      RelationPaint(relation, node.data, palette, node.opacity),
                    ),
            'rect' => RectangleContent(
              RectanglePaint.fromElement(node.data, palette, node.opacity),
            ),
            'text' => TextContent(
              text,
              text.acquire(
                _textOpacity(node.data, node.opacity),
                node.data['size'] == null
                    ? null
                    : fixedSize(node.data['size']! as Map),
              ),
            ),
            'image' => AssetContent(
              assets(
                node.data['source']!,
                const Color(0xffffffff).withValues(
                  alpha:
                      node.opacity *
                      ((node.data['opacity'] as num?)?.toDouble() ?? 1),
                ),
                initialLoad: initialLoad,
                retry: retrySources.contains(PatchMapTarget(node.id)),
              ),
            ),
            _ => null,
          };
        }
        if (content != null) {
          content.retain();
          acquired.add(content);
        }
      }
      return DrawNode(
        node,
        List.unmodifiable(components),
        content,
        previous: previous,
      );
    } finally {
      for (final value in acquired) {
        value.release();
      }
    }
  }

  DrawContent _background(
    Map<String, Object?> data,
    double opacity,
    bool initial,
    bool retry,
  ) {
    final source = data['source']!;
    if (source is Map<String, Object?> && source['type'] == 'rect') {
      return RectangleContent(
        RectanglePaint.fromTexture(
          source,
          palette,
          data['tint']!,
          _opacity(data, opacity),
        ),
      );
    }
    return AssetContent(
      assets(source, _tint(data, opacity), initialLoad: initial, retry: retry),
    );
  }

  RectangleContent _bar(Map<String, Object?> data, double opacity) {
    final style = RectanglePaint.fromTexture(
      data['source']! as Map<String, Object?>,
      palette,
      data['tint']!,
      _opacity(data, opacity),
    );
    final radius = style.uniformRadius;
    return RectangleContent(
      style,
      barMask:
          radius != null &&
              radius.isFinite &&
              radius >= 0 &&
              style.strokeWidth == 0
          ? barMasks?.call(radius)
          : null,
    );
  }

  Color _tint(Map<String, Object?> data, double opacity) {
    final tint = palette.resolve(data['tint'] ?? '#ffffff');
    return tint.withValues(alpha: tint.a * _opacity(data, opacity));
  }
}

double _opacity(Map<String, Object?> data, double inherited) =>
    inherited * (((data['attrs'] as Map?)?['alpha'] as num?)?.toDouble() ?? 1);

Map<String, Object?> _textOpacity(
  Map<String, Object?> data,
  double inherited, {
  bool component = false,
}) {
  final opacity = component ? _opacity(data, inherited) : inherited;
  if (opacity == 1) return data;
  final style = data['style']! as Map<String, Object?>;
  return {
    ...data,
    'style': {
      ...style,
      'alpha': ((style['alpha'] as num?)?.toDouble() ?? 1) * opacity,
    },
  };
}

double _worldScale(Affine world) {
  final x = vectorLength(world.a, world.b), y = vectorLength(world.c, world.d);
  return x > y ? x : y;
}
