import type { PatchMapElement } from '../semantic/dataset';

export type PatchMapSemanticDataset = readonly PatchMapElement[];
export type PatchMapHistoryDirection = 'undo' | 'redo';
export type PatchMapHistoryCommitOutcome = 'accepted' | 'no-op' | 'refused';
export type PatchMapHistoryRecordStatus = 'recorded' | 'no-op' | 'refused' | 'disabled';
export type PatchMapHistoryPreparedCommitStatus =
  | PatchMapHistoryRecordStatus
  | 'cancelled'
  | 'stale'
  | 'invalid';

export interface PatchMapSemanticHistorySnapshotInput<
  TDataset extends readonly unknown[] = PatchMapSemanticDataset,
  TCompanion = never,
> {
  readonly dataset: TDataset;
  /** Host-owned editor state committed atomically with the semantic dataset. */
  readonly companion?: TCompanion;
}

export interface PatchMapSemanticHistorySnapshot<
  TDataset extends readonly unknown[] = PatchMapSemanticDataset,
  TCompanion = never,
> {
  readonly dataset: TDataset;
  /** Null means that this command has no host companion state. */
  readonly companion: TCompanion | null;
}

export interface PatchMapSemanticHistoryCommandInput<
  TDataset extends readonly unknown[] = PatchMapSemanticDataset,
  TCompanion = never,
> {
  /** Stable non-empty identity for one accepted human action. */
  readonly id: string;
  readonly before: PatchMapSemanticHistorySnapshotInput<TDataset, TCompanion>;
  readonly after: PatchMapSemanticHistorySnapshotInput<TDataset, TCompanion>;
}

export interface PatchMapSemanticHistoryCommand<
  TDataset extends readonly unknown[] = PatchMapSemanticDataset,
  TCompanion = never,
> {
  readonly id: string;
  /** Number of accepted consecutive records represented by this human action. */
  readonly recordCount: number;
  /**
   * Detached accepted records in authored order. Grouped undo traverses this
   * array in reverse and redo traverses it forward, while the aggregate surface
   * may reconcile directly to the command boundary snapshot.
   */
  readonly records: readonly PatchMapSemanticHistoryRecord<TDataset, TCompanion>[];
  readonly before: PatchMapSemanticHistorySnapshot<TDataset, TCompanion>;
  readonly after: PatchMapSemanticHistorySnapshot<TDataset, TCompanion>;
}

export interface PatchMapSemanticHistoryRecord<
  TDataset extends readonly unknown[] = PatchMapSemanticDataset,
  TCompanion = never,
> {
  readonly before: PatchMapSemanticHistorySnapshot<TDataset, TCompanion>;
  readonly after: PatchMapSemanticHistorySnapshot<TDataset, TCompanion>;
}

export interface PatchMapHistoryState {
  readonly capacity: number;
  readonly depth: number;
  /** Boundary between applied commands and the redo branch. */
  readonly cursor: number;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly destroyed: boolean;
}

export interface PatchMapHistoryInspection<
  TDataset extends readonly unknown[] = PatchMapSemanticDataset,
  TCompanion = never,
> {
  readonly state: PatchMapHistoryState;
  readonly commands: readonly PatchMapSemanticHistoryCommand<TDataset, TCompanion>[];
}

export interface PatchMapHistoryTransition<
  TDataset extends readonly unknown[] = PatchMapSemanticDataset,
  TCompanion = never,
> {
  readonly direction: PatchMapHistoryDirection;
  readonly command: PatchMapSemanticHistoryCommand<TDataset, TCompanion>;
  /** Detached target snapshot that the caller must reconcile atomically. */
  readonly snapshot: PatchMapSemanticHistorySnapshot<TDataset, TCompanion>;
  readonly cursorBefore: number;
  readonly cursorAfter: number;
}

export interface PatchMapSemanticHistoryOptions {
  /** Default 50 accepted user actions; zero disables recording. */
  readonly capacity?: number;
}

export interface PatchMapHistoryCapacityChange {
  readonly changed: boolean;
  readonly previousCapacity: number;
  readonly capacity: number;
  readonly evictedActionIds: readonly string[];
  readonly retainedActionIds: readonly string[];
  readonly state: PatchMapHistoryState;
}

/**
 * Opaque record preflight token. The public fields are diagnostic only;
 * commitPrepared validates instance ownership and the private prepared plan.
 */
export interface PatchMapHistoryPreparedRecord {
  readonly plannedStatus: PatchMapHistoryRecordStatus;
  readonly baseEpoch: number;
  readonly baseCursor: number;
}

export type PatchMapHistoryApply<
  TDataset extends readonly unknown[] = PatchMapSemanticDataset,
  TCompanion = never,
> = (transition: PatchMapHistoryTransition<TDataset, TCompanion>) => boolean;
