import { Color, type ColorSource } from 'pixi.js';

import {
  CORE_V2_BUILTIN_ASSETS,
  CoreV2AssetError,
  CoreV2AssetRuntime,
  createCoreV2ColorResolver,
  createCoreV2PixiAssetBackend,
  materializeCoreV2Dataset,
  materializeCoreV2Grid,
  resolveCoreV2ComponentSize,
  resolveCoreV2ContentBox,
  setCoreV2GridCell,
  type CoreV2AssetBackend,
  type CoreV2AssetBackendRequest,
  type CoreV2AssetDescriptor,
  type CoreV2AssetPolicy,
  type CoreV2AssetPolicyContext,
  type CoreV2Engine,
  type CoreV2EngineOptions,
  type CoreV2EngineSnapshot,
  type CoreV2SemanticProductProbe,
} from '../../../src/core-v2';

// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as foundationHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/foundation.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as emptyStateHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/empty-state.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as dataFoundationHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/data-foundation.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as dataClosureHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/data-closure.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as lifecycleResizeHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/lifecycle-resize.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as lifecycleDestroyHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/lifecycle-destroy.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as lifecycleInterruptionHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/lifecycle-interruption.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as determinismLifecycleHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/determinism-lifecycle.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderFoundationHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-foundation.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderBoundsHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-bounds.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderOrientationHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-orientation.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderRelationsHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-relations.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderImagesHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-images.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderComponentAssetsHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-component-assets.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderTextHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-text.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as layoutOrderHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/layout-order.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as presentationDynamicsHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/presentation-dynamics.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as updateTransactionsHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/update-transactions.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as viewportHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/viewport.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as querySelectionHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/query-selection.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as pointerSelectionHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/pointer-selection.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as interactionEditorHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/interaction-editor.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as authoringHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/authoring.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as editorWorkflowHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/editor-workflow.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as assetHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/assets.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as assetIngestionHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/asset-ingestion.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as historyHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/history.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as replacementRecoveryHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/replacement-recovery.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as exportExtractionHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/export-extraction.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as foundationFoldModule from '../../../scripts/verification/core-v2-contract/fold-foundation.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as dataFoundationFoldModule from '../../../scripts/verification/core-v2-contract/fold-data-foundation.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as dataClosureFoldModule from '../../../scripts/verification/core-v2-contract/fold-data-closure.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as lifecycleResizeFoldModule from '../../../scripts/verification/core-v2-contract/fold-lifecycle-resize.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as lifecycleDestroyFoldModule from '../../../scripts/verification/core-v2-contract/fold-lifecycle-destroy.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as lifecycleInterruptionFoldModule from '../../../scripts/verification/core-v2-contract/fold-lifecycle-interruption.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as determinismLifecycleFoldModule from '../../../scripts/verification/core-v2-contract/fold-determinism-lifecycle.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderFoundationFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-foundation.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderBoundsFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-bounds.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderOrientationFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-orientation.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderRelationsFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-relations.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderImagesFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-images.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderComponentAssetsFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-component-assets.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderTextFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-text.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as layoutOrderFoldModule from '../../../scripts/verification/core-v2-contract/fold-layout-order.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as presentationDynamicsFoldModule from '../../../scripts/verification/core-v2-contract/fold-presentation-dynamics.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as updateTransactionsFoldModule from '../../../scripts/verification/core-v2-contract/fold-update-transactions.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as viewportFoldModule from '../../../scripts/verification/core-v2-contract/fold-viewport.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as querySelectionFoldModule from '../../../scripts/verification/core-v2-contract/fold-query-selection.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as pointerSelectionFoldModule from '../../../scripts/verification/core-v2-contract/fold-pointer-selection.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as interactionEditorFoldModule from '../../../scripts/verification/core-v2-contract/fold-interaction-editor.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as authoringFoldModule from '../../../scripts/verification/core-v2-contract/fold-authoring.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as editorWorkflowFoldModule from '../../../scripts/verification/core-v2-contract/fold-editor-workflow.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as assetFoldModule from '../../../scripts/verification/core-v2-contract/fold-assets.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as assetIngestionFoldModule from '../../../scripts/verification/core-v2-contract/fold-asset-ingestion.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as historyFoldModule from '../../../scripts/verification/core-v2-contract/fold-history.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as replacementRecoveryFoldModule from '../../../scripts/verification/core-v2-contract/fold-replacement-recovery.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as exportExtractionFoldModule from '../../../scripts/verification/core-v2-contract/fold-export-extraction.mjs';

import type {
  CoreV2ExecutableCaseId,
  CoreV2ExecutableCasePlan,
} from './executable-cases';
import { createCoreV2LayoutOrderRuntime } from './layout-order-runtime';
import { createCoreV2PresentationDynamicsRuntime } from './presentation-dynamics-runtime';
import {
  CORE_V2_UPDATE_TRANSACTIONS_CASE_IDS,
  createCoreV2UpdateTransactionsRuntime,
  type CoreV2UpdateTransactionsCaseId,
} from './update-transactions-runtime';
import {
  CORE_V2_VIEWPORT_CASE_IDS,
  createCoreV2ViewportRuntime,
  type CoreV2ViewportCaseId,
} from './viewport-runtime';
import {
  CORE_V2_QUERY_SELECTION_CASE_IDS,
  createCoreV2QuerySelectionRuntime,
  type CoreV2QuerySelectionCaseId,
} from './query-selection-runtime';
import {
  CORE_V2_POINTER_SELECTION_CASE_IDS,
  createCoreV2PointerSelectionRuntime,
  type CoreV2PointerSelectionCaseId,
} from './pointer-selection-runtime';
import {
  CORE_V2_INTERACTION_EDITOR_CASE_IDS,
  createCoreV2InteractionEditorRuntime,
  type CoreV2InteractionEditorCaseId,
} from './interaction-editor-runtime';
import {
  CORE_V2_AUTHORING_CASE_IDS,
  createCoreV2AuthoringRuntime,
  type CoreV2AuthoringCaseId,
} from './authoring-runtime';
import {
  CORE_V2_EDITOR_WORKFLOW_CASE_IDS,
  createCoreV2EditorWorkflowRuntime,
  type CoreV2EditorWorkflowCaseId,
} from './editor-workflow-runtime';
import { createCoreV2RenderComponentAssetsRuntime } from './render-component-assets-runtime';
import { createCoreV2RenderImagesRuntime } from './render-images-runtime';
import { createCoreV2RenderTextRuntime } from './render-text-runtime';
import {
  CORE_V2_HISTORY_CASE_IDS,
  createCoreV2HistoryRuntime,
  type CoreV2HistoryCaseId,
} from './history-runtime';
import {
  CORE_V2_REPLACEMENT_RECOVERY_CASE_IDS,
  createCoreV2ReplacementRecoveryRuntime,
  type CoreV2ReplacementRecoveryCaseId,
} from './replacement-recovery-runtime';
import {
  CORE_V2_LIFECYCLE_INTERRUPTION_CASE_IDS,
  createCoreV2LifecycleInterruptionRuntime,
  type CoreV2LifecycleInterruptionCaseId,
} from './lifecycle-interruption-runtime';
import {
  CORE_V2_DETERMINISM_LIFECYCLE_CASE_IDS,
  createCoreV2DeterminismLifecycleRuntime,
  type CoreV2DeterminismLifecycleCaseId,
} from './determinism-lifecycle-runtime';
import {
  CORE_V2_EXPORT_EXTRACTION_CASE_IDS,
  createCoreV2ExportExtractionRuntime,
  type CoreV2ExportExtractionCaseId,
} from './export-extraction-runtime';
import { createCoreV2AssetIngestionRuntime } from './asset-ingestion-runtime';

