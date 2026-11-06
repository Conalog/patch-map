import 'dart:async';

import 'package:flutter/gestures.dart';

/// Holds the first tap's arena like Flutter's double-tap recognizer, and
/// exposes the actual pair so a drag can claim the second contact before up.
final class MapDoubleTapRecognizer extends GestureRecognizer {
  MapDoubleTapRecognizer({super.debugOwner})
    : super(allowedButtonsFilter: _primaryOnly);

  static bool _primaryOnly(int buttons) => buttons == kPrimaryButton;

  late bool Function() canStart;
  late void Function(int pointer) onDoubleTap;

  final _contacts = <int, _TapContact>{};
  _TapContact? _first;
  Timer? _expiry;

  GestureBinding get _binding => GestureBinding.instance;

  int? firstTapFor(int pointer) =>
      _contacts.containsKey(pointer) ? _first?.pointer : null;

  @override
  bool isPointerAllowed(PointerDownEvent event) {
    final allowed = canStart() && super.isPointerAllowed(event);
    if (!allowed) reset();
    return allowed;
  }

  @override
  void addAllowedPointer(PointerDownEvent event) {
    final first = _first;
    if (first != null) {
      // A distant press is free to be a single tap without replacing the
      // pending first tap. A too-early press starts a new pair instead.
      if ((event.position - first.position).distance > kDoubleTapSlop) {
        return;
      }
      if (first.minimum.isActive) reset();
    }
    _expiry?.cancel();
    _expiry = null;
    _contacts[event.pointer] = _TapContact(
      event,
      _binding.gestureArena.add(event.pointer, this),
    );
    _binding.pointerRouter.addRoute(event.pointer, _handle, event.transform);
  }

  void _handle(PointerEvent event) {
    final contact = _contacts[event.pointer];
    if (contact == null) return;
    if (event is PointerUpEvent) {
      _untrack(contact);
      final first = _first;
      if (first == null) {
        _first = contact;
        _binding.gestureArena.hold(event.pointer);
        _rejectContacts();
        _expiry = Timer(kDoubleTapTimeout, reset);
      } else {
        // Clear the pair before resolving arenas, which can call other
        // recognizers synchronously.
        _first = null;
        first.minimum.cancel();
        contact.minimum.cancel();
        first.entry.resolve(GestureDisposition.accepted);
        contact.entry.resolve(GestureDisposition.accepted);
        _binding.gestureArena.release(first.pointer);
        _rejectContacts();
        onDoubleTap(event.pointer);
      }
    } else if (event is PointerCancelEvent ||
        (event is PointerMoveEvent &&
            (event.position - contact.position).distance >
                kDoubleTapTouchSlop)) {
      rejectGesture(event.pointer);
    }
  }

  void _untrack(_TapContact contact) {
    final pointer = contact.pointer;
    _contacts.remove(pointer);
    _binding.pointerRouter.removeRoute(pointer, _handle);
  }

  void _reject(_TapContact contact) {
    _untrack(contact);
    contact.minimum.cancel();
    contact.entry.resolve(GestureDisposition.rejected);
  }

  void _rejectContacts() {
    while (_contacts.isNotEmpty) {
      _reject(_contacts.values.first);
    }
  }

  @override
  void acceptGesture(int pointer) {}

  @override
  void rejectGesture(int pointer) {
    if (_first?.pointer == pointer) {
      reset();
      return;
    }
    final contact = _contacts[pointer];
    if (contact == null) return;
    _reject(contact);
    if (_first != null && _contacts.isEmpty) reset();
  }

  void reset() {
    _expiry?.cancel();
    _expiry = null;
    final first = _first;
    _first = null;
    _rejectContacts();
    if (first == null) return;
    first.minimum.cancel();
    first.entry.resolve(GestureDisposition.rejected);
    _binding.gestureArena.release(first.pointer);
  }

  @override
  void dispose() {
    reset();
    super.dispose();
  }

  @override
  String get debugDescription => 'map double tap';
}

final class _TapContact {
  _TapContact(PointerDownEvent down, this.entry)
    : pointer = down.pointer,
      position = down.position;

  final int pointer;
  final Offset position;
  final GestureArenaEntry entry;
  final Timer minimum = Timer(kDoubleTapMinTime, _elapsed);

  static void _elapsed() {}
}
