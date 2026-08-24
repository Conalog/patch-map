import {
  PATCH_MAP_ACCESSIBILITY_CASE_IDS,
  type PatchMapAccessibilityCaseId,
} from '../accessibility-runtime';
import {
  PATCH_MAP_AUTHORING_CASE_IDS,
  type PatchMapAuthoringCaseId,
} from '../authoring-runtime';
import {
  PATCH_MAP_DETERMINISM_LIFECYCLE_CASE_IDS,
  type PatchMapDeterminismLifecycleCaseId,
} from '../determinism-lifecycle-runtime';
import {
  PATCH_MAP_EDITOR_WORKFLOW_CASE_IDS,
  type PatchMapEditorWorkflowCaseId,
} from '../editor-workflow-runtime';
import type { PatchMapExecutableCaseId } from '../executable-cases';
import {
  PATCH_MAP_EXPORT_EXTRACTION_CASE_IDS,
  type PatchMapExportExtractionCaseId,
} from '../export-extraction-runtime';
import {
  PATCH_MAP_HISTORY_CASE_IDS,
  type PatchMapHistoryCaseId,
} from '../history-runtime';
import {
  PATCH_MAP_INTERACTION_EDITOR_CASE_IDS,
  type PatchMapInteractionEditorCaseId,
} from '../interaction-editor-runtime';
import {
  PATCH_MAP_LIFECYCLE_INTERRUPTION_CASE_IDS,
  type PatchMapLifecycleInterruptionCaseId,
} from '../lifecycle-interruption-runtime';
import {
  PATCH_MAP_MIGRATION_CASE_IDS,
  type PatchMapMigrationCaseId,
} from '../migration-runtime';
import {
  PATCH_MAP_PACKAGE_INTEGRATION_CASE_IDS,
  type PatchMapPackageIntegrationCaseId,
} from '../package-integration-runtime';
import {
  PATCH_MAP_PERFORMANCE_CASE_IDS,
  type PatchMapPerformanceCaseId,
} from '../performance-runtime';
import {
  PATCH_MAP_POINTER_SELECTION_CASE_IDS,
  type PatchMapPointerSelectionCaseId,
} from '../pointer-selection-runtime';
import {
  PATCH_MAP_QUERY_SELECTION_CASE_IDS,
  type PatchMapQuerySelectionCaseId,
} from '../query-selection-runtime';
import {
  PATCH_MAP_REPLACEMENT_RECOVERY_CASE_IDS,
  type PatchMapReplacementRecoveryCaseId,
} from '../replacement-recovery-runtime';
import {
  PATCH_MAP_SECURITY_OPERATIONS_CASE_IDS,
  type PatchMapSecurityOperationsCaseId,
} from '../security-operations-runtime';
import {
  PATCH_MAP_UPDATE_TRANSACTIONS_CASE_IDS,
  type PatchMapUpdateTransactionsCaseId,
} from '../update-transactions-runtime';
import {
  PATCH_MAP_VIEWPORT_CASE_IDS,
  type PatchMapViewportCaseId,
} from '../viewport-runtime';
import { patchMapExecutableInvariant as invariant } from './descriptor';

export type PatchMapExecutableRoute =
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
  | 'pixijs-integration'
  | 'package-integration'
  | 'package-multi-instance'
  | 'performance-evidence'
  | 'performance-product'
  | 'asset-ingestion'
  | 'security-operations'
  | 'accessibility'
  | 'migration'
  | 'assets';