export type CoreV2ExecutableRuntimeKey =
  | 'foundation'
  | 'data-foundation'
  | 'data-closure'
  | 'lifecycle-resize'
  | 'lifecycle-destroy'
  | 'lifecycle-interruption'
  | 'determinism-lifecycle'
  | 'render-foundation'
  | 'render-bounds'
  | 'render-orientation'
  | 'render-relations'
  | 'render-images'
  | 'render-component-assets'
  | 'render-text'
  | 'layout-order'
  | 'presentation-dynamics'
  | 'update-transactions'
  | 'viewport'
  | 'query-selection'
  | 'pointer-selection'
  | 'interaction-editor'
  | 'authoring'
  | 'editor-workflow'
  | 'history'
  | 'replacement-recovery'
  | 'export-extraction'
  | 'asset-ingestion'
  | 'assets';

type Handler = (
  context: Readonly<Record<string, unknown>>,
  action: Readonly<Record<string, unknown>>,
) => unknown;
type HandlerEntry = readonly [string, Handler];

interface HandlerFactoryRuntime {
  createFoundationHandlerEntries?(this: void): readonly HandlerEntry[];
  createEmptyStateHandlerEntries?(this: void): readonly HandlerEntry[];
  createDataFoundationHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createDataClosureHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createLifecycleResizeHandlerEntries?(this: void): readonly HandlerEntry[];
  createLifecycleDestroyHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createLifecycleInterruptionHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createDeterminismLifecycleHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createRenderFoundationHandlerEntries?(this: void): readonly HandlerEntry[];
  createRenderBoundsHandlerEntries?(this: void): readonly HandlerEntry[];
  createRenderOrientationHandlerEntries?(this: void): readonly HandlerEntry[];
  createRenderRelationsHandlerEntries?(this: void): readonly HandlerEntry[];
  createRenderImageHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createRenderComponentAssetHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createRenderTextHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createLayoutOrderHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createPresentationDynamicsHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createUpdateTransactionHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createViewportHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createQuerySelectionHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createPointerSelectionHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createInteractionEditorHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createAuthoringHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createEditorWorkflowHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createAssetHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createAssetIngestionHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createHistoryHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createReplacementRecoveryHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createExportExtractionHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
}

interface FoldRuntime {
  foldFoundationExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldDataFoundationExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldDataClosureExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldLifecycleResizeExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldLifecycleDestroyExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldLifecycleInterruptionExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldDeterminismLifecycleExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderFoundationExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderBoundsExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderOrientationExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderRelationsExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderImageExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderComponentAssetExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderTextExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldLayoutOrderExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldPresentationDynamicsExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldUpdateTransactionExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldViewportExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldQuerySelectionExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldPointerSelectionExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldInteractionEditorExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldAuthoringExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldEditorWorkflowExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldAssetExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldAssetIngestionExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldHistoryExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldReplacementRecoveryExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldExportExtractionExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
}

export interface CoreV2FoldedExecution {
  readonly actual: Readonly<Record<string, unknown>>;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly captures: Readonly<Record<string, unknown>>;
}

export interface CoreV2ExecutableRuntimeDescriptor {
  readonly key: CoreV2ExecutableRuntimeKey;
  readonly needsSupplementalWebGLLease: boolean;
  createRun(plan: CoreV2ExecutableCasePlan): Readonly<{
    readonly handlerEntries: readonly HandlerEntry[];
    readonly engineOptions: Readonly<CoreV2EngineOptions>;
    readonly actionTimeoutMs?: number;
    readonly postDestroyProductProbe?: () =>
      | Readonly<Record<string, unknown>>
      | Promise<Readonly<Record<string, unknown>>>;
  }>;
  handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[];
  fold(options: Readonly<{
    casePlan: CoreV2ExecutableCasePlan;
    execution: Readonly<Record<string, unknown>>;
    provenance: Readonly<Record<string, unknown>>;
    environment: Readonly<Record<string, unknown>>;
  }>): CoreV2FoldedExecution;
}

type CoreV2RuntimeFoldInput = Parameters<CoreV2ExecutableRuntimeDescriptor['fold']>[0];

const foundationHandlers = foundationHandlersModule as unknown as HandlerFactoryRuntime;
const emptyStateHandlers = emptyStateHandlersModule as unknown as HandlerFactoryRuntime;
const dataFoundationHandlers = dataFoundationHandlersModule as unknown as HandlerFactoryRuntime;
const dataClosureHandlers = dataClosureHandlersModule as unknown as HandlerFactoryRuntime;
const lifecycleResizeHandlers = lifecycleResizeHandlersModule as unknown as HandlerFactoryRuntime;
const lifecycleDestroyHandlers = lifecycleDestroyHandlersModule as unknown as HandlerFactoryRuntime;
const lifecycleInterruptionHandlers =
  lifecycleInterruptionHandlersModule as unknown as HandlerFactoryRuntime;
const determinismLifecycleHandlers =
  determinismLifecycleHandlersModule as unknown as HandlerFactoryRuntime;
