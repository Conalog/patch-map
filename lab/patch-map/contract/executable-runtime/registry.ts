import type {
  PatchMapExecutableCaseId,
  PatchMapExecutableCasePlan,
} from '../executable-cases';
import { createPatchMapLayoutOrderRuntime } from '../layout-order-runtime';
import { createPatchMapPresentationDynamicsRuntime } from '../presentation-dynamics-runtime';
import {
  createPatchMapUpdateTransactionsRuntime,
} from '../update-transactions-runtime';
import {
  createPatchMapViewportRuntime,
} from '../viewport-runtime';
import {
  createPatchMapQuerySelectionRuntime,
} from '../query-selection-runtime';
import {
  createPatchMapPointerSelectionRuntime,
} from '../pointer-selection-runtime';
import {
  createPatchMapInteractionEditorRuntime,
} from '../interaction-editor-runtime';
import {
  createPatchMapAuthoringRuntime,
} from '../authoring-runtime';
import {
  createPatchMapEditorWorkflowRuntime,
} from '../editor-workflow-runtime';
import { createPatchMapRenderComponentAssetsRuntime } from '../render-component-assets-runtime';
import { createPatchMapRenderImagesRuntime } from '../render-images-runtime';
import { createPatchMapRenderTextRuntime } from '../render-text-runtime';
import {
  createPatchMapHistoryRuntime,
} from '../history-runtime';
import {
  createPatchMapReplacementRecoveryRuntime,
} from '../replacement-recovery-runtime';
import {
  createPatchMapLifecycleInterruptionRuntime,
} from '../lifecycle-interruption-runtime';
import {
  createPatchMapDeterminismLifecycleRuntime,
} from '../determinism-lifecycle-runtime';
import {
  createPatchMapExportExtractionRuntime,
} from '../export-extraction-runtime';
import { createPatchMapAssetIngestionRuntime } from '../asset-ingestion-runtime';
import {
  createPatchMapSecurityOperationsRuntime,
} from '../security-operations-runtime';
import {
  createPatchMapAccessibilityRuntime,
} from '../accessibility-runtime';
import {
  createPatchMapMigrationRuntime,
} from '../migration-runtime';
import {
  createPatchMapPackageIntegrationRuntime,
} from '../package-integration-runtime';
import {
  createPatchMapPerformanceRuntime,
} from '../performance-runtime';
import {
  isAccessibilityCaseId,
  isAuthoringCaseId,
  isDeterminismLifecycleCaseId,
  isEditorWorkflowCaseId,
  isExportExtractionCaseId,
  isHistoryCaseId,
  isInteractionEditorCaseId,
  isLifecycleInterruptionCaseId,
  isMigrationCaseId,
  isPackageIntegrationCaseId,
  isPerformanceCaseId,
  isPixijsIntegrationCaseId,
  isPointerSelectionCaseId,
  isQuerySelectionCaseId,
  isReplacementRecoveryCaseId,
  isSecurityOperationsCaseId,
  isUpdateTransactionCaseId,
  isViewportCaseId,
  routePatchMapExecutableCase,
  type PatchMapExecutableRoute,
} from './case-routing';
import type {
  PatchMapExecutableRuntimeDescriptor,
} from './contracts';
import {
  createPatchMapExecutableDescriptor as createDescriptor,
  createPatchMapRuntimeDescriptor,
  patchMapExecutableInvariant as invariant,
  requirePatchMapFold as requireFold,
  requirePatchMapHandlerFactory as requireFactory,
  selectPatchMapHandlerEntries as selectHandlerEntries,
} from './descriptor';
import {
  PATCH_MAP_FOLD_MODULES,
  PATCH_MAP_HANDLER_MODULES,
} from './script-modules';
import { createPatchMapAstAssetRuntime } from './ast-asset-product';
import {
  PATCH_MAP_DATA_CLOSURE_PRODUCT,
  PATCH_MAP_DATA_FOUNDATION_PRODUCT,
  PATCH_MAP_LIFECYCLE_DESTROY_PRODUCT,
} from './foundation-products';

