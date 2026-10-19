import 'dart:async';

import '../api/result.dart';
import '../api/target.dart';
import '../presentation/field_operations.dart';

/// Request completion metadata, separate from the single composed value plan.
/// Overwritten claims are dropped immediately; identical claims share their
/// expected value. This does not retain a complete value snapshot per request.
final class RequestLedger {
  final _requests = <_Request>[];
  final _claims = <PatchMapTarget, List<_ClaimOwners>>{};
  bool _settled = false;
  int get requestCount => _requests.length;
  int get retainedClaimCount =>
      _claims.values.fold(0, (n, claims) => n + claims.length);

  Future<PatchMapResult> add(PresentationBatch batch) {
    if (_settled) throw StateError('request ledger is settled');
    final request = _Request();
    _requests.add(request);
    for (final claim in batch.claims) {
      _append(claim, [request]);
    }
    return request.completer.future;
  }

  /// Move newer pending obligations into an interrupted-by-inactivity batch.
  /// Their completers stay live; only field provenance is composed.
  void absorb(RequestLedger newer) {
    if (_settled || newer._settled || identical(this, newer)) {
      throw StateError('cannot combine settled or identical ledgers');
    }
    _requests.addAll(newer._requests);
    for (final entries in newer._claims.values) {
      for (final entry in entries) {
        _append(entry.claim, entry.owners);
      }
    }
    newer._settled = true;
    newer._clear();
  }

  void _append(PresentationClaim claim, List<_Request> owners) {
    final entries = _claims.putIfAbsent(claim.target, () => []);
    _ClaimOwners? identicalClaim;
    for (var i = entries.length - 1; i >= 0; i--) {
      final previous = entries[i];
      final overlap = _overlap(previous.claim, claim);
      if (overlap == null) continue;
      if (!overlap) {
        for (final owner in previous.owners) {
          owner.superseded = true;
        }
        entries.removeAt(i);
        if (previous.claim.path.length < claim.path.length) {
          for (final survivor in _survivors(previous.claim, claim.path)) {
            entries.add(_ClaimOwners.shared(survivor, previous.owners));
          }
        }
      } else if (_samePath(previous.claim.path, claim.path)) {
        identicalClaim = previous;
      }
    }
    if (identicalClaim == null) {
      entries.add(_ClaimOwners.shared(claim, owners));
    } else {
      identicalClaim.owners.addAll(owners);
    }
  }

  /// Called after the matching publication was submitted. Failures are keyed
  /// by item/element id because related components publish as one unit.
  void submit({
    Map<String, List<PatchMapFailure>> failures = const {},
    bool unchanged = false,
  }) {
    if (_settled) return;
    recordFailures(failures);
    _settled = true;
    for (final request in _requests) {
      final failures = request.failures.values.expand((value) => value);
      request.completer.complete(
        PatchMapResult(
          request.failures.isNotEmpty
              ? PatchMapOutcome.partialFailure
              : unchanged
              ? PatchMapOutcome.unchanged
              : PatchMapOutcome.applied,
          superseded: request.superseded,
          failures: failures,
        ),
      );
    }
    _clear();
  }

  /// Preserve failures already published even if submission is interrupted.
  void recordFailures(Map<String, List<PatchMapFailure>> failures) {
    if (_settled) return;
    for (final entry in _claims.entries) {
      final errors = failures[entry.key.id];
      if (errors == null || errors.isEmpty) continue;
      for (final claim in entry.value) {
        for (final owner in claim.owners) {
          owner.failures.putIfAbsent(entry.key.id, () => errors);
        }
      }
    }
  }

  void interrupt(PatchMapInterruption reason, {PatchMapFailure? failure}) {
    if (_settled) return;
    _settled = true;
    for (final request in _requests) {
      request.completer.complete(
        PatchMapResult(
          PatchMapOutcome.interrupted,
          superseded: request.superseded,
          interruption: reason,
          failures: [
            ...request.failures.values.expand((errors) => errors),
            ?failure,
          ],
        ),
      );
    }
    _clear();
  }

  void failUnexpected(Object error, StackTrace stack) {
    if (_settled) return;
    _settled = true;
    for (final request in _requests) {
      request.completer.completeError(error, stack);
    }
    _clear();
  }

  void _clear() {
    _claims.clear();
    _requests.clear();
  }
}

class _Request {
  final completer = Completer<PatchMapResult>();
  bool superseded = false;
  final failures = <String, List<PatchMapFailure>>{};
}

class _ClaimOwners {
  _ClaimOwners.shared(this.claim, List<_Request> previous)
    : owners = List.of(previous);
  final PresentationClaim claim;
  final List<_Request> owners;
}

/// null = independent paths, true = same overlapping value, false = replaced.
bool? _overlap(PresentationClaim previous, PresentationClaim next) {
  final a = previous.path, b = next.path;
  final length = a.length < b.length ? a.length : b.length;
  for (var i = 0; i < length; i++) {
    if (a[i] != b[i]) return null;
  }
  var old = (exists: previous.exists, value: previous.expectedValue);
  var value = (exists: next.exists, value: next.expectedValue);
  if (a.length < b.length && old.exists) {
    old = _at(previous, b);
  } else if (b.length < a.length && value.exists) {
    value = _at(next, a);
  }
  return old.exists == value.exists &&
      (!old.exists || presentationEqual(old.value, value.value));
}

({bool exists, Object? value}) _at(PresentationClaim claim, List<String> path) {
  Object? nested = claim.expectedValue;
  for (final key in claim.path.reversed) {
    nested = <String, Object?>{key: nested};
  }
  return readField(nested, path);
}

/// A reset of a compound field can be only partly superseded. Retain claims
/// for its untouched children so an item's failure still reaches their owner.
Iterable<PresentationClaim> _survivors(
  PresentationClaim old,
  List<String> overwritten,
) sync* {
  if (!old.exists) return;
  Object? value = old.expectedValue;
  if (old.path.length == 1 &&
      old.path.first == 'size' &&
      (value is! Map || value.containsKey('value'))) {
    value = <String, Object?>{'width': value, 'height': value};
  }
  if (value is! Map<String, Object?>) return;
  final replacedKey = overwritten[old.path.length];
  for (final entry in value.entries) {
    final child = PresentationClaim(
      old.target,
      [...old.path, entry.key],
      entry.value,
      exists: true,
    );
    if (entry.key != replacedKey) {
      yield child;
    } else if (child.path.length < overwritten.length) {
      yield* _survivors(child, overwritten);
    }
  }
}

bool _samePath(List<String> a, List<String> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}