const renderFoundationHandlers = renderFoundationHandlersModule as unknown as HandlerFactoryRuntime;
const renderBoundsHandlers = renderBoundsHandlersModule as unknown as HandlerFactoryRuntime;
const renderOrientationHandlers = renderOrientationHandlersModule as unknown as HandlerFactoryRuntime;
const renderRelationsHandlers = renderRelationsHandlersModule as unknown as HandlerFactoryRuntime;
const renderImagesHandlers = renderImagesHandlersModule as unknown as HandlerFactoryRuntime;
const renderComponentAssetsHandlers = renderComponentAssetsHandlersModule as unknown as HandlerFactoryRuntime;
const renderTextHandlers = renderTextHandlersModule as unknown as HandlerFactoryRuntime;
const layoutOrderHandlers = layoutOrderHandlersModule as unknown as HandlerFactoryRuntime;
const presentationDynamicsHandlers = presentationDynamicsHandlersModule as unknown as HandlerFactoryRuntime;
const updateTransactionsHandlers = updateTransactionsHandlersModule as unknown as HandlerFactoryRuntime;
const viewportHandlers = viewportHandlersModule as unknown as HandlerFactoryRuntime;
const querySelectionHandlers = querySelectionHandlersModule as unknown as HandlerFactoryRuntime;
const pointerSelectionHandlers = pointerSelectionHandlersModule as unknown as HandlerFactoryRuntime;
const interactionEditorHandlers =
  interactionEditorHandlersModule as unknown as HandlerFactoryRuntime;
const authoringHandlers =
  authoringHandlersModule as unknown as HandlerFactoryRuntime;
const editorWorkflowHandlers =
  editorWorkflowHandlersModule as unknown as HandlerFactoryRuntime;
const assetHandlers = assetHandlersModule as unknown as HandlerFactoryRuntime;
const assetIngestionHandlers =
  assetIngestionHandlersModule as unknown as HandlerFactoryRuntime;
const historyHandlers = historyHandlersModule as unknown as HandlerFactoryRuntime;
const replacementRecoveryHandlers =
  replacementRecoveryHandlersModule as unknown as HandlerFactoryRuntime;
const exportExtractionHandlers =
  exportExtractionHandlersModule as unknown as HandlerFactoryRuntime;
const foundationFold = foundationFoldModule as unknown as FoldRuntime;
const dataFoundationFold = dataFoundationFoldModule as unknown as FoldRuntime;
const dataClosureFold = dataClosureFoldModule as unknown as FoldRuntime;
const lifecycleResizeFold = lifecycleResizeFoldModule as unknown as FoldRuntime;
const lifecycleDestroyFold = lifecycleDestroyFoldModule as unknown as FoldRuntime;
const lifecycleInterruptionFold =
  lifecycleInterruptionFoldModule as unknown as FoldRuntime;
const determinismLifecycleFold =
  determinismLifecycleFoldModule as unknown as FoldRuntime;
const renderFoundationFold = renderFoundationFoldModule as unknown as FoldRuntime;
const renderBoundsFold = renderBoundsFoldModule as unknown as FoldRuntime;
const renderOrientationFold = renderOrientationFoldModule as unknown as FoldRuntime;
const renderRelationsFold = renderRelationsFoldModule as unknown as FoldRuntime;
const renderImagesFold = renderImagesFoldModule as unknown as FoldRuntime;
const renderComponentAssetsFold = renderComponentAssetsFoldModule as unknown as FoldRuntime;
const renderTextFold = renderTextFoldModule as unknown as FoldRuntime;
const layoutOrderFold = layoutOrderFoldModule as unknown as FoldRuntime;
const presentationDynamicsFold = presentationDynamicsFoldModule as unknown as FoldRuntime;
const updateTransactionsFold = updateTransactionsFoldModule as unknown as FoldRuntime;
const viewportFold = viewportFoldModule as unknown as FoldRuntime;
const querySelectionFold = querySelectionFoldModule as unknown as FoldRuntime;
const pointerSelectionFold = pointerSelectionFoldModule as unknown as FoldRuntime;
const interactionEditorFold =
  interactionEditorFoldModule as unknown as FoldRuntime;
const authoringFold =
  authoringFoldModule as unknown as FoldRuntime;
const editorWorkflowFold =
  editorWorkflowFoldModule as unknown as FoldRuntime;
const assetFold = assetFoldModule as unknown as FoldRuntime;
const assetIngestionFold =
  assetIngestionFoldModule as unknown as FoldRuntime;
const historyFold = historyFoldModule as unknown as FoldRuntime;
const replacementRecoveryFold =
  replacementRecoveryFoldModule as unknown as FoldRuntime;
const exportExtractionFold =
  exportExtractionFoldModule as unknown as FoldRuntime;

const FOUNDATION_CASE_IDS = new Set<CoreV2ExecutableCaseId>([
  'LIF-001',
  'LIF-002',
  'DAT-001',
  'DAT-002',
  'CSM-001',
  'CSM-003',
]);
const DATA_FOUNDATION_CASE_IDS = new Set<CoreV2ExecutableCaseId>([
  'DAT-003',
  'DAT-004',
  'DAT-005',
]);
const DATA_CLOSURE_CASE_IDS = new Set<CoreV2ExecutableCaseId>([
  'DAT-006',
  'DAT-007',
  'DAT-008',
]);
const RENDER_FOUNDATION_CASE_IDS = new Set<CoreV2ExecutableCaseId>([
  'LAY-001',
  'REN-001',
  'REN-004',
  'REN-003',
  'REN-002',
]);
const UPDATE_TRANSACTION_CASE_IDS = new Set<CoreV2UpdateTransactionsCaseId>(
  CORE_V2_UPDATE_TRANSACTIONS_CASE_IDS,
);
const VIEWPORT_CASE_IDS = new Set<CoreV2ViewportCaseId>(CORE_V2_VIEWPORT_CASE_IDS);
const QUERY_SELECTION_CASE_IDS = new Set<CoreV2QuerySelectionCaseId>(
  CORE_V2_QUERY_SELECTION_CASE_IDS,
);
const POINTER_SELECTION_CASE_IDS = new Set<CoreV2PointerSelectionCaseId>(
  CORE_V2_POINTER_SELECTION_CASE_IDS,
);
const INTERACTION_EDITOR_CASE_IDS = new Set<CoreV2InteractionEditorCaseId>(
  CORE_V2_INTERACTION_EDITOR_CASE_IDS,
);
const AUTHORING_CASE_IDS = new Set<CoreV2AuthoringCaseId>(
  CORE_V2_AUTHORING_CASE_IDS,
);
const EDITOR_WORKFLOW_CASE_IDS = new Set<CoreV2EditorWorkflowCaseId>(
  CORE_V2_EDITOR_WORKFLOW_CASE_IDS,
);
const HISTORY_CASE_IDS = new Set<CoreV2HistoryCaseId>(
  CORE_V2_HISTORY_CASE_IDS,
);
const REPLACEMENT_RECOVERY_CASE_IDS = new Set<CoreV2ReplacementRecoveryCaseId>(
  CORE_V2_REPLACEMENT_RECOVERY_CASE_IDS,
);
const LIFECYCLE_INTERRUPTION_CASE_IDS = new Set<CoreV2LifecycleInterruptionCaseId>(
  CORE_V2_LIFECYCLE_INTERRUPTION_CASE_IDS,
);
const DETERMINISM_LIFECYCLE_CASE_IDS =
  new Set<CoreV2DeterminismLifecycleCaseId>(
    CORE_V2_DETERMINISM_LIFECYCLE_CASE_IDS,
  );
