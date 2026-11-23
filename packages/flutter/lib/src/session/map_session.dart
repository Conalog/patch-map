import 'dart:async';
import 'dart:ui' show Offset;

import '../api/edit_history.dart';
import '../api/events.dart';
import '../api/result.dart';
import '../api/presentation.dart';
import '../api/target.dart';
import '../api/update.dart';
import '../dataset/dataset_reader.dart';
import '../frame/frame_coordinator.dart';
import '../geometry/affine.dart' show localTranslation;
import '../presentation/field_operations.dart';
import '../presentation/presentation_layers.dart';
import '../presentation/presentation_admission.dart';
import '../presentation/presentation_composer.dart';
import '../presentation/presentation_resolver.dart';
import '../presentation/record_delta.dart';
import 'edit_history.dart';
import 'request_ledger.dart';
import 'session_backend.dart';

const _moveConflict = PatchMapFailure(
  'MOVE_CONFLICT',
  'The active move or its position baseline changed',
);
const _structureConflict = PatchMapFailure(
  'EDIT_CONFLICT',
  'The map or structural edit changed before publication',
);

PatchMapResult _editDenied(String code, String message) => PatchMapResult(
  PatchMapOutcome.rejected,
  failures: [PatchMapFailure(code, message)],
);
PatchMapMoveResult _historyDenied(String code, String message) =>
    PatchMapMoveResult(_editDenied(code, message), const {});

/// One widget attachment's accepted dataset, presentation and request owner.
final class MapSession {
  MapSession({
    required this.backend,
    required this.invalidate,
    required this.onPhase,
    required this.onCallbackError,
    this.readEditSelection,
    this.onEditHistoryChanged,
    int editHistoryLimit = 0,
  }) : _editHistory = editHistoryLimit == 0
           ? null
           : EditHistory(editHistoryLimit);
  final SessionBackend backend;
  final void Function() invalidate;
  final void Function(PatchMapPhase phase, PatchMapFailure? failure) onPhase;
  final void Function(Object error, StackTrace stack) onCallbackError;
  final Iterable<String> Function()? readEditSelection;
  final void Function(PatchMapEditHistoryState)? onEditHistoryChanged;
  final EditHistory? _editHistory;
  _RelationEditScope? _relationEdit;
  EditHistory? get _activeEditHistory => _relationEdit?.history ?? _editHistory;
  _Pending? _editInFlight;
  PatchMapEditHistoryState _notifiedHistory = emptyEditHistoryState;
  bool _historyNotificationQueued = false;
  final _reader = const DatasetReader();
  final _admission = const PresentationAdmission();
  final _resolver = const PresentationResolver();
  final _composer = const PresentationComposer();
  DatasetDocument? _document;
  PresentationLayers? _layers;
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
  _Pending? _pendingEdit;
  _Submission? _submission;
  Completer<PatchMapResult>? _replacementResult;
  final _replacementFailures = <String, List<PatchMapFailure>>{};

  PatchMapPhase get phase => _phase;
  DatasetDocument? get document => _document;
  bool get active => _active && !_closed;
  int get generation => _generation;
  bool get commandsAllowed => !_closed && !_inFilter;
  bool get editInFlight => _editInFlight != null;
  bool get hasEditHistory => _editHistory != null;
  bool get isEditingRelation => _relationEdit != null;
  PatchMapEditHistoryState get editHistoryState =>
      _activeEditHistory?.state(
        active: active && _phase == PatchMapPhase.ready,
        busy: editInFlight,
      ) ??
      emptyEditHistoryState;
  Map<String, Object?>? current(PatchMapTarget target) {
    final value = _values[target];
    final authored = _document?.targets[target.id];
    if (value != null) {
      if (target.componentId == null &&
          authored?.type == 'group' &&
          !identical(value['children'], authored!.data['children'])) {
        return Map.unmodifiable({
          ...value,
          'children': authored.data['children'],
        });
      }
      return value;
    }
    if (authored == null) return null;
    final component = target.componentId;
    return component == null ? authored.data : authored.components[component];
  }

  PatchMapPresentationResult setPresentation(
    String key,
    PatchMapPresentationLayer layer,
  ) {
    final denial = _commandDenial(requireDocument: true);
    if (denial != null) {
      return PatchMapPresentationResult(
        denial.outcome,
        failures: denial.failures,
      );
    }
    final layers = _layers ??= PresentationLayers();
    final before = layers.opacity;
    final result = layers.set(key, layer, _document!);
    _publishPresentation(before);
    return result;
  }