const {
  accessibility: accessibilityHandlers,
  assetIngestion: assetIngestionHandlers,
  assets: assetHandlers,
  authoring: authoringHandlers,
  dataClosure: dataClosureHandlers,
  dataFoundation: dataFoundationHandlers,
  determinismLifecycle: determinismLifecycleHandlers,
  editorWorkflow: editorWorkflowHandlers,
  emptyState: emptyStateHandlers,
  exportExtraction: exportExtractionHandlers,
  foundation: foundationHandlers,
  history: historyHandlers,
  interactionEditor: interactionEditorHandlers,
  layoutOrder: layoutOrderHandlers,
  lifecycleDestroy: lifecycleDestroyHandlers,
  lifecycleInterruption: lifecycleInterruptionHandlers,
  lifecycleResize: lifecycleResizeHandlers,
  migration: migrationHandlers,
  packageIntegration: packageIntegrationHandlers,
  performance: performanceHandlers,
  pixijsIntegration: pixijsIntegrationHandlers,
  pointerSelection: pointerSelectionHandlers,
  presentationDynamics: presentationDynamicsHandlers,
  querySelection: querySelectionHandlers,
  renderBounds: renderBoundsHandlers,
  renderComponentAssets: renderComponentAssetsHandlers,
  renderFoundation: renderFoundationHandlers,
  renderImages: renderImagesHandlers,
  renderOrientation: renderOrientationHandlers,
  renderRelations: renderRelationsHandlers,
  renderText: renderTextHandlers,
  replacementRecovery: replacementRecoveryHandlers,
  securityOperations: securityOperationsHandlers,
  updateTransactions: updateTransactionsHandlers,
  viewport: viewportHandlers,
} = PATCH_MAP_HANDLER_MODULES;

const {
  accessibility: accessibilityFold,
  assetIngestion: assetIngestionFold,
  assets: assetFold,
  authoring: authoringFold,
  dataClosure: dataClosureFold,
  dataFoundation: dataFoundationFold,
  determinismLifecycle: determinismLifecycleFold,
  editorWorkflow: editorWorkflowFold,
  exportExtraction: exportExtractionFold,
  foundation: foundationFold,
  history: historyFold,
  interactionEditor: interactionEditorFold,
  layoutOrder: layoutOrderFold,
  lifecycleDestroy: lifecycleDestroyFold,
  lifecycleInterruption: lifecycleInterruptionFold,
  lifecycleResize: lifecycleResizeFold,
  migration: migrationFold,
  packageIntegration: packageIntegrationFold,
  performance: performanceFold,
  pixijsIntegration: pixijsIntegrationFold,
  pointerSelection: pointerSelectionFold,
  presentationDynamics: presentationDynamicsFold,
  querySelection: querySelectionFold,
  renderBounds: renderBoundsFold,
  renderComponentAssets: renderComponentAssetsFold,
  renderFoundation: renderFoundationFold,
  renderImages: renderImagesFold,
  renderOrientation: renderOrientationFold,
  renderRelations: renderRelationsFold,
  renderText: renderTextFold,
  replacementRecovery: replacementRecoveryFold,
  securityOperations: securityOperationsFold,
  updateTransactions: updateTransactionsFold,
  viewport: viewportFold,
} = PATCH_MAP_FOLD_MODULES;

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
  )(PATCH_MAP_DATA_FOUNDATION_PRODUCT),
  fold: requireFold(dataFoundationFold.foldDataFoundationExecution, 'data-foundation fold'),
});