const EXPORT_EXTRACTION_CASE_IDS = new Set<CoreV2ExportExtractionCaseId>(
  CORE_V2_EXPORT_EXTRACTION_CASE_IDS,
);
const ASSET_INGESTION_CASE_IDS = new Set<CoreV2ExecutableCaseId>([
  'ERR-003',
  'AST-002',
  'AST-003',
  'SEC-001',
  'CSM-032',
]);

const DATA_FOUNDATION_PRODUCT = Object.freeze({
  createColorResolver: createCoreV2ColorResolver,
  constructPixiColor(value: unknown): Color {
    return new Color(value as ColorSource);
  },
  resolveComponentSize: resolveCoreV2ComponentSize,
  resolveContentBox: resolveCoreV2ContentBox,
  materializeGrid: materializeCoreV2Grid,
  setGridCell: setCoreV2GridCell,
});

const DATA_CLOSURE_PRODUCT = Object.freeze({
  materializeDataset: materializeCoreV2Dataset,
});

const LIFECYCLE_DESTROY_PRODUCT = Object.freeze({
  inspectEngineResources(engine: unknown): Readonly<Record<string, unknown>> {
    const inspectable = requireInspectableEngine(engine);
    const snapshot = inspectable.snapshot();
    const semantic = inspectable.semanticProbe();
    // These are public logical counters only. pendingWork is the closest public
    // scheduler-work boundary; logicalDatasetRootCount is not a heap-retention
    // claim and stays zero only after the engine releases its authoritative scene.
    return deepFreeze({
      dom: { canvasCount: snapshot.resources.canvasCount },
      subscriptions: { count: snapshot.resources.subscriptions.active },
      tickerTasks: { count: snapshot.pendingWork },
      animations: { count: semantic.interaction.activeAnimationCount ?? 0 },
      history: { depth: semantic.history.depth ?? snapshot.historyDepth },
      retained: {
        logicalDatasetRootCount: semantic.dataset.rootIds.length,
      },
    });
  },
});

const FOUNDATION_DESCRIPTOR = createDescriptor({
  key: 'foundation',
  needsSupplementalWebGLLease: false,
  createEntries: () => [
    ...requireFactory(foundationHandlers.createFoundationHandlerEntries, 'foundation handlers')(),
    ...requireFactory(emptyStateHandlers.createEmptyStateHandlerEntries, 'empty-state handlers')(),
  ],
  fold: requireFold(foundationFold.foldFoundationExecution, 'foundation fold'),
});

const DATA_FOUNDATION_DESCRIPTOR = createDescriptor({
  key: 'data-foundation',
  needsSupplementalWebGLLease: true,
  createEntries: () => requireFactory(
    dataFoundationHandlers.createDataFoundationHandlerEntries,
    'data-foundation handlers',
  )(DATA_FOUNDATION_PRODUCT),
  fold: requireFold(dataFoundationFold.foldDataFoundationExecution, 'data-foundation fold'),
});

const DATA_CLOSURE_DESCRIPTOR = createDescriptor({
  key: 'data-closure',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    dataClosureHandlers.createDataClosureHandlerEntries,
    'data-closure handlers',
  )(DATA_CLOSURE_PRODUCT),
  fold: requireFold(dataClosureFold.foldDataClosureExecution, 'data-closure fold'),
});

const LIFECYCLE_RESIZE_DESCRIPTOR = createDescriptor({
  key: 'lifecycle-resize',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    lifecycleResizeHandlers.createLifecycleResizeHandlerEntries,
    'lifecycle-resize handlers',
  )(),
  fold: requireFold(lifecycleResizeFold.foldLifecycleResizeExecution, 'lifecycle-resize fold'),
});

const LIFECYCLE_DESTROY_DESCRIPTOR = createDescriptor({
  key: 'lifecycle-destroy',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    lifecycleDestroyHandlers.createLifecycleDestroyHandlerEntries,
    'lifecycle-destroy handlers',
  )(LIFECYCLE_DESTROY_PRODUCT),
  fold: requireFold(lifecycleDestroyFold.foldLifecycleDestroyExecution, 'lifecycle-destroy fold'),
});

const RENDER_FOUNDATION_DESCRIPTOR = createDescriptor({
  key: 'render-foundation',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    renderFoundationHandlers.createRenderFoundationHandlerEntries,
    'render-foundation handlers',
  )(),
  fold: requireFold(
    renderFoundationFold.foldRenderFoundationExecution,
    'render-foundation fold',
  ),
});

const RENDER_BOUNDS_DESCRIPTOR = createDescriptor({
  key: 'render-bounds',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    renderBoundsHandlers.createRenderBoundsHandlerEntries,
    'render-bounds handlers',
  )(),
  fold: requireFold(
    renderBoundsFold.foldRenderBoundsExecution,
    'render-bounds fold',
  ),
});

const RENDER_ORIENTATION_DESCRIPTOR = createDescriptor({
  key: 'render-orientation',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    renderOrientationHandlers.createRenderOrientationHandlerEntries,
    'render-orientation handlers',
  )(),
  fold: requireFold(
    renderOrientationFold.foldRenderOrientationExecution,
    'render-orientation fold',
  ),
});

const RENDER_RELATIONS_DESCRIPTOR = createDescriptor({
  key: 'render-relations',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    renderRelationsHandlers.createRenderRelationsHandlerEntries,
    'render-relations handlers',
  )(),
  fold: requireFold(
    renderRelationsFold.foldRenderRelationsExecution,
    'render-relations fold',
  ),
});

const ASSET_DESCRIPTOR = createAssetDescriptor();
const ASSET_INGESTION_DESCRIPTOR = createAssetIngestionDescriptor();
const RENDER_IMAGES_DESCRIPTOR = createRenderImagesDescriptor();
const RENDER_COMPONENT_ASSETS_DESCRIPTOR = createRenderComponentAssetsDescriptor();
const RENDER_TEXT_DESCRIPTOR = createRenderTextDescriptor();
const LAYOUT_ORDER_DESCRIPTOR = createLayoutOrderDescriptor();
const PRESENTATION_DYNAMICS_DESCRIPTOR = createPresentationDynamicsDescriptor();
const UPDATE_TRANSACTIONS_DESCRIPTOR = createUpdateTransactionsDescriptor();
const VIEWPORT_DESCRIPTOR = createViewportDescriptor();
const QUERY_SELECTION_DESCRIPTOR = createQuerySelectionDescriptor();
const POINTER_SELECTION_DESCRIPTOR = createPointerSelectionDescriptor();
const INTERACTION_EDITOR_DESCRIPTOR = createInteractionEditorDescriptor();
const AUTHORING_DESCRIPTOR = createAuthoringDescriptor();
const EDITOR_WORKFLOW_DESCRIPTOR = createEditorWorkflowDescriptor();
const HISTORY_DESCRIPTOR = createHistoryDescriptor();
const REPLACEMENT_RECOVERY_DESCRIPTOR = createReplacementRecoveryDescriptor();
const LIFECYCLE_INTERRUPTION_DESCRIPTOR = createLifecycleInterruptionDescriptor();
const DETERMINISM_LIFECYCLE_DESCRIPTOR = createDeterminismLifecycleDescriptor();
const EXPORT_EXTRACTION_DESCRIPTOR = createExportExtractionDescriptor();

