import type {
  PatchMapAuthoringActionType,
  PatchMapAuthoringDiagnostic,
  PatchMapAuthoringFacts,
  PatchMapAuthoringPlan,
  PATCH_MAP_AUTHORING_REVISION,
} from '../../authoring';
import type {
  PatchMapEditorMutationKind,
  PatchMapEditorWorkflowAction,
  PatchMapEditorWorkflowDiagnostic,
  PatchMapEditorWorkflowFacts,
  PatchMapEditorWorkflowPlan,
  PatchMapEditorWorkflowProbe,
  PATCH_MAP_EDITOR_WORKFLOW_REVISION,
} from '../../editor-workflow';
import type { PatchMapHistoryState } from '../../history';
import type {
  PatchMapHostAssetIngestionPlan,
  PatchMapHostAssetIngestionProbe,
  PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
} from '../../host-asset-ingestion';
import type { PatchMapMutationJsonValue } from '../../semantic/transaction';
import type { PatchMapEngineDiagnostic } from './lifecycle';
import type { PatchMapEngineTransactionResult } from './mutation';

export interface PatchMapEngineAuthoringResult {
  readonly schemaRevision: typeof PATCH_MAP_AUTHORING_REVISION;
  readonly actionType: PatchMapAuthoringActionType | null;
  readonly status: 'committed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly code: string | null;
  readonly plan: PatchMapAuthoringPlan;
  readonly facts: PatchMapAuthoringFacts;
  readonly transaction: PatchMapEngineTransactionResult | null;
  readonly diagnostic: PatchMapAuthoringDiagnostic | PatchMapEngineDiagnostic | null;
  readonly history: PatchMapHistoryState;
}

export interface PatchMapEngineHostAssetIngestionResult {
  readonly schemaRevision: typeof PATCH_MAP_HOST_ASSET_INGESTION_REVISION;
  readonly status:
    | 'committed'
    | 'unchanged'
    | 'ignored'
    | 'failed'
    | 'rejected'
    | 'refused';
  readonly changed: boolean;
  readonly code: string | null;
  readonly createdTextId: string | null;
  readonly createdImageIds: readonly string[];
  readonly plan: PatchMapHostAssetIngestionPlan;
  readonly transaction: PatchMapEngineTransactionResult | null;
  readonly probe: PatchMapHostAssetIngestionProbe;
}

export interface PatchMapEngineEditorWorkflowResult {
  readonly schemaRevision: typeof PATCH_MAP_EDITOR_WORKFLOW_REVISION;
  readonly actionType: PatchMapEditorWorkflowAction['type'];
  readonly status: 'committed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly code: string | null;
  readonly plan: PatchMapEditorWorkflowPlan;
  readonly facts: PatchMapEditorWorkflowFacts;
  readonly transaction: PatchMapEngineTransactionResult | null;
  readonly diagnostic: PatchMapEditorWorkflowDiagnostic | PatchMapEngineDiagnostic | null;
  readonly history: PatchMapHistoryState;
  readonly selectionIds: readonly string[];
  readonly probe: PatchMapEditorWorkflowProbe;
}

export interface PatchMapEngineEditorMutationMatrixInput {
  readonly mutationKinds: readonly PatchMapEditorMutationKind[];
  readonly oneActionEach: true;
  readonly companion: PatchMapMutationJsonValue;
}

export interface PatchMapEngineEditorMutationMatrixResult {
  readonly schemaRevision: typeof PATCH_MAP_EDITOR_WORKFLOW_REVISION;
  readonly status: 'committed' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly code: string | null;
  readonly requestedCount: number;
  readonly executedCount: number;
  readonly transactions: readonly PatchMapEngineTransactionResult[];
  readonly history: PatchMapHistoryState;
  readonly companionRestored: boolean;
}