  PatchMapPresentationResult clearPresentation(String key) {
    final denial = _commandDenial(requireDocument: true);
    if (denial != null) {
      return PatchMapPresentationResult(
        denial.outcome,
        failures: denial.failures,
      );
    }
    final layers = _layers ??= PresentationLayers();
    final before = layers.opacity;
    final result = layers.clear(key);
    _publishPresentation(before);
    return result;
  }

  void _publishPresentation(PresentationOpacity? before) {
    final after = _layers?.opacity;
    if (_layers?.layerCount == 0) _layers = null;
    if (identical(before, after)) return;
    backend.setPresentation(after);
    invalidate();
  }

  void _resetPresentation() {
    if (_layers == null) return;
    _layers = null;
    backend.setPresentation(null);
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
    _resetEditHistory();
    _revision = 0;
    _submittedRevision = -1;
    _document = candidate;
    _resetPresentation();
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
      final edit = _editInFlight?.edit;
      if (edit is _StructurePublication &&
          batch.patches.any((patch) => edit.blocksWrite(patch.target.id))) {
        return Future.value(
          _editDenied('EDIT_BUSY', 'A target is being structurally edited'),
        );
      }
      final contextReady =
          active &&
          _phase == PatchMapPhase.ready &&
          _work == null &&
          _pending == null &&
          _executing == null &&
          _submission == null &&
          _submittedRevision == _revision &&
          _failedTargets.isEmpty &&
          !_refresh &&
          _publication != null;
      final direct =
          contextReady &&
          backend.validateRetainedUpdate(
            _document!,
            batch,
            _latestRecord,
            _publication!,
            _generation,
          );
      if (!direct) backend.validateUpdate(_document!, batch, _latestRecord);
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
        final validated = _failedTargets.isEmpty && _publication != null
            ? backend.validatedChanges(
                _document!,
                batch,
                _publication!,
                _generation,
              )
            : null;
        if (validated?.isEmpty ??
            !batch.patches.any((patch) => _resolveChange(patch) != null)) {
          backend.releaseValidatedChanges();
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

  /// A move is one atomic position update on the regular publication drain.
  /// Finish already-waiting values first so the move can check its baseline.
  Future<PatchMapResult> move(
    List<PatchMapUpdate> updates,
    bool Function() canPublish,
    void Function() didPublish,
  ) => _queueMove(updates, canPublish, didPublish, record: true);

  Future<PatchMapResult> addObjects(
    List<Map<String, Object?>> objects, {
    required bool selectAdded,
    required void Function(List<String>) restoreSelection,
    required bool gestureInProgress,
    bool editNewRelation = false,
  }) async {
    final denial = _editDenial(gestureInProgress: gestureInProgress);
    if (denial != null) return denial;
    if (editNewRelation) {
      if (_editHistory == null) {
        return _editDenied('HISTORY_DISABLED', 'Edit history is required');
      }
      if (objects.length != 1 || objects.single['type'] != 'relations') {
        return _editDenied('INVALID_TARGET', 'A relation root is required');
      }
      if (objects.single['locked'] == true) {
        return _editDenied('LOCKED_TARGET', 'The relation is locked');
      }
    }
    final DatasetDocument added, candidate;
    try {
      final document = _document!;
      added = _reader.read(objects, rootOffset: document.roots.length);
      if (added.roots.isEmpty) return PatchMapResult(PatchMapOutcome.unchanged);
      candidate = document.append(added);
      for (final target in added.targets.values) {
        if (target.type == 'relations') {
          _validateNewRelationLinks(candidate, target);
        }
      }
      backend.validateDocument(added);
    } catch (error) {
      if (!_expected(error)) rethrow;
      return _rejected(error);
    }
    return _queueStructure(
      candidate,
      removed: null,
      canPublish: () => true,
      didPublish: () {
        if (editNewRelation) {
          final authored = added.targets.values.single;
          _openRelationEdit((
            authored: authored,
            effective: authored.data,
          ), creating: true);
          return;
        }
        final before = readEditSelection?.call().toList() ?? const <String>[];
        if (selectAdded) {
          restoreSelection([
            for (final root in added.roots) root['id']! as String,
          ]);
        }
        _editHistory?.recordAddition(
          added,
          before,
          readEditSelection?.call().toList() ?? const <String>[],
        );
      },
    );
  }

  Future<PatchMapResult> editRelation(
    String id, {
    List<Map<String, Object?>>? links,
    List<List<Map<String, Object?>>>? linkSteps,
    Map<String, Object?>? metadata,
    required bool remove,
    bool mergeEmptyLinkEdit = false,
    required void Function(List<String>) restoreSelection,
    required bool gestureInProgress,
  }) async {
    final scope = _relationEdit;
    final denial = _editDenial(
      gestureInProgress: gestureInProgress,
      withinRelationEdit:
          id == scope?.before.authored.id &&
          !remove &&
          metadata?.isNotEmpty != true,
    );
    if (denial != null) return denial;
    if (linkSteps != null && scope == null) {
      return _editDenied('INVALID_TARGET', 'An open relation edit is required');
    }
    final document = _document!;
    final authored = document.targets[id];
    if (authored?.type != 'relations') {
      return _editDenied('INVALID_TARGET', 'A relation target is required');
    }
    final relation = authored!;
    final target = PatchMapTarget(id);
    final before = _latestRecord(target)!;
    if (before['locked'] == true ||
        !_relationParentUnlocked(relation.parentId)) {
      return _editDenied('LOCKED_TARGET', 'The relation is locked');
    }

    final initial = (authored: relation, effective: before);
    final index = document.indexOf(relation);
    final changesLinks = links != null || linkSteps != null;
    final metadataKeys = metadata?.keys.toSet() ?? const <String>{};
    final steps = <RelationEdit>[];
    RelationVersion? after;
    if (!remove) {
      DatasetTarget edited(
        Map<String, Object?> data,
        List<Map<String, Object?>>? nextLinks,
      ) {
        final attrs = data['attrs'] as Map<String, Object?>?;
        final existingMetadata = attrs?['metadata'];
        if (metadata?.isNotEmpty == true &&
            existingMetadata != null &&
            existingMetadata is! Map<String, Object?>) {
          throw DatasetException(
            'INVALID_DATA',
            id,
            'Relation metadata must be an object',
          );
        }
        return _reader.readRelation({
          ...data,
          'links': ?nextLinks,
          if (metadata?.isNotEmpty == true)
            'attrs': {
              ...?attrs,
              'metadata': {
                if (existingMetadata is Map<String, Object?>)
                  ...existingMetadata,
                ...metadata!,
              },
            },
        }, relation.parentId);
      }

      try {
        var previous = initial;
        for (final nextLinks in linkSteps ?? [links]) {
          final candidate = edited(previous.authored.data, nextLinks);
          if (nextLinks != null) {
            _validateNewRelationLinks(
              document,
              candidate,
              previous: previous.authored,
            );
          }
          final original = scope?.before.authored;
          // Reuse the original target when returning to its links so older
          // global history entries can still match its identity.
          final nextAuthored =
              original != null &&
                  presentationEqual(
                    candidate.data['links'],
                    original.data['links'],
                  )
              ? original
              : candidate;
          final nextValue =
              identical(previous.effective, previous.authored.data)
              ? nextAuthored.data
              : edited(previous.effective, nextLinks).data;
          if (presentationEqual(previous.authored.data, nextAuthored.data) &&
              presentationEqual(previous.effective, nextValue)) {
            continue;
          }
          final next = (authored: nextAuthored, effective: nextValue);
          if (linkSteps != null) {
            steps.add(
              RelationEdit(
                previous,
                next,
                index,
                changesLinks: true,
                metadataKeys: const {},
              ),
            );
          }
          previous = next;
          after = next;
        }
        if (after == null) return PatchMapResult(PatchMapOutcome.unchanged);
      } on DatasetException catch (error) {
        return _rejected(error);
      }
    }

    final change = RelationEdit(
      initial,
      after,
      index,
      changesLinks: changesLinks,
      metadataKeys: metadataKeys,
    );
    return _queueRelation(
      change,
      redo: true,
      isCurrent: () => true,
      didPublish: () {
        final before = readEditSelection?.call().toList() ?? const <String>[];
        final after = remove
            ? before.where((selected) => selected != id).toList()
            : before;
        if (remove && after.length != before.length) restoreSelection(after);
        final history = _activeEditHistory;
        if (steps.isEmpty) {
          history?.recordRelation(
            change,
            before,
            after,
            mergeEmptyLinkEdit: mergeEmptyLinkEdit,
          );
        } else {
          for (final step in steps) {
            history!.recordRelation(step, before, after);
          }
        }
      },
    );
  }

  void _validateNewRelationLinks(
    DatasetDocument document,
    DatasetTarget relation, {
    DatasetTarget? previous,
  }) {
    final links = relation.data['links']! as List<Map<String, Object?>>;
    Set<(String, String)>? previousPairs;
    for (final (index, link) in links.indexed) {
      final source = link['source']! as String;
      final target = link['target']! as String;
      final missing = !document.targets.containsKey(source)
          ? 'source'
          : !document.targets.containsKey(target)
          ? 'target'
          : null;
      if (missing == null) continue;
      // Only consult the previous list when a legacy link may be carried forward.
      if (previous != null) {
        previousPairs ??= {
          for (final link
              in previous.data['links']! as List<Map<String, Object?>>)
            (link['source']! as String, link['target']! as String),
        };
        if (previousPairs.contains((source, target))) continue;
      }
      throw DatasetException(
        'MISSING_TARGET',
        '${relation.id}.links[$index].$missing',
        'Relation endpoint "${link[missing]}" does not exist',
      );
    }
  }

  PatchMapResult beginRelationEdit(
    String id, {
    required bool gestureInProgress,
  }) {
    final denial = _editDenial(gestureInProgress: gestureInProgress);
    if (denial != null) return denial;
    if (_editHistory == null) {
      return _editDenied('HISTORY_DISABLED', 'Edit history is required');
    }
    final authored = _document!.targets[id];
    if (authored == null || authored.type != 'relations') {
      return _editDenied('INVALID_TARGET', 'A relation target is required');
    }
    final effective = _latestRecord(PatchMapTarget(id))!;
    if (effective['locked'] == true ||
        !_relationParentUnlocked(authored.parentId)) {
      return _editDenied('LOCKED_TARGET', 'The relation is locked');
    }
    _openRelationEdit((authored: authored, effective: effective));
    return PatchMapResult(PatchMapOutcome.applied);
  }

  void _openRelationEdit(RelationVersion before, {bool creating = false}) {
    _relationEdit = _RelationEditScope(
      before,
      readEditSelection?.call().toList() ?? const [],
      EditHistory(_editHistory!.limit),
      creating: creating,
    );
    _notifyEditHistory();
  }

  Future<PatchMapResult> finishRelationEdit(
    String id, {
    required bool removeIfEmpty,
    bool cancelCreation = false,
    required bool gestureInProgress,
    required void Function(List<String>) restoreSelection,
  }) async {
    final denial = _editDenial(
      gestureInProgress: gestureInProgress,
      withinRelationEdit: true,
    );
    if (denial != null) return denial;
    final scope = _relationEdit;
    if (scope == null ||
        scope.before.authored.id != id ||
        (cancelCreation && !scope.creating)) {
      return _editDenied('INVALID_TARGET', 'No matching relation edit is open');
    }
    final document = _document!;
    final authored = document.targets[id]!;
    final effective = _latestRecord(PatchMapTarget(id))!;
    final current = (authored: authored, effective: effective);
    final index = document.indexOf(authored);
    final remove =
        cancelCreation ||
        ((scope.creating || removeIfEmpty) &&
            (effective['links'] as List).isEmpty);
    final changed =
        scope.creating || !identical(authored, scope.before.authored);
    final selection = remove
        ? scope.selection.where((selected) => selected != id).toList()
        : scope.creating
        ? [id]
        : scope.selection;

    void finish() {
      if (scope.creating) {
        if (!remove) {
          _editHistory!.recordAddition(
            DatasetDocument.relationRoot(authored),
            scope.selection,
            selection,
          );
        }
      } else if (remove || changed) {
        _editHistory!.recordRelation(
          RelationEdit(
            remove
                ? (
                    authored: scope.before.authored,
                    effective: Map.unmodifiable({
                      ...effective,
                      'links': scope.before.effective['links'],
                    }),
                  )
                : scope.before,
            remove ? null : current,
            index,
            changesLinks: true,
            metadataKeys: const {},
          ),
          scope.selection,
          selection,
        );
      }
      _relationEdit = null;
      restoreSelection(selection);
      _notifyEditHistory();
    }

    if (!remove) {
      finish();
      return PatchMapResult(
        changed ? PatchMapOutcome.applied : PatchMapOutcome.unchanged,
      );
    }
    if (!scope.creating &&
        (effective['locked'] == true ||
            !_relationParentUnlocked(authored.parentId))) {
      return _editDenied('LOCKED_TARGET', 'The relation is locked');
    }
    return _queueRelation(
      RelationEdit(
        current,
        null,
        index,
        changesLinks: false,
        metadataKeys: const {},
      ),
      redo: true,
      isCurrent: () => identical(_relationEdit, scope),
      didPublish: finish,
      allowLockedRemoval: scope.creating,
    );
  }

  bool _relationParentUnlocked(String? id) {
    while (id != null) {
      final group = _document!.targets[id];
      if (group == null || current(PatchMapTarget(id))?['locked'] == true) {
        return false;
      }
      id = group.parentId;
    }
    return true;
  }

  Future<PatchMapResult> _queueRelation(
    RelationEdit relation, {
    required bool redo,
    required bool Function() isCurrent,
    required void Function() didPublish,
    bool allowLockedRemoval = false,
  }) {
    final id = relation.id;
    final target = PatchMapTarget(id);
    final previous = relation.version(redo: !redo);
    final next = relation.version(redo: redo);
    final baseline = _latestRecord(target);
    if (!identical(_document!.targets[id], previous?.authored) ||
        (previous == null) != (baseline == null) ||
        (baseline != null &&
            !relation.matches(baseline, previous!.effective))) {
      return Future.value(
        _editDenied(_structureConflict.code, _structureConflict.message),
      );
    }
    final effective = next == null
        ? null
        : baseline == null
        ? next.effective
        : relation.apply(baseline, next.effective);
    final nextValue =
        next != null && presentationEqual(effective, next.authored.data)
        ? next.authored.data
        : effective;
    bool canPublish() =>
        isCurrent() &&
        identical(_document!.targets[id], previous?.authored) &&
        (allowLockedRemoval || current(target)?['locked'] != true) &&
        presentationEqual(current(target), baseline) &&
        _relationParentUnlocked(relation.parentId);

    return _queueStructure(
      _document!.changeRelation(
        id,
        parentId: relation.parentId,
        index: relation.index,
        replacement: next?.authored,
      ),
      removed: next == null ? {id} : null,
      relationValue: nextValue,
      canPublish: canPublish,
      didPublish: () {
        if (next == null) {
          relation.before = (
            authored: relation.before.authored,
            effective: baseline!,
          );
        }
        if (nextValue != null && !identical(nextValue, next!.authored.data)) {
          _values[target] = nextValue;
        } else {
          _values.remove(target);
        }
        didPublish();
      },
    );
  }

  bool recordSelection(Iterable<String> before, Iterable<String> after) {
    final history = _editHistory;
    if (history == null ||
        !commandsAllowed ||
        !active ||
        _phase != PatchMapPhase.ready ||
        editInFlight ||
        isEditingRelation ||
        !history.recordSelection(before, after)) {
      return false;
    }
    _notifyEditHistory();
    return true;
  }

  Future<PatchMapMoveResult> replayEdit({
    required bool redo,
    required bool Function(String id) canMove,
    required void Function(List<String> ids) restoreSelection,
    bool gestureInProgress = false,
  }) async {
    if (!commandsAllowed || !active || _phase != PatchMapPhase.ready) {
      return _historyDenied('NOT_READY', 'An active, ready map is required');
    }
    if (editInFlight) {
      return _historyDenied('EDIT_BUSY', 'An edit is already in progress');
    }
    final history = _activeEditHistory;
    final entry = history?.at(redo: redo);
    if (history == null || entry == null) {
      return PatchMapMoveResult(
        PatchMapResult(PatchMapOutcome.unchanged),
        const {},
      );
    }
    if (gestureInProgress) {
      return _historyDenied('EDIT_BUSY', 'An edit is already in progress');
    }

    final generation = _generation, suspension = _suspension;
    bool canPublish() =>
        _generation == generation &&
        _suspension == suspension &&
        identical(history.at(redo: redo), entry) &&
        entry.matches(redo, current, canMove);
    if (!canPublish()) {
      return _historyDenied(_moveConflict.code, _moveConflict.message);
    }

    final selection = entry.selection(redo: redo);
    final relation = entry.relation;
    if (relation != null) {
      final result = await _queueRelation(
        relation,
        redo: redo,
        isCurrent: canPublish,
        didPublish: () {
          history.advance(redo: redo);
          restoreSelection(selection);
        },
      );
      return PatchMapMoveResult(result, const {});
    }
    final added = entry.added;
    if (added != null) {
      final DatasetDocument document;
      try {
        document = redo
            ? _document!.append(added)
            : _document!.removeAppended(added);
      } on DatasetException catch (error) {
        return PatchMapMoveResult(_rejected(error), const {});
      }
      final result = await _queueStructure(
        document,
        removed: redo ? null : added.targets.keys.toSet(),
        canPublish: canPublish,
        didPublish: () {
          history.advance(redo: redo);
          restoreSelection(selection);
        },
      );
      return PatchMapMoveResult(result, const {});
    }
    if (!entry.hasPositions) {
      history.advance(redo: redo);
      restoreSelection(selection);
      _notifyEditHistory();
      return PatchMapMoveResult(
        PatchMapResult(PatchMapOutcome.applied),
        const {},
      );
    }

    Map<String, Offset> positions = const {};
    final result = await _queueMove(entry.updates(redo: redo), canPublish, () {
      history.advance(redo: redo);
      positions = {
        for (final id in entry.ids)
          id: localTranslation(current(PatchMapTarget(id))!),
      };
      restoreSelection(selection);
    }, record: false);
    return PatchMapMoveResult(
      result,
      result.outcome == PatchMapOutcome.applied && !result.superseded
          ? positions
          : const {},
    );
  }

  Future<PatchMapResult> _queueMove(
    List<PatchMapUpdate> updates,
    bool Function() canPublish,
    void Function() didPublish, {
    required bool record,
  }) {
    final denial = _editDenial();
    if (denial != null) return Future.value(denial);
    final PresentationBatch batch;
    try {
      batch = _admission.admit(_document!, updates, current: current);
    } on DatasetException catch (error) {
      return Future.value(_rejected(error));
    }
    return _enqueueEdit(
      _MovePublication(_pending, canPublish, didPublish, record),
      batch,
    );
  }

  Future<PatchMapResult> _queueStructure(
    DatasetDocument document, {
    required Set<String>? removed,
    Map<String, Object?>? relationValue,
    required bool Function() canPublish,
    required void Function() didPublish,
  }) => _enqueueEdit(
    _StructurePublication(
      _pending,
      canPublish,
      didPublish,
      document,
      removed,
      relationValue,
    ),
    PresentationBatch(const [], const []),
  );

  Future<PatchMapResult> _enqueueEdit(
    _EditPublication edit,
    PresentationBatch batch,
  ) {
    final pending = _pendingEdit = _Pending()..edit = edit;
    final result = pending.ledger.add(batch);
    if (batch.patches.isNotEmpty) _composePending(pending, batch);
    _schedule();
    _editInFlight = pending;
    _notifyEditHistory();
    return result.whenComplete(() {
      if (!identical(_editInFlight, pending)) return;
      _editInFlight = null;
      _notifyEditHistory();
    });
  }

  PatchMapResult? _editDenial({
    bool gestureInProgress = false,
    bool withinRelationEdit = false,
  }) {
    if (!commandsAllowed || !active || _phase != PatchMapPhase.ready) {
      return _editDenied('NOT_READY', 'An active, ready map is required');
    }
    if (gestureInProgress ||
        editInFlight ||
        (!withinRelationEdit && isEditingRelation)) {
      return _editDenied('EDIT_BUSY', 'An edit is already in progress');
    }
    return null;
  }

  void _resetEditHistory() {
    _relationEdit = null;
    _editHistory?.clear();
    _editInFlight = null;
    _notifyEditHistory();
  }

  void _notifyEditHistory() {
    final callback = onEditHistoryChanged;
    if (callback == null ||
        _editHistory == null ||
        _closed ||
        _historyNotificationQueued ||
        editHistoryState == _notifiedHistory) {
      return;
    }
    _historyNotificationQueued = true;
    scheduleMicrotask(() {
      _historyNotificationQueued = false;
      if (_closed) return;
      final state = editHistoryState;
      if (state == _notifiedHistory) return;
      _notifiedHistory = state;
      notify(() => callback(state));
    });
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
          old.rolledBack = newer.rolledBack;
          _pending = old;
        }
        _executing = null;
        _submission = null;
      }
      _schedule();
      if (_submission != null) invalidate();
    }
    _notifyEditHistory();
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
    _notifyEditHistory();
    _schedule();
  }

  /// Fatal drawing/preparation failure stops this accepted generation.
  void fail(Object error, [StackTrace? stack]) {
    if (_closed || _phase == PatchMapPhase.failed) return;
    final failure = _failure(error);
    _phase = PatchMapPhase.failed;
    _resetEditHistory();
    _work = null;
    _wakeActivity();
    _replacement = false;
    if (_expected(error)) {
      _interrupt(PatchMapInterruption.failed, failure: failure);
    } else {
      final trace = stack ?? StackTrace.current;
      _pending?.ledger.failUnexpected(error, trace);
      _pendingEdit?.ledger.failUnexpected(error, trace);
      _executing?.ledger.failUnexpected(error, trace);
      final replacement = _replacementResult;
      if (replacement != null && !replacement.isCompleted) {
        replacement.completeError(error, trace);
      }
      _pending = null;
      _pendingEdit = null;
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
    final executing = _submission == null && _executing?.edit == null
        ? _executing?.index[target]
        : null;
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

  Map<PatchMapTarget, RecordDelta> _resolve(PresentationPlan plan) {
    if (_failedTargets.isEmpty && _publication != null && active) {
      final validated = backend.validatedChanges(
        _document!,
        plan,
        _publication!,
        _generation,
      );
      if (validated != null) return validated;
    }
    final result = <PatchMapTarget, RecordDelta>{};
    for (final patch in plan.patches) {
      final next = _resolveChange(patch);
      if (next != null) result[patch.target] = next;
    }
    return result;
  }

  RecordDelta? _resolveChange(PresentationPatch patch) {
    final before = current(patch.target)!;
    final next = _resolver.resolveDelta(
      authoredRecord(_document!, patch.target),
      before,
      patch,
      // Consume admission's proof when available. One-time execution (notably
      // plain numeric text) does not need to retain another memo per record.
      remember: false,
    );
    return !identical(before, next.after) ||
            _failedTargets.contains(patch.target.id) ||
            (_publication != null && backend.needsRetry(_publication!, patch))
        ? next
        : null;
  }

  /// Admission may have used an executing item's values which later rolled
  /// back. Recheck only that failure lineage, against the resolved final fields
  /// and published owner geometry. Ordinary successful updates keep their proof.
  Map<String, List<PatchMapFailure>> _revalidateAfterFailure(
    _Pending pending,
    Map<PatchMapTarget, RecordDelta> changes,
  ) {
    final rolledBack = pending.rolledBack;
    if (rolledBack == null) return const {};
    Map<String, List<PresentationPatch>>? affected;
    for (final patch in pending.plan.patches) {
      if (!changes.containsKey(patch.target)) continue;
      String? id = patch.target.id;
      while (id != null && !rolledBack.contains(id)) {
        id = _document!.targets[id]?.parentId;
      }
      if (id != null) {
        (affected ??= {}).putIfAbsent(patch.target.id, () => []).add(patch);
      }
    }
    if (affected == null) return const {};
    final failures = <String, List<PatchMapFailure>>{};
    for (final entry in affected.entries) {
      try {
        // Reuse admission's compound schema rules on whole touched fields.
        // Replay neither caller input nor claims: their reset/supersession
        // meaning remains with the original composed plan and request ledger.
        _admission.admit(_document!, [
          for (final patch in entry.value)
            PatchMapUpdate(patch.target, {
              for (final operation in patch.operations)
                if (changes[patch.target]!.after.containsKey(
                  operation.path.first,
                ))
                  operation.path.first:
                      changes[patch.target]!.after[operation.path.first],
            }),
        ], current: (target) => changes[target]?.after ?? current(target));
        backend.validateUpdate(
          _document!,
          PresentationBatch(entry.value, const []),
          current,
        );
      } catch (error) {
        if (!_expected(error)) rethrow;
        final failure = _failure(error);
        failures[entry.key] = [
          PatchMapFailure(
            failure.code,
            failure.message,
            path: failure.path,
            target: PatchMapTarget(entry.key),
          ),
        ];
      }
    }
    if (failures.isNotEmpty) {
      changes.removeWhere((target, _) => failures.containsKey(target.id));
    }
    return failures;
  }

  bool get _canDrain =>
      active &&
      _notificationDepth == 0 &&
      _work == null &&
      _submission == null &&
      _phase != PatchMapPhase.failed &&
      (_replacement || _pending != null || _pendingEdit != null || _refresh);

  void _schedule() {
    if (_queued || !_canDrain) return;
    _queued = true;
    scheduleMicrotask(() {
      _queued = false;
      _drain();
    });
  }

  Future<void> _drain() async {
    if (!_canDrain) return;
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
      final queuedEdit = _pendingEdit;
      final takeEdit =
          !initial &&
          !refresh &&
          queuedEdit != null &&
          (_pending == null || !identical(queuedEdit.edit!.after, _pending));
      var pending = _executing = takeEdit ? queuedEdit : _pending;
      if (takeEdit) {
        _pendingEdit = null;
      } else {
        _pending = null;
      }
      final edit = pending?.edit;
      final structure = edit is _StructurePublication ? edit : null;
      final conflict = structure == null ? _moveConflict : _structureConflict;
      while (valid()) {
        if (edit != null && !edit.canPublish()) {
          pending!.ledger.reject([conflict]);
          _executing = null;
          return;
        }
        final suspension = _suspension;
        final changes = pending == null
            ? <PatchMapTarget, RecordDelta>{}
            : _resolve(pending.plan);
        var failures = pending == null
            ? const <String, List<PatchMapFailure>>{}
            : _revalidateAfterFailure(pending, changes);
        if (structure != null || changes.isNotEmpty) {
          try {
            if (structure != null) {
              candidate = await backend.prepareStructure(
                baseline,
                structure.document,
                relationValue: structure.relationValue,
              );
            } else {
              final prepared = await backend.prepareUpdate(
                baseline,
                document,
                changes,
                generation: generation,
                animate: !initial && !_resumeWithoutAnimation,
                intent: pending?.plan,
                atomic: edit != null,
              );
              candidate = prepared.publication;
              failures = failures.isEmpty
                  ? prepared.failures
                  : {...failures, ...prepared.failures};
            }
          } catch (error) {
            if (edit == null || !_expected(error)) rethrow;
            if (valid()) {
              pending!.ledger.reject([_failure(error)]);
              _executing = null;
            }
            return;
          }
        } else {
          candidate = baseline;
          backend.retain(candidate);
        }
        if (edit != null) {
          if (!valid()) return;
          if (!active ||
              suspension != _suspension ||
              !edit.canPublish() ||
              failures.isNotEmpty) {
            pending!.ledger.reject(
              failures.isEmpty
                  ? [conflict]
                  : failures.values.expand((value) => value),
            );
            _executing = null;
            return;
          }
        } else if (!await waitActive()) {
          return;
        }
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
        final history = _editHistory;
        for (final entry in changes.entries) {
          if (failures.containsKey(entry.key.id)) {
            _failedTargets.add(entry.key.id);
          } else {
            _values[entry.key] = entry.value.after;
            _failedTargets.remove(entry.key.id);
          }
        }
        if (failures.isNotEmpty) {
          _failedTargets.addAll(failures.keys);
          final waiting = _pending;
          if (waiting != null) {
            (waiting.rolledBack ??= {}).addAll(failures.keys);
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
        if (edit != null) {
          pending!.edit = null;
          if (structure != null) {
            _document = structure.document;
            final removed = structure.removed;
            if (removed != null) {
              _values.removeWhere((target, _) => removed.contains(target.id));
              _failedTargets.removeAll(removed);
            }
            final before = _layers?.opacity;
            _layers?.rootsChanged(removed);
            _publishPresentation(before);
          } else if ((edit as _MovePublication).record && history != null) {
            history.recordPositions(changes, readEditSelection);
          }
          edit.didPublish();
        } else if (history != null &&
            !history.isEmpty &&
            changes.entries.any(
              (entry) =>
                  !failures.containsKey(entry.key.id) &&
                  history.conflicts(entry.key, entry.value),
            )) {
          history.clear();
        }
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
    if (newer.rolledBack != null) {
      (older.rolledBack ??= {}).addAll(newer.rolledBack!);
    }
    _composePending(older, newer.plan);
  }

  void _composePending(_Pending pending, PresentationPlan later) {
    if (pending.plan.patches.isEmpty &&
        _publication != null &&
        active &&
        _failedTargets.isEmpty) {
      final validated = backend.validatedPatchIndex(
        _document!,
        later,
        _publication!,
        _generation,
      );
      if (validated != null) {
        pending.plan = later;
        pending.index = validated;
        return;
      }
    }
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
    _pendingEdit?.ledger.interrupt(reason, failure: failure);
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
    _pendingEdit = null;
    _executing = null;
    _submission = null;
    _replacementResult = null;
    _replacementFailures.clear();
  }

  void close() {
    if (_closed) return;
    _closed = true;
    _resetEditHistory();
    _work = null;
    _wakeActivity();
    _interrupt(PatchMapInterruption.detached);
    _document = null;
    _resetPresentation();
    _values.clear();
    _failedTargets.clear();
    _refresh = false;
    final previous = _publication;
    _publication = null;
    if (previous != null) backend.retire(previous);
    backend.close();
  }
}

final class _RelationEditScope {
  _RelationEditScope(
    this.before,
    this.selection,
    this.history, {
    required this.creating,
  });

  final bool creating;
  final RelationVersion before;
  final List<String> selection;
  final EditHistory history;
}

class _Pending {
  PresentationPlan plan = PresentationPlan([]);
  Map<PatchMapTarget, PresentationPatch> index = {};
  final ledger = RequestLedger();
  Set<String>? rolledBack;
  _EditPublication? edit;
}

sealed class _EditPublication {
  const _EditPublication(this.after, this.canPublish, this.didPublish);
  final _Pending? after;
  final bool Function() canPublish;
  final void Function() didPublish;
}

final class _MovePublication extends _EditPublication {
  const _MovePublication(
    super.after,
    super.canPublish,
    super.didPublish,
    this.record,
  );
  final bool record;
}

final class _StructurePublication extends _EditPublication {
  const _StructurePublication(
    super.after,
    super.canPublish,
    super.didPublish,
    this.document,
    this.removed,
    this.relationValue,
  );
  final DatasetDocument document;
  final Set<String>? removed;
  final Map<String, Object?>? relationValue;

  bool blocksWrite(String id) =>
      removed?.contains(id) == true || relationValue?['id'] == id;
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