export function resolveCoreV2ExecutableRuntime(
  caseId: CoreV2ExecutableCaseId,
): CoreV2ExecutableRuntimeDescriptor {
  if (FOUNDATION_CASE_IDS.has(caseId)) return FOUNDATION_DESCRIPTOR;
  if (DATA_FOUNDATION_CASE_IDS.has(caseId)) return DATA_FOUNDATION_DESCRIPTOR;
  if (DATA_CLOSURE_CASE_IDS.has(caseId)) return DATA_CLOSURE_DESCRIPTOR;
  if (caseId === 'LIF-004') return LIFECYCLE_RESIZE_DESCRIPTOR;
  if (caseId === 'LIF-005') return LIFECYCLE_DESTROY_DESCRIPTOR;
  if (RENDER_FOUNDATION_CASE_IDS.has(caseId)) return RENDER_FOUNDATION_DESCRIPTOR;
  if (caseId === 'LAY-004') return RENDER_ORIENTATION_DESCRIPTOR;
  if (caseId === 'LAY-005') return RENDER_BOUNDS_DESCRIPTOR;
  if (caseId === 'REN-007') return RENDER_RELATIONS_DESCRIPTOR;
  if (caseId === 'REN-005') return RENDER_IMAGES_DESCRIPTOR;
  if (caseId === 'REN-006' || caseId === 'REN-011') return RENDER_TEXT_DESCRIPTOR;
  if (caseId === 'REN-008' || caseId === 'REN-010') return RENDER_COMPONENT_ASSETS_DESCRIPTOR;
  if (caseId === 'LAY-002' || caseId === 'LAY-003') return LAYOUT_ORDER_DESCRIPTOR;
  if (
    caseId === 'UPD-005'
    || caseId === 'REN-009'
    || caseId === 'ANI-001'
    || caseId === 'ANI-002'
  ) return PRESENTATION_DYNAMICS_DESCRIPTOR;
  if (isUpdateTransactionCaseId(caseId)) return UPDATE_TRANSACTIONS_DESCRIPTOR;
  if (isQuerySelectionCaseId(caseId)) return QUERY_SELECTION_DESCRIPTOR;
  if (isPointerSelectionCaseId(caseId)) return POINTER_SELECTION_DESCRIPTOR;
  if (isInteractionEditorCaseId(caseId)) return INTERACTION_EDITOR_DESCRIPTOR;
  if (isEditorWorkflowCaseId(caseId)) return EDITOR_WORKFLOW_DESCRIPTOR;
  if (isAuthoringCaseId(caseId)) return AUTHORING_DESCRIPTOR;
  if (isHistoryCaseId(caseId)) return HISTORY_DESCRIPTOR;
  if (isReplacementRecoveryCaseId(caseId)) return REPLACEMENT_RECOVERY_DESCRIPTOR;
  if (isLifecycleInterruptionCaseId(caseId)) return LIFECYCLE_INTERRUPTION_DESCRIPTOR;
  if (isDeterminismLifecycleCaseId(caseId)) return DETERMINISM_LIFECYCLE_DESCRIPTOR;
  if (isExportExtractionCaseId(caseId)) return EXPORT_EXTRACTION_DESCRIPTOR;
  if (isViewportCaseId(caseId)) return VIEWPORT_DESCRIPTOR;
  if (ASSET_INGESTION_CASE_IDS.has(caseId)) return ASSET_INGESTION_DESCRIPTOR;
  if (caseId === 'AST-001') return ASSET_DESCRIPTOR;
  throw new Error(`Unsupported Core v2 executable runtime: ${String(caseId)}`);
}

function createLifecycleInterruptionDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    lifecycleInterruptionFold.foldLifecycleInterruptionExecution,
    'lifecycle-interruption fold',
  );
  const createEntries = requireFactory(
    lifecycleInterruptionHandlers.createLifecycleInterruptionHandlerEntries,
    'lifecycle-interruption handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(
      isLifecycleInterruptionCaseId(plan.id),
      'lifecycle-interruption case identity',
    );
    const runtime = createCoreV2LifecycleInterruptionRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      actionTimeoutMs: 60_000,
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'lifecycle-interruption',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isLifecycleInterruptionCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2LifecycleInterruptionCaseId {
  return LIFECYCLE_INTERRUPTION_CASE_IDS.has(
    caseId as CoreV2LifecycleInterruptionCaseId,
  );
}

function createDeterminismLifecycleDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    determinismLifecycleFold.foldDeterminismLifecycleExecution,
    'determinism-lifecycle fold',
  );
  const createEntries = requireFactory(
    determinismLifecycleHandlers.createDeterminismLifecycleHandlerEntries,
    'determinism-lifecycle handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(
      isDeterminismLifecycleCaseId(plan.id),
      'determinism-lifecycle case identity',
    );
    const runtime = createCoreV2DeterminismLifecycleRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(
          runtime.product as unknown as Readonly<Record<string, unknown>>,
        ),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'determinism-lifecycle',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isDeterminismLifecycleCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2DeterminismLifecycleCaseId {
  return DETERMINISM_LIFECYCLE_CASE_IDS.has(
    caseId as CoreV2DeterminismLifecycleCaseId,
  );
}

function createExportExtractionDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    exportExtractionFold.foldExportExtractionExecution,
    'export-extraction fold',
  );
  const createEntries = requireFactory(
    exportExtractionHandlers.createExportExtractionHandlerEntries,
    'export-extraction handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(isExportExtractionCaseId(plan.id), 'export-extraction case identity');
    const runtime = createCoreV2ExportExtractionRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      actionTimeoutMs: 60_000,
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'export-extraction',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isExportExtractionCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2ExportExtractionCaseId {
  return EXPORT_EXTRACTION_CASE_IDS.has(
    caseId as CoreV2ExportExtractionCaseId,
  );
}

function createReplacementRecoveryDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    replacementRecoveryFold.foldReplacementRecoveryExecution,
    'replacement-recovery fold',
  );
  const createEntries = requireFactory(
    replacementRecoveryHandlers.createReplacementRecoveryHandlerEntries,
    'replacement-recovery handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(isReplacementRecoveryCaseId(plan.id), 'replacement-recovery case identity');
    const runtime = createCoreV2ReplacementRecoveryRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'replacement-recovery',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isReplacementRecoveryCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2ReplacementRecoveryCaseId {
  return REPLACEMENT_RECOVERY_CASE_IDS.has(
    caseId as CoreV2ReplacementRecoveryCaseId,
  );
}

function createUpdateTransactionsDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    updateTransactionsFold.foldUpdateTransactionExecution,
    'update-transactions fold',
  );
  const createEntries = requireFactory(
    updateTransactionsHandlers.createUpdateTransactionHandlerEntries,
    'update-transactions handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(isUpdateTransactionCaseId(plan.id), 'update-transactions case identity');
    const runtime = createCoreV2UpdateTransactionsRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'update-transactions',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isUpdateTransactionCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2UpdateTransactionsCaseId {
  return UPDATE_TRANSACTION_CASE_IDS.has(caseId as CoreV2UpdateTransactionsCaseId);
}

function createViewportDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    viewportFold.foldViewportExecution,
    'viewport fold',
  );
  const createEntries = requireFactory(
    viewportHandlers.createViewportHandlerEntries,
    'viewport handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(isViewportCaseId(plan.id), 'viewport case identity');
    const runtime = createCoreV2ViewportRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'viewport',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isViewportCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2ViewportCaseId {
  return VIEWPORT_CASE_IDS.has(caseId as CoreV2ViewportCaseId);
}

function createQuerySelectionDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    querySelectionFold.foldQuerySelectionExecution,
    'query-selection fold',
  );
  const createEntries = requireFactory(
    querySelectionHandlers.createQuerySelectionHandlerEntries,
    'query-selection handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(isQuerySelectionCaseId(plan.id), 'query-selection case identity');
    const runtime = createCoreV2QuerySelectionRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'query-selection',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isQuerySelectionCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2QuerySelectionCaseId {
  return QUERY_SELECTION_CASE_IDS.has(caseId as CoreV2QuerySelectionCaseId);
}

function createPointerSelectionDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    pointerSelectionFold.foldPointerSelectionExecution,
    'pointer-selection fold',
  );
  const createEntries = requireFactory(
    pointerSelectionHandlers.createPointerSelectionHandlerEntries,
    'pointer-selection handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(isPointerSelectionCaseId(plan.id), 'pointer-selection case identity');
    const runtime = createCoreV2PointerSelectionRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'pointer-selection',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isPointerSelectionCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2PointerSelectionCaseId {
  return POINTER_SELECTION_CASE_IDS.has(caseId as CoreV2PointerSelectionCaseId);
}

function createInteractionEditorDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    interactionEditorFold.foldInteractionEditorExecution,
    'interaction-editor fold',
  );
  const createEntries = requireFactory(
    interactionEditorHandlers.createInteractionEditorHandlerEntries,
    'interaction-editor handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(isInteractionEditorCaseId(plan.id), 'interaction-editor case identity');
    const runtime = createCoreV2InteractionEditorRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'interaction-editor',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isInteractionEditorCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2InteractionEditorCaseId {
  return INTERACTION_EDITOR_CASE_IDS.has(
    caseId as CoreV2InteractionEditorCaseId,
  );
}

function createEditorWorkflowDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    editorWorkflowFold.foldEditorWorkflowExecution,
    'editor-workflow fold',
  );
  const createEntries = requireFactory(
    editorWorkflowHandlers.createEditorWorkflowHandlerEntries,
    'editor-workflow handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(isEditorWorkflowCaseId(plan.id), 'editor-workflow case identity');
    const runtime = createCoreV2EditorWorkflowRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'editor-workflow',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isEditorWorkflowCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2EditorWorkflowCaseId {
  return EDITOR_WORKFLOW_CASE_IDS.has(caseId as CoreV2EditorWorkflowCaseId);
}

function createAuthoringDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    authoringFold.foldAuthoringExecution,
    'authoring fold',
  );
  const createEntries = requireFactory(
    authoringHandlers.createAuthoringHandlerEntries,
    'authoring handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(isAuthoringCaseId(plan.id), 'authoring case identity');
    const runtime = createCoreV2AuthoringRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'authoring',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isAuthoringCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2AuthoringCaseId {
  return AUTHORING_CASE_IDS.has(caseId as CoreV2AuthoringCaseId);
}

function createHistoryDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    historyFold.foldHistoryExecution,
    'history fold',
  );
  const createEntries = requireFactory(
    historyHandlers.createHistoryHandlerEntries,
    'history handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(isHistoryCaseId(plan.id), 'history case identity');
    const runtime = createCoreV2HistoryRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'history',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function isHistoryCaseId(
  caseId: CoreV2ExecutableCaseId,
): caseId is CoreV2HistoryCaseId {
  return HISTORY_CASE_IDS.has(caseId as CoreV2HistoryCaseId);
}

function createLayoutOrderDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    layoutOrderFold.foldLayoutOrderExecution,
    'layout-order fold',
  );
  const createEntries = requireFactory(
    layoutOrderHandlers.createLayoutOrderHandlerEntries,
    'layout-order handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(plan.id === 'LAY-002' || plan.id === 'LAY-003', 'layout-order case identity');
    const runtime = createCoreV2LayoutOrderRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'layout-order',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function createPresentationDynamicsDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    presentationDynamicsFold.foldPresentationDynamicsExecution,
    'presentation-dynamics fold',
  );
  const createEntries = requireFactory(
    presentationDynamicsHandlers.createPresentationDynamicsHandlerEntries,
    'presentation-dynamics handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(
      plan.id === 'UPD-005'
        || plan.id === 'REN-009'
        || plan.id === 'ANI-001'
        || plan.id === 'ANI-002',
      'presentation-dynamics case identity',
    );
    const runtime = createCoreV2PresentationDynamicsRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'presentation-dynamics',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function createRenderTextDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    renderTextFold.foldRenderTextExecution,
    'render-text fold',
  );
  const createEntries = requireFactory(
    renderTextHandlers.createRenderTextHandlerEntries,
    'render-text handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    invariant(plan.id === 'REN-006' || plan.id === 'REN-011', 'render-text case identity');
    const runtime = createCoreV2RenderTextRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'render-text',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function createRenderComponentAssetsDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    renderComponentAssetsFold.foldRenderComponentAssetExecution,
    'render-component-assets fold',
  );
  const createEntries = requireFactory(
    renderComponentAssetsHandlers.createRenderComponentAssetHandlerEntries,
    'render-component-assets handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    const runtime = createCoreV2RenderComponentAssetsRuntime();
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({
        assetRuntime: runtime.assetRuntime,
        assetPolicy: runtime.assetPolicy,
      }),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'render-component-assets',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function createRenderImagesDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    renderImagesFold.foldRenderImageExecution,
    'render-images fold',
  );
  const createEntries = requireFactory(
    renderImagesHandlers.createRenderImageHandlerEntries,
    'render-images handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    const runtime = createCoreV2RenderImagesRuntime();
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({
        assetRuntime: runtime.assetRuntime,
        assetPolicy: runtime.assetPolicy,
      }),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'render-images',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function createDescriptor(options: Readonly<{
  key: CoreV2ExecutableRuntimeKey;
  needsSupplementalWebGLLease: boolean;
  createEntries: () => readonly HandlerEntry[];
  fold: (
    options: Readonly<Record<string, unknown>>,
  ) => CoreV2FoldedExecution;
}>): CoreV2ExecutableRuntimeDescriptor {
  const createRun = (plan: CoreV2ExecutableCasePlan) => Object.freeze({
    handlerEntries: selectHandlerEntries(plan, options.createEntries()),
    engineOptions: Object.freeze({}),
  });
  return Object.freeze({
    key: options.key,
    needsSupplementalWebGLLease: options.needsSupplementalWebGLLease,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return options.fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

const AST_REQUIRED_ASSET_SOURCE = 'fixture://required-init-failure.png';
const AST_DEVICE_SOURCE = 'core-v2-builtin://images/device.svg';

function createAssetDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(assetFold.foldAssetExecution, 'asset fold');
  const createEntries = requireFactory(
    assetHandlers.createAssetHandlerEntries,
    'asset handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    const assetRuntime = new CoreV2AssetRuntime(createAstPixiAssetBackend());
    const product = createAssetProductAdapter(assetRuntime);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(plan, createEntries(product)),
      engineOptions: Object.freeze({
        assetRuntime,
        assetPolicy: AST_ASSET_POLICY,
      }),
    });
  };
  return Object.freeze({
    key: 'assets',
    needsSupplementalWebGLLease: true,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function createAssetIngestionDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    assetIngestionFold.foldAssetIngestionExecution,
    'asset-ingestion fold',
  );
  const createEntries = requireFactory(
    assetIngestionHandlers.createAssetIngestionHandlerEntries,
    'asset-ingestion handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    const runtime = createCoreV2AssetIngestionRuntime();
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({
        assetRuntime: runtime.assetRuntime,
        assetPolicy: runtime.assetPolicy,
      }),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'asset-ingestion',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function selectHandlerEntries(
  plan: CoreV2ExecutableCasePlan,
  entries: readonly HandlerEntry[],
): readonly HandlerEntry[] {
  const required = new Set(plan.actionTrace.map((action) => `contract/${action.type}`));
  const selected = entries.filter(([handlerId]) => required.has(handlerId));
  invariant(selected.length === required.size, `${plan.id} exact handler coverage`);
  invariant(
    new Set(selected.map(([handlerId]) => handlerId)).size === selected.length,
    `${plan.id} handler collisions`,
  );
  return Object.freeze(selected);
}

const AST_ASSET_POLICY: CoreV2AssetPolicy = (
  context: CoreV2AssetPolicyContext,
): void => {
  if (context.packageOwned || isRequiredFailureDescriptor(context.descriptor)) return;
  throw new CoreV2AssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
};

function createAstPixiAssetBackend(): CoreV2AssetBackend {
  const pixi = createCoreV2PixiAssetBackend();
  const loadedKeys = new Set<string>();
  const nonBrowserResources = new Map<string, Readonly<Record<string, unknown>>>();
  const hasBrowserAssetEnvironment = typeof document !== 'undefined';
  return Object.freeze({
    get(request: CoreV2AssetBackendRequest): unknown {
      const kind = classifyAstAssetRequest(request);
      if (kind === 'required-failure') return undefined;
      return hasBrowserAssetEnvironment
        ? pixi.get(request)
        : nonBrowserResources.get(request.key);
    },
    async load(request: CoreV2AssetBackendRequest): Promise<unknown> {
      const kind = classifyAstAssetRequest(request);
      if (kind === 'required-failure') {
        throw new CoreV2AssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
      }
      invariant(request.descriptor.src === AST_DEVICE_SOURCE, 'AST-001 loads only device builtin');
      // The focused Lab always has a DOM and therefore exercises public Pixi
      // Assets. Node Vitest intentionally has no DOM adapter; its resource only
      // supplies a stable object identity for the exact handler/fold contract.
      if (!hasBrowserAssetEnvironment) {
        const resource = deepFreeze({
          kind: 'non-browser-asset-identity',
          cacheIdentity: request.cacheIdentity,
        });
        nonBrowserResources.set(request.key, resource);
        loadedKeys.add(request.key);
        return resource;
      }
      const resource = await pixi.load(request);
      loadedKeys.add(request.key);
      return resource;
    },
    async unload(key: string): Promise<void> {
      invariant(loadedKeys.has(key), 'AST-001 unload owns the Pixi asset key');
      try {
        if (hasBrowserAssetEnvironment) {
          await pixi.unload(key);
        } else {
          nonBrowserResources.delete(key);
        }
      } finally {
        loadedKeys.delete(key);
      }
    },
  });
}

function classifyAstAssetRequest(
  request: CoreV2AssetBackendRequest,
): 'package-builtin' | 'required-failure' {
  if (request.packageOwned) return 'package-builtin';
  if (isRequiredFailureDescriptor(request.descriptor)) return 'required-failure';
  throw new CoreV2AssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
}

function isRequiredFailureDescriptor(descriptor: CoreV2AssetDescriptor): boolean {
  return Object.keys(descriptor).length === 1
    && descriptor.src === AST_REQUIRED_ASSET_SOURCE;
}

function createAssetProductAdapter(
  assetRuntime: CoreV2AssetRuntime,
): Readonly<Record<string, unknown>> {
  const acquisitions = new WeakMap<object, Map<string, Readonly<{
    cacheIdentity: string;
    resourceToken: string;
  }>>>();
  const resourceTokens = new WeakMap<object, string>();
  let resourceSequence = 0;

  const tokenFor = (resource: unknown): string => {
    invariant(isObjectLike(resource), 'asset acquisition resource identity');
    const existing = resourceTokens.get(resource);
    if (existing) return existing;
    const token = `asset-resource-${++resourceSequence}`;
    resourceTokens.set(resource, token);
    return token;
  };

  return Object.freeze({
    registerAssets(engineValue: unknown, optionsValue: unknown): Readonly<Record<string, unknown>> {
      const engine = requireAssetEngine(engineValue);
      const options = requireRuntimeRecord(optionsValue, 'registerAssets options');
      const instanceId = requireRuntimeString(options.instanceId, 'registerAssets instanceId');
      const aliases = requireRuntimeStringArray(options.aliases, 'registerAssets aliases');
      invariant(
        sameRuntimeArray(aliases, CORE_V2_BUILTIN_ASSETS.map(({ alias }) => alias)),
        'AST-001 builtin alias inventory',
      );
      const result = engine.registerAssets(instanceId, CORE_V2_BUILTIN_ASSETS);
      return deepFreeze({
        registeredAliases: [...result.registeredAliases],
        duplicateAliases: [...result.duplicateAliases],
      });
    },
    initializeWithRequiredAssetFailure(
      engineValue: unknown,
      optionsValue: unknown,
    ) {
      const engine = requireAssetEngine(engineValue);
      const options = requireRuntimeRecord(optionsValue, 'required failure options');
      const alias = requireRuntimeString(options.alias, 'required failure alias');
      const source = requireRuntimeString(options.source, 'required failure source');
      const instanceId = requireRuntimeString(options.instanceId, 'required failure instanceId');
      invariant(source === AST_REQUIRED_ASSET_SOURCE, 'AST-001 required failure source');
      return engine.initialize({
        instanceId,
        width: 800,
        height: 600,
        pixelRatio: 1,
        strategy: 'mesh',
        preference: 'webgl',
        requiredAssets: Object.freeze([
          Object.freeze({ alias, descriptor: source, kind: 'image' as const }),
        ]),
      });
    },
    async acquireAsset(
      engineValue: unknown,
      optionsValue: unknown,
    ): Promise<Readonly<Record<string, unknown>>> {
      const engine = requireAssetEngine(engineValue);
      const options = requireRuntimeRecord(optionsValue, 'acquireAsset options');
      const instanceId = requireRuntimeString(options.instanceId, 'acquireAsset instanceId');
      const alias = requireRuntimeString(options.alias, 'acquireAsset alias');
      invariant(engine.assetProbe().session?.instanceId === instanceId, 'acquireAsset instance identity');
      const acquisition = await engine.acquireAsset(alias);
      const resourceToken = tokenFor(acquisition.resource);
      const byAlias = acquisitions.get(engine) ?? new Map<string, Readonly<{
        cacheIdentity: string;
        resourceToken: string;
      }>>();
      byAlias.set(alias, Object.freeze({
        cacheIdentity: acquisition.cacheIdentity,
        resourceToken,
      }));
      acquisitions.set(engine, byAlias);
      return Object.freeze({
        cacheIdentity: acquisition.cacheIdentity,
        resourceToken,
      });
    },
    registerAlias(optionsValue: unknown): Readonly<Record<string, unknown>> {
      const options = requireRuntimeRecord(optionsValue, 'registerAlias options');
      const alias = requireRuntimeString(options.alias, 'registerAlias alias');
      const descriptor = requireRuntimeRecord(options.descriptor, 'registerAlias descriptor');
      invariant(Object.keys(descriptor).length === 1, 'registerAlias descriptor keys');
      const src = requireRuntimeString(descriptor.src, 'registerAlias descriptor src');
      const result = assetRuntime.registerAlias({ alias, descriptor: { src } });
      return deepFreeze({
        registeredAliases: [...result.registeredAliases],
        duplicateAliases: [...result.duplicateAliases],
      });
    },
    inspectAssetState(optionsValue: unknown): Readonly<Record<string, unknown>> {
      const options = requireRuntimeRecord(optionsValue, 'inspectAssetState options');
      const alias = requireRuntimeString(options.alias, 'inspectAssetState alias');
      const engine = options.engine === null ? null : requireAssetEngine(options.engine);
      const runtimeProbe = engine?.assetProbe(alias).runtime ?? assetRuntime.probe(alias);
      const acquisition = engine ? acquisitions.get(engine)?.get(alias) : undefined;
      return deepFreeze({
        catalog: {
          imageAliases: [...runtimeProbe.builtins.aliases],
          fontWeights: [...runtimeProbe.fonts.weights],
        },
        selected: {
          alias,
          cacheKey: acquisition?.cacheIdentity ?? null,
          resourceCount: runtimeProbe.resource?.resourceCount ?? 0,
          leaseCount: runtimeProbe.resource?.leaseCount ?? 0,
          pendingUserCount: runtimeProbe.resource?.pendingCount ?? 0,
          resourceToken: acquisition?.resourceToken ?? null,
        },
        totals: {
          resourceCount: runtimeProbe.resourceCount,
          leaseCount: runtimeProbe.leaseCount,
          pendingCount: runtimeProbe.pendingCount,
        },
      });
    },
  });
}

function requireAssetEngine(value: unknown): CoreV2Engine {
  invariant(isObjectLike(value), 'asset engine');
  for (const method of [
    'registerAssets',
    'initialize',
    'acquireAsset',
    'assetProbe',
  ]) {
    invariant(typeof (value as Record<string, unknown>)[method] === 'function', `asset engine ${method}()`);
  }
  return value as CoreV2Engine;
}

function requireRuntimeRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  invariant(isRecord(value), label);
  return value;
}

function requireRuntimeString(value: unknown, label: string): string {
  invariant(typeof value === 'string' && value.length > 0, label);
  return value;
}

function requireRuntimeStringArray(value: unknown, label: string): readonly string[] {
  invariant(Array.isArray(value), label);
  return value.map((entry, index) => requireRuntimeString(entry, `${label} ${index}`));
}

function sameRuntimeArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isObjectLike(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function requireFactory<T extends (...args: never[]) => readonly HandlerEntry[]>(
  value: T | undefined,
  label: string,
): T {
  invariant(typeof value === 'function', `${label} export`);
  return value;
}

function requireFold(
  value: ((options: Readonly<Record<string, unknown>>) => CoreV2FoldedExecution) | undefined,
  label: string,
): (options: Readonly<Record<string, unknown>>) => CoreV2FoldedExecution {
  invariant(typeof value === 'function', `${label} export`);
  return value;
}

interface InspectableEngine {
  snapshot(): CoreV2EngineSnapshot;
  semanticProbe(): CoreV2SemanticProductProbe;
}

function requireInspectableEngine(value: unknown): InspectableEngine {
  invariant(isRecord(value), 'lifecycle engine inspection target');
  invariant(typeof value.snapshot === 'function', 'lifecycle engine snapshot()');
  invariant(typeof value.semanticProbe === 'function', 'lifecycle engine semanticProbe()');
  return value as unknown as InspectableEngine;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Core v2 executable Lab runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
