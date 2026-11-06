import 'dart:collection';
import 'dart:ui';

import '../dataset/dataset_values.dart' show DatasetException;
import '../presentation/record_delta.dart';
import 'affine.dart';
import 'layout.dart';
import 'readable_rect.dart';

/// The text owner supplies measured geometry; layout never owns a Paragraph.
typedef MeasureText = Size Function(Map<String, Object?> data, Size? content);

/// One admission batch's scalar layouts. Text validation uses placeholder
/// measurements, so only non-text components may cross into preparation.
final class ComponentLayoutMemo {
  final _entries =
      HashMap<
        Map<String, Object?>,
        ({Size size, Rect content, ComponentLayout layout})
      >.identity();

  ComponentLayout? reuse(
    Map<String, Object?> data,
    Size size,
    Rect content,
    bool upright,
  ) {
    final entry = _entries[data];
    return entry != null &&
            entry.size == size &&
            entry.content == content &&
            entry.layout.upright == upright
        ? entry.layout
        : null;
  }

  void remember(Size size, Rect content, ComponentLayout layout) {
    if (layout.type != 'text') {
      _entries[layout.data] = (size: size, content: content, layout: layout);
    }
  }
}

final class ComponentLayout {
  ComponentLayout(this.data, this.box, this.transform, this.upright);
  Map<String, Object?> data;
  Rect box;

  /// Maps a zero-origin component rectangle into its item's coordinates.
  Affine transform;
  final bool upright;
  String get id => data['id']! as String;
  String get type => data['type']! as String;
  bool get visible => data['show'] != false;

  bool get remapsPlacement => upright && data['placement'] != 'none';

  Affine worldTransform(Affine item, double cameraRotation, Rect content) {
    final authored = item.multiply(transform);
    if (!upright) return authored;
    final axes = remapsPlacement
        ? ReadableRectBasis(item, cameraRotation).axes
        : 0;
    final placed = projectComponentPlacement(
      authored,
      item,
      box,
      orientPlacement(box, content, axes),
    );
    return readableRectTransform(
      placed,
      Offset.zero & box.size,
      cameraRotation,
    );
  }
}

/// Reflect the placement box, leaving the component's authored offsets alone.
Rect orientPlacement(Rect box, Rect? content, int axes) {
  if (axes == 0 || content == null) return box;
  final left = (axes & readableFlipX) == 0
      ? box.left
      : content.left + (content.right - box.right);
  final top = (axes & readableFlipY) == 0
      ? box.top
      : content.top + (content.bottom - box.bottom);
  if (left == box.left && top == box.top) return box;
  final right = left + box.width, bottom = top + box.height;
  if (!right.isFinite ||
      !bottom.isFinite ||
      (box.width > 0 && right <= left) ||
      (box.height > 0 && bottom <= top)) {
    return box;
  }
  return Rect.fromLTRB(left, top, right, bottom);
}

/// The two camera-dependent placements use the same authored linear transform.
Affine projectComponentPlacement(
  Affine authored,
  Affine item,
  Rect box,
  Rect placement,
) {
  if (identical(box, placement)) return authored;
  final dx = placement.left - box.left, dy = placement.top - box.top;
  final tx = authored.tx + item.a * dx + item.c * dy;
  final ty = authored.ty + item.b * dx + item.d * dy;
  if (!tx.isFinite || !ty.isFinite) return authored;
  final projected = Affine(
    authored.a,
    authored.b,
    authored.c,
    authored.d,
    tx,
    ty,
  );
  // Only extreme inputs need a second check. An alternate placement must
  // never turn a valid authored projection into nonfinite paint coordinates.
  final extentX =
      (authored.a * placement.width).abs() +
      (authored.c * placement.height).abs();
  final extentY =
      (authored.b * placement.width).abs() +
      (authored.d * placement.height).abs();
  if ((tx.abs() + extentX).isFinite && (ty.abs() + extentY).isFinite) {
    return projected;
  }
  return projected.projectRect(Offset.zero & placement.size).bounds.isFinite
      ? projected
      : authored;
}

