import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import '../engine/controller.dart';
import '../api/values.dart';
import '../model/json.dart';

/// One surface's native gesture state; logical selection stays in the engine.
class NativePointerBinding {
  NativePointerBinding(this.controller, this.hitTest, this.invalidate);
  final PatchMapController controller;
  final PatchMapTarget? Function(Offset world) hitTest;
  final void Function() invalidate;
  void Function()? claimGesture;
  final _presses = <int, _Press>{};
  PatchMapTarget? _hover, _tooltip, _lastClickTarget;
  bool _pinned = false, _closed = false;
  Duration? _lastClickTime;
  Offset? _lastClickPosition;
  String? _armedTarget;
  PointerDeviceKind? _lastClickKind;
  int _clickCount = 0;
  Rect? marquee;
  PointerEvent? _lastEvent;
  JsonMap get _policy => controller.selectionPolicy;
  JsonMap get _modifiers => {
    'shift': HardwareKeyboard.instance.isShiftPressed,
    'ctrl': HardwareKeyboard.instance.isControlPressed,
    'alt': HardwareKeyboard.instance.isAltPressed,
    'meta': HardwareKeyboard.instance.isMetaPressed,
  };
  bool get _live => !_closed && !controller.destroyed;
  Offset _world(Offset screen) {
    final p = controller.viewport.screenToWorld(screen.dx, screen.dy);
    return Offset(p[0], p[1]);
  }

  PatchMapTarget? _hit(Offset screen) => hitTest(_world(screen));
  JsonMap _event(
    PointerEvent event,
    String type,
    PatchMapTarget? target,
    PatchMapTarget? previous,
  ) => {
    'type': type,
    'target': target?.toJson(),
    'previousTarget': previous?.toJson(),
    'anchor': [event.localPosition.dx, event.localPosition.dy],
    'world': [_world(event.localPosition).dx, _world(event.localPosition).dy],
    'pointerId': event.pointer,
    'pointerType': event.kind == PointerDeviceKind.touch
        ? 'touch'
        : event.kind == PointerDeviceKind.stylus ||
              event.kind == PointerDeviceKind.invertedStylus
        ? 'pen'
        : 'mouse',
    'modifiers': _modifiers,
  };
  void _showTooltip(
    PointerEvent event,
    PatchMapTarget? target, {
    bool pin = false,
  }) {
    if (_pinned && !pin) return;
    final previous = _tooltip;
    if (target == null && previous == null) return;
    _tooltip = target;
    _pinned = pin;
    controller.pointer.publishTooltip({
      ..._event(
        event,
        pin
            ? 'pin'
            : target == null
            ? 'hide'
            : _sameTarget(target, previous)
            ? 'move'
            : 'show',
        target,
        previous,
      ),
      'pinned': _pinned,
    });
  }

  void hover(PointerEvent event) {
    _lastEvent = event;
    if (!_live ||
        _presses.isNotEmpty &&
            controller.pointerPolicy['hoverDuringPress'] != true)
      return;
    final next = _hit(event.localPosition), previous = _hover;
    if (next == null && previous == null) return;
    _hover = next;
    controller.pointer.publishHover(
      _event(
        event,
        next == null
            ? 'leave'
            : _sameTarget(next, previous)
            ? 'move'
            : 'hover',
        next,
        previous,
      ),
    );
    _showTooltip(event, next);
  }

  void leave(PointerEvent event) {
    _lastEvent = event;
    if (!_live) return;
    final previous = _hover;
    _hover = null;
    if (previous != null)
      controller.pointer.publishHover(_event(event, 'leave', null, previous));
    _showTooltip(event, null);
  }

  void down(PointerDownEvent event) {
    _lastEvent = event;
    if (!_live) return;
    final modifiers = _modifiers;
    final box = _policy['box'];
    final boxEnabled = box == true || box is Map;
    final wantsBox =
        event.buttons == kPrimaryButton &&
        boxEnabled &&
        (box is! Map ||
            box['activationModifier'] != 'shift' ||
            modifiers['shift'] == true);
    _presses[event.pointer] = _Press(
      event.localPosition,
      _hit(event.localPosition),
      controller.revisions.view,
      event.buttons,
      wantsBox,
      modifiers['shift'] == true,
    );
    if (_presses.length > 1) {
      for (final press in _presses.values) {
        press.dragged = true;
        press.longPress?.cancel();
      }
      marquee = null;
    }
    if (controller.pointerPolicy['hoverDuringPress'] != true) leave(event);
    final press = _presses[event.pointer]!;
    if (_presses.length == 1 &&
        event.kind == PointerDeviceKind.touch &&
        (controller.pointerPolicy['tooltip'] as Map?)?['pinOnContextMenu'] ==
            true &&
        press.target != null) {
      press.longPress = Timer(const Duration(milliseconds: 500), () {
        if (!_live ||
            !identical(_presses[event.pointer], press) ||
            press.dragged)
          return;
        claimGesture?.call();
        if (!_presses.containsKey(event.pointer)) return;
        press.contextPinned = true;
        _showTooltip(event, press.target, pin: true);
      });
    }
  }

