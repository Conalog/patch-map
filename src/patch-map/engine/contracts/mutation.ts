import type {
  PatchMapInstanceBarHeightBatchRequest,
  PatchMapInstanceBarTarget,
  PatchMapReconcileTimings,
} from '../../core/contracts';
import type { SlotRange } from '../../dense/contracts';
import type { PatchMapHistoryState } from '../../history';
import type { PatchMapSemanticMutationDiagnostic } from '../../semantic/mutation';
import type { PatchMapSemanticTarget } from '../../semantic/probe';
import type { PatchMapReconcileDiagnostic } from '../../semantic/reconcile';
import type {
  PatchMapMutationTarget,
  PatchMapMutationTransactionDiagnostic,
  PatchMapMutationTransactionRequest,
} from '../../semantic/transaction';
import type {
  PatchMapEngineDiagnostic,
  PatchMapRevisionStamp,
} from './lifecycle';

export interface PatchMapEngineTransactionHistory {
  readonly recorded: boolean;
  readonly commandId: string | null;
  readonly depthDelta: number;
  readonly state: PatchMapHistoryState;
}

export interface PatchMapEngineTransactionPerformanceProbe {
  readonly transactionPlanMs: number;
  readonly preReconcileMs: number;
  readonly reconcileMs: number;
  readonly postReconcileMs: number;
  readonly totalMs: number;
  readonly surfaceTimings: PatchMapReconcileTimings | null;
}

interface PatchMapEngineTransactionResultBase {
  readonly changed: boolean;
  readonly actionId: string | null;
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly PatchMapMutationTarget[];
  readonly missing: readonly PatchMapMutationTarget[];
  readonly unchanged: readonly PatchMapMutationTarget[];
  readonly history: PatchMapEngineTransactionHistory;
}

export type PatchMapEngineTransactionResult =
  | Readonly<PatchMapEngineTransactionResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>
  | Readonly<PatchMapEngineTransactionResultBase & {
      readonly status: 'unchanged';
      readonly changed: false;
    }>
  | Readonly<PatchMapEngineTransactionResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly transactionDiagnostic?: PatchMapMutationTransactionDiagnostic;
    }>
  | Readonly<PatchMapEngineTransactionResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>;

interface PatchMapEnginePatchResultBase {
  readonly changed: boolean;
  readonly target: PatchMapSemanticTarget | null;
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly PatchMapSemanticTarget[];
  readonly missing: readonly PatchMapSemanticTarget[];
  readonly unchanged: readonly PatchMapSemanticTarget[];
}

export type PatchMapEnginePatchResult =
  | Readonly<PatchMapEnginePatchResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly target: PatchMapSemanticTarget;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>
  | Readonly<PatchMapEnginePatchResultBase & {
      readonly status: 'unchanged';
      readonly changed: false;
      readonly target: PatchMapSemanticTarget;
    }>
  | Readonly<PatchMapEnginePatchResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly mutationDiagnostic?: PatchMapSemanticMutationDiagnostic;
    }>
  | Readonly<PatchMapEnginePatchResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly target: PatchMapSemanticTarget;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>;

interface PatchMapEngineDestroyTargetResultBase {
  readonly changed: boolean;
  readonly target: PatchMapSemanticTarget | null;
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly PatchMapSemanticTarget[];
  readonly missing: readonly PatchMapSemanticTarget[];
  readonly unchanged: readonly PatchMapSemanticTarget[];
}

export type PatchMapEngineDestroyTargetResult =
  | Readonly<PatchMapEngineDestroyTargetResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly target: Extract<
        PatchMapSemanticTarget,
        { readonly kind: 'element' }
      >;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>
  | Readonly<PatchMapEngineDestroyTargetResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly mutationDiagnostic: PatchMapSemanticMutationDiagnostic;
    }>
  | Readonly<PatchMapEngineDestroyTargetResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly target: Extract<
        PatchMapSemanticTarget,
        { readonly kind: 'element' }
      >;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>;

export interface PatchMapLiveOverlayTuple {
  readonly sourceRevision: number;
  readonly payloadHash: string;
  readonly sceneRevision: number;
}

export type PatchMapInstanceBarHeightRequest = PatchMapInstanceBarHeightBatchRequest;

export type PatchMapEngineInstanceBarHeightResult =
  | Readonly<{
      readonly status: 'committed';
      readonly changed: true;
      readonly publication: 'pending';
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly appliedTargets: readonly PatchMapInstanceBarTarget[];
      readonly missingTargets: readonly PatchMapInstanceBarTarget[];
      readonly dirtyRanges: readonly SlotRange[];
      readonly activeAnimationCount: number;
      readonly overlayCount: number;
    }>
  | Readonly<{
      readonly status: 'unchanged';
      readonly changed: false;
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly appliedTargets: readonly PatchMapInstanceBarTarget[];
      readonly missingTargets: readonly PatchMapInstanceBarTarget[];
      readonly dirtyRanges: readonly SlotRange[];
      readonly activeAnimationCount: number;
      readonly overlayCount: number;
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly changed: false;
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly appliedTargets: readonly [];
      readonly missingTargets: readonly PatchMapInstanceBarTarget[];
      readonly dirtyRanges: readonly [];
      readonly activeAnimationCount: number;
      readonly overlayCount: number;
      readonly diagnostic: PatchMapEngineDiagnostic;
    }>;

export interface PatchMapLiveOverlayPublishedTuple
  extends PatchMapLiveOverlayTuple {
  readonly frameRevision: number;
}

export interface PatchMapLiveOverlayInput {
  readonly sourceRevision: number;
  readonly payloadHash: string;
  readonly transaction: PatchMapMutationTransactionRequest;
}

export type PatchMapLiveOverlayResult =
  | Readonly<{
      readonly status: 'accepted';
      readonly changed: boolean;
      readonly publication: 'pending';
      readonly tuple: PatchMapLiveOverlayTuple;
      readonly transaction: PatchMapEngineTransactionResult;
    }>
  | Readonly<{
      readonly status: 'superseded' | 'rejected';
      readonly changed: false;
      readonly sourceRevision: number;
      readonly payloadHash: string;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly transaction?: PatchMapEngineTransactionResult;
    }>;

export interface PatchMapLiveOverlayProbe {
  readonly latestAccepted: PatchMapLiveOverlayTuple | null;
  readonly latestPublished: PatchMapLiveOverlayPublishedTuple | null;
  readonly pendingPublicationCount: 0 | 1;
  readonly acceptedCount: number;
  readonly publicationCount: number;
}

export interface PatchMapSemanticRefreshInput {
  readonly targets: readonly PatchMapSemanticTarget[];
  readonly strict?: boolean;
  readonly recordHistory?: boolean;
}

export type PatchMapEngineSemanticRefreshResult =
  | Readonly<{
      readonly status: 'committed';
      readonly changed: true;
      readonly publication: 'pending';
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly recomputedTargets: readonly string[];
      readonly missingTargets: readonly string[];
      readonly dirtyRanges: readonly SlotRange[];
      readonly dataDiffCount: 0;
      readonly history: PatchMapHistoryState;
      readonly selectionIds: readonly string[];
    }>
  | Readonly<{
      readonly status: 'unchanged' | 'rejected';
      readonly changed: false;
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly recomputedTargets: readonly string[];
      readonly missingTargets: readonly string[];
      readonly dirtyRanges: readonly SlotRange[];
      readonly dataDiffCount: 0;
      readonly history: PatchMapHistoryState;
      readonly selectionIds: readonly string[];
      readonly diagnostic?: PatchMapEngineDiagnostic;
    }>;