const FOUNDATION_CASE_IDS = new Set<PatchMapExecutableCaseId>([
  'LIF-001',
  'LIF-002',
  'DAT-001',
  'DAT-002',
  'CSM-001',
  'CSM-003',
]);
const DATA_FOUNDATION_CASE_IDS = new Set<PatchMapExecutableCaseId>([
  'DAT-003',
  'DAT-004',
  'DAT-005',
]);
const DATA_CLOSURE_CASE_IDS = new Set<PatchMapExecutableCaseId>([
  'DAT-006',
  'DAT-007',
  'DAT-008',
]);
const RENDER_FOUNDATION_CASE_IDS = new Set<PatchMapExecutableCaseId>([
  'LAY-001',
  'REN-001',
  'REN-004',
  'REN-003',
  'REN-002',
]);
const UPDATE_TRANSACTION_CASE_IDS = new Set<PatchMapUpdateTransactionsCaseId>(
  PATCH_MAP_UPDATE_TRANSACTIONS_CASE_IDS,
);
const VIEWPORT_CASE_IDS = new Set<PatchMapViewportCaseId>(PATCH_MAP_VIEWPORT_CASE_IDS);
const QUERY_SELECTION_CASE_IDS = new Set<PatchMapQuerySelectionCaseId>(
  PATCH_MAP_QUERY_SELECTION_CASE_IDS,
);
const POINTER_SELECTION_CASE_IDS = new Set<PatchMapPointerSelectionCaseId>(
  PATCH_MAP_POINTER_SELECTION_CASE_IDS,
);
const INTERACTION_EDITOR_CASE_IDS = new Set(
  PATCH_MAP_INTERACTION_EDITOR_CASE_IDS,
);
const AUTHORING_CASE_IDS = new Set(PATCH_MAP_AUTHORING_CASE_IDS);
const EDITOR_WORKFLOW_CASE_IDS = new Set(PATCH_MAP_EDITOR_WORKFLOW_CASE_IDS);
const HISTORY_CASE_IDS = new Set(PATCH_MAP_HISTORY_CASE_IDS);
const REPLACEMENT_RECOVERY_CASE_IDS = new Set(
  PATCH_MAP_REPLACEMENT_RECOVERY_CASE_IDS,
);
const LIFECYCLE_INTERRUPTION_CASE_IDS = new Set(
  PATCH_MAP_LIFECYCLE_INTERRUPTION_CASE_IDS,
);
const DETERMINISM_LIFECYCLE_CASE_IDS = new Set(
  PATCH_MAP_DETERMINISM_LIFECYCLE_CASE_IDS,
);
const EXPORT_EXTRACTION_CASE_IDS = new Set(PATCH_MAP_EXPORT_EXTRACTION_CASE_IDS);
const PIXIJS_INTEGRATION_CASE_IDS = new Set<PatchMapExecutableCaseId>([
  'PIX-001',
  'PIX-002',
  'PIX-003',
  'PIX-005',
]);
const PACKAGE_INTEGRATION_CASE_IDS = new Set(
  PATCH_MAP_PACKAGE_INTEGRATION_CASE_IDS,
);
const PERFORMANCE_CASE_IDS = new Set(PATCH_MAP_PERFORMANCE_CASE_IDS);
const ASSET_INGESTION_CASE_IDS = new Set<PatchMapExecutableCaseId>([
  'ERR-003',
  'AST-002',
  'AST-003',
  'SEC-001',
  'CSM-032',
]);
const SECURITY_OPERATIONS_CASE_IDS = new Set(PATCH_MAP_SECURITY_OPERATIONS_CASE_IDS);
const ACCESSIBILITY_CASE_IDS = new Set(PATCH_MAP_ACCESSIBILITY_CASE_IDS);
const MIGRATION_CASE_IDS = new Set(PATCH_MAP_MIGRATION_CASE_IDS);

export function routePatchMapExecutableCase(
  caseId: PatchMapExecutableCaseId,
): PatchMapExecutableRoute {
  if (FOUNDATION_CASE_IDS.has(caseId)) return 'foundation';
  if (DATA_FOUNDATION_CASE_IDS.has(caseId)) return 'data-foundation';
  if (DATA_CLOSURE_CASE_IDS.has(caseId)) return 'data-closure';
  if (caseId === 'LIF-004') return 'lifecycle-resize';
  if (caseId === 'LIF-005') return 'lifecycle-destroy';
  if (RENDER_FOUNDATION_CASE_IDS.has(caseId)) return 'render-foundation';
  if (caseId === 'LAY-004') return 'render-orientation';
  if (caseId === 'LAY-005') return 'render-bounds';
  if (caseId === 'REN-007') return 'render-relations';
  if (caseId === 'REN-005') return 'render-images';
  if (caseId === 'REN-006' || caseId === 'REN-011') return 'render-text';
  if (caseId === 'REN-008' || caseId === 'REN-010') return 'render-component-assets';
  if (caseId === 'LAY-002' || caseId === 'LAY-003') return 'layout-order';
  if (
    caseId === 'UPD-005'
    || caseId === 'REN-009'
    || caseId === 'ANI-001'
    || caseId === 'ANI-002'
  ) return 'presentation-dynamics';
  if (isUpdateTransactionCaseId(caseId)) return 'update-transactions';
  if (isQuerySelectionCaseId(caseId)) return 'query-selection';
  if (isPointerSelectionCaseId(caseId)) return 'pointer-selection';
  if (isInteractionEditorCaseId(caseId)) return 'interaction-editor';
  if (isEditorWorkflowCaseId(caseId)) return 'editor-workflow';
  if (isAuthoringCaseId(caseId)) return 'authoring';
  if (isHistoryCaseId(caseId)) return 'history';
  if (isReplacementRecoveryCaseId(caseId)) return 'replacement-recovery';
  if (isLifecycleInterruptionCaseId(caseId)) return 'lifecycle-interruption';
  if (isDeterminismLifecycleCaseId(caseId)) return 'determinism-lifecycle';
  if (isExportExtractionCaseId(caseId)) return 'export-extraction';
  if (PIXIJS_INTEGRATION_CASE_IDS.has(caseId)) return 'pixijs-integration';
  if (isPackageIntegrationCaseId(caseId)) {
    return caseId === 'PKG-003'
      ? 'package-multi-instance'
      : 'package-integration';
  }
  if (isPerformanceCaseId(caseId)) {
    return caseId === 'PRF-001' || caseId === 'PRF-002'
      ? 'performance-evidence'
      : 'performance-product';
  }
  if (isViewportCaseId(caseId)) return 'viewport';
  if (isAccessibilityCaseId(caseId)) return 'accessibility';
  if (isMigrationCaseId(caseId)) return 'migration';
  if (isSecurityOperationsCaseId(caseId)) return 'security-operations';
  if (ASSET_INGESTION_CASE_IDS.has(caseId)) return 'asset-ingestion';
  if (caseId === 'AST-001') return 'assets';
  invariant(false, `unsupported executable route ${String(caseId)}`);
}

