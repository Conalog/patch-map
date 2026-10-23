import 'dart:ui';

import '../dataset/colors.dart';
import '../api/target.dart';
import '../geometry/layout.dart';
import '../geometry/scene_geometry.dart';
import '../resources/text/text_pool.dart';
import '../resources/bars/bar_masks.dart';
import '../presentation/record_delta.dart';
import '../geometry/item_layout.dart';
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
    int fields = RecordFields.all,
    ComponentChanges? componentChanges,
  }) {
    final acquired = <DrawContent>[];
    var components = <DrawComponent>[];
    ComponentChanges? sparseChanges;
    var reuseAssetMetadata = false;
    DrawContent? content;
    try {
      final item = node.item;
      if (item != null) {
        final priorItem = previous?.geometry.item;
        final sameOrder =
            priorItem != null && identical(item.indices, priorItem.indices);
        final sparse =
            previous != null &&
            priorItem != null &&
            componentChanges != null &&
            sameOrder &&
            item.size == priorItem.size &&
            item.content == priorItem.content &&
            node.opacity == previous.geometry.opacity &&
            fields & RecordFields.contentOrientation == 0;
        if (sparse) {
          components = [
            for (var i = 0; i < previous.components.length; i++)
              DrawComponent(
                item.components[i],
                previous.components[i].content,
                previous: previous.components[i],
              ),
          ];
          sparseChanges = componentChanges;
          reuseAssetMetadata = true;
          // Exact changes include requested source retries even when their
          // resolved fields are unchanged. Retry membership stays a point lookup.
          for (final entry in componentChanges) {
            final index = entry.index;
            final prior = previous.components[index];
            final component = _component(
              node,
              item.components[index],
              prior,
              entry.delta.fields,
              initialLoad,
              retrySources,
              acquired,
              previous.geometry,
            );
            if (!identical(component.content, prior.content) &&
                (component.content.assets.isNotEmpty ||
                    prior.content.assets.isNotEmpty)) {
              reuseAssetMetadata = false;
            }
            components[index] = component;
          }
        } else {
          for (final layout in item.components) {
            final index = sameOrder
                ? components.length
                : priorItem?.indices[layout.id];
            final prior = index == null ? null : previous!.components[index];
            components.add(
              _component(
                node,
                layout,
                prior,
                sameOrder
                    ? (componentChanges?[components.length]?.fields ??
                          RecordFields.all)
                    : RecordFields.all,
                initialLoad,
                retrySources,
                acquired,
                previous?.geometry,
              ),
            );
          }
        }
      } else {
        if (previous?.content != null &&
            _reuseElementContent(node, previous!.geometry, fields) &&
            !_retryFailed(
              previous.content!,
              retrySources.contains(PatchMapTarget(node.id)),
            )) {
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
        componentChanges: sparseChanges,
        reuseAssetMetadata: reuseAssetMetadata,
      );
    } finally {
      for (final value in acquired) {
        value.release();
      }
    }
  }

  DrawComponent _component(
    TargetGeometry node,
    ComponentLayout layout,
    DrawComponent? prior,
    int fields,
    bool initialLoad,
    Set<PatchMapTarget> retrySources,
    List<DrawContent> acquired,
    TargetGeometry? previous,
  ) {
    final retry = retrySources.contains(
      PatchMapTarget(node.id, componentId: layout.id),
    );
    if (prior != null &&
        _reuseComponentContent(node, previous!, layout, prior.layout, fields) &&
        !_retryFailed(prior.content, retry)) {
      return DrawComponent(layout, prior.content, previous: prior);
    }
    final data = layout.data;
    final opacity = _opacity(data, node.opacity);
    // Content identity excludes placement, transforms, visibility and dimensions
    // except for text's measured content bounds and margins.
    final Object key = layout.type == 'text'
        ? (
            layout.type,
            data['text'],
            data['style'],
            data['tint'],
            data['split'],
            data['overflow'],
            data['margin'],
            node.item!.content.size,
            opacity,
          )
        : (layout.type, data['source'], data['tint'], opacity);
    var value = _components[key];
    if (value != null && _retryFailed(value, retry)) value = null;
    if (value == null) {
      value = switch (layout.type) {
        'text' => TextContent(
          text,
          text.acquire(
            _textOpacity(data, node.opacity, component: true),
            node.item!.content.size,
          ),
        ),
        'bar' => _bar(data, node.opacity),
        'background' => _background(data, node.opacity, initialLoad, retry),
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
    return DrawComponent(layout, value, previous: prior);
  }

  /// Stages a lease, without allocating replacement draw handles. Source/asset
  /// changes use the baseline asynchronous preparation path.
  DrawContent prepareRetainedContent(
    TargetGeometry node,
    Map<String, Object?> data,
    DrawComponent prior,
    int fields,
  ) {
    final type = prior.layout.type;
    final mask = type == 'text' ? _textFields : _componentPaintFields;
    if ((fields & mask) == 0) return prior.content..retain();
    final opacity = _opacity(data, node.opacity);
    final Object key = type == 'text'
        ? (
            type,
            data['text'],
            data['style'],
            data['tint'],
            data['split'],
            data['overflow'],
            data['margin'],
            node.item!.content.size,
            opacity,
          )
        : (type, data['source'], data['tint'], opacity);
    var value = _components[key];
    if (value == null) {
      value = switch (type) {
        'text' => TextContent(
          text,
          text.acquire(
            _textOpacity(data, node.opacity, component: true),
            node.item!.content.size,
          ),
        ),
        'bar' => _bar(data, node.opacity),
        'background' => _background(data, node.opacity, false, false),
        _ => throw StateError('Retained asset content requires baseline'),
      };
      _components[key] = value;
      final cached = value;
      value.onDisposed = () {
        if (identical(_components[key], cached)) _components.remove(key);
      };
    }
    return value..retain();
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

bool _retryFailed(DrawContent content, bool retry) =>
    retry && content.assets.any((asset) => asset.failure != null);

const _componentPaintFields =
    RecordFields.source | RecordFields.tint | RecordFields.attrsAlpha;
const _textFields =
    RecordFields.text |
    RecordFields.style |
    RecordFields.tint |
    RecordFields.split |
    RecordFields.overflow |
    RecordFields.margin |
    RecordFields.attrsAlpha;

bool _reuseComponentContent(
  TargetGeometry node,
  TargetGeometry previous,
  ComponentLayout layout,
  ComponentLayout prior,
  int fields,
) {
  if (layout.type != prior.type ||
      _opacity(layout.data, node.opacity) !=
          _opacity(prior.data, previous.opacity)) {
    return false;
  }
  final data = layout.data, old = prior.data;
  if (layout.type == 'text') {
    if (node.item!.content.size != previous.item!.content.size) return false;
    return fields & _textFields == 0 ||
        _sameValues(data, old, const [
          'text',
          'style',
          'tint',
          'split',
          'overflow',
          'margin',
        ]);
  }
  return fields & _componentPaintFields == 0 ||
      _sameValues(data, old, const ['source', 'tint']);
}

bool _reuseElementContent(
  TargetGeometry node,
  TargetGeometry previous,
  int fields,
) {
  if (node.target.type != previous.target.type ||
      node.opacity != previous.opacity) {
    return false;
  }
  final data = node.data, old = previous.data;
  return switch (node.target.type) {
    'rect' =>
      fields &
                  (RecordFields.fill |
                      RecordFields.stroke |
                      RecordFields.radius) ==
              0 ||
          _sameValues(data, old, const ['fill', 'stroke', 'radius']),
    'text' =>
      fields & (_textFields | RecordFields.size) == 0 ||
          _sameValues(data, old, const [
            'text',
            'style',
            'tint',
            'split',
            'overflow',
            'margin',
            'size',
          ]),
    'image' =>
      fields & (RecordFields.source | RecordFields.opacity) == 0 ||
          _sameValues(data, old, const ['source', 'opacity']),
    _ => false,
  };
}

bool _sameValues(
  Map<String, Object?> a,
  Map<String, Object?> b,
  List<String> keys,
) => keys.every((key) => a[key] == b[key]);