const DATA_CLOSURE_DESCRIPTOR = createDescriptor({
  key: 'data-closure',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    dataClosureHandlers.createDataClosureHandlerEntries,
    'data-closure handlers',
  )(PATCH_MAP_DATA_CLOSURE_PRODUCT),
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
  )(PATCH_MAP_LIFECYCLE_DESTROY_PRODUCT),
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
const PIXIJS_INTEGRATION_DESCRIPTOR = createPixijsIntegrationDescriptor();
const PACKAGE_INTEGRATION_DESCRIPTOR = createPackageIntegrationDescriptor(true);
const PACKAGE_MULTI_INSTANCE_DESCRIPTOR = createPackageIntegrationDescriptor(false);
const PERFORMANCE_EVIDENCE_DESCRIPTOR = createPerformanceDescriptor(true);
const PERFORMANCE_PRODUCT_DESCRIPTOR = createPerformanceDescriptor(false);
const SECURITY_OPERATIONS_DESCRIPTOR = createSecurityOperationsDescriptor();
const ACCESSIBILITY_DESCRIPTOR = createAccessibilityDescriptor();
const MIGRATION_DESCRIPTOR = createMigrationDescriptor();

const PATCH_MAP_EXECUTABLE_DESCRIPTORS = Object.freeze({
  foundation: FOUNDATION_DESCRIPTOR,
  'data-foundation': DATA_FOUNDATION_DESCRIPTOR,
  'data-closure': DATA_CLOSURE_DESCRIPTOR,
  'lifecycle-resize': LIFECYCLE_RESIZE_DESCRIPTOR,
  'lifecycle-destroy': LIFECYCLE_DESTROY_DESCRIPTOR,
  'lifecycle-interruption': LIFECYCLE_INTERRUPTION_DESCRIPTOR,
  'determinism-lifecycle': DETERMINISM_LIFECYCLE_DESCRIPTOR,
  'render-foundation': RENDER_FOUNDATION_DESCRIPTOR,
  'render-bounds': RENDER_BOUNDS_DESCRIPTOR,
  'render-orientation': RENDER_ORIENTATION_DESCRIPTOR,
  'render-relations': RENDER_RELATIONS_DESCRIPTOR,
  'render-images': RENDER_IMAGES_DESCRIPTOR,
  'render-component-assets': RENDER_COMPONENT_ASSETS_DESCRIPTOR,
  'render-text': RENDER_TEXT_DESCRIPTOR,
  'layout-order': LAYOUT_ORDER_DESCRIPTOR,
  'presentation-dynamics': PRESENTATION_DYNAMICS_DESCRIPTOR,
  'update-transactions': UPDATE_TRANSACTIONS_DESCRIPTOR,
  viewport: VIEWPORT_DESCRIPTOR,
  'query-selection': QUERY_SELECTION_DESCRIPTOR,
  'pointer-selection': POINTER_SELECTION_DESCRIPTOR,
  'interaction-editor': INTERACTION_EDITOR_DESCRIPTOR,
  authoring: AUTHORING_DESCRIPTOR,
  'editor-workflow': EDITOR_WORKFLOW_DESCRIPTOR,
  history: HISTORY_DESCRIPTOR,
  'replacement-recovery': REPLACEMENT_RECOVERY_DESCRIPTOR,
  'export-extraction': EXPORT_EXTRACTION_DESCRIPTOR,
  'pixijs-integration': PIXIJS_INTEGRATION_DESCRIPTOR,
  'package-integration': PACKAGE_INTEGRATION_DESCRIPTOR,
  'package-multi-instance': PACKAGE_MULTI_INSTANCE_DESCRIPTOR,
  'performance-evidence': PERFORMANCE_EVIDENCE_DESCRIPTOR,
  'performance-product': PERFORMANCE_PRODUCT_DESCRIPTOR,
  'asset-ingestion': ASSET_INGESTION_DESCRIPTOR,
  'security-operations': SECURITY_OPERATIONS_DESCRIPTOR,
  accessibility: ACCESSIBILITY_DESCRIPTOR,
  migration: MIGRATION_DESCRIPTOR,
  assets: ASSET_DESCRIPTOR,
}) satisfies Readonly<
  Record<PatchMapExecutableRoute, PatchMapExecutableRuntimeDescriptor>
>;

export function resolvePatchMapExecutableRuntime(
  caseId: PatchMapExecutableCaseId,
): PatchMapExecutableRuntimeDescriptor {
  return PATCH_MAP_EXECUTABLE_DESCRIPTORS[routePatchMapExecutableCase(caseId)];
}

function createLifecycleInterruptionDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    lifecycleInterruptionFold.foldLifecycleInterruptionExecution,
    'lifecycle-interruption fold',
  );
  const createEntries = requireFactory(
    lifecycleInterruptionHandlers.createLifecycleInterruptionHandlerEntries,
    'lifecycle-interruption handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(
      isLifecycleInterruptionCaseId(plan.id),
      'lifecycle-interruption case identity',
    );
    const runtime = createPatchMapLifecycleInterruptionRuntime(plan.id);
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
  return createPatchMapRuntimeDescriptor({
    key: 'lifecycle-interruption',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createDeterminismLifecycleDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    determinismLifecycleFold.foldDeterminismLifecycleExecution,
    'determinism-lifecycle fold',
  );
  const createEntries = requireFactory(
    determinismLifecycleHandlers.createDeterminismLifecycleHandlerEntries,
    'determinism-lifecycle handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(
      isDeterminismLifecycleCaseId(plan.id),
      'determinism-lifecycle case identity',
    );
    const runtime = createPatchMapDeterminismLifecycleRuntime(plan.id);
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
  return createPatchMapRuntimeDescriptor({
    key: 'determinism-lifecycle',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createExportExtractionDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    exportExtractionFold.foldExportExtractionExecution,
    'export-extraction fold',
  );
  const createEntries = requireFactory(
    exportExtractionHandlers.createExportExtractionHandlerEntries,
    'export-extraction handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isExportExtractionCaseId(plan.id), 'export-extraction case identity');
    const runtime = createPatchMapExportExtractionRuntime(plan.id);
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
  return createPatchMapRuntimeDescriptor({
    key: 'export-extraction',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createPixijsIntegrationDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    pixijsIntegrationFold.foldPixijsIntegrationExecution,
    'PixiJS integration fold',
  );
  const createEntries = requireFactory(
    pixijsIntegrationHandlers.createPixijsIntegrationHandlerEntries,
    'PixiJS integration handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(
      isPixijsIntegrationCaseId(plan.id),
      'PixiJS integration case identity',
    );
    return Object.freeze({
      handlerEntries: selectHandlerEntries(plan, createEntries()),
      engineOptions: Object.freeze({}),
      actionTimeoutMs: 120_000,
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'pixijs-integration',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createPackageIntegrationDescriptor(
  needsSupplementalWebGLLease: boolean,
): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    packageIntegrationFold.foldPackageIntegrationExecution,
    'package integration fold',
  );
  const createEntries = requireFactory(
    packageIntegrationHandlers.createPackageIntegrationHandlerEntries,
    'package integration handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isPackageIntegrationCaseId(plan.id), 'package integration case identity');
    const runtime = createPatchMapPackageIntegrationRuntime();
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      actionTimeoutMs: 120_000,
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'package-integration',
    needsSupplementalWebGLLease,
    createRun,
    fold,
  });
}

function createPerformanceDescriptor(
  needsSupplementalWebGLLease: boolean,
): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    performanceFold.foldPerformanceExecution,
    'performance fold',
  );
  const createEntries = requireFactory(
    performanceHandlers.createPerformanceHandlerEntries,
    'performance handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isPerformanceCaseId(plan.id), 'performance case identity');
    const runtime = createPatchMapPerformanceRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(
          runtime.product as unknown as Readonly<Record<string, unknown>>,
        ),
      ),
      engineOptions: Object.freeze({}),
      actionTimeoutMs: 180_000,
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'performance',
    needsSupplementalWebGLLease,
    createRun,
    fold,
  });
}

function createReplacementRecoveryDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    replacementRecoveryFold.foldReplacementRecoveryExecution,
    'replacement-recovery fold',
  );
  const createEntries = requireFactory(
    replacementRecoveryHandlers.createReplacementRecoveryHandlerEntries,
    'replacement-recovery handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isReplacementRecoveryCaseId(plan.id), 'replacement-recovery case identity');
    const runtime = createPatchMapReplacementRecoveryRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'replacement-recovery',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createUpdateTransactionsDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    updateTransactionsFold.foldUpdateTransactionExecution,
    'update-transactions fold',
  );
  const createEntries = requireFactory(
    updateTransactionsHandlers.createUpdateTransactionHandlerEntries,
    'update-transactions handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isUpdateTransactionCaseId(plan.id), 'update-transactions case identity');
    const runtime = createPatchMapUpdateTransactionsRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'update-transactions',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createViewportDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    viewportFold.foldViewportExecution,
    'viewport fold',
  );
  const createEntries = requireFactory(
    viewportHandlers.createViewportHandlerEntries,
    'viewport handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isViewportCaseId(plan.id), 'viewport case identity');
    const runtime = createPatchMapViewportRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'viewport',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createQuerySelectionDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    querySelectionFold.foldQuerySelectionExecution,
    'query-selection fold',
  );
  const createEntries = requireFactory(
    querySelectionHandlers.createQuerySelectionHandlerEntries,
    'query-selection handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isQuerySelectionCaseId(plan.id), 'query-selection case identity');
    const runtime = createPatchMapQuerySelectionRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'query-selection',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createPointerSelectionDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    pointerSelectionFold.foldPointerSelectionExecution,
    'pointer-selection fold',
  );
  const createEntries = requireFactory(
    pointerSelectionHandlers.createPointerSelectionHandlerEntries,
    'pointer-selection handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isPointerSelectionCaseId(plan.id), 'pointer-selection case identity');
    const runtime = createPatchMapPointerSelectionRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'pointer-selection',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createInteractionEditorDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    interactionEditorFold.foldInteractionEditorExecution,
    'interaction-editor fold',
  );
  const createEntries = requireFactory(
    interactionEditorHandlers.createInteractionEditorHandlerEntries,
    'interaction-editor handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isInteractionEditorCaseId(plan.id), 'interaction-editor case identity');
    const runtime = createPatchMapInteractionEditorRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'interaction-editor',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createEditorWorkflowDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    editorWorkflowFold.foldEditorWorkflowExecution,
    'editor-workflow fold',
  );
  const createEntries = requireFactory(
    editorWorkflowHandlers.createEditorWorkflowHandlerEntries,
    'editor-workflow handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isEditorWorkflowCaseId(plan.id), 'editor-workflow case identity');
    const runtime = createPatchMapEditorWorkflowRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'editor-workflow',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createAuthoringDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    authoringFold.foldAuthoringExecution,
    'authoring fold',
  );
  const createEntries = requireFactory(
    authoringHandlers.createAuthoringHandlerEntries,
    'authoring handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isAuthoringCaseId(plan.id), 'authoring case identity');
    const runtime = createPatchMapAuthoringRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'authoring',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createHistoryDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    historyFold.foldHistoryExecution,
    'history fold',
  );
  const createEntries = requireFactory(
    historyHandlers.createHistoryHandlerEntries,
    'history handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isHistoryCaseId(plan.id), 'history case identity');
    const runtime = createPatchMapHistoryRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'history',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createLayoutOrderDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    layoutOrderFold.foldLayoutOrderExecution,
    'layout-order fold',
  );
  const createEntries = requireFactory(
    layoutOrderHandlers.createLayoutOrderHandlerEntries,
    'layout-order handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(plan.id === 'LAY-002' || plan.id === 'LAY-003', 'layout-order case identity');
    const runtime = createPatchMapLayoutOrderRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'layout-order',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createPresentationDynamicsDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    presentationDynamicsFold.foldPresentationDynamicsExecution,
    'presentation-dynamics fold',
  );
  const createEntries = requireFactory(
    presentationDynamicsHandlers.createPresentationDynamicsHandlerEntries,
    'presentation-dynamics handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(
      plan.id === 'UPD-005'
        || plan.id === 'REN-009'
        || plan.id === 'ANI-001'
        || plan.id === 'ANI-002',
      'presentation-dynamics case identity',
    );
    const runtime = createPatchMapPresentationDynamicsRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'presentation-dynamics',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createRenderTextDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    renderTextFold.foldRenderTextExecution,
    'render-text fold',
  );
  const createEntries = requireFactory(
    renderTextHandlers.createRenderTextHandlerEntries,
    'render-text handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(plan.id === 'REN-006' || plan.id === 'REN-011', 'render-text case identity');
    const runtime = createPatchMapRenderTextRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'render-text',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createRenderComponentAssetsDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    renderComponentAssetsFold.foldRenderComponentAssetExecution,
    'render-component-assets fold',
  );
  const createEntries = requireFactory(
    renderComponentAssetsHandlers.createRenderComponentAssetHandlerEntries,
    'render-component-assets handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    const runtime = createPatchMapRenderComponentAssetsRuntime();
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
  return createPatchMapRuntimeDescriptor({
    key: 'render-component-assets',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createRenderImagesDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    renderImagesFold.foldRenderImageExecution,
    'render-images fold',
  );
  const createEntries = requireFactory(
    renderImagesHandlers.createRenderImageHandlerEntries,
    'render-images handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    const runtime = createPatchMapRenderImagesRuntime();
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
  return createPatchMapRuntimeDescriptor({
    key: 'render-images',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createAssetDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(assetFold.foldAssetExecution, 'asset fold');
  const createEntries = requireFactory(
    assetHandlers.createAssetHandlerEntries,
    'asset handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    const runtime = createPatchMapAstAssetRuntime();
    return Object.freeze({
      handlerEntries: selectHandlerEntries(plan, createEntries(runtime.product)),
      engineOptions: Object.freeze({
        assetRuntime: runtime.assetRuntime,
        assetPolicy: runtime.assetPolicy,
      }),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'assets',
    needsSupplementalWebGLLease: true,
    createRun,
    fold,
  });
}

function createAssetIngestionDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    assetIngestionFold.foldAssetIngestionExecution,
    'asset-ingestion fold',
  );
  const createEntries = requireFactory(
    assetIngestionHandlers.createAssetIngestionHandlerEntries,
    'asset-ingestion handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    const runtime = createPatchMapAssetIngestionRuntime();
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
  return createPatchMapRuntimeDescriptor({
    key: 'asset-ingestion',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createSecurityOperationsDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    securityOperationsFold.foldSecurityOperationsExecution,
    'security-operations fold',
  );
  const createEntries = requireFactory(
    securityOperationsHandlers.createSecurityOperationsHandlerEntries,
    'security-operations handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isSecurityOperationsCaseId(plan.id), 'security-operations case identity');
    const runtime = createPatchMapSecurityOperationsRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({}),
      actionTimeoutMs: 120_000,
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'security-operations',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createAccessibilityDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    accessibilityFold.foldAccessibilityExecution,
    'accessibility fold',
  );
  const createEntries = requireFactory(
    accessibilityHandlers.createAccessibilityHandlerEntries,
    'accessibility handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isAccessibilityCaseId(plan.id), 'accessibility case identity');
    const runtime = createPatchMapAccessibilityRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(
          runtime.product as unknown as Readonly<Record<string, unknown>>,
        ),
      ),
      engineOptions: Object.freeze({}),
      actionTimeoutMs: 60_000,
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'accessibility',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createMigrationDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    migrationFold.foldMigrationExecution,
    'migration fold',
  );
  const createEntries = requireFactory(
    migrationHandlers.createMigrationHandlerEntries,
    'migration handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(isMigrationCaseId(plan.id), 'migration case identity');
    const runtime = createPatchMapMigrationRuntime(plan.id);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(
          runtime.product as unknown as Readonly<Record<string, unknown>>,
        ),
      ),
      engineOptions: Object.freeze({}),
      actionTimeoutMs: 120_000,
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'migration',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}
