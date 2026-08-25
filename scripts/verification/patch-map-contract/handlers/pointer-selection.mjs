import {
  bindEventsAction,
  bindingProbeSequenceAction,
  clickSuppressionMatrixAction,
  destroyStateStackAction,
  dispatchPropagatingEventAction,
  dispatchStateOwnedInputAction,
  keyboardMatrixAction,
  setSelectionAction,
  stateStackAction,
  subscribeEventsAction,
  transformerHandlePropagationProbeAction,
} from './pointer-selection/event-actions.mjs';
import {
  gestureTerminationMatrixAction,
  hoverOverlapRedrawProbeAction,
  physicalClickSeriesAction,
  pointerHoverSeriesAction,
  pointerSeriesAction,
} from './pointer-selection/pointer-actions.mjs';
import {
  applyCommandStatusAction,
  applyHostSelectionAction,
  boxSelectionAction,
  canvasUserSelectAction,
  clearConsumerSelectionAction,
  consumerBoxSelectAction,
  consumerPointerCancelAction,
  consumerPointerDownAction,
  dispatchHostShortcutAction,
  drillDownAction,
  paintSelectionAction,
  probeConsumerDeclaredFailureAction,
  rangeSelectFromSidebarAction,
  redrawConsumerSceneAction,
  relationBoxIntersectionMatrixAction,
  remountSelectionAction,
  removeRelationEndpointAction,
  renameTargetAction,
  replaceEndpointAction,
  replaceSelectionSceneAction,
  revealTargetAction,
  secondaryClickAction,
  selectConsumerTargetsAction,
  selectFromSidebarAction,
  selectRelatedTargetsAction,
  selectRelationEndpointsAction,
  selectionEligibilityMatrixAction,
  selectionVisualMatrixAction,
  setExternalSelectionAction,
  singleSelectAction,
  snapshotCommandTargetsAction,
  toggleSelectAction,
  userSelectAction,
} from './pointer-selection/selection-actions.mjs';
import {
  inspectTransformHandlesAction,
  evaluateTransformableKindMatrixAction,
  evaluateTransformableSubsetAction,
  transformTargetOperationsAction,
  resizeHandleMatrixAction,
  resizeTargetClassMatrixAction,
  ratioResizeSeriesAction,
  ratioLockPolicyMatrixAction,
  rotateSelectionAction,
  rotationFrameMatrixAction,
  rotationSnapSeriesAction,
  moveTransformAction,
  keyNudgeAction,
  edgeAutoPanAction,
  moveIneligibleMixedSetAction,
  measureTransformVisualFollowAction,
  transformGestureAction,
  transformHistoryDirectionAction,
  transformCancelMatrixAction,
  transformCompletionMatrixAction,
  transformHandleGestureAction,
  postTransformPointerClickAction,
} from './pointer-selection/transformer-actions.mjs';
import {
  assert,
  assertExactKeys,
  isRecord,
  recordValue,
} from './pointer-selection/support.mjs';

export const POINTER_SELECTION_HANDLER_REVISION = 'patch-map-pointer-selection-handlers/1';

export const POINTER_SELECTION_CASE_IDS = Object.freeze([
  'EVT-001',
  'EVT-002',
  'EVT-003',
  'EVT-004',
  'EVT-005',
  'EVT-006',
  'EVT-007',
  'EVT-008',
  'EVT-009',
  'SEL-005',
  'SEL-006',
  'SEL-007',
  'SEL-008',
  'SEL-009',
  'TRN-001',
  'TRN-002',
  'TRN-003',
  'TRN-004',
  'TRN-005',
  'TRN-006',
  'TRN-007',
  'TRN-008',
  'TRN-009',
  'TRN-010',
  'CSM-011',
  'CSM-012',
  'CSM-015',
  'CSM-016',
  'CSM-020',
  'CSM-021',
]);

