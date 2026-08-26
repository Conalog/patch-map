import type { PatchMapHistoryDirection, PatchMapHistoryState } from '../history';
import type { PatchMapLogicalTargetSnapshot } from '../query-selection';
import type {
  PatchMapEditorWorkflowFacts,
  PatchMapEditorWorkflowProbe,
} from '../editor-workflow';
import type {
  PatchMapMutationJsonValue,
  PatchMapMutationTarget,
} from '../semantic/transaction';
import type { PatchMapTransformerHandle } from '../selection-transformer';
import type {
  PatchMapTransformerEditKind,
} from '../selection-transformer/edit';
import type {
  PatchMapDebugSnapshot,
  PatchMapDiagnostic,
  PatchMapHistoryClearResult,
  PatchMapHistoryResult,
  PatchMapRevisionStamp,
  PatchMapTransformOptions,
  PatchMapTransformResult,
  PatchMapViewportChangeResult,
  PatchMapViewportFitResult,
  PatchMapViewportRestoreResult,
  PatchMapViewportState,
} from './contracts';

export interface PatchMapHostLoadOptions {
  readonly datasetRef?: string;
  readonly strict?: boolean;
}

export interface PatchMapHostLoadResult {
  readonly sceneRevision: number;
  readonly semanticHash: string;
  readonly rootIds: readonly string[];
}

export interface PatchMapHostQueryResult {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly targets: readonly PatchMapLogicalTargetSnapshot[];
}

export type PatchMapHostTransactionResult = Readonly<{
  readonly status: 'committed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly applied: readonly PatchMapMutationTarget[];
  readonly missing: readonly PatchMapMutationTarget[];
  readonly diagnostic?: PatchMapDiagnostic;
}>;

export interface PatchMapHostInstanceBarTarget {
  readonly id: string;
  readonly componentId: string;
}

export interface PatchMapHostInstanceComponentPresentationColumns {
  readonly targets: readonly PatchMapHostInstanceBarTarget[];
  readonly changes?: Readonly<Record<string, ArrayLike<unknown>>>;
}

export interface PatchMapHostInstancePresentationColumns {
  readonly targets: readonly PatchMapHostInstanceBarTarget[];
  readonly tint?: ArrayLike<unknown>;
  readonly source?: ArrayLike<unknown>;
  readonly show?: ArrayLike<boolean | null>;
}

export interface PatchMapHostInstanceBarPresentationColumns
  extends PatchMapHostInstancePresentationColumns {
  readonly height?: ArrayLike<number | null>;
}

export interface PatchMapHostInstanceTextPresentationColumns
  extends PatchMapHostInstanceComponentPresentationColumns {
  readonly text?: ArrayLike<string | null>;
  readonly style?: ArrayLike<Readonly<Record<string, unknown>> | null>;
}

export interface PatchMapHostInstanceBarHeightBatchRequest {
  readonly background?: PatchMapHostInstanceComponentPresentationColumns;
  readonly bar?: PatchMapHostInstanceBarPresentationColumns;
  readonly icon?: PatchMapHostInstancePresentationColumns;
  readonly text?: PatchMapHostInstanceTextPresentationColumns;
  readonly animate?: boolean;
  readonly animatedBarTargets?: readonly PatchMapHostInstanceBarTarget[];
}

export type PatchMapHostInstanceBarHeightResult = Readonly<{
  readonly status: 'committed' | 'unchanged' | 'rejected';
  readonly changed: boolean;
  readonly appliedTargets: readonly PatchMapHostInstanceBarTarget[];
  readonly missingTargets: readonly PatchMapHostInstanceBarTarget[];
  readonly diagnostic?: PatchMapDiagnostic;
}>;

export interface PatchMapHostLogicalPresentationLayerInput {
  readonly key: string;
  readonly scopeToken: object;
  readonly scope: readonly PatchMapLogicalTargetSnapshot[];
  readonly matched: readonly PatchMapLogicalTargetSnapshot[];
  readonly matchedAlphaMultiplier: number;
  readonly unmatchedAlphaMultiplier: number;
}

export interface PatchMapHostPresentationLayerChange {
  readonly changed: boolean;
  readonly revision: number;
}

export interface PatchMapHostViewportFitOptions {
  readonly paddingCssPx?: number | readonly [number, number];
  readonly targets?: readonly string[] | null;
}

export type PatchMapHostTransformerEditOptions = PatchMapTransformOptions;
export type PatchMapHostTransformerEditResult = PatchMapTransformResult;
export type PatchMapHostViewportChangeResult = PatchMapViewportChangeResult;
export type PatchMapHostViewportFitResult = PatchMapViewportFitResult;
export type PatchMapHostViewportRestoreResult = PatchMapViewportRestoreResult;
export type PatchMapHostViewportState = PatchMapViewportState;
export type PatchMapHostHistoryResult = Omit<PatchMapHistoryResult, 'companion'> & Readonly<{
  readonly hostCompanion: PatchMapMutationJsonValue | null;
}>;
export type PatchMapHostHistoryClearResult = PatchMapHistoryClearResult;
export type PatchMapHostDebugSnapshot = PatchMapDebugSnapshot;

export interface PatchMapHostEditorWorkflowResult {
  readonly status: 'committed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly code: string | null;
  readonly facts: PatchMapEditorWorkflowFacts;
  readonly selectionIds: readonly string[];
  readonly probe: PatchMapEditorWorkflowProbe;
}

export interface PatchMapHostTransformerSessionBeginInput {
  readonly actionId: string;
  readonly kind: PatchMapTransformerEditKind;
  readonly handle: PatchMapTransformerHandle;
  readonly selectionIds?: readonly string[];
}

export interface PatchMapHostHistoryCompanionState {
  readonly hostCompanion: PatchMapMutationJsonValue | null;
}

/** Opaque host-only identity for one public transformer session. */
export type PatchMapHostTransformerSessionToken = object;

export interface PatchMapHostExtractionResult {
  readonly cssSize: readonly [number, number];
  readonly mime: 'image/png';
  readonly dataUrl: string;
}

/** Common history observation retained for structural compatibility checks. */
export interface PatchMapHostHistoryObservation {
  readonly direction: PatchMapHistoryDirection;
  readonly history: PatchMapHistoryState;
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
}
