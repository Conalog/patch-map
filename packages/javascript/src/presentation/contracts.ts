export type PatchMapPresentationCancelReason =
  | 'hide'
  | 'remove'
  | 'replacement'
  | 'destroy';

export interface PatchMapPresentationControllerOptions {
  /** Engine lifecycle generation copied into every result and diagnostic. */
  readonly lifecycleGeneration?: number;
  readonly defaultDurationMs?: number;
  readonly initialCapacity?: number;
}

export interface PatchMapPresentationRetargetInput {
  readonly entityId: string;
  readonly slot: number;
  readonly generation: number;
  /** Current renderer-visible scalar. The semantic destination is owned elsewhere. */
  readonly currentVisibleValue: number;
  readonly destinationValue: number;
  readonly timeMs: number;
  readonly durationMs?: number;
  readonly enabled?: boolean;
}

export interface PatchMapPresentationCancelInput {
  readonly entityId: string;
  readonly generation: number;
  readonly timeMs: number;
  readonly reason: Exclude<PatchMapPresentationCancelReason, 'destroy'>;
}

export interface PatchMapPresentationDirtyRange {
  /** Inclusive dense slot. */
  readonly start: number;
  /** Exclusive dense slot. */
  readonly end: number;
}

export interface PatchMapPresentationUpdate {
  readonly entityId: string;
  readonly slot: number;
  readonly generation: number;
  readonly value: number;
}

export interface PatchMapPresentationFrame {
  readonly operation: 'advance' | 'retarget';
  readonly lifecycleGeneration: number;
  readonly presentationRevision: number;
  readonly timeMs: number;
  readonly activeCount: number;
  readonly changedCount: number;
  readonly settledCount: number;
  readonly totalSettlementCount: number;
  readonly published: boolean;
  readonly updates: readonly PatchMapPresentationUpdate[];
  readonly dirtyEntityIds: readonly string[];
  readonly dirtyRanges: readonly PatchMapPresentationDirtyRange[];
  readonly settledEntityIds: readonly string[];
}

export interface PatchMapPresentationRetargetResult extends PatchMapPresentationFrame {
  readonly operation: 'retarget';
  readonly scheduled: boolean;
  readonly replaced: boolean;
  readonly startValue: number;
  readonly destinationValue: number;
  readonly durationMs: number;
}

export interface PatchMapPresentationCancelResult {
  readonly lifecycleGeneration: number;
  readonly presentationRevision: number;
  readonly timeMs: number;
  readonly entityId: string;
  readonly reason: Exclude<PatchMapPresentationCancelReason, 'destroy'>;
  readonly cancelled: boolean;
  readonly activeCount: number;
  readonly published: false;
}

export interface PatchMapPresentationDestroyResult {
  readonly lifecycleGeneration: number;
  readonly presentationRevision: number;
  readonly destroyed: true;
  readonly cancelledCount: number;
  readonly cancelledEntityIds: readonly string[];
  readonly published: false;
}

export interface PatchMapPresentationProbe {
  readonly entityId: string;
  readonly slot: number;
  readonly generation: number;
  readonly currentValue: number;
  readonly startValue: number;
  readonly destinationValue: number;
  readonly startTimeMs: number;
  readonly durationMs: number;
}

export interface PatchMapPresentationSnapshot {
  readonly lifecycleGeneration: number;
  readonly presentationRevision: number;
  readonly clockMs: number;
  readonly activeCount: number;
  readonly indexedCount: number;
  readonly capacity: number;
  readonly totalSettlementCount: number;
  readonly totalCancellationCount: number;
  readonly totalSupersessionCount: number;
  readonly publishedFrameCount: number;
  readonly destroyed: boolean;
}

export interface PatchMapPresentationDiagnostic {
  readonly code: 'DESTROYED' | 'INVALID_VALUE';
  readonly category: 'DESTROYED' | 'INVALID_INPUT';
  readonly operation: 'advance' | 'cancel' | 'retarget';
  readonly lifecycleGeneration: number;
  readonly presentationRevision: number;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly field?: string;
}

export interface PatchMapPresentationReconcileState {
  readonly found: boolean;
  readonly entityId: string;
  readonly slot: number;
  readonly generation: number;
  readonly currentValue: number;
  readonly scheduled: boolean;
  readonly replaced: boolean;
  readonly startValue: number;
  readonly destinationValue: number;
  readonly durationMs: number;
  readonly changed: boolean;
  readonly changedValue: number;
  readonly settled: boolean;
  readonly published: boolean;
}
