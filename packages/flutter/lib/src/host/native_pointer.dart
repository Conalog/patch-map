import 'dart:async';
import 'brush_hit_index.dart';
import 'dart:math' as math;
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import '../engine/controller.dart';
import '../api/values.dart';
import '../model/json.dart';

/// One surface's native gesture state; logical selection stays in the engine.
class NativePointerBinding {
  NativePointerBinding(
    this.controller,
    this.hitTest,
    this.invalidate, {
    this.onError,
  }) : _datasetGeneration = controller.datasetGeneration {
    controller.selection.brush.cancelGesture = _cancelBrushFromApi;
  }
  final void Function(Object)? onError;
  _BrushGesture? _brush;
  int _brushGeneration = 0;
  void _cancelBrushFromApi(bool restore) =>
      _clearBrush('cancel', restore: restore, consume: true);
  int _datasetGeneration;
  void syncDataset() {
    if (_datasetGeneration != controller.datasetGeneration) {
      _datasetGeneration = controller.datasetGeneration;
      blur();
      return;
    }
    final g = _brush;
    if (g != null && !_brushLive(g)) _clearBrush('cancel', consume: g.consumed);
  }

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

  double _panZoomScale = 1;
  Offset _panZoomPan = Offset.zero;
  void panZoomStart(PointerPanZoomStartEvent event) {
    if (!_live) return;
    blur();
    _panZoomScale = 1;
    _panZoomPan = Offset.zero;
  }

  void panZoomUpdate(PointerPanZoomUpdateEvent event) {
    if (!_live) return;
    final delta = event.localPan - _panZoomPan;
    controller.viewport.panBy([delta.dx, delta.dy], source: 'pointer');
    final anchor = event.localPosition + event.localPan;
    controller.viewport.zoomBy(event.scale / _panZoomScale, [
      anchor.dx,
      anchor.dy,
    ]);
    _panZoomScale = event.scale;
    _panZoomPan = event.localPan;
  }