export const POINTER_SELECTION_ACTION_TYPES = Object.freeze([
  'pointer-series',
  'physical-click-series',
  'pointer-hover-series',
  'hover-overlap-redraw-probe',
  'gesture-termination-matrix',
  'bind-events',
  'binding-probe-sequence',
  'dispatch-propagating-event',
  'keyboard-matrix',
  'transformer-handle-propagation-probe',
  'state-stack',
  'dispatch-state-owned-input',
  'destroy-state-stack',
  'click-suppression-matrix',
  'subscribe-events',
  'set-selection',
  'box-selection',
  'relation-box-intersection-matrix',
  'paint-selection',
  'selection-visual-matrix',
  'selection-eligibility-matrix',
  'canvas-user-select',
  'set-external-selection',
  'replace-scene',
  'remount',
  'select-relation-endpoints',
  'replace-endpoint',
  'remove-relation-endpoint',
  'inspect-transform-handles',
  'evaluate-transformable-subset',
  'evaluate-transformable-kind-matrix',
  'transform-target-operations',
  'resize-handle-matrix',
  'resize-target-class-matrix',
  'ratio-resize-series',
  'ratio-lock-policy-matrix',
  'rotate-selection',
  'rotation-frame-matrix',
  'rotation-snap-series',
  'move-transform',
  'key-nudge',
  'edge-auto-pan',
  'move-ineligible-mixed-set',
  'measure-transform-visual-follow',
  'transform-gesture',
  'undo',
  'redo',
  'transform-cancel-matrix',
  'transform-completion-matrix',
  'transform-handle-gesture',
  'pointer-click',
  'single-select',
  'toggle-select',
  'select-related-targets',
  'box-select',
  'clear-selection',
  'probe-declared-failure',
  'apply-host-selection',
  'user-select',
  'redraw-scene',
  'pointerdown',
  'pointercancel',
  'dispatch-host-shortcut',
  'select-targets',
  'snapshot-command-targets',
  'apply-command-status',
  'drill-down',
  'secondary-click',
  'select-from-sidebar',
  'range-select-from-sidebar',
  'rename-target',
  'reveal-target',
]);

const CASE_ACTIONS = Object.freeze({
  'EVT-001': Object.freeze(['pointer-series']),
  'EVT-002': Object.freeze(['physical-click-series']),
  'EVT-003': Object.freeze(['pointer-hover-series', 'hover-overlap-redraw-probe']),
  'EVT-004': Object.freeze(['gesture-termination-matrix']),
  'EVT-005': Object.freeze(['bind-events', 'binding-probe-sequence']),
  'EVT-006': Object.freeze([
    'dispatch-propagating-event',
    'keyboard-matrix',
    'transformer-handle-propagation-probe',
  ]),
  'EVT-007': Object.freeze([
    'state-stack',
    'dispatch-state-owned-input',
    'destroy-state-stack',
  ]),
  'EVT-008': Object.freeze(['click-suppression-matrix']),
  'EVT-009': Object.freeze(['subscribe-events', 'set-selection']),
  'SEL-005': Object.freeze([
    'box-selection',
    'box-selection',
    'box-selection',
    'relation-box-intersection-matrix',
  ]),
  'SEL-006': Object.freeze(['paint-selection']),
  'SEL-007': Object.freeze([
    'selection-visual-matrix',
    'selection-eligibility-matrix',
  ]),
  'SEL-008': Object.freeze([
    'canvas-user-select',
    'set-external-selection',
    'replace-scene',
    'replace-scene',
    'remount',
  ]),
  'SEL-009': Object.freeze([
    'select-relation-endpoints',
    'replace-endpoint',
    'select-relation-endpoints',
    'select-relation-endpoints',
    'remove-relation-endpoint',
    'select-relation-endpoints',
  ]),
  'TRN-001': Object.freeze([
    'transform-target-operations',
    'replace-scene',
  ]),
  'TRN-002': Object.freeze(['inspect-transform-handles']),
  'TRN-003': Object.freeze([
    'evaluate-transformable-subset',
    'evaluate-transformable-kind-matrix',
  ]),
  'TRN-004': Object.freeze([
    'resize-handle-matrix',
    'resize-target-class-matrix',
  ]),
  'TRN-005': Object.freeze([
    'ratio-resize-series',
    'ratio-lock-policy-matrix',
  ]),
  'TRN-006': Object.freeze([
    'rotate-selection',
    'rotation-frame-matrix',
  ]),
  'TRN-007': Object.freeze(['rotation-snap-series']),
  'TRN-008': Object.freeze([
    'move-transform',
    'move-transform',
    'key-nudge',
    'edge-auto-pan',
    'move-ineligible-mixed-set',
    'measure-transform-visual-follow',
  ]),
  'TRN-009': Object.freeze([
    'transform-gesture',
    'undo',
    'redo',
    'transform-cancel-matrix',
    'transform-completion-matrix',
  ]),
  'TRN-010': Object.freeze(['transform-handle-gesture', 'pointer-click']),
  'CSM-011': Object.freeze([
    'single-select',
    'toggle-select',
    'select-related-targets',
    'box-select',
    'clear-selection',
    'probe-declared-failure',
  ]),
  'CSM-012': Object.freeze([
    'apply-host-selection',
    'user-select',
    'redraw-scene',
    'probe-declared-failure',
  ]),
  'CSM-015': Object.freeze([
    'pointerdown',
    'pointercancel',
    'dispatch-host-shortcut',
    'probe-declared-failure',
  ]),
  'CSM-016': Object.freeze([
    'select-targets',
    'snapshot-command-targets',
    'clear-selection',
    'apply-command-status',
    'probe-declared-failure',
  ]),
  'CSM-020': Object.freeze([
    'single-select',
    'toggle-select',
    'box-select',
    'drill-down',
    'secondary-click',
    'clear-selection',
    'probe-declared-failure',
  ]),
  'CSM-021': Object.freeze([
    'select-from-sidebar',
    'range-select-from-sidebar',
    'rename-target',
    'reveal-target',
    'clear-selection',
    'probe-declared-failure',
  ]),
});

