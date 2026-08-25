import { clone } from '../value-atoms.mjs';
import {
  actionActual,
  assert,
  cloneArray,
  cloneRecord,
  domains,
  finiteNumber,
  isRecord,
  nonNegativeInteger,
  pointerProbe,
  stringValue,
} from './support.mjs';

export function projectEventCaseDomains(caseId, execution) {
  switch (caseId) {
    case 'EVT-001': {
      const action = actionActual(execution, 0, 'pointer-series');
      return domains({
        interaction: {
          staleGestureCount: pointerProbe(action).staleGestureCount,
        },
        events: {
          traces: cloneRecord(action.traces, 'EVT-001 traces'),
        },
      });
    }
    case 'EVT-002': {
      const action = actionActual(execution, 0, 'physical-click-series');
      return domains({
        interaction: {
          staleGestureCount: pointerProbe(action).staleGestureCount,
        },
        events: {
          semanticCallbacks: cloneArray(action.semanticCallbacks, 'EVT-002 callbacks'),
          aliasDuplicateCount: nonNegativeInteger(
            action.aliasDuplicateCount,
            'EVT-002 alias duplicate count',
          ),
        },
      });
    }
    case 'EVT-003': {
      const hover = actionActual(execution, 0, 'pointer-hover-series');
      const redraw = actionActual(execution, 1, 'hover-overlap-redraw-probe');
      return domains({
        interaction: {
          hoverTrace: cloneArray(hover.hoverTrace, 'EVT-003 hover trace'),
          tooltipTarget: hover.tooltipTarget ?? null,
          cursor: stringValue(hover.cursor, 'EVT-003 cursor'),
          overlapRedrawTrace: cloneArray(
            redraw.overlapRedrawTrace,
            'EVT-003 overlap redraw trace',
          ),
        },
        events: {
          afterDestroyCount: nonNegativeInteger(
            hover.afterDestroyCount,
            'EVT-003 after destroy count',
          ),
        },
        resources: cloneRecord(hover.resources, 'EVT-003 resources'),
      });
    }
    case 'EVT-004': {
      const action = actionActual(execution, 0, 'gesture-termination-matrix');
      return domains({
        interaction: {
          staleGestureCount: pointerProbe(action).staleGestureCount,
        },
        events: {
          cancelMatrix: cloneArray(action.eventCancelMatrix, 'EVT-004 event matrix'),
        },
        history: {
          cancelMatrix: cloneArray(
            action.historyCancelMatrix,
            'EVT-004 history matrix',
          ),
        },
        outcome: {
          commitMatrix: cloneArray(action.commitMatrix, 'EVT-004 commit matrix'),
          cancelMatrix: cloneArray(action.cancelMatrix, 'EVT-004 cancel matrix'),
        },
        resources: {
          cancelMatrix: cloneArray(
            action.resourceCancelMatrix,
            'EVT-004 resource matrix',
          ),
        },
      });
    }
    case 'EVT-005': {
      const action = actionActual(execution, 1, 'binding-probe-sequence');
      return domains({
        interaction: {
          staleGestureCount: nonNegativeInteger(
            action.staleGestureCount,
            'EVT-005 stale gestures',
          ),
        },
        events: {
          deliveryByTarget: cloneRecord(
            action.deliveryByTarget,
            'EVT-005 target deliveries',
          ),
          deliveryByBinding: cloneRecord(
            action.deliveryByBinding,
            'EVT-005 binding deliveries',
          ),
          afterDisposeCount: nonNegativeInteger(
            action.afterDisposeCount,
            'EVT-005 post-dispose deliveries',
          ),
        },
        outcome: {
          disposeResults: cloneArray(
            action.disposeResults,
            'EVT-005 dispose results',
          ),
        },
        resources: cloneRecord(action.resources, 'EVT-005 resources'),
      });
    }
    case 'EVT-006': {
      const propagation = actionActual(execution, 0, 'dispatch-propagating-event');
      const keyboard = actionActual(execution, 1, 'keyboard-matrix');
      const transformer = actionActual(
        execution,
        2,
        'transformer-handle-propagation-probe',
      );
      return domains({
        interaction: {
          keyboardOwned: cloneRecord(
            keyboard.keyboardOwned,
            'EVT-006 keyboard ownership',
          ),
        },
        events: {
          noStop: cloneRecord(propagation.noStop, 'EVT-006 no-stop trace'),
          stop: cloneRecord(propagation.stop, 'EVT-006 stop trace'),
          immediateStop: cloneRecord(
            propagation.immediateStop,
            'EVT-006 immediate-stop trace',
          ),
          transformerHandle: cloneRecord(
            transformer.transformerHandle,
            'EVT-006 transformer handle',
          ),
        },
        history: {
          corruptEntryCount: nonNegativeInteger(
            propagation.corruptEntryCount,
            'EVT-006 corrupt history entries',
          ),
        },
      });
    }
    case 'EVT-007': {
      const stack = actionActual(execution, 0, 'state-stack');
      const ownership = actionActual(execution, 1, 'dispatch-state-owned-input');
      const destroyed = actionActual(execution, 2, 'destroy-state-stack');
      return domains({
        interaction: {
          activeState: stringValue(stack.activeState, 'EVT-007 active state'),
          inputOwnerTrace: cloneArray(
            ownership.inputOwnerTrace,
            'EVT-007 input owners',
          ),
          afterDestroy: cloneRecord(
            destroyed.afterDestroy,
            'EVT-007 destroyed mode state',
          ),
        },
        events: {
          lifecycle: cloneArray(stack.lifecycle, 'EVT-007 lifecycle'),
        },
        outcome: {
          emptyPop: stringValue(stack.emptyPop, 'EVT-007 empty pop'),
          unknownState: stringValue(stack.unknownState, 'EVT-007 unknown state'),
        },
        resources: cloneRecord(destroyed.resources, 'EVT-007 resources'),
      });
    }
    case 'EVT-008': {
      const action = actionActual(execution, 0, 'click-suppression-matrix');
      return domains({
        interaction: {
          thresholdCssPxByZoom: cloneArray(
            action.thresholdCssPxByZoom,
            'EVT-008 thresholds',
          ),
          nativeContextMenuPrevented: cloneRecord(
            action.nativeContextMenuPrevented,
            'EVT-008 context ownership',
          ),
        },
        events: {
          clickCounts: cloneRecord(action.clickCounts, 'EVT-008 click counts'),
        },
      });
    }
    case 'EVT-009': {
      const action = actionActual(execution, 1, 'set-selection');
      const observations = cloneArray(
        action.observations,
        'EVT-009 event observations',
      );
      const specific = observations.find(({ id }) => id === 'specific');
      const family = observations.find(({ id }) => id === 'family');
      assert(isRecord(specific), 'EVT-009 specific observation');
      assert(isRecord(family), 'EVT-009 family observation');
      return domains({
        interaction: {
          staleGestureCount: nonNegativeInteger(
            action.staleGestureCount,
            'EVT-009 stale gestures',
          ),
        },
        events: {
          order: observations.map(({ id }) =>
            stringValue(id, 'EVT-009 observer ID')),
          specific: {
            payload: clone(specific.payload),
            revision: finiteNumber(
              specific.revision,
              'EVT-009 specific revision',
            ),
          },
          family: {
            payload: clone(family.payload),
            revision: finiteNumber(family.revision, 'EVT-009 family revision'),
          },
        },
      });
    }
    default:
      throw new Error(`PatchMap pointer/selection fold invalid: unsupported case ${caseId}`);
  }
}
