import 'dart:ui';

import '../dataset/dataset_values.dart' show DatasetException;
import 'affine.dart';
import 'layout.dart';
import 'readable_rect.dart';

/// The text owner supplies measured geometry; layout never owns a Paragraph.
typedef MeasureText = Size Function(Map<String, Object?> data, Size? content);

final class ComponentLayout {
  ComponentLayout(this.data, this.box, this.transform, this.upright);
  final Map<String, Object?> data;
  final Rect box;

  /// Maps a zero-origin component rectangle into its item's coordinates.
  final Affine transform;
  final bool upright;
  String get id => data['id']! as String;
  String get type => data['type']! as String;
  bool get visible => data['show'] != false;

  Affine worldTransform(Affine item, double cameraRotation, Size itemSize) {
    final authored = item.multiply(transform);
    if (!upright) return authored;
    return readableRectTransform(
      authored,
      Offset.zero & box.size,
      cameraRotation,
      placementAnchor: type == 'bar'
          ? item.project(Offset(itemSize.width / 2, itemSize.height / 2))
          : null,
    );
  }
}

/// Shared item-local layout. Every unchanged cell of a grid can use one copy.
final class ItemLayout {
  ItemLayout._(this.size, this.content, this.components);
  final Size size;
  final Rect content;
  final List<ComponentLayout> components;

  factory ItemLayout.compile(
    Map<String, Object?> data,
    MeasureText measureText, {
    ItemLayout? previous,
  }) {
    final size = fixedSize(data['size']! as Map);
    final content = BoxEdges.fromData(data['padding']! as Map).contentBox(size);
    final values = (data['components']! as List).cast<Map<String, Object?>>();
    final components = <ComponentLayout>[];
    final previousById = previous == null
        ? const <String, ComponentLayout>{}
        : {
            for (final component in previous.components)
              component.id: component,
          };
    for (final value in orderedRecords(values)) {
      final type = value['type'];
      final prior = previousById[value['id']];
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
      final Rect box;
      if (type == 'background') {
        box = Offset.zero & size;
      } else {
        final componentSize = type == 'text'
            ? measureText(value, content.size)
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
        box = placeBox(
          content,
          componentSize,
          value['placement']! as String,
          BoxEdges.fromData(value['margin']! as Map),
        );
      }
      final local = Affine.identity
          .translated(box.left, box.top)
          .multiply(Affine.fromAttrs(value['attrs'] as Map<String, Object?>?));
      components.add(
        ComponentLayout(
          value,
          box,
          local,
          type != 'background' && data['contentOrientation'] == 'upright',
        ),
      );
    }
    return ItemLayout._(size, content, List.unmodifiable(components));
  }

  /// Bars are contained and never invalidate the text/SVG safety envelope.
  bool sameEnvelope(ItemLayout other) {
    if (size != other.size || components.length != other.components.length) {
      return false;
    }
    for (var i = 0; i < components.length; i++) {
      final component = components[i];
      if (component.type == 'bar' && other.components[i].type == 'bar') {
        continue;
      }
      if (!identical(component, other.components[i])) return false;
    }
    return true;
  }

  /// Camera-independent conservative paint envelope. Bars are contained by the
  /// item clip and deliberately do not enlarge the overflow safety envelope.
  Rect paintBounds(Affine world) {
    var result = world.projectRect(Offset.zero & size).bounds;
    for (final component in components) {
      if (!component.visible || component.type == 'bar') continue;
      final authored = world.multiply(component.transform);
      final local = Offset.zero & component.box.size;
      var bounds = authored.projectRect(local).bounds;
      if (component.upright) {
        final center = authored.project(local.center);
        final width =
            component.box.width * vectorLength(authored.a, authored.b);
        final height =
            component.box.height * vectorLength(authored.c, authored.d);
        // The sum also covers skew and readable basis changes under rotation.
        final radius = (width + height) / 2;
        bounds = Rect.fromCircle(center: center, radius: radius);
      }
      result = result.expandToInclude(bounds);
    }
    validateBounds(result);
    return result;
  }
}

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
