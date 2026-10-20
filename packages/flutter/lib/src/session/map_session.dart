import 'dart:async';

import '../api/result.dart';
import '../api/target.dart';
import '../api/update.dart';
import '../dataset/dataset_reader.dart';
import '../frame/frame_coordinator.dart';
import '../presentation/field_operations.dart';
import '../presentation/presentation_admission.dart';
import '../presentation/presentation_composer.dart';
import '../presentation/presentation_resolver.dart';
import 'request_ledger.dart';
import 'session_backend.dart';

/// One widget attachment's accepted dataset, presentation and request owner.
final class MapSession {
  MapSession({
    required this.backend,
    required this.invalidate,
    required this.onPhase,
    required this.onCallbackError,
  });
  final SessionBackend backend;
  final void Function() invalidate;
  final void Function(PatchMapPhase phase, PatchMapFailure? failure) onPhase;
  final void Function(Object error, StackTrace stack) onCallbackError;
  final _reader = const DatasetReader();
  final _admission = const PresentationAdmission();
  final _resolver = const PresentationResolver();
  final _composer = const PresentationComposer();
  DatasetDocument? _document;
  SessionPublication? _publication;
  final _values = <PatchMapTarget, Map<String, Object?>>{};
  final _failedTargets = <String>{};
  int _generation = 0, _revision = 0, _submittedRevision = -1;
  PatchMapPhase _phase = PatchMapPhase.empty;
  bool _active = true, _closed = false, _replacement = false, _queued = false;
  bool _resumeWithoutAnimation = false, _inFilter = false;
  int _notificationDepth = 0, _suspension = 0;
  Completer<void>? _activityChange;
  Object? _work;
  bool _refresh = false;
  _Pending? _pending, _executing;
  _Submission? _submission;
  Completer<PatchMapResult>? _replacementResult;
  final _replacementFailures = <String, List<PatchMapFailure>>{};

  PatchMapPhase get phase => _phase;
  DatasetDocument? get document => _document;
  bool get active => _active && !_closed;
  int get generation => _generation;
  bool get commandsAllowed => !_closed && !_inFilter;
  Map<String, Object?>? current(PatchMapTarget target) {
    final value = _values[target];
    if (value != null) return value;
    final authored = _document?.targets[target.id];
    if (authored == null) return null;
    final component = target.componentId;
    return component == null ? authored.data : authored.components[component];
  }

  void refreshResources() {
    if (_closed || _document == null || _phase == PatchMapPhase.failed) return;
    _refresh = true;
    _schedule();
  }

  Future<PatchMapResult> replace(Object? input) {
    final denial = _commandDenial();
    if (denial != null) return Future.value(denial);
    final DatasetDocument candidate;
    try {
      candidate = _reader.read(input);
      backend.validateDocument(candidate);
    } catch (error, stack) {
      return _expected(error)
          ? Future.value(_rejected(error))
          : Future.error(error, stack);
    }
    _interrupt(PatchMapInterruption.replaced);
    _generation++;
    _revision = 0;
    _submittedRevision = -1;
    _document = candidate;
    _values.clear();
    _failedTargets.clear();
    _refresh = false;
    _replacement = true;
    _phase = PatchMapPhase.preparing;
    _work = null; // Old uncancellable preparation still owns its temporaries.
    _wakeActivity();
    final result = _replacementResult = Completer<PatchMapResult>();
    _schedule();
    return result.future;
  }

  Future<PatchMapResult> update(Iterable<PatchMapUpdate> updates) {
    final denial = _commandDenial(requireDocument: true);
    if (denial != null) return Future.value(denial);
    final PresentationBatch batch;
    try {
      batch = _admission.admit(_document!, updates, current: _latestRecord);
      backend.validateUpdate(_document!, batch, _latestRecord);
    } catch (error, stack) {
      return _expected(error)
          ? Future.value(_rejected(error))
          : Future.error(error, stack);
    }
    if (active &&
        _phase == PatchMapPhase.ready &&
        _work == null &&
        _pending == null &&
        _executing == null &&
        _submission == null &&
        _submittedRevision == _revision) {
      try {
        // Admission already checked every input. Only prove whether this is a
        // no-op here; a changed batch resolves fully against current at execution.
        if (!batch.patches.any((patch) => _resolveChange(patch) != null)) {
          return Future.value(PatchMapResult(PatchMapOutcome.unchanged));
        }
      } catch (error, stack) {
        return Future.error(error, stack);
      }
    }
    final pending = _pending ??= _Pending();
    final result = pending.ledger.add(batch);
    _composePending(pending, batch);
    _schedule();
    return result;
  }