/// Shared item-local layout. Every unchanged cell of a grid can use one copy.
final class ItemLayout {
  ItemLayout._(
    this.size,
    this.content,
    this.components,
    this.indices,
    this.sourceIndices,
  );
  // True only for a layout with no shared mutable component handles.
  bool mutationOwned = false;
  final Size size;
  final Rect content;
  final List<ComponentLayout> components;
  final Map<String, int> indices;
  final Map<String, int> sourceIndices;

  /// Retained geometry must never mutate a grid template or sibling handle.
  ItemLayout detached() => ItemLayout._(
    size,
    content,
    List.unmodifiable([
      for (final c in components)
        ComponentLayout(c.data, c.box, c.transform, c.upright),
    ]),
    indices,
    sourceIndices,
  )..mutationOwned = true;

  factory ItemLayout.compile(
    Map<String, Object?> data,
    MeasureText measureText, {
    ItemLayout? previous,
    ComponentLayoutMemo? memo,
  }) {
    var size = fixedSize(data['size']! as Map);
    if (previous?.size == size) size = previous!.size;
    var content = BoxEdges.fromData(data['padding']! as Map).contentBox(size);
    if (previous?.content == content) content = previous!.content;
    final values = (data['components']! as List).cast<Map<String, Object?>>();
    final components = <ComponentLayout>[];
    Map<String, ComponentLayout>? previousById;
    for (final value in orderedRecords(values)) {
      final type = value['type'];
      final upright =
          type != 'background' && data['contentOrientation'] == 'upright';
      final index = components.length;
      final indexed = previous != null && index < previous.components.length
          ? previous.components[index]
          : null;
      final ComponentLayout? prior;
      if (previous == null) {
        prior = null;
      } else {
        prior = indexed?.id == value['id']
            ? indexed
            : (previousById ??= {
                for (final component in previous.components)
                  component.id: component,
              })[value['id']];
      }
      if (prior != null &&
          identical(prior.data, value) &&
          previous!.size == size &&
          previous.content == content &&
          prior.upright ==
              (type != 'background' &&
                  data['contentOrientation'] == 'upright')) {
        components.add(prior);
        continue;
      }
      final checked = memo?.reuse(value, size, content, upright);
      if (checked != null) {
        components.add(_reuseCheckedGeometry(checked, prior));
        continue;
      }
      final component = prepareComponent(
        value,
        size,
        content,
        upright,
        measureText,
        previous: prior,
        previousContent: previous?.content,
      );
      components.add(component);
      memo?.remember(size, content, component);
    }
    return ItemLayout._(
      size,
      content,
      List.unmodifiable(components),
      Map.unmodifiable({
        for (var i = 0; i < components.length; i++) components[i].id: i,
      }),
      Map.unmodifiable({
        for (var i = 0; i < values.length; i++) values[i]['id']! as String: i,
      }),
    );
  }