  void hover(PointerEvent event) {
    syncDataset();
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
    syncDataset();
    _lastEvent = event;
    if (!_live) return;
    final modifiers = _modifiers;
    final box = _policy['box'];
    final boxEnabled = box == true || box is Map;
    final wantsBox =
        event.buttons == kPrimaryButton &&
        controller.editor.state['mode'] == 'select' &&
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
    if (_presses.length > 1) _clearBrush('cancel', consume: true);
    final b = (_policy['brush'] as Map?) ?? const {};
    final hold = b['longPress'];
    final generation = _brushGeneration;
    final scene = controller.revisions.scene;
    final view = controller.revisions.view;
    if (_presses.length == 1 &&
        event.buttons == kPrimaryButton &&
        controller.editor.state['mode'] == 'select' &&
        _policy['allowMultiple'] != false &&
        (controller.selection.brush.state.enabled || hold is Map) &&
        (press.target == null
            ? controller.selection.brush.state.enabled
            : _selectable(press.target!.id))) {
      if (!_live ||
          generation != _brushGeneration ||
          scene != controller.revisions.scene ||
          view != controller.revisions.view ||
          !identical(_presses[event.pointer], press))
        return;
      final g = _BrushGesture(
        event.pointer,
        press,
        controller.revisions.scene,
        controller.revisions.view,
      );
      _brush = g;
      if (hold is Map && press.target != null) {
        g.timer = Timer(
          Duration(
            microseconds: (((hold['delayMs'] as num?) ?? 500) * 1000).round(),
          ),
          () {
            g.timer = null;
            if (!_brushLive(g)) {
              if (identical(_brush, g)) _clearBrush('cancel');
              return;
            }
            try {
              claimGesture?.call();
              if (!_brushLive(g)) return;
              g.consumed = true;
              press.dragged = true;
              press.longPress?.cancel();
              marquee = null;
              final prior = controller.selection.brush.state.enabled;
              if (hold['behavior'] == 'hold') g.restore = prior;
              if (hold['behavior'] == 'toggle' && prior) {
                controller.selection.brush.publishGestureState(
                  false,
                  false,
                  'long-press',
                );
              } else {
                controller.selection.brush.publishGestureState(
                  true,
                  false,
                  'long-press',
                );
                if (_brushLive(g)) _startBrush(g, 'long-press');
              }
            } catch (error) {
              _clearBrush('cancel', consume: true);
              onError?.call(error);
            }
          },
        );
      }
    }
    if (!_live) return;
    if (_brush == null &&
        _presses.length == 1 &&
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
    syncDataset();
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
    if (press.consumed) {
      press.current = event.localPosition;
      return;
    }
    final g = _brush;
    if (g != null && g.pointer == event.pointer) {
      if (!_brushLive(g)) {
        final consumed = g.consumed;
        _clearBrush('cancel', consume: consumed);
        if (consumed) {
          press.current = event.localPosition;
          return;
        }
      } else {
        final d = event.localPosition - press.start;
        if (!g.consumed && math.max(d.dx.abs(), d.dy.abs()) > 4) {
          g.timer?.cancel();
          g.timer = null;
          if (!controller.selection.brush.state.enabled) {
            _clearBrush('cancel');
          } else {
            claimGesture?.call();
            if (!_brushLive(g)) return;
            g.consumed = true;
            press.dragged = true;
            press.longPress?.cancel();
            marquee = null;
            _startBrush(g, 'api');
          }
        }
        if (_brushLive(g) && g.active) _paintBrush(g, event.localPosition);
        if (g.consumed) {
          press.current = event.localPosition;
          return;
        }
      }
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
    var ancestor = controller.dataset.nodes[node.parentId];
    while (ancestor != null) {
      if (ancestor.value['locked'] == true) return false;
      ancestor = controller.dataset.nodes[ancestor.parentId];
    }
    final callback = _policy['isSelectable'];
    return callback == null ||
        (callback as bool Function(JsonMap))(identity?.toJson() ?? {'id': id});
  }

  void up(PointerUpEvent event) {
    syncDataset();
    _lastEvent = event;
    if (!_live) return;
    final g = _brush;
    if (g != null && g.pointer == event.pointer) {
      if (g.consumed) {
        try {
          if (_brushLive(g) && g.active) _paintBrush(g, event.localPosition);
        } finally {
          _presses.remove(event.pointer)?.longPress?.cancel();
          if (identical(_brush, g)) _clearBrush('release');
        }
        return;
      }
      _clearBrush('release');
    }
    final press = _presses.remove(event.pointer);
    if (press == null) return;
    press.longPress?.cancel();
    if (press.contextPinned || press.consumed) return;
    final d = event.localPosition - press.start;
    if (press.dragged || math.max(d.dx.abs(), d.dy.abs()) > 4) {
      try {
        if (press.box && marquee != null) _box(press);
      } finally {
        marquee = null;
        invalidate();
      }
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
    if (controller.editor.state['mode'] != 'select') return;
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
    if (controller.editor.state['mode'] != 'select') return;
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
          // Group/grid scopes aggregate children but have no selectable quad.
          // Their rendered leaves participate in region selection instead.
          target.quad.isEmpty ||
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
      if (selected.isNotEmpty && _policy['allowMultiple'] == false) break;
    }
    controller.selection.fromPointer(
      press.additive && _policy['allowMultiple'] != false
          ? {...controller.selection.ids, ...selected}.toList()
          : selected,
    );
  }

  bool _brushLive(_BrushGesture g) =>
      identical(_brush, g) &&
      _live &&
      controller.attached &&
      identical(_presses[g.pointer], g.press) &&
      controller.revisions.scene == g.scene &&
      controller.revisions.view == g.view &&
      controller.editor.state['mode'] == 'select';

  void _clearBrush(String source, {bool restore = true, bool consume = false}) {
    _brushGeneration++;
    final g = _brush;
    _brush = null;
    g?.timer?.cancel();
    if (consume && g != null) {
      g.press.dragged = true;
      g.press.consumed = true;
    }
    final api = controller.selection.brush;
    api.publishGestureState(
      restore ? (g?.restore ?? api.state.enabled) : api.state.enabled,
      false,
      source,
    );
  }

  void _startBrush(_BrushGesture g, String source) {
    final op = (_policy['brush'] as Map?)?['operation'] ?? 'auto';
    g.removing =
        op == 'remove' ||
        op == 'auto' && controller.selection.ids.contains(g.press.target?.id);
    g.active = true;
    g.index = BrushHitIndex(
      controller.renderSnapshot.geometry,
      controller.viewport.worldToScreen,
    );
    controller.selection.brush.publishGestureState(true, true, source);
    if (_brushLive(g)) _paintBrush(g, g.previous, seed: g.press.target?.id);
  }

  void _paintBrush(_BrushGesture g, Offset end, {String? seed}) {
    if (!_brushLive(g)) return;
    final ids = <String>[];
    for (final id in [
      if (seed != null) seed,
      ...g.index!.query(g.previous, end).map((t) => t.id),
    ]) {
      if (g.seen.contains(id)) continue;
      final eligible = _selectable(id);
      if (!_brushLive(g)) return;
      if (!eligible) continue;
      g.seen.add(id);
      ids.add(id);
    }
    g.previous = end;
    if (ids.isEmpty) return;
    final next = controller.selection.ids.toSet();
    if (g.removing) {
      next.removeAll(ids);
    } else {
      next.addAll(ids);
    }
    controller.selection.fromPointer(next.toList());
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
    _clearBrush('cancel', consume: true);
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
    _clearBrush('cancel', consume: true);
    controller.selection.brush.cancelGesture = null;
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
  bool dragged = false, contextPinned = false, consumed = false;
  Timer? longPress;
}

bool _sameTarget(PatchMapTarget? a, PatchMapTarget? b) =>
    a?.id == b?.id && a?.componentId == b?.componentId;

class _BrushGesture {
  _BrushGesture(this.pointer, this.press, this.scene, this.view)
    : previous = press.start;
  final int pointer, scene, view;
  final _Press press;
  Offset previous;
  Timer? timer;
  bool active = false, consumed = false, removing = false;
  bool? restore;
  final seen = <String>{};
  BrushHitIndex? index;
}