  /// Caller callback mutations are admitted immediately, processed on exit.
  void notify(void Function() callback) {
    if (_closed) return;
    _notificationDepth++;
    try {
      callback();
    } catch (error, stack) {
      _reportCallback(error, stack);
    } finally {
      _notificationDepth--;
      _schedule();
    }
  }

  bool filter(bool Function() predicate) {
    if (_closed) return false;
    final previous = _inFilter;
    _inFilter = true;
    try {
      return predicate();
    } catch (error, stack) {
      _reportCallback(error, stack);
      return false;
    } finally {
      _inFilter = previous;
    }
  }

  void setActive(bool value) {
    if (_closed || value == _active) return;
    _active = value;
    _wakeActivity();
    backend.setActive(value);
    if (!value) {
      _suspension++;
      _resumeWithoutAnimation = true;
    } else {
      if (_submission != null && _pending != null) {
        // A publication never submitted before suspension has no right to
        // precede newer accepted values on the first resumed frame.
        final old = _executing;
        if (old != null) {
          final newer = _pending!;
          old.ledger.absorb(newer.ledger);
          // Published successful fields already live in _values; failed fields
          // must not be replayed. Carry obligations, not the old value plan.
          old.plan = newer.plan;
          old.index = newer.index;
          _pending = old;
        }
        _executing = null;
        _submission = null;
      }
      _schedule();
      if (_submission != null) invalidate();
    }
  }

  void didSubmit(PaintSubmission stamp) {
    if (!active ||
        stamp.generation != _generation ||
        stamp.revision != _revision) {
      return;
    }
    _submittedRevision = stamp.revision;
    final submission = _submission;
    if (submission == null || submission.revision != stamp.revision) return;
    _submission = null;
    _executing = null;
    submission.pending?.ledger.submit(failures: submission.failures);
    if (submission.replacement != null) {
      final result = PatchMapResult(
        _replacementFailures.isEmpty
            ? PatchMapOutcome.applied
            : PatchMapOutcome.partialFailure,
        failures: _replacementFailures.values.expand((value) => value),
      );
      submission.replacement!.complete(result);
      _replacementResult = null;
      _replacementFailures.clear();
      _phase = PatchMapPhase.ready;
      notify(() => onPhase(PatchMapPhase.ready, null));
    }
    _schedule();
  }

  /// Fatal drawing/preparation failure stops this accepted generation.
  void fail(Object error, [StackTrace? stack]) {
    if (_closed || _phase == PatchMapPhase.failed) return;
    final failure = _failure(error);
    _phase = PatchMapPhase.failed;
    _work = null;
    _wakeActivity();
    _replacement = false;
    if (_expected(error)) {
      _interrupt(PatchMapInterruption.failed, failure: failure);
    } else {
      final trace = stack ?? StackTrace.current;
      _pending?.ledger.failUnexpected(error, trace);
      _executing?.ledger.failUnexpected(error, trace);
      final replacement = _replacementResult;
      if (replacement != null && !replacement.isCompleted) {
        replacement.completeError(error, trace);
      }
      _pending = null;
      _executing = null;
      _submission = null;
      _replacementResult = null;
      _replacementFailures.clear();
      _reportCallback(error, trace);
    }
    backend.hide();
    final previous = _publication;
    _publication = null;
    if (previous != null) backend.retire(previous);
    notify(() => onPhase(PatchMapPhase.failed, failure));
    invalidate();
  }

