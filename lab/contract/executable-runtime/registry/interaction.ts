import { createPatchMapAuthoringRuntime } from '../../authoring-runtime';
import { createPatchMapEditorWorkflowRuntime } from '../../editor-workflow-runtime';
import { createPatchMapHistoryRuntime } from '../../history-runtime';
import { createPatchMapInteractionEditorRuntime } from '../../interaction-editor-runtime';
import { createPatchMapPointerSelectionRuntime } from '../../pointer-selection-runtime';
import { createPatchMapQuerySelectionRuntime } from '../../query-selection-runtime';
import { createPatchMapUpdateTransactionsRuntime } from '../../update-transactions-runtime';
import { createPatchMapViewportRuntime } from '../../viewport-runtime';
import {
  isAuthoringCaseId,
  isEditorWorkflowCaseId,
  isHistoryCaseId,
  isInteractionEditorCaseId,
  isPointerSelectionCaseId,
  isQuerySelectionCaseId,
  isUpdateTransactionCaseId,
  isViewportCaseId,
  type PatchMapExecutableRoute,
} from '../case-routing';
import type {
  PatchMapExecutableRuntimeDescriptor,
} from '../contracts';
import { patchMapExecutableInvariant as invariant } from '../descriptor';
import {
  PATCH_MAP_FOLD_MODULES,
  PATCH_MAP_HANDLER_MODULES,
} from '../script-modules';
import {
  createPatchMapProductRuntimeDescriptor,
} from './runtime-descriptor';

const UPDATE_TRANSACTIONS_DESCRIPTOR =
  createPatchMapProductRuntimeDescriptor({
    key: 'update-transactions',
    needsSupplementalWebGLLease: false,
    handlerFactory:
      PATCH_MAP_HANDLER_MODULES.updateTransactions
        .createUpdateTransactionHandlerEntries,
    handlerLabel: 'update-transactions handlers',
    fold:
      PATCH_MAP_FOLD_MODULES.updateTransactions
        .foldUpdateTransactionExecution,
    foldLabel: 'update-transactions fold',
    createRuntime(plan) {
      invariant(
        isUpdateTransactionCaseId(plan.id),
        'update-transactions case identity',
      );
      return createPatchMapUpdateTransactionsRuntime(plan.id);
    },
    postDestroyProductProbe: (runtime) => (
      () => runtime.postDestroyProductProbe()
    ),
  });

const VIEWPORT_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'viewport',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.viewport.createViewportHandlerEntries,
  handlerLabel: 'viewport handlers',
  fold: PATCH_MAP_FOLD_MODULES.viewport.foldViewportExecution,
  foldLabel: 'viewport fold',
  createRuntime(plan) {
    invariant(isViewportCaseId(plan.id), 'viewport case identity');
    return createPatchMapViewportRuntime(plan.id);
  },
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const QUERY_SELECTION_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'query-selection',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.querySelection
      .createQuerySelectionHandlerEntries,
  handlerLabel: 'query-selection handlers',
  fold: PATCH_MAP_FOLD_MODULES.querySelection.foldQuerySelectionExecution,
  foldLabel: 'query-selection fold',
  createRuntime(plan) {
    invariant(isQuerySelectionCaseId(plan.id), 'query-selection case identity');
    return createPatchMapQuerySelectionRuntime(plan.id);
  },
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const POINTER_SELECTION_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'pointer-selection',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.pointerSelection
      .createPointerSelectionHandlerEntries,
  handlerLabel: 'pointer-selection handlers',
  fold:
    PATCH_MAP_FOLD_MODULES.pointerSelection.foldPointerSelectionExecution,
  foldLabel: 'pointer-selection fold',
  createRuntime(plan) {
    invariant(
      isPointerSelectionCaseId(plan.id),
      'pointer-selection case identity',
    );
    return createPatchMapPointerSelectionRuntime(plan.id);
  },
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const INTERACTION_EDITOR_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'interaction-editor',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.interactionEditor
      .createInteractionEditorHandlerEntries,
  handlerLabel: 'interaction-editor handlers',
  fold:
    PATCH_MAP_FOLD_MODULES.interactionEditor.foldInteractionEditorExecution,
  foldLabel: 'interaction-editor fold',
  createRuntime(plan) {
    invariant(
      isInteractionEditorCaseId(plan.id),
      'interaction-editor case identity',
    );
    return createPatchMapInteractionEditorRuntime(plan.id);
  },
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const AUTHORING_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'authoring',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.authoring.createAuthoringHandlerEntries,
  handlerLabel: 'authoring handlers',
  fold: PATCH_MAP_FOLD_MODULES.authoring.foldAuthoringExecution,
  foldLabel: 'authoring fold',
  createRuntime(plan) {
    invariant(isAuthoringCaseId(plan.id), 'authoring case identity');
    return createPatchMapAuthoringRuntime(plan.id);
  },
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const EDITOR_WORKFLOW_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'editor-workflow',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.editorWorkflow
      .createEditorWorkflowHandlerEntries,
  handlerLabel: 'editor-workflow handlers',
  fold: PATCH_MAP_FOLD_MODULES.editorWorkflow.foldEditorWorkflowExecution,
  foldLabel: 'editor-workflow fold',
  createRuntime(plan) {
    invariant(
      isEditorWorkflowCaseId(plan.id),
      'editor-workflow case identity',
    );
    return createPatchMapEditorWorkflowRuntime(plan.id);
  },
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const HISTORY_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'history',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.history.createHistoryHandlerEntries,
  handlerLabel: 'history handlers',
  fold: PATCH_MAP_FOLD_MODULES.history.foldHistoryExecution,
  foldLabel: 'history fold',
  createRuntime(plan) {
    invariant(isHistoryCaseId(plan.id), 'history case identity');
    return createPatchMapHistoryRuntime(plan.id);
  },
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

export const PATCH_MAP_INTERACTION_DESCRIPTORS = Object.freeze({
  'update-transactions': UPDATE_TRANSACTIONS_DESCRIPTOR,
  viewport: VIEWPORT_DESCRIPTOR,
  'query-selection': QUERY_SELECTION_DESCRIPTOR,
  'pointer-selection': POINTER_SELECTION_DESCRIPTOR,
  'interaction-editor': INTERACTION_EDITOR_DESCRIPTOR,
  authoring: AUTHORING_DESCRIPTOR,
  'editor-workflow': EDITOR_WORKFLOW_DESCRIPTOR,
  history: HISTORY_DESCRIPTOR,
}) satisfies Readonly<
  Partial<Record<PatchMapExecutableRoute, PatchMapExecutableRuntimeDescriptor>>
>;
