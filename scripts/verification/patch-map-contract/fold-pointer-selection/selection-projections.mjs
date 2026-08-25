import { clone } from '../value-atoms.mjs';
import {
  actionActual,
  actionProductSnapshot,
  booleanValue,
  cloneArray,
  cloneRecord,
  domains,
  nonNegativeInteger,
  pointerActiveCount,
  recordValue,
  semanticInteractionMode,
  semanticSceneRevision,
  stringValue,
} from './support.mjs';

export function projectSelectionCaseDomains(caseId, execution) {
  switch (caseId) {
    case 'SEL-005': {
      const completed = actionActual(execution, 0, 'box-selection');
      const cancelled = actionActual(execution, 1, 'box-selection');
      const leave = actionActual(execution, 2, 'box-selection');
      const relation = actionActual(
        execution,
        3,
        'relation-box-intersection-matrix',
      );
      return domains({
        geometry: {
          boxStrokeCssPxByZoomAndDpr: cloneArray(
            relation.strokeCssPxByZoomAndDpr,
            'SEL-005 box strokes',
          ),
        },
        interaction: {
          completed: {
            targets: cloneArray(completed.targets, 'SEL-005 completed targets'),
            duplicateCount: nonNegativeInteger(
              completed.duplicateCount,
              'SEL-005 duplicate count',
            ),
          },
          beforeCancelled: {
            targets: cloneArray(cancelled.beforeTargets, 'SEL-005 before cancelled'),
          },
          cancelled: {
            targets: cloneArray(cancelled.targets, 'SEL-005 cancelled targets'),
          },
          beforeLeave: {
            targets: cloneArray(leave.beforeTargets, 'SEL-005 before leave'),
          },
          leave: {
            targets: cloneArray(leave.targets, 'SEL-005 leave targets'),
          },
          relationIntersection: cloneRecord(
            relation.relationIntersection,
            'SEL-005 relation intersection',
          ),
        },
        events: {
          completed: {
            dragStartCount: nonNegativeInteger(
              completed.dragStartCount,
              'SEL-005 drag-start count',
            ),
          },
        },
        resources: {
          cancelled: cloneRecord(cancelled.resources, 'SEL-005 cancelled resources'),
        },
      });
    }
    case 'SEL-006': {
      const action = actionActual(execution, 0, 'paint-selection');
      return domains({
        geometry: {
          nonFiniteCount: nonNegativeInteger(
            action.nonFiniteCount,
            'SEL-006 non-finite count',
          ),
        },
        interaction: {
          targets: cloneArray(action.targets, 'SEL-006 targets'),
          duplicateCount: nonNegativeInteger(
            action.duplicateCount,
            'SEL-006 duplicate count',
          ),
          filteredTargets: cloneArray(
            action.filteredTargets,
            'SEL-006 filtered targets',
          ),
          lockedTargets: cloneArray(action.lockedTargets, 'SEL-006 locked targets'),
          relationPathIntersections: cloneArray(
            action.relationPathIntersections,
            'SEL-006 relation intersections',
          ),
        },
        events: {
          liveChangeCount: nonNegativeInteger(
            action.liveChangeCount,
            'SEL-006 live change count',
          ),
          dragEnd: cloneRecord(action.dragEnd, 'SEL-006 drag end'),
        },
      });
    }
    case 'SEL-007': {
      const visual = actionActual(execution, 0, 'selection-visual-matrix');
      const eligibility = actionActual(
        execution,
        1,
        'selection-eligibility-matrix',
      );
      const cases = cloneRecord(
        eligibility.cases,
        'SEL-007 eligibility cases',
      );
      return domains({
        geometry: {
          single: cloneRecord(visual.single, 'SEL-007 single frame'),
          multi: cloneRecord(visual.multi, 'SEL-007 multi frame'),
          handleCssPxByZoom: cloneArray(
            visual.handleCssPxByZoom,
            'SEL-007 handle sizes',
          ),
          strokeCssPxByZoom: cloneArray(
            visual.strokeCssPxByZoom,
            'SEL-007 stroke sizes',
          ),
        },
        interaction: {
          empty: cloneRecord(visual.empty, 'SEL-007 empty visual'),
          hidden: cloneRecord(visual.hidden, 'SEL-007 hidden visual'),
          'group-only': cloneRecord(cases['group-only'], 'SEL-007 group visual'),
          'element-only': cloneRecord(
            cases['element-only'],
            'SEL-007 element visual',
          ),
          mixed: cloneRecord(cases.mixed, 'SEL-007 mixed visual'),
        },
      });
    }
    case 'SEL-008': {
      const canvas = actionActual(execution, 0, 'canvas-user-select');
      const external = actionActual(execution, 1, 'set-external-selection');
      const redraw = actionActual(execution, 2, 'replace-scene');
      const withoutHost = actionActual(execution, 3, 'replace-scene');
      const remount = actionActual(execution, 4, 'remount');
      const publications = cloneArray(
        remount.canvasToHost,
        'SEL-008 host publications',
      );
      return domains({
        interaction: {
          afterExternal: {
            targets: cloneArray(
              external.targets,
              'SEL-008 external selection',
            ),
          },
          afterRedraw: {
            targets: cloneArray(redraw.targets, 'SEL-008 redraw selection'),
          },
          withoutHostInput: {
            targets: cloneArray(
              withoutHost.targets,
              'SEL-008 hostless selection',
            ),
          },
          afterRemount: {
            targets: cloneArray(remount.targets, 'SEL-008 remount selection'),
          },
        },
        events: {
          canvasToHost: {
            publicationCount: publications.length,
            payload: publications.length === 0
              ? null
              : clone(publications.at(-1)),
          },
        },
        resources: {
          staleOutlines: nonNegativeInteger(
            remount.staleOutlines,
            'SEL-008 stale outlines',
          ),
        },
        outcome: {
          canvasSelectionChanged: recordValue(
            canvas.change,
            'SEL-008 canvas selection change',
          ).changed === true,
        },
      });
    }
    case 'SEL-009': {
      const first = actionActual(execution, 0, 'select-relation-endpoints');
      const replaced = actionActual(execution, 1, 'replace-endpoint');
      const toggled = actionActual(execution, 2, 'select-relation-endpoints');
      const missing = actionActual(execution, 3, 'select-relation-endpoints');
      const removed = actionActual(execution, 5, 'select-relation-endpoints');
      const lifecycleIdentity = cloneRecord(
        replaced.lifecycleIdentity,
        'SEL-009 replacement identity',
      );
      return domains({
        scene: {
          current: {
            elements: {
              'rect-b': lifecycleIdentity,
            },
          },
        },
        interaction: {
          first: {
            targets: cloneArray(first.resolvedTargets, 'SEL-009 first targets'),
            duplicateCount: nonNegativeInteger(
              first.duplicateCount,
              'SEL-009 duplicate count',
            ),
            missingCount: nonNegativeInteger(
              first.missingCount,
              'SEL-009 missing count',
            ),
          },
          replacedEndpoint: {
            id: stringValue(replaced.id, 'SEL-009 replacement ID'),
            lifecycleIdentity,
          },
          staleEndpointResolutionCount: nonNegativeInteger(
            toggled.staleEndpointResolutionCount,
            'SEL-009 stale endpoint count',
          ),
          missingRelation: {
            targets: cloneArray(
              missing.resolvedTargets,
              'SEL-009 missing relation targets',
            ),
          },
          removedEndpoint: {
            missingIds: cloneArray(
              removed.missingIds,
              'SEL-009 removed endpoint IDs',
            ),
          },
          addMode: {
            targets: cloneArray(
              missing.selectionTargets,
              'SEL-009 add-mode selection',
            ),
          },
        },
      });
    }
    case 'CSM-011': {
      const cleared = actionActual(execution, 4, 'clear-selection');
      const failure = actionActual(execution, 5, 'probe-declared-failure');
      const selectionTrace = cloneArray(
        cleared.selectionTrace,
        'CSM-011 selection trace',
      );
      const snapshot = actionProductSnapshot(cleared, 'CSM-011');
      return domains({
        interaction: { selectionTrace },
        outcome: {
          hostEngineSeam: {
            engineReturns: {
              traces: clone(selectionTrace),
              selectedIds: cloneArray(
                snapshot.selectionIds,
                'CSM-011 selected IDs',
              ),
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-011 failure rollback',
            ),
            finalState: {
              selectedIds: cloneArray(
                snapshot.selectionIds,
                'CSM-011 final selection',
              ),
              mode: semanticInteractionMode(cleared, 'CSM-011'),
              sceneRevision: semanticSceneRevision(cleared, 'CSM-011'),
            },
          },
        },
      });
    }
    case 'CSM-012': {
      const user = actionActual(execution, 1, 'user-select');
      const redraw = actionActual(execution, 2, 'redraw-scene');
      const failure = actionActual(execution, 3, 'probe-declared-failure');
      const selectedTargets = cloneArray(
        redraw.selectedTargets,
        'CSM-012 selected targets',
      );
      const highlightedTargets = cloneArray(
        redraw.highlightedTargets,
        'CSM-012 highlighted targets',
      );
      const callbacks = cloneArray(
        user.selectionCallbacks,
        'CSM-012 selection callbacks',
      );
      return domains({
        interaction: { selectedTargets, highlightedTargets },
        events: { selectionCallbacks: callbacks },
        outcome: {
          hostEngineSeam: {
            engineReturns: {
              callbackSelectedIds: clone(callbacks.at(-1) ?? []),
              selectionAfterRedraw: clone(selectedTargets),
              highlightAfterRedraw: clone(highlightedTargets),
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-012 failure rollback',
            ),
            finalState: {
              selectedIds: clone(selectedTargets),
              highlightedIds: clone(highlightedTargets),
              mode: semanticInteractionMode(redraw, 'CSM-012'),
            },
          },
        },
      });
    }
    case 'CSM-015': {
      const down = actionActual(execution, 0, 'pointerdown');
      const cancelled = actionActual(execution, 1, 'pointercancel');
      const shortcut = actionActual(execution, 2, 'dispatch-host-shortcut');
      const failure = actionActual(execution, 3, 'probe-declared-failure');
      const hostShortcut = cloneRecord(
        shortcut.hostShortcut,
        'CSM-015 host shortcut',
      );
      const selectedIds = cloneArray(
        cancelled.selectionIds,
        'CSM-015 selected IDs',
      );
      const temporaryModifiers = cloneArray(
        cancelled.temporaryModifiers,
        'CSM-015 temporary modifiers',
      );
      return domains({
        interaction: {
          pointerShift: booleanValue(down.pointerShift, 'CSM-015 pointer Shift'),
          temporaryModifiersAfterCancel: temporaryModifiers,
        },
        events: {
          hostShortcut: {
            coreIntercepted: booleanValue(
              hostShortcut.coreIntercepted,
              'CSM-015 shortcut interception',
            ),
          },
        },
        outcome: {
          hostEngineSeam: {
            engineReturns: {
              shiftAtPointerDown: booleanValue(
                down.pointerShift,
                'CSM-015 Shift at pointer down',
              ),
              modifierAfterCancel: temporaryModifiers.length > 0,
              coreShortcutIntercepted: booleanValue(
                hostShortcut.coreIntercepted,
                'CSM-015 core shortcut intercepted',
              ),
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-015 failure rollback',
            ),
            finalState: {
              selectedIds,
              temporaryModifiers,
              activeGesture: pointerActiveCount(cancelled, 'CSM-015') === 0
                ? null
                : 'pointer',
            },
          },
        },
      });
    }
    case 'CSM-016': {
      const opened = actionActual(execution, 1, 'snapshot-command-targets');
      const status = actionActual(execution, 3, 'apply-command-status');
      const failure = actionActual(execution, 4, 'probe-declared-failure');
      const openedState = cloneRecord(
        opened.commandState,
        'CSM-016 opened command',
      );
      const finalState = cloneRecord(
        status.commandState,
        'CSM-016 final command',
      );
      const commandTargetIds = cloneArray(
        openedState.targetIds,
        'CSM-016 command target IDs',
      );
      const statusTrace = cloneArray(
        finalState.statusTrace,
        'CSM-016 status trace',
      );
      return domains({
        events: { statusTrace },
        outcome: {
          commandTargetIds,
          commandTargetIdsAfterSelectionChange: cloneArray(
            finalState.targetIds,
            'CSM-016 retained command targets',
          ),
          hostEngineSeam: {
            engineReturns: {
              commandTargetIds: clone(commandTargetIds),
              statusTrace: clone(statusTrace),
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-016 failure rollback',
            ),
            finalState: {
              commandId: stringValue(finalState.commandId, 'CSM-016 command ID'),
              commandTargetIds: cloneArray(
                finalState.targetIds,
                'CSM-016 final target IDs',
              ),
              selectedIds: cloneArray(
                status.selectionAfterStatus,
                'CSM-016 final selection',
              ),
              status: stringValue(finalState.status, 'CSM-016 final status'),
            },
          },
        },
      });
    }
    case 'CSM-020': {
      const secondary = actionActual(execution, 4, 'secondary-click');
      const cleared = actionActual(execution, 5, 'clear-selection');
      const failure = actionActual(execution, 6, 'probe-declared-failure');
      const selectionTrace = cloneArray(
        cleared.selectionTrace,
        'CSM-020 selection trace',
      );
      const selectedIds = cloneArray(
        actionProductSnapshot(cleared, 'CSM-020').selectionIds,
        'CSM-020 selected IDs',
      );
      return domains({
        interaction: {
          selectionTrace,
          lockedSelectedCount: selectionTrace.flat().filter(
            (id) => id === 'text-c',
          ).length,
        },
        events: {
          contextMenu: {
            targetId: stringValue(
              secondary.targetId,
              'CSM-020 context menu target',
            ),
          },
        },
        outcome: {
          hostEngineSeam: {
            engineReturns: {
              selectionTrace: clone(selectionTrace),
              contextMenuTarget: secondary.targetId,
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-020 failure rollback',
            ),
            finalState: {
              selectedIds,
              mode: semanticInteractionMode(cleared, 'CSM-020'),
              contextMenuTarget: cleared.contextMenuTarget ?? null,
            },
          },
        },
      });
    }
    case 'CSM-021': {
      const range = actionActual(execution, 1, 'range-select-from-sidebar');
      const renamed = actionActual(execution, 2, 'rename-target');
      const revealed = actionActual(execution, 3, 'reveal-target');
      const cleared = actionActual(execution, 4, 'clear-selection');
      const failure = actionActual(execution, 5, 'probe-declared-failure');
      const renamedTarget = cloneRecord(
        renamed.renamedTarget,
        'CSM-021 renamed target',
      );
      const selectedIds = cloneArray(
        actionProductSnapshot(cleared, 'CSM-021').selectionIds,
        'CSM-021 selected IDs',
      );
      const rangeSelection = cloneArray(
        range.rangeSelection,
        'CSM-021 range selection',
      );
      const reveal = cloneRecord(revealed.result, 'CSM-021 reveal result');
      return domains({
        scene: {
          targets: {
            [stringValue(renamedTarget.id, 'CSM-021 renamed ID')]: {
              label: stringValue(renamedTarget.label, 'CSM-021 renamed label'),
            },
          },
        },
        interaction: { rangeSelection, selectedTargets: selectedIds },
        outcome: {
          hostEngineSeam: {
            engineReturns: {
              selectedIdsAfterRange: clone(rangeSelection),
              renamedTarget: renamedTarget.id,
              revealViewChanged: booleanValue(
                reveal.changed,
                'CSM-021 reveal changed',
              ),
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-021 failure rollback',
            ),
            finalState: {
              selectedIds: clone(selectedIds),
              mode: semanticInteractionMode(cleared, 'CSM-021'),
              labelById: {
                [renamedTarget.id]: renamedTarget.label,
              },
            },
          },
        },
      });
    }
    default:
      throw new Error(`PatchMap pointer/selection fold invalid: unsupported case ${caseId}`);
  }
}