  Map<String, Object?>? _latestRecord(PatchMapTarget target) {
    var result = current(target);
    if (result == null) return null;
    // A published executing plan is already represented by _values. Replaying
    // it would resurrect fields of an item whose preparation failed.
    final executing = _submission == null ? _executing?.index[target] : null;
    final pending = _pending?.index[target];
    if (executing == null && pending == null) return result;
    final authored = authoredRecord(_document!, target);
    if (executing != null) {
      result = _resolver.resolvePatch(authored, result, executing);
    }
    if (pending != null) {
      result = _resolver.resolvePatch(authored, result, pending);
    }
    return result;
  }

  Map<PatchMapTarget, Map<String, Object?>> _resolve(PresentationPlan plan) {
    final result = <PatchMapTarget, Map<String, Object?>>{};
    for (final patch in plan.patches) {
      final next = _resolveChange(patch);
      if (next != null) result[patch.target] = next;
    }
    return result;
  }

  Map<String, Object?>? _resolveChange(PresentationPatch patch) {
    final before = current(patch.target)!;
    final next = _resolver.resolvePatch(
      authoredRecord(_document!, patch.target),
      before,
      patch,
      // Consume admission's proof when available. One-time execution (notably
      // plain numeric text) does not need to retain another memo per record.
      remember: false,
    );
    return !identical(before, next) ||
            _failedTargets.contains(patch.target.id) ||
            (_publication != null && backend.needsRetry(_publication!, patch))
        ? next
        : null;
  }

  void _schedule() {
    if (!active ||
        _queued ||
        _notificationDepth > 0 ||
        _work != null ||
        _submission != null ||
        _phase == PatchMapPhase.failed ||
        (!_replacement && _pending == null && !_refresh)) {
      return;
    }
    _queued = true;
    scheduleMicrotask(() {
      _queued = false;
      _drain();
    });
  }

  Future<void> _drain() async {
    if (!active ||
        _notificationDepth > 0 ||
        _work != null ||
        _submission != null ||
        _phase == PatchMapPhase.failed ||
        (!_replacement && _pending == null && !_refresh)) {
      return;
    }
    final token = _work = Object(),
        generation = _generation,
        document = _document!;
    final refresh = _refresh;
    _refresh = false;
    final initial = _replacement;
    _replacement = false;
    SessionPublication? baseline, candidate;
    bool valid() =>
        !_closed && generation == _generation && identical(_work, token);
    Future<bool> waitActive() async {
      while (valid() && !_active) {
        await (_activityChange ??= Completer<void>()).future;
      }
      return valid();
    }

    try {
      if (initial) {
        backend.hide();
        final previous = _publication;
        _publication = null;
        if (previous != null) backend.retire(previous);
        notify(() => onPhase(PatchMapPhase.preparing, null));
        if (!await waitActive()) return;
        baseline = await backend.prepareDocument(document, generation);
      } else {
        baseline = _publication!;
        backend.retain(baseline);
      }
      if (!await waitActive()) return;
      if (refresh) {
        final refreshed = await backend.prepareRefresh(baseline);
        backend.retire(baseline);
        baseline = refreshed;
        if (!await waitActive()) return;
      }
      // First-screen input is cut at presentation processing, after document
      // preparation. Later active requests cannot postpone first readiness.
      var pending = _executing = _pending;
      _pending = null;
      while (valid()) {
        final suspension = _suspension;
        final changes = pending == null
            ? <PatchMapTarget, Map<String, Object?>>{}
            : _resolve(pending.plan);
        var failures = const <String, List<PatchMapFailure>>{};
        if (changes.isNotEmpty) {
          final prepared = await backend.prepareUpdate(
            baseline,
            document,
            changes,
            generation: generation,
            animate: !initial && !_resumeWithoutAnimation,
            intent: pending?.plan,
          );
          candidate = prepared.publication;
          failures = prepared.failures;
        } else {
          candidate = baseline;
          backend.retain(candidate);
        }
        if (!await waitActive()) return;
        if (suspension != _suspension) {
          // Resume publishes latest composed values, never an intermediate
          // result prepared before suspension. The old work's reservation is
          // released only now, after its actual completion.
          backend.retire(candidate);
          candidate = null;
          final newer = _pending;
          _pending = null;
          if (newer != null) {
            if (pending == null) {
              pending = newer;
            } else {
              _mergePending(pending, newer);
            }
          }
          _executing = pending;
          continue;
        }
        final nextRevision = _revision + 1;
        backend.publish(candidate, generation, nextRevision);
        final previous = _publication;
        _publication = candidate;
        candidate = null; // Transfer this owned reference to the live session.
        if (previous != null) backend.retire(previous);
        for (final entry in changes.entries) {
          if (failures.containsKey(entry.key.id)) {
            _failedTargets.add(entry.key.id);
          } else {
            _values[entry.key] = entry.value;
            _failedTargets.remove(entry.key.id);
          }
        }
        _revision = nextRevision;
        _resumeWithoutAnimation = false;
        _submission = _Submission(
          nextRevision,
          pending,
          _replacementResult,
          failures,
        );
        pending?.ledger.recordFailures(failures);
        if (_replacementResult != null) _replacementFailures.addAll(failures);
        invalidate();
        break;
      }
    } catch (error, stack) {
      if (valid()) fail(error, stack);
    } finally {
      if (candidate != null) backend.retire(candidate);
      if (baseline != null) backend.retire(baseline);
      if (identical(_work, token)) {
        _work = null;
        _schedule();
      }
    }
  }