  /// Replaces addressed components directly. Owner geometry is an independent
  /// dependency; only a changed content box/orientation expands work to siblings.
  ItemLayout update(
    Map<String, Object?> data,
    ComponentChanges changes,
    MeasureText measure, {
    required int fields,
    ComponentLayoutMemo? memo,
  }) {
    var nextSize = (fields & RecordFields.size) == 0
        ? size
        : fixedSize(data['size']! as Map);
    if (nextSize == size) nextSize = size;
    var nextContent = (fields & (RecordFields.size | RecordFields.padding)) == 0
        ? content
        : BoxEdges.fromData(data['padding']! as Map).contentBox(nextSize);
    if (nextContent == content) nextContent = content;
    final ownerChanged =
        nextSize != size ||
        nextContent != content ||
        (fields & RecordFields.contentOrientation) != 0;
    if (!ownerChanged && changes.isEmpty) return this;
    final next = List<ComponentLayout>.of(components);
    var orderChanged = false;
    void updateAt(int index, RecordDelta? change) {
      final prior = components[index];
      final value = change?.after ?? prior.data;
      final flags = change?.fields ?? 0;
      final upright =
          prior.type != 'background' && data['contentOrientation'] == 'upright';
      final geometry = ownerChanged || (flags & componentGeometryFields) != 0;
      if (!geometry) {
        next[index] = identical(value, prior.data)
            ? prior
            : ComponentLayout(value, prior.box, prior.transform, prior.upright);
      } else {
        final checked = memo?.reuse(value, nextSize, nextContent, upright);
        next[index] = checked != null
            ? _reuseCheckedGeometry(checked, prior)
            : prepareComponent(
                value,
                nextSize,
                nextContent,
                upright,
                measure,
                previous: prior,
                previousContent: content,
              );
      }
      orderChanged |= (flags & RecordFields.attrsZIndex) != 0;
    }

    if (ownerChanged) {
      for (var i = 0; i < components.length; i++) {
        updateAt(i, changes[i]);
      }
    } else {
      for (final entry in changes) {
        updateAt(entry.index, entry.delta);
      }
    }
    var nextIndices = indices;
    if (orderChanged) {
      double z(ComponentLayout value) =>
          ((value.data['attrs'] as Map?)?['zIndex'] as num?)?.toDouble() ?? 0;
      // Authored list order, rather than previous sorted order, breaks ties.
      next.sort((a, b) {
        final order = z(a).compareTo(z(b));
        return order == 0
            ? sourceIndices[a.id]!.compareTo(sourceIndices[b.id]!)
            : order;
      });
      nextIndices = Map.unmodifiable({
        for (var i = 0; i < next.length; i++) next[i].id: i,
      });
    }
    final result = ItemLayout._(
      nextSize,
      nextContent,
      List.unmodifiable(next),
      nextIndices,
      sourceIndices,
    );
    return result.detached();
  }

  /// Fields used by local layout, independent of resource and painting fields.
  static const componentGeometryFields =
      RecordFields.size |
      RecordFields.margin |
      RecordFields.placement |
      RecordFields.attrsTransform |
      RecordFields.text |
      RecordFields.style |
      RecordFields.split |
      RecordFields.overflow;

  /// Admission and rendering preparation share one scalar layout authority.
  static ComponentLayout prepareComponent(
    Map<String, Object?> value,
    Size size,
    Rect content,
    bool upright,
    MeasureText measureText, {
    ComponentLayout? previous,
    Rect? previousContent,
  }) {
    final prepared = prepareComponentValues(
      value,
      size,
      content,
      measureText,
      previous: previous,
      previousContent: previousContent,
    );
    return ComponentLayout(value, prepared.box, prepared.transform, upright);
  }