  void move(PointerMoveEvent event) {
    _lastEvent = event;
    if (!_live) return;
    final press = _presses[event.pointer];
    if (press == null) return hover(event);
    if (_presses.length == 2) {
      final other = _presses.entries
          .firstWhere((e) => e.key != event.pointer)
          .value;
      final oldCenter = (press.current + other.current) / 2;
      final newCenter = (event.localPosition + other.current) / 2;
      final oldDistance = (press.current - other.current).distance;
      final newDistance = (event.localPosition - other.current).distance;
      controller.viewport.panBy([
        newCenter.dx - oldCenter.dx,
        newCenter.dy - oldCenter.dy,
      ], source: 'pointer');
      if (oldDistance > 0 && newDistance > 0)
        controller.viewport.zoomBy(newDistance / oldDistance, [
          newCenter.dx,
          newCenter.dy,
        ]);
      press.current = event.localPosition;
      return;
    }
    final delta = event.localPosition - press.start;
    final started =
        !press.dragged && math.max(delta.dx.abs(), delta.dy.abs()) > 4;
    press.dragged = press.dragged || started;
    if (press.dragged) {
      press.longPress?.cancel();
      _armedTarget = null;
      _pinned = false;
      _showTooltip(event, null);
      if (press.box) {
        marquee = Rect.fromPoints(press.start, event.localPosition);
        invalidate();
      } else if (press.buttons == kPrimaryButton ||
          press.buttons == kMiddleMouseButton) {
        final previous = started ? press.start : press.current;
        controller.viewport.panBy([
          event.localPosition.dx - previous.dx,
          event.localPosition.dy - previous.dy,
        ], source: 'pointer');
      }
    }
    press.current = event.localPosition;
  }

  bool _selectable(String id, {PatchMapTarget? identity}) {
    final node = controller.dataset.nodes[id];
    if (node == null ||
        node.value['locked'] == true ||
        (node.value['attrs'] as Map?)?['locked'] == true)
      return false;
    final callback = _policy['isSelectable'];
    return callback == null ||
        (callback as bool Function(JsonMap))(identity?.toJson() ?? {'id': id});
  }