  void _mergePending(_Pending older, _Pending newer) {
    older.ledger.absorb(newer.ledger);
    _composePending(older, newer.plan);
  }

  void _composePending(_Pending pending, PresentationPlan later) {
    final composed = _composer.composeIndexed(pending.plan, later);
    pending.plan = composed.plan;
    pending.index = composed.index;
  }

  void _wakeActivity() {
    final waiter = _activityChange;
    _activityChange = null;
    waiter?.complete();
  }

  void _reportCallback(Object error, StackTrace stack) {
    // Even a host-supplied error reporter cannot corrupt session progression.
    try {
      onCallbackError(error, stack);
    } catch (_) {
      // The error reporter is terminal; recursively reporting would loop.
    }
  }

  PatchMapResult? _commandDenial({bool requireDocument = false}) {
    if (_closed) return _rejected(StateError('map is detached'));
    if (_inFilter) {
      return _rejected(StateError('map commands are not allowed in a filter'));
    }
    if (requireDocument &&
        (_document == null || _phase == PatchMapPhase.failed)) {
      return _rejected(StateError('an accepted, usable diagram is required'));
    }
    return null;
  }

  void _interrupt(PatchMapInterruption reason, {PatchMapFailure? failure}) {
    _pending?.ledger.interrupt(reason, failure: failure);
    _executing?.ledger.interrupt(reason, failure: failure);
    final replacement = _replacementResult;
    if (replacement != null && !replacement.isCompleted) {
      replacement.complete(
        PatchMapResult(
          PatchMapOutcome.interrupted,
          interruption: reason,
          failures: [
            ..._replacementFailures.values.expand((errors) => errors),
            ?failure,
          ],
        ),
      );
    }
    _pending = null;
    _executing = null;
    _submission = null;
    _replacementResult = null;
    _replacementFailures.clear();
  }

  void close() {
    if (_closed) return;
    _closed = true;
    _work = null;
    _wakeActivity();
    _interrupt(PatchMapInterruption.detached);
    _document = null;
    _values.clear();
    _failedTargets.clear();
    _refresh = false;
    final previous = _publication;
    _publication = null;
    if (previous != null) backend.retire(previous);
    backend.close();
  }
}

class _Pending {
  PresentationPlan plan = PresentationPlan([]);
  Map<PatchMapTarget, PresentationPatch> index = {};
  final ledger = RequestLedger();
}

class _Submission {
  _Submission(this.revision, this.pending, this.replacement, this.failures);
  final int revision;
  final _Pending? pending;
  final Completer<PatchMapResult>? replacement;
  final Map<String, List<PatchMapFailure>> failures;
}

PatchMapFailure _failure(Object error) => error is DatasetException
    ? PatchMapFailure(error.code, error.message, path: error.path)
    : PatchMapFailure('RUNTIME_FAILURE', error.toString());
PatchMapResult _rejected(Object error) =>
    PatchMapResult(PatchMapOutcome.rejected, failures: [_failure(error)]);

bool _expected(Object error) =>
    error is DatasetException || error is FormatException;
