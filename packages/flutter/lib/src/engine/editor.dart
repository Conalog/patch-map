part of 'controller.dart';

class PatchMapEditorApi {
  PatchMapEditorApi._(this._c);
  final PatchMapController _c;
  String _mode = 'select';
  String? _target, _sessionKind;
  bool _inactive = false, _awaitingResolve = false, _confirmed = false;
  Set<String> _linked = {};
  List<String> _pending = [], _cascade = [], _requested = [];
  String? _originalText;
  String? _lastActionId;
  bool _deleteActive = false, _committing = false;
  JsonMap get state => {
    'mode': _mode,
    'activeTargetId': _target,
    'inactiveCellsVisible': _inactive,
    'pendingDeleteCount': _pending.length,
  };
  void _sceneReplaced() {
    if (_sessionKind == 'text-edit') {
      _awaitingResolve = true;
    } else {
      _mode = 'select';
      _target = null;
      _sessionKind = null;
      _inactive = false;
    }
    _pending = [];
    _cascade = [];
    _requested = [];
    _deleteActive = false;
    _confirmed = false;
  }

  PatchMapResult execute(JsonMap input) {
    var facts = <String, dynamic>{};
    PatchMapResult result(String status, {String? code, bool? changed}) =>
        PatchMapResult({
          'status': status,
          'changed': changed ?? status == 'committed',
          'code': code,
          'facts': facts,
          'selectionIds': _c.selection.ids,
          'state': state,
        });
    if (!_c._canCommit)
      return result('refused', code: _c.destroyed ? 'DESTROYED' : 'NOT_READY');
    _c._notificationDepth++;
    try {
      final action = _cloneMap(input), type = action['type'];
      var nextMode = _mode,
          nextTarget = _target,
          nextInactive = _inactive,
          nextAwaiting = _awaitingResolve;
      var nextLinked = _linked,
          nextPending = _pending,
          nextCascade = _cascade,
          nextConfirmed = _confirmed;
      var nextActionId = _lastActionId;
      var nextRequested = _requested;
      var nextOriginalText = _originalText;
      var nextDeleteActive = _deleteActive;
      var nextSessionKind = _sessionKind;
      var outcomeStatus = 'committed';
      List<String>? select;
      final operations = <JsonMap>[];
      JsonMap node(String id, String kind) {
        final n = _c.dataset.nodes[id];
        if (n == null || n.type != kind || n.instance) throw _MissingTarget(id);
        return _cloneMap(n.value);
      }

      String target() {
        if (action['target'] is! String || (action['target'] as String).isEmpty)
          throw const PatchMapException(
            'INVALID_INPUT',
            'Action target required',
          );
        return action['target'] as String;
      }

      List<String> ids(Object? value) {
        if (value is! List || value.any((v) => v is! String || v.isEmpty))
          throw const PatchMapException(
            'INVALID_INPUT',
            'Expected target identities',
          );
        final result = value.cast<String>();
        return result;
      }

      void requireSession(String mode, String id) {
        if (_sessionKind != mode || _target != id) throw _MissingTarget(id);
      }

      void replace(String id, JsonMap value) {
        operations.add({'type': 'replace', 'id': id, 'value': value});
      }

      void clearEditing() {
        nextMode = 'select';
        nextTarget = null;
        nextSessionKind = null;
        nextInactive = false;
        nextAwaiting = false;
        nextLinked = {};
        nextOriginalText = null;
        nextActionId = null;
      }

      void clearDeletion() {
        nextDeleteActive = false;
        nextPending = [];
        nextRequested = [];
        nextCascade = [];
        nextConfirmed = false;
      }

      bool authored(Object? id) => _c.dataset.nodes[id]?.instance == false;
      const groupedActions = {
        'resize-grid',
        'set-grid-cell-active',
        'add-relation-link',
        'remove-relation-link',
        'commit-text-edit',
        'delete-transaction',
      };
      if (groupedActions.contains(type) &&
          (action['actionId'] is! String ||
              (action['actionId'] as String).isEmpty)) {
        throw const PatchMapException(
          'INVALID_INPUT',
          'Action identity required',
        );
      }
      switch (type) {
        case 'select-targets':
          if (action['mode'] != 'replace')
            throw const PatchMapException(
              'INVALID_INPUT',
              'Invalid selection mode',
            );
          select = ids(action['targets']);
          clearEditing();
          if (select.any((id) => !authored(id)))
            throw const PatchMapException(
              'MISSING_TARGET',
              'Missing selection target',
            );
          facts = {'selectedIds': select};
        case 'enter-grid-edit':
          final id = target();
          node(id, 'grid');
          clearEditing();
          clearDeletion();
          nextMode = 'grid-edit';
          nextSessionKind = 'grid-edit';
          nextTarget = id;
          nextInactive = false;
          nextLinked = action['linkedCellIds'] == null
              ? {}
              : ids(action['linkedCellIds']).toSet();
          select = [id];
          facts = {'mode': nextMode, 'targetId': id};
        case 'reveal-inactive-cells':
          final id = target();
          requireSession('grid-edit', id);
          if (_inactive) {
            facts = {'inactiveCellsVisible': true};
            return result('unchanged');
          }
          nextInactive = true;
          facts = {'inactiveCellsVisible': true};
        case 'resize-grid':
          final id = target();
          requireSession('grid-edit', id);
          final value = node(id, 'grid');
          final rows = action['rows'], columns = action['columns'];
          if (rows is! int || columns is! int || rows < 1 || columns < 1)
            throw const PatchMapException(
              'INVALID_INPUT',
              'Invalid grid dimensions',
            );
          for (final key in ['gapX', 'gapY']) {
            final gap = action[key];
            if (gap is! num || !gap.isFinite || gap < 0)
              throw const PatchMapException(
                'INVALID_INPUT',
                'Invalid grid gap',
              );
          }
          final cells = value['cells'] as List;
          value['cells'] = List.generate(
            rows,
            (r) => List.generate(
              columns,
              (c) => r < cells.length && c < (cells[r] as List).length
                  ? cells[r][c]
                  : 0,
            ),
          );
          value['gap'] = {
            'x': _number(action['gapX']),
            'y': _number(action['gapY']),
          };
          replace(id, value);
          select = [id];
          nextActionId = action['actionId'] as String?;
          facts = {
            'rows': rows,
            'columns': columns,
            'gapX': action['gapX'],
            'gapY': action['gapY'],
          };
        case 'set-grid-cell-active':
          if (_sessionKind != 'grid-edit' || _target == null)
            throw const PatchMapException(
              'MISSING_TARGET',
              'Grid edit not active',
            );
          final id = target(), value = node(_target!, 'grid');
          if (action['active'] is! bool || !id.startsWith('$_target.'))
            throw const PatchMapException(
              'INVALID_INPUT',
              'Invalid grid cell action',
            );
          final coordinate = id
              .substring(_target!.length + 1)
              .split('.')
              .map(int.parse)
              .toList();
          if (coordinate.length != 2) throw _MissingTarget(id);
          final cells = value['cells'] as List,
              row = coordinate[0],
              column = coordinate[1];
          if (row < 0 ||
              column < 0 ||
              row >= cells.length ||
              column >= (cells[row] as List).length)
            throw _MissingTarget(id);
          if (action['active'] == false && _linked.contains(id))
            throw const PatchMapException(
              'CONFLICT',
              'Linked grid cell cannot be disabled',
            );
          final current = cells[row][column];
          final next = action['active'] == true
              ? (current == 0 ? 1 : current)
              : 0;
          if (next == current) {
            facts = {'appliedCells': [], 'rejectedCells': []};
            return result('unchanged');
          }
          cells[row][column] = next;
          replace(_target!, value);
          select = [_target!];
          nextActionId = action['actionId'] as String?;
          facts = {
            'appliedCells': [id],
            'rejectedCells': [],
          };
        case 'exit-grid-edit':
          final id = target();
          requireSession('grid-edit', id);
          node(id, 'grid');
          nextMode = 'select';
          nextTarget = null;
          nextSessionKind = null;
          nextInactive = false;
          select = [id];
          facts = {'mode': 'select', 'selectedIds': select};
        case 'enter-relation-edit':
          final id = target();
          node(id, 'relations');
          clearEditing();
          clearDeletion();
          nextMode = 'relation-edit';
          nextSessionKind = 'relation-edit';
          nextTarget = id;
          select = [id];
          facts = {'mode': nextMode, 'targetId': id};
        case 'add-relation-link':
        case 'remove-relation-link':
          final id = action['relationId'] as String;
          requireSession('relation-edit', id);
          final value = node(id, 'relations'),
              source = action['source'],
              destination = action['target'];
          if (!authored(source) || !authored(destination))
            throw const PatchMapException(
              'MISSING_TARGET',
              'Relation endpoint missing',
            );
          final links = value['links'] as List;
          final at = links.indexWhere(
            (v) => v['source'] == source && v['target'] == destination,
          );
          if (type == 'add-relation-link') {
            if (at >= 0)
              throw const PatchMapException(
                'CONFLICT',
                'Directed relation link already exists',
              );
            links.add({'source': source, 'target': destination});
          } else {
            if (at < 0) {
              facts = {'changedLinkCount': 0};
              return result('unchanged');
            }
            links.removeAt(at);
          }
          replace(id, value);
          select = [id];
          nextActionId = action['actionId'] as String?;
          facts = {'changedLinkCount': 1, 'links': links};
        case 'exit-relation-edit':
          final id = action['relationId'] as String;
          requireSession('relation-edit', id);
          final value = node(id, 'relations'),
              empty = (value['links'] as List).isEmpty;
          if (empty) operations.add({'type': 'remove', 'id': id});
          nextMode = 'select';
          nextTarget = null;
          nextSessionKind = null;
          select = empty ? [] : [id];
          facts = {'mode': 'select', 'emptyRelationRemoved': empty};
        case 'open-text-editor':
          final id = target(), value = node(id, 'text');
          if (action['hostOverlay'] != true)
            throw const PatchMapException(
              'INVALID_INPUT',
              'Text editing requires a host overlay',
            );
          clearEditing();
          clearDeletion();
          nextMode = 'text-edit';
          nextSessionKind = 'text-edit';
          nextTarget = id;
          nextAwaiting = false;
          nextOriginalText = value['text'] as String;
          select = [id];
          facts = {
            'mode': nextMode,
            'targetId': id,
            'sourceText': value['text'],
          };
        case 'resolve-editor-target-by-id':
          final id = target();
          requireSession('text-edit', id);
          node(id, 'text');
          nextAwaiting = false;
          select = [id];
          facts = {'resolvedTargetId': id};
        case 'commit-text-edit':
          final id = target(), value = node(id, 'text');
          if (action['text'] is! String ||
              (action.containsKey('preserveStyle') &&
                  action['preserveStyle'] is! bool))
            throw const PatchMapException('INVALID_INPUT', 'Invalid text edit');
          if (_sessionKind == 'text-edit' && _awaitingResolve)
            throw const PatchMapException(
              'MISSING_TARGET',
              'Text target requires resolution',
            );
          nextMode = 'select';
          if (_sessionKind == 'text-edit') {
            nextTarget = null;
            nextSessionKind = null;
          }
          select = [id];
          final changed = value['text'] != action['text'];
          final removing = (action['text'] as String).isEmpty;
          if (changed) {
            if (removing) {
              operations.add({'type': 'remove', 'id': id});
              select = [];
            } else {
              value['text'] = action['text'];
              replace(id, value);
            }
          } else {
            outcomeStatus = 'unchanged';
          }
          facts = {
            'appliedCount': changed ? 1 : 0,
            'unchangedCount': changed ? 0 : 1,
            if (changed) 'emptyDeleted': removing,
            'selectedIds': select,
          };
        case 'cancel-text-edit':
          final id = target();
          requireSession('text-edit', id);
          nextMode = 'select';
          if (_sessionKind == 'text-edit') {
            nextTarget = null;
            nextSessionKind = null;
          }
          select = [id];
          facts = {'cancelled': true, 'restoredText': _originalText};
        case 'request-delete-plan':
          final requested = ids(action['targets']).toSet().toList();
          if (requested.any((id) => !authored(id)))
            throw const PatchMapException(
              'MISSING_TARGET',
              'Delete target missing',
            );
          final relations = <String>[];
          for (final n in _c.dataset.nodes.values.where(
            (n) => n.type == 'relations',
          )) {
            if ((n.value['links'] as List).any(
              (link) =>
                  requested.contains(link['source']) ||
                  requested.contains(link['target']),
            ))
              relations.add(n.id);
          }
          nextDeleteActive = true;
          nextPending = [
            ...requested,
            ...relations.where((id) => !requested.contains(id)),
          ];
          nextConfirmed = false;
          nextRequested = requested;
          nextCascade = [];
          facts = {'deletePlan': nextPending};
        case 'apply-host-cascade-confirmation':
          if (!_deleteActive)
            throw const PatchMapException(
              'INVALID_MUTATION',
              'Delete plan is not active',
            );
          if (action['confirmed'] is! bool ||
              (action.containsKey('registryLoading') &&
                  action['registryLoading'] is! bool))
            throw const PatchMapException(
              'INVALID_INPUT',
              'Invalid confirmation',
            );
          if (action['registryLoading'] == true)
            throw const PatchMapException(
              'CONFLICT',
              'Delete confirmation unavailable',
            );
          nextCascade = ids(action['cascadeTargets']);
          nextConfirmed = action['confirmed'] == true;
          facts = {'confirmed': nextConfirmed, 'cascadeTargets': nextCascade};
        case 'delete-transaction':
          final requested = ids(action['targets']);
          if (!_deleteActive ||
              !_confirmed ||
              !_equal(requested, {..._requested, ..._cascade}.toList()))
            throw const PatchMapException(
              'CONFLICT',
              'Delete plan requires matching confirmation',
            );
          if (requested.any((id) => !authored(id)))
            throw const PatchMapException(
              'MISSING_TARGET',
              'Delete target missing',
            );
          final removal = requested;
          final ordered = [
            ...removal.where((id) => _c.dataset.nodes[id]?.type == 'relations'),
            ...removal.where((id) => _c.dataset.nodes[id]?.type != 'relations'),
          ];
          for (final id in ordered) {
            operations.add({'type': 'remove', 'id': id, 'cascade': 'subtree'});
          }
          nextDeleteActive = true;
          clearEditing();
          clearDeletion();
          select = [];
          nextMode = 'select';
          nextTarget = null;
          facts = {'deletedIds': removal.toList()};
        default:
          throw const PatchMapException(
            'INVALID_INPUT',
            'Unknown editor action',
          );
      }
      final oldState = state;
      if (operations.isNotEmpty) {
        late PatchMapResult outcome;
        _committing = true;
        try {
          outcome = _c.transaction(
            operations,
            actionId:
                action['actionId'] as String? ??
                _lastActionId ??
                (type == 'exit-relation-edit'
                    ? 'relation-edit:${action['relationId']}'
                    : null),
            selectedIds: select,
          );
        } finally {
          _committing = false;
        }
        if (outcome.changed && _c.history._entries.isNotEmpty)
          _c.history._entries.last.editorBoundary = true;
        if (outcome.status == 'rejected' || outcome.status == 'refused')
          return result(
            outcome.status,
            code: (outcome.diagnostic as Map?)?['code'] as String?,
          );
      } else if (select != null) {
        _c.selection.set(select);
      }
      _mode = nextMode;
      _target = nextTarget;
      _sessionKind = nextSessionKind;
      _inactive = nextInactive;
      _awaitingResolve = nextAwaiting;
      _linked = nextLinked;
      _pending = nextPending;
      _cascade = nextCascade;
      _confirmed = nextConfirmed;
      _lastActionId = nextActionId;
      _requested = nextRequested;
      _originalText = nextOriginalText;
      _deleteActive = nextDeleteActive;
      if (type.toString().startsWith('exit-') ||
          type == 'cancel-text-edit' ||
          type == 'commit-text-edit' ||
          type == 'delete-transaction')
        _c.history._closed = true;
      if (!_equal(oldState, state) && operations.isEmpty) _c._notify();
      return result(outcomeStatus);
    } catch (error) {
      return result(
        'rejected',
        code: error is PatchMapException
            ? error.code
            : error is _MissingTarget
            ? 'MISSING_TARGET'
            : 'INVALID_INPUT',
      );
    } finally {
      _c._endNotifications();
    }
  }
}