  /// Scalar staging avoids allocating a replacement ComponentLayout handle.
  static ({Rect box, Affine transform}) prepareComponentValues(
    Map<String, Object?> value,
    Size size,
    Rect content,
    MeasureText measureText, {
    ComponentLayout? previous,
    Rect? previousContent,
  }) {
    final prior = previous, type = value['type'];
    Rect box;
    if (type == 'background') {
      box = Offset.zero & size;
    } else {
      final componentSize = type == 'text'
          ? prior != null &&
                    previousContent == content &&
                    _sameTextMeasurement(value, prior.data)
                ? prior.box.size
                : measureText(value, content.size)
          : RelativeSize.compile(value['size']!).resolve(content.size);
      if (!componentSize.isFinite ||
          componentSize.width < 0 ||
          componentSize.height < 0) {
        throw const DatasetException(
          'INVALID_GEOMETRY',
          'component',
          'invalid measured size',
        );
      }
      box =
          prior != null &&
              previousContent == content &&
              prior.box.width == componentSize.width &&
              prior.box.height == componentSize.height &&
              value['placement'] == prior.data['placement'] &&
              _sameEdges(value['margin'] as Map, prior.data['margin'] as Map)
          ? prior.box
          : placeBox(
              content,
              componentSize,
              value['placement']! as String,
              BoxEdges.fromData(value['margin']! as Map),
            );
    }
    if (prior?.box == box) box = prior!.box;
    final attrs = value['attrs'] as Map<String, Object?>?;
    Affine local;
    if (prior != null && identical(attrs, prior.data['attrs'])) {
      if (identical(box, prior.box)) {
        local = prior.transform;
      } else {
        // Placement changes translation only. Keep the already parsed
        // rotation/scale, but read authored offsets (subtracting the old box
        // from a rounded translation would lose precision at large positions).
        final x = (attrs?['x'] as num?)?.toDouble() ?? 0;
        final y = (attrs?['y'] as num?)?.toDouble() ?? 0;
        final old = prior.transform;
        local = Affine(
          old.a,
          old.b,
          old.c,
          old.d,
          x + 0 * y + box.left,
          0 * x + y + box.top,
        );
      }
    } else {
      local = Affine.identity
          .translated(box.left, box.top)
          .multiply(Affine.fromAttrs(attrs));
    }
    if (prior != null && local.sameTransform(prior.transform)) {
      local = prior.transform;
    }
    return (box: box, transform: local);
  }

  /// Bars are contained and never invalidate the text/SVG safety envelope.
  bool sameEnvelope(ItemLayout other, {ComponentChanges? changed}) {
    if (size != other.size ||
        content != other.content ||
        components.length != other.components.length) {
      return false;
    }
    if (changed != null && identical(indices, other.indices)) {
      for (final entry in changed) {
        final index = entry.index;
        if (!_sameEnvelopeComponent(
          components[index],
          other.components[index],
        )) {
          return false;
        }
      }
    } else {
      for (var i = 0; i < components.length; i++) {
        if (!_sameEnvelopeComponent(components[i], other.components[i])) {
          return false;
        }
      }
    }
    return true;
  }

  /// Conservative envelope from canonical scalar entries, before live mutation.
  /// Geometry remains the owner of this calculation for retained updates.
  Rect projectedPaintBounds(
    Affine world,
    ({Map<String, Object?> data, Rect box, Affine transform})? Function(int)
    staged,
  ) {
    var result = world.projectRect(Offset.zero & size).bounds;
    final handedness = readableHandedness(world);
    for (var index = 0; index < components.length; index++) {
      final component = components[index], next = staged(index);
      final data = next?.data ?? component.data;
      if (data['show'] == false || component.type == 'bar') continue;
      final box = next?.box ?? component.box;
      result = result.expandToInclude(
        _componentPaintBounds(
          world.multiply(next?.transform ?? component.transform),
          box,
          component.upright,
          data,
          world,
          content,
          handedness,
        ),
      );
    }
    validateBounds(result);
    return result;
  }

  /// Camera-independent conservative paint envelope. Bars are contained by the
  /// item clip and deliberately do not enlarge the overflow safety envelope.
  /// [includeComponent] narrows only a renderer's temporary safety proof. It
  /// does not alter the layout or the published paint/hit/query envelope.
  Rect paintBounds(Affine world, {bool Function(String)? includeComponent}) {
    var result = world.projectRect(Offset.zero & size).bounds;
    final handedness = readableHandedness(world);
    for (final component in components) {
      if (!component.visible ||
          component.type == 'bar' ||
          (includeComponent != null && !includeComponent(component.id))) {
        continue;
      }
      result = result.expandToInclude(
        _componentPaintBounds(
          world.multiply(component.transform),
          component.box,
          component.upright,
          component.data,
          world,
          content,
          handedness,
        ),
      );
    }
    validateBounds(result);
    return result;
  }
}