  void up(PointerUpEvent event) {
    _lastEvent = event;
    if (!_live) return;
    final press = _presses.remove(event.pointer);
    if (press == null) return;
    press.longPress?.cancel();
    if (press.contextPinned) return;
    final d = event.localPosition - press.start;
    if (press.dragged || math.max(d.dx.abs(), d.dy.abs()) > 4) {
      if (press.box && marquee != null) _box(press);
      marquee = null;
      invalidate();
      return;
    }
    if (controller.revisions.view != press.viewRevision ||
        !_sameTarget(_hit(event.localPosition), press.target))
      return;
    if (press.buttons == kSecondaryMouseButton) {
      _lastClickTime = null;
      _armedTarget = null;
      if ((controller.pointerPolicy['tooltip'] as Map?)?['pinOnContextMenu'] ==
              true &&
          press.target != null)
        _showTooltip(event, press.target, pin: true);
      return;
    }
    if (press.buttons != kPrimaryButton) return;
    final repeated =
        _lastClickTime != null &&
        event.timeStamp - _lastClickTime! <=
            const Duration(milliseconds: 500) &&
        _sameTarget(_lastClickTarget, press.target) &&
        _lastClickKind == event.kind &&
        math.max(
              (event.localPosition - _lastClickPosition!).dx.abs(),
              (event.localPosition - _lastClickPosition!).dy.abs(),
            ) <=
            4;
    _clickCount = repeated ? _clickCount + 1 : 1;
    _lastClickTime = event.timeStamp;
    _lastClickTarget = press.target;
    _lastClickPosition = event.localPosition;
    _lastClickKind = event.kind;
    if (!repeated) _armedTarget = null;
    _pinned = false;
    _showTooltip(event, press.target);
    final target =
        press.target != null &&
            _selectable(press.target!.id, identity: press.target)
        ? press.target!.id
        : null;
    final modifiers = _modifiers;
    if (target == null) {
      _armedTarget = null;
      final clear = _policy['clearOnBlankClick'] ?? 'single';
      if (clear == 'single' || clear == 'double' && _clickCount == 2)
        controller.selection.fromPointer(<String>[]);
      return;
    }
    final resolver = _policy['resolveModifierSelection'];
    if (resolver != null &&
        (modifiers['ctrl'] == true || modifiers['meta'] == true)) {
      final next = (resolver as List<String> Function(JsonMap))({
        'target': press.target!.toJson(),
        'currentIds': controller.selection.ids,
        'modifiers': modifiers,
        'clickCount': _clickCount,
      });
      if (next.any((id) => !controller.dataset.nodes.containsKey(id)))
        throw ArgumentError('Modifier selection contains an unknown target');
      if (next.any((id) => !_selectable(id))) return;
      _armedTarget = null;
      controller.selection.fromPointer(next);
    } else if (modifiers['shift'] == true &&
        _policy['allowMultiple'] != false) {
      _armedTarget = null;
      controller.selection.fromPointer([target], toggle: true);
    } else if (_policy['deselectOnTargetDoubleClick'] == true &&
        !modifiers.values.any((value) => value == true)) {
      if (_clickCount % 2 == 0 && _armedTarget == target) {
        _armedTarget = null;
        controller.selection.fromPointer(
          controller.selection.ids.where((id) => id != target).toList(),
        );
      } else if (controller.selection.ids.contains(target)) {
        _armedTarget = target;
      } else {
        _armedTarget = null;
        controller.selection.fromPointer([target]);
      }
    } else {
      _armedTarget = null;
      controller.selection.fromPointer([target]);
    }
  }

  void _box(_Press press) {
    final box = marquee!, selected = <String>[];
    final partial =
        (_policy['box'] is Map
            ? (_policy['box'] as Map)['partialIntersection']
            : true) !=
        false;
    for (final entry in controller.renderSnapshot.geometry.targets.entries) {
      final target = entry.value;
      if (entry.key.contains('\u0000') ||
          !target.visible ||
          target.locked ||
          !_selectable(target.id))
        continue;
      final corners = target.quad
          .map((p) => controller.viewport.worldToScreen(p.x, p.y))
          .toList();
      final bounds = Rect.fromLTRB(
        corners.map((p) => p[0]).reduce(math.min),
        corners.map((p) => p[1]).reduce(math.min),
        corners.map((p) => p[0]).reduce(math.max),
        corners.map((p) => p[1]).reduce(math.max),
      );
      // v1 region hit includes touching edges for both partial and contained hits.
      if (partial
          ? box.left <= bounds.right &&
                box.right >= bounds.left &&
                box.top <= bounds.bottom &&
                box.bottom >= bounds.top
          : bounds.left >= box.left &&
                bounds.top >= box.top &&
                bounds.right <= box.right &&
                bounds.bottom <= box.bottom)
        selected.add(target.id);
    }
    controller.selection.fromPointer(
      press.additive && _policy['allowMultiple'] != false
          ? {...controller.selection.ids, ...selected}.toList()
          : selected,
    );
  }

  void blur() {
    _pinned = false;
    final event = _lastEvent;
    if (event != null) leave(event);
    _lastClickTime = null;
    _lastClickTarget = null;
    _lastClickKind = null;
    _clickCount = 0;
    cancel();
  }

  void cancel([PointerEvent? event]) {
    for (final press in _presses.values) {
      press.longPress?.cancel();
    }
    _presses.clear();
    _armedTarget = null;
    marquee = null;
    if (event != null) leave(event);
    if (_live) invalidate();
  }

  void dispose() {
    _closed = true;
    for (final press in _presses.values) {
      press.longPress?.cancel();
    }
    _presses.clear();
    marquee = null;
  }
}

class _Press {
  _Press(
    this.start,
    this.target,
    this.viewRevision,
    this.buttons,
    this.box,
    this.additive,
  ) : current = start;
  final Offset start;
  Offset current;
  final PatchMapTarget? target;
  final int viewRevision, buttons;
  final bool box, additive;
  bool dragged = false, contextPinned = false;
  Timer? longPress;
}

bool _sameTarget(PatchMapTarget? a, PatchMapTarget? b) =>
    a?.id == b?.id && a?.componentId == b?.componentId;
