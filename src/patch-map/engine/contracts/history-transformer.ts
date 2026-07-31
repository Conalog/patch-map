import type {
  PatchMapHistoryCapacityChange,
  PatchMapHistoryDirection,
  PatchMapHistoryState,
} from '../../history';
import type { PatchMapInteractionMode } from '../../host-interaction';
import type {
  PatchMapGestureCancelReason,
  PatchMapOwnedGestureTermination,
} from '../../pointer-gesture';
import type { PatchMapReconcileDiagnostic } from '../../semantic/reconcile';
import type { PatchMapMutationJsonValue } from '../../semantic/transaction';
import type {
  PatchMapTransformerGestureProbe,
  PatchMapTransformerHandle,
} from '../../selection-transformer';
import type {
  PatchMapEdgeAutoPanResult,
  PatchMapTransformerEditKind,
  PatchMapTransformerEditPlan,
  PATCH_MAP_TRANSFORMER_EDIT_REVISION,
} from '../../transformer-edit';
import type {
  PatchMapEngineDiagnostic,
  PatchMapRevisionStamp,
} from './lifecycle';
import type { PatchMapEngineTransactionResult } from './mutation';

export type PatchMapEngineHistoryResult =
  | Readonly<{
      readonly status: 'committed';
      readonly changed: true;
      readonly direction: PatchMapHistoryDirection;
      readonly actionId: string;
      readonly recordCount: number;
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly sceneRevision: number;
      readonly semanticHash: string;
      readonly publication: 'pending';
      readonly history: PatchMapHistoryState;
    }>
  | Readonly<{
      readonly status: 'unavailable';
      readonly changed: false;
      readonly direction: PatchMapHistoryDirection;
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly sceneRevision: number;
      readonly semanticHash: string | null;
      readonly history: PatchMapHistoryState;
    }>
  | Readonly<{
      readonly status: 'refused';
      readonly changed: false;
      readonly direction: PatchMapHistoryDirection;
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly sceneRevision: number;
      readonly semanticHash: string | null;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
      readonly history: PatchMapHistoryState;
    }>;

export interface PatchMapEngineHistoryCompanionState {
  readonly selectionIds: readonly string[];
  readonly mode: PatchMapInteractionMode;
  /** Detached host-authored JSON restored atomically with Engine state. */
  readonly hostCompanion: PatchMapMutationJsonValue | null;
}

export type PatchMapEngineHistoryCapacityResult =
  | Readonly<{
      readonly status: 'committed';
      readonly changed: boolean;
      readonly code: null;
      readonly change: PatchMapHistoryCapacityChange;
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly changed: false;
      readonly code: 'INVALID_VALUE';
      readonly capacity: number;
      readonly history: PatchMapHistoryState;
    }>;

export interface PatchMapEngineHistoryClearResult {
  readonly changed: boolean;
  readonly reason: 'host' | 'replace' | 'destroy';
  readonly history: PatchMapHistoryState;
}

export interface PatchMapHistoryShortcutInput {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly pathKind: string;
}

export interface PatchMapHistoryShortcutResult {
  readonly action: PatchMapHistoryDirection | null;
  readonly handled: boolean;
  readonly preventDefault: boolean;
  readonly result: PatchMapEngineHistoryResult | null;
}

export interface PatchMapEngineHistoryRestoredEvent {
  readonly direction: PatchMapHistoryDirection;
  readonly sceneRevision: number;
  readonly selectionIds: readonly string[];
  readonly mode: PatchMapInteractionMode;
  readonly publication: 'pending';
}

export interface PatchMapEngineHistoryVisibleEvent {
  readonly direction: PatchMapHistoryDirection;
  readonly sceneRevision: number;
  readonly frameRevision: number;
  readonly publication: 'published';
}

export interface PatchMapEngineTransformerEditOptions {
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface PatchMapEngineTransformerEditResult {
  readonly schemaRevision: typeof PATCH_MAP_TRANSFORMER_EDIT_REVISION;
  readonly status:
    | PatchMapTransformerEditPlan['status']
    | PatchMapEngineTransactionResult['status'];
  readonly changed: boolean;
  readonly plan: PatchMapTransformerEditPlan;
  readonly transaction: PatchMapEngineTransactionResult | null;
  readonly historyDepthDelta: number;
}

export interface PatchMapEngineTransformerSessionBeginInput {
  readonly pointerId: number;
  readonly actionId: string;
  readonly kind: PatchMapTransformerEditKind;
  readonly handle: PatchMapTransformerHandle;
  readonly selectionIds?: readonly string[];
}

export interface PatchMapEngineTransformerSessionProbe {
  readonly schemaRevision: typeof PATCH_MAP_TRANSFORMER_EDIT_REVISION;
  readonly activeSessionCount: 0 | 1;
  readonly activePointerId: number | null;
  readonly activeKind: PatchMapTransformerEditKind | null;
  readonly activeActionId: string | null;
  readonly previewCount: number;
  readonly committedMutationCount: number;
  readonly cancelledSessionCount: number;
  readonly staleCompletionCount: number;
  readonly previewOverlayCount: 0 | 1;
  readonly edgePanActiveCount: 0;
}

export interface PatchMapEngineTransformerPreviewResult {
  readonly status: 'previewed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly plan: PatchMapTransformerEditPlan;
  readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
  readonly probe: PatchMapEngineTransformerSessionProbe;
}

export interface PatchMapEngineTransformerCompletionResult {
  readonly status: 'committed' | 'unchanged' | 'refused' | 'stale';
  readonly changed: boolean;
  readonly mutationCount: 0 | 1;
  readonly historyDepthDelta: 0 | 1;
  readonly transaction: PatchMapEngineTransactionResult | null;
  readonly gesture: Readonly<{
    readonly completed: boolean;
    readonly pointer: PatchMapOwnedGestureTermination | null;
    readonly probe: PatchMapTransformerGestureProbe;
  }> | null;
  readonly probe: PatchMapEngineTransformerSessionProbe;
}

export interface PatchMapEngineTransformerCancelResult {
  readonly status: 'cancelled' | 'stale';
  readonly cancelled: boolean;
  readonly reason: PatchMapGestureCancelReason;
  readonly historyDepthDelta: 0;
  readonly gesture: Readonly<{
    readonly cancelled: boolean;
    readonly pointer: PatchMapOwnedGestureTermination | null;
    readonly probe: PatchMapTransformerGestureProbe;
  }> | null;
  readonly probe: PatchMapEngineTransformerSessionProbe;
}

export interface PatchMapEngineTransformerEdgePanResult
  extends PatchMapEdgeAutoPanResult {
  readonly policyRestored: true;
  readonly edgePanActiveCount: 0;
}