Rect _componentPaintBounds(
  Affine authored,
  Rect box,
  bool upright,
  Map<String, Object?> data,
  Affine item,
  Rect content,
  int handedness,
) {
  var local = Offset.zero & box.size;
  final outset = _backgroundOutset(data);
  if (outset > 0) local = local.inflate(outset);
  var bounds = authored.projectRect(local).bounds;
  if (!upright || data['placement'] == 'none' || handedness == 0) {
    return bounds;
  }
  final first = handedness < 0 ? readableFlipY : 0;
  for (final axes in [first, first ^ (readableFlipX | readableFlipY)]) {
    if (axes == 0) continue;
    final placed = projectComponentPlacement(
      authored,
      item,
      box,
      orientPlacement(box, content, axes),
    );
    final variant = placed.projectRect(local).bounds;
    if (variant.isFinite) bounds = bounds.expandToInclude(variant);
  }
  return bounds;
}

double _backgroundOutset(Map<String, Object?> data) {
  if (data['type'] != 'background') return 0;
  final source = data['source'];
  return source is Map && source['type'] == 'rect'
      ? ((source['borderWidth'] as num?)?.toDouble() ?? 0) / 2
      : 0;
}

bool _sameEnvelopeComponent(ComponentLayout component, ComponentLayout prior) {
  if (component.id != prior.id ||
      component.type != prior.type ||
      component.visible != prior.visible ||
      component.upright != prior.upright ||
      component.remapsPlacement != prior.remapsPlacement) {
    return false;
  }
  return component.type == 'bar' ||
      component.box == prior.box &&
          component.transform.sameTransform(prior.transform) &&
          (component.type != 'background' ||
              identical(component.data['source'], prior.data['source']) ||
              _backgroundOutset(component.data) ==
                  _backgroundOutset(prior.data));
}

ComponentLayout _reuseCheckedGeometry(
  ComponentLayout checked,
  ComponentLayout? prior,
) =>
    prior != null &&
        prior.box == checked.box &&
        prior.transform.sameTransform(checked.transform)
    ? ComponentLayout(checked.data, prior.box, prior.transform, checked.upright)
    : checked;

/// Stable sibling z-order. Never sort components across item boundaries.
List<Map<String, Object?>> orderedRecords(List<Map<String, Object?>> values) {
  double z(Map<String, Object?> value) =>
      ((value['attrs'] as Map?)?['zIndex'] as num?)?.toDouble() ?? 0;
  var needsSort = false;
  for (var i = 1; i < values.length; i++) {
    if (z(values[i - 1]) > z(values[i])) {
      needsSort = true;
      break;
    }
  }
  if (!needsSort) return values;
  final order = List<int>.generate(values.length, (i) => i)
    ..sort((a, b) {
      final result = z(values[a]).compareTo(z(values[b]));
      return result == 0 ? a.compareTo(b) : result;
    });
  return [for (final index in order) values[index]];
}

void validateBounds(Rect bounds) {
  if (!bounds.isFinite || !bounds.width.isFinite || !bounds.height.isFinite) {
    throw const DatasetException(
      'INVALID_GEOMETRY',
      'bounds',
      'derived bounds must be finite',
    );
  }
}

bool _sameEdges(Map a, Map b) =>
    identical(a, b) ||
    const ['top', 'right', 'bottom', 'left'].every((key) => a[key] == b[key]);

// TextSpec's content bounds include margin. Keep the whole style identity as a
// conservative dependency, including font/wrap/auto/stroke metric settings.
// Tint/show/placement/attrs affect paint or placement rather than measurement.
bool _sameTextMeasurement(Map<String, Object?> a, Map<String, Object?> b) =>
    b['type'] == 'text' &&
    a['text'] == b['text'] &&
    identical(a['style'], b['style']) &&
    a['split'] == b['split'] &&
    a['overflow'] == b['overflow'] &&
    _sameEdges(a['margin'] as Map, b['margin'] as Map);