export function createPointerSelectionHandlerEntries(productValue) {
  const product = validateProductAdapter(productValue);
  const states = new WeakMap();
  const handlers = Object.freeze({
    'pointer-series': withState(product, states, pointerSeriesAction),
    'physical-click-series': withState(product, states, physicalClickSeriesAction),
    'pointer-hover-series': withState(product, states, pointerHoverSeriesAction),
    'hover-overlap-redraw-probe': withState(
      product,
      states,
      hoverOverlapRedrawProbeAction,
    ),
    'gesture-termination-matrix': withState(
      product,
      states,
      gestureTerminationMatrixAction,
    ),
    'bind-events': withState(product, states, bindEventsAction),
    'binding-probe-sequence': withState(product, states, bindingProbeSequenceAction),
    'dispatch-propagating-event': withState(
      product,
      states,
      dispatchPropagatingEventAction,
    ),
    'keyboard-matrix': withState(product, states, keyboardMatrixAction),
    'transformer-handle-propagation-probe': withState(
      product,
      states,
      transformerHandlePropagationProbeAction,
    ),
    'state-stack': withState(product, states, stateStackAction),
    'dispatch-state-owned-input': withState(
      product,
      states,
      dispatchStateOwnedInputAction,
    ),
    'destroy-state-stack': withState(product, states, destroyStateStackAction),
    'click-suppression-matrix': withState(product, states, clickSuppressionMatrixAction),
    'subscribe-events': withState(product, states, subscribeEventsAction),
    'set-selection': withState(product, states, setSelectionAction),
    'box-selection': withState(product, states, boxSelectionAction),
    'relation-box-intersection-matrix': withState(
      product,
      states,
      relationBoxIntersectionMatrixAction,
    ),
    'paint-selection': withState(product, states, paintSelectionAction),
    'selection-visual-matrix': withState(product, states, selectionVisualMatrixAction),
    'selection-eligibility-matrix': withState(
      product,
      states,
      selectionEligibilityMatrixAction,
    ),
    'canvas-user-select': withState(product, states, canvasUserSelectAction),
    'set-external-selection': withState(product, states, setExternalSelectionAction),
    'replace-scene': withState(product, states, replaceSelectionSceneAction),
    'remount': withState(product, states, remountSelectionAction),
    'select-relation-endpoints': withState(
      product,
      states,
      selectRelationEndpointsAction,
    ),
    'replace-endpoint': withState(product, states, replaceEndpointAction),
    'remove-relation-endpoint': withState(
      product,
      states,
      removeRelationEndpointAction,
    ),
    'inspect-transform-handles': withState(
      product,
      states,
      inspectTransformHandlesAction,
    ),
    'evaluate-transformable-subset': withState(
      product,
      states,
      evaluateTransformableSubsetAction,
    ),
    'evaluate-transformable-kind-matrix': withState(
      product,
      states,
      evaluateTransformableKindMatrixAction,
    ),
    'transform-target-operations': withState(
      product,
      states,
      transformTargetOperationsAction,
    ),
    'resize-handle-matrix': withState(product, states, resizeHandleMatrixAction),
    'resize-target-class-matrix': withState(
      product,
      states,
      resizeTargetClassMatrixAction,
    ),
    'ratio-resize-series': withState(product, states, ratioResizeSeriesAction),
    'ratio-lock-policy-matrix': withState(
      product,
      states,
      ratioLockPolicyMatrixAction,
    ),
    'rotate-selection': withState(product, states, rotateSelectionAction),
    'rotation-frame-matrix': withState(product, states, rotationFrameMatrixAction),
    'rotation-snap-series': withState(product, states, rotationSnapSeriesAction),
    'move-transform': withState(product, states, moveTransformAction),
    'key-nudge': withState(product, states, keyNudgeAction),
    'edge-auto-pan': withState(product, states, edgeAutoPanAction),
    'move-ineligible-mixed-set': withState(
      product,
      states,
      moveIneligibleMixedSetAction,
    ),
    'measure-transform-visual-follow': withState(
      product,
      states,
      measureTransformVisualFollowAction,
    ),
    'transform-gesture': withState(product, states, transformGestureAction),
    undo: withState(product, states, transformHistoryDirectionAction),
    redo: withState(product, states, transformHistoryDirectionAction),
    'transform-cancel-matrix': withState(
      product,
      states,
      transformCancelMatrixAction,
    ),
    'transform-completion-matrix': withState(
      product,
      states,
      transformCompletionMatrixAction,
    ),
    'transform-handle-gesture': withState(
      product,
      states,
      transformHandleGestureAction,
    ),
    'pointer-click': withState(product, states, postTransformPointerClickAction),
    'single-select': withState(product, states, singleSelectAction),
    'toggle-select': withState(product, states, toggleSelectAction),
    'select-related-targets': withState(
      product,
      states,
      selectRelatedTargetsAction,
    ),
    'box-select': withState(product, states, consumerBoxSelectAction),
    'clear-selection': withState(product, states, clearConsumerSelectionAction),
    'probe-declared-failure': withState(
      product,
      states,
      probeConsumerDeclaredFailureAction,
    ),
    'apply-host-selection': withState(product, states, applyHostSelectionAction),
    'user-select': withState(product, states, userSelectAction),
    'redraw-scene': withState(product, states, redrawConsumerSceneAction),
    pointerdown: withState(product, states, consumerPointerDownAction),
    pointercancel: withState(product, states, consumerPointerCancelAction),
    'dispatch-host-shortcut': withState(
      product,
      states,
      dispatchHostShortcutAction,
    ),
    'select-targets': withState(product, states, selectConsumerTargetsAction),
    'snapshot-command-targets': withState(
      product,
      states,
      snapshotCommandTargetsAction,
    ),
    'apply-command-status': withState(
      product,
      states,
      applyCommandStatusAction,
    ),
    'drill-down': withState(product, states, drillDownAction),
    'secondary-click': withState(product, states, secondaryClickAction),
    'select-from-sidebar': withState(
      product,
      states,
      selectFromSidebarAction,
    ),
    'range-select-from-sidebar': withState(
      product,
      states,
      rangeSelectFromSidebarAction,
    ),
    'rename-target': withState(product, states, renameTargetAction),
    'reveal-target': withState(product, states, revealTargetAction),
  });
  return Object.freeze(POINTER_SELECTION_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(product, states, handler) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const action = validateAction(context, actionValue);
    let state = states.get(context.ensureSessionEngine);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        loadedDatasetRef: null,
        sessionIndex: 1,
        bindingHandle: null,
        bindingDeliveries: [],
        observerEvents: [],
        eventSubscriptions: [],
        selectionHostUnbind: null,
        canvasToHost: [],
        externalSelectionIds: [],
        firstEndpointTargets: [],
        replacedEndpointBefore: null,
        replacedEndpointCurrent: null,
        transformCounters: null,
        transformTargetSnapshots: [],
        transformSelectionChanges: [],
        transformerBaselineDataset: null,
        transformBeforeGesture: null,
        transformAfterCommit: null,
        consumerSelectionTrace: [],
        currentHostSelection: [],
        currentHighlights: [],
        selectionCallbacks: [],
        commandState: null,
        pointerShift: false,
        temporaryModifiers: [],
        pointerScreen: [170, 50],
        hostShortcut: null,
        contextMenuTarget: null,
        rangeSelection: [],
        renamedTarget: null,
        revealResult: null,
      };
      states.set(context.ensureSessionEngine, state);
    }
    assert(state.caseId === context.caseId, 'pointer/selection state case identity');
    return handler(product, state, context, action);
  };
}

