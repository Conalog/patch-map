import {
  actionActual,
  booleanValue,
  cloneArray,
  cloneRecord,
  domains,
  finiteNumber,
  nonNegativeInteger,
  pointerProbe,
  stringValue,
} from './support.mjs';

export function projectTransformerCaseDomains(caseId, execution) {
  switch (caseId) {
    case 'TRN-001': {
      const operations = actionActual(
        execution,
        0,
        'transform-target-operations',
      );
      const redraw = actionActual(execution, 1, 'replace-scene');
      return domains({
        interaction: {
          targetSnapshots: cloneArray(
            operations.targetSnapshots,
            'TRN-001 target snapshots',
          ),
          afterRedraw: {
            targets: cloneArray(redraw.targets, 'TRN-001 redraw targets'),
          },
          overlayPublication: stringValue(
            operations.overlayPublication,
            'TRN-001 overlay publication',
          ),
        },
        events: {
          changes: cloneArray(operations.changes, 'TRN-001 changes'),
        },
      });
    }
    case 'TRN-002': {
      const action = actionActual(execution, 0, 'inspect-transform-handles');
      return domains({
        geometry: {
          visibleCorners: cloneArray(
            action.visibleCorners,
            'TRN-002 visible corners',
          ),
          cornerCssPxByZoom: cloneArray(
            action.cornerCssPxByZoom,
            'TRN-002 corner sizes',
          ),
          edgeStripCssPxByZoom: cloneArray(
            action.edgeStripCssPxByZoom,
            'TRN-002 edge sizes',
          ),
        },
        interaction: {
          overlapPriority: cloneArray(
            action.overlapPriority,
            'TRN-002 overlap priority',
          ),
          cursorDirectionByHandle: cloneRecord(
            action.cursorDirectionByHandle,
            'TRN-002 cursor directions',
          ),
        },
      });
    }
    case 'TRN-003': {
      const subset = actionActual(execution, 0, 'evaluate-transformable-subset');
      const matrix = actionActual(
        execution,
        1,
        'evaluate-transformable-kind-matrix',
      );
      return domains({
        scene: {
          before: {
            targets: cloneRecord(
              subset.beforeTargets,
              'TRN-003 before targets',
            ),
          },
          targets: cloneRecord(
            subset.currentTargets,
            'TRN-003 current targets',
          ),
        },
        interaction: {
          rotatableTargets: cloneArray(
            subset.rotatableTargets,
            'TRN-003 rotatable targets',
          ),
          resizableTargets: cloneArray(
            subset.resizableTargets,
            'TRN-003 resizable targets',
          ),
          activeResizeHandles: booleanValue(
            subset.activeResizeHandles,
            'TRN-003 active resize handles',
          ),
          subsetIndicator: cloneRecord(
            subset.subsetIndicator,
            'TRN-003 subset indicator',
          ),
          kindEligibility: cloneRecord(
            matrix.kindEligibility,
            'TRN-003 kind eligibility',
          ),
        },
      });
    }
    case 'TRN-004': {
      const handles = actionActual(execution, 0, 'resize-handle-matrix');
      const classes = actionActual(
        execution,
        1,
        'resize-target-class-matrix',
      );
      return domains({
        geometry: {
          results: cloneRecord(handles.results, 'TRN-004 resize results'),
          targetClasses: cloneRecord(
            classes.targetClasses,
            'TRN-004 resize target classes',
          ),
        },
        interaction: {
          staleGestureCount: nonNegativeInteger(
            pointerProbe(classes).staleGestureCount,
            'TRN-004 stale gestures',
          ),
        },
      });
    }
    case 'TRN-005': {
      const series = actionActual(execution, 0, 'ratio-resize-series');
      const matrix = actionActual(execution, 1, 'ratio-lock-policy-matrix');
      return domains({
        geometry: {
          steps: cloneArray(series.geometrySteps, 'TRN-005 geometry steps'),
          policy: cloneRecord(matrix.policy, 'TRN-005 geometry policy'),
        },
        interaction: {
          steps: cloneArray(series.interactionSteps, 'TRN-005 interaction steps'),
          policy: cloneRecord(
            matrix.interactionPolicy,
            'TRN-005 interaction policy',
          ),
        },
      });
    }
    case 'TRN-006': {
      const rotation = actionActual(execution, 0, 'rotate-selection');
      const frames = actionActual(execution, 1, 'rotation-frame-matrix');
      return domains({
        scene: {
          before: cloneRecord(rotation.before, 'TRN-006 scene before'),
          targets: cloneRecord(rotation.targets, 'TRN-006 scene targets'),
        },
        geometry: {
          selectionCenterBefore: cloneArray(
            rotation.selectionCenterBefore,
            'TRN-006 center before',
          ),
          selectionCenterAfter: cloneArray(
            rotation.selectionCenterAfter,
            'TRN-006 center after',
          ),
          visibleCenterByTarget: cloneArray(
            rotation.visibleCenterByTarget,
            'TRN-006 visible centers',
          ).flat(),
          single: cloneRecord(frames.single, 'TRN-006 single frame'),
          multi: cloneRecord(frames.multi, 'TRN-006 multi frame'),
        },
        interaction: {
          staleGestureCount: nonNegativeInteger(
            pointerProbe(frames).staleGestureCount,
            'TRN-006 stale gestures',
          ),
        },
      });
    }
    case 'TRN-007': {
      const action = actionActual(execution, 0, 'rotation-snap-series');
      return domains({
        interaction: {
          steps: cloneArray(action.steps, 'TRN-007 rotation snap steps'),
        },
      });
    }
    case 'TRN-008': {
      const drag = actionActual(execution, 0, 'move-transform');
      const axis = actionActual(execution, 1, 'move-transform');
      const nudge = actionActual(execution, 2, 'key-nudge');
      const edgePan = actionActual(execution, 3, 'edge-auto-pan');
      const mixed = actionActual(execution, 4, 'move-ineligible-mixed-set');
      const visualFollow = actionActual(
        execution,
        5,
        'measure-transform-visual-follow',
      );
      return domains({
        scene: {
          afterDrag: cloneRecord(drag.after, 'TRN-008 after drag'),
          beforeAxisLock: cloneRecord(axis.before, 'TRN-008 before axis lock'),
          afterAxisLock: cloneRecord(axis.after, 'TRN-008 after axis lock'),
          afterNudge: cloneRecord(nudge.after, 'TRN-008 after nudge'),
          ineligibleMixedSet: {
            semanticHashBefore: stringValue(
              mixed.semanticHashBefore,
              'TRN-008 mixed hash before',
            ),
            semanticHashAfter: stringValue(
              mixed.semanticHashAfter,
              'TRN-008 mixed hash after',
            ),
          },
        },
        geometry: {
          pointerWorldBeforeAutoPan: cloneArray(
            edgePan.pointerWorldBefore,
            'TRN-008 pointer before auto-pan',
          ),
          pointerWorldAfterAutoPan: cloneArray(
            edgePan.pointerWorldAfter,
            'TRN-008 pointer after auto-pan',
          ),
        },
        interaction: {
          partialMoveOnIneligibleMixedSet: nonNegativeInteger(
            mixed.partialMoveCount,
            'TRN-008 partial move count',
          ),
        },
        outcome: {
          visualFollow: {
            frameGapP95Ms: finiteNumber(
              visualFollow.frameGapP95Ms,
              'TRN-008 frame gap p95',
            ),
            actionToVisibleP95Ms: finiteNumber(
              visualFollow.actionToVisibleP95Ms,
              'TRN-008 action-to-visible p95',
            ),
          },
        },
        history: {
          corruptEntryCount: nonNegativeInteger(
            visualFollow.corruptEntryCount,
            'TRN-008 corrupt history entries',
          ),
        },
      });
    }
    case 'TRN-009': {
      const gesture = actionActual(execution, 0, 'transform-gesture');
      const undo = actionActual(execution, 1, 'undo');
      const redo = actionActual(execution, 2, 'redo');
      const cancelled = actionActual(
        execution,
        3,
        'transform-cancel-matrix',
      );
      const completed = actionActual(
        execution,
        4,
        'transform-completion-matrix',
      );
      return domains({
        scene: {
          beforeGesture: cloneRecord(
            gesture.beforeGesture,
            'TRN-009 scene before gesture',
          ),
          afterCommit: cloneRecord(
            gesture.afterCommit,
            'TRN-009 scene after commit',
          ),
          afterUndo: cloneRecord(undo.dataset, 'TRN-009 scene after undo'),
          afterRedo: cloneRecord(redo.dataset, 'TRN-009 scene after redo'),
          cancelMatrix: {
            allTargetsRestored: booleanValue(
              cancelled.allTargetsRestored,
              'TRN-009 targets restored',
            ),
          },
        },
        interaction: {
          cancelMatrix: {
            selectionRestored: booleanValue(
              cancelled.selectionRestored,
              'TRN-009 selection restored',
            ),
            edgePanPolicyRestored: booleanValue(
              cancelled.edgePanPolicyRestored,
              'TRN-009 edge-pan policy restored',
            ),
          },
        },
        events: {
          cancelMatrix: cloneArray(
            cancelled.eventCancelMatrix,
            'TRN-009 event cancel matrix',
          ),
        },
        history: {
          committed: cloneRecord(gesture.history, 'TRN-009 committed history'),
          cancelMatrix: cloneArray(
            cancelled.historyCancelMatrix,
            'TRN-009 history cancel matrix',
          ),
        },
        outcome: {
          committed: cloneRecord(
            gesture.committed,
            'TRN-009 committed outcome',
          ),
          completionMatrix: cloneArray(
            completed.completionMatrix,
            'TRN-009 completion matrix',
          ),
        },
        resources: {
          cancelMatrix: cloneArray(
            cancelled.resourceCancelMatrix,
            'TRN-009 resource cancel matrix',
          ),
        },
      });
    }
    case 'TRN-010': {
      const gesture = actionActual(execution, 0, 'transform-handle-gesture');
      const after = actionActual(execution, 1, 'pointer-click');
      return domains({
        interaction: {
          afterTransform: {
            owner: stringValue(after.owner, 'TRN-010 input owner'),
          },
        },
        events: {
          duringTransform: cloneRecord(
            gesture.duringTransform,
            'TRN-010 transform counters',
          ),
          afterTransform: {
            clickCount: nonNegativeInteger(
              after.clickCount,
              'TRN-010 post-transform click count',
            ),
          },
        },
      });
    }
    default:
      throw new Error(`PatchMap pointer/selection fold invalid: unsupported case ${caseId}`);
  }
}