export function isLifecycleInterruptionCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapLifecycleInterruptionCaseId {
  return LIFECYCLE_INTERRUPTION_CASE_IDS.has(
    caseId as PatchMapLifecycleInterruptionCaseId,
  );
}

export function isDeterminismLifecycleCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapDeterminismLifecycleCaseId {
  return DETERMINISM_LIFECYCLE_CASE_IDS.has(
    caseId as PatchMapDeterminismLifecycleCaseId,
  );
}

export function isExportExtractionCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapExportExtractionCaseId {
  return EXPORT_EXTRACTION_CASE_IDS.has(caseId as PatchMapExportExtractionCaseId);
}

export function isPixijsIntegrationCaseId(
  caseId: PatchMapExecutableCaseId,
): boolean {
  return PIXIJS_INTEGRATION_CASE_IDS.has(caseId);
}

export function isPackageIntegrationCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapPackageIntegrationCaseId {
  return PACKAGE_INTEGRATION_CASE_IDS.has(caseId as PatchMapPackageIntegrationCaseId);
}

export function isPerformanceCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapPerformanceCaseId {
  return PERFORMANCE_CASE_IDS.has(caseId as PatchMapPerformanceCaseId);
}

export function isReplacementRecoveryCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapReplacementRecoveryCaseId {
  return REPLACEMENT_RECOVERY_CASE_IDS.has(
    caseId as PatchMapReplacementRecoveryCaseId,
  );
}

export function isUpdateTransactionCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapUpdateTransactionsCaseId {
  return UPDATE_TRANSACTION_CASE_IDS.has(caseId as PatchMapUpdateTransactionsCaseId);
}

export function isViewportCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapViewportCaseId {
  return VIEWPORT_CASE_IDS.has(caseId as PatchMapViewportCaseId);
}

export function isQuerySelectionCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapQuerySelectionCaseId {
  return QUERY_SELECTION_CASE_IDS.has(caseId as PatchMapQuerySelectionCaseId);
}

export function isPointerSelectionCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapPointerSelectionCaseId {
  return POINTER_SELECTION_CASE_IDS.has(caseId as PatchMapPointerSelectionCaseId);
}

export function isInteractionEditorCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapInteractionEditorCaseId {
  return INTERACTION_EDITOR_CASE_IDS.has(caseId as PatchMapInteractionEditorCaseId);
}

export function isEditorWorkflowCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapEditorWorkflowCaseId {
  return EDITOR_WORKFLOW_CASE_IDS.has(caseId as PatchMapEditorWorkflowCaseId);
}

export function isAuthoringCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapAuthoringCaseId {
  return AUTHORING_CASE_IDS.has(caseId as PatchMapAuthoringCaseId);
}

export function isHistoryCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapHistoryCaseId {
  return HISTORY_CASE_IDS.has(caseId as PatchMapHistoryCaseId);
}

export function isSecurityOperationsCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapSecurityOperationsCaseId {
  return SECURITY_OPERATIONS_CASE_IDS.has(
    caseId as PatchMapSecurityOperationsCaseId,
  );
}

export function isAccessibilityCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapAccessibilityCaseId {
  return ACCESSIBILITY_CASE_IDS.has(caseId as PatchMapAccessibilityCaseId);
}

export function isMigrationCaseId(
  caseId: PatchMapExecutableCaseId,
): caseId is PatchMapMigrationCaseId {
  return MIGRATION_CASE_IDS.has(caseId as PatchMapMigrationCaseId);
}