function validateProductAdapter(value) {
  const product = recordValue(value, 'pointer/selection product adapter');
  assert(typeof product.resourceProbe === 'function', 'product adapter resourceProbe()');
  assert(
    typeof product.releasedResourceProbe === 'function',
    'product adapter releasedResourceProbe()',
  );
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'context');
  assert(POINTER_SELECTION_CASE_IDS.includes(context.caseId), 'context case identity');
  assert(Number.isInteger(context.actionIndex) && context.actionIndex >= 0, 'context action index');
  for (const method of [
    'ensureSessionEngine',
    'releaseEngine',
    'resolveDataset',
  ]) {
    assert(typeof context[method] === 'function', `context ${method}()`);
  }
  assert(isRecord(context.fixtureParams), 'context fixtureParams');
  assert(isRecord(context.fixtureProfiles), 'context fixtureProfiles');
  assert(context.signal !== null && typeof context.signal === 'object', 'context signal');
  return context;
}

function validateAction(context, value) {
  const action = recordValue(value, 'action');
  assertExactKeys(action, ['index', 'operands', 'type'], 'action');
  assert(action.index === context.actionIndex, 'action index');
  assert(
    action.type === CASE_ACTIONS[context.caseId]?.[context.actionIndex],
    `${context.caseId} action type`,
  );
  assert(!context.signal.aborted, 'action is aborted');
  return action;
}
