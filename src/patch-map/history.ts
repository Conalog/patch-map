import type {
  PatchMapHistoryApply,
  PatchMapHistoryCapacityChange,
  PatchMapHistoryCommitOutcome,
  PatchMapHistoryDirection,
  PatchMapHistoryInspection,
  PatchMapHistoryPreparedCommitStatus,
  PatchMapHistoryPreparedRecord,
  PatchMapHistoryRecordStatus,
  PatchMapHistoryState,
  PatchMapHistoryTransition,
  PatchMapSemanticDataset,
  PatchMapSemanticHistoryCommand,
  PatchMapSemanticHistoryCommandInput,
  PatchMapSemanticHistoryOptions,
} from './history/contracts';
import {
  detachCommand,
  mergeCommands,
  retainOwnedImmutableCommand,
  semanticEqual,
} from './history/record-values';

export type * from './history/contracts';

const DEFAULT_HISTORY_CAPACITY = 50;
const PENDING_PLAN_PRUNE_INTERVAL = 256;

/**
 * Pure semantic history. It owns detached, deeply frozen full snapshots but
 * deliberately does not own dense slots, Pixi objects, selection reconciliation,
 * or scene revisions. The caller applies a transition through its stable-ID
 * reconcile seam; the cursor moves only after that synchronous apply accepts.
 */
export class PatchMapSemanticHistory<
  TDataset extends readonly unknown[] = PatchMapSemanticDataset,
  TCompanion = never,
> {
  private capacityValue: number;
  private entriesValue: readonly PatchMapSemanticHistoryCommand<TDataset, TCompanion>[] =
    Object.freeze([]);
  private readonly preparedRecords = new WeakMap<
    PatchMapHistoryPreparedRecord,
    PatchMapPreparedRecordPlan<TDataset, TCompanion>
  >();
  private readonly pendingPreparedRecords = new Set<
    WeakRef<PatchMapPreparedRecordPlan<TDataset, TCompanion>>
  >();
  private pendingPlanRegistrationsSincePrune = 0;
  private cursorValue = 0;
  private epochValue = 0;
  private continuationId: string | null = null;
  private transitioning = false;
  private destroyedValue = false;

  public constructor(options: PatchMapSemanticHistoryOptions = {}) {
    const capacity = options.capacity ?? DEFAULT_HISTORY_CAPACITY;
    if (!Number.isSafeInteger(capacity) || capacity < 0) {
      throw new RangeError('capacity must be a non-negative safe integer');
    }
    this.capacityValue = capacity;
  }

  public get capacity(): number {
    return this.capacityValue;
  }

  public get destroyed(): boolean {
    return this.destroyedValue;
  }

  public get canUndo(): boolean {
    return !this.destroyedValue && this.cursorValue > 0;
  }

  public get canRedo(): boolean {
    return !this.destroyedValue && this.cursorValue < this.entriesValue.length;
  }

  /**
   * Complete every fallible record step before a caller publishes the staged
   * semantic dataset to its render surface. The returned token owns a fully
   * detached command and a precomputed next stack; no caller-owned value is read
   * by commitPrepared.
   */
  public prepareRecord(
    command: PatchMapSemanticHistoryCommandInput<TDataset, TCompanion>,
    outcome: PatchMapHistoryCommitOutcome = 'accepted',
  ): PatchMapHistoryPreparedRecord {
    return this.prepareRecordWith(
      command,
      outcome,
      detachCommand,
      true,
    );
  }

  /**
   * Preflight one known-changed Engine-owned command without cloning its
   * already detached, deeply frozen materialized datasets a second time.
   * Caller-owned or merely shallow-frozen input belongs in `prepareRecord`.
   */
  public prepareOwnedChangedRecord(
    command: PatchMapSemanticHistoryCommandInput<TDataset, TCompanion>,
  ): PatchMapHistoryPreparedRecord {
    return this.prepareRecordWith(
      command,
      'accepted',
      retainOwnedImmutableCommand,
      false,
    );
  }

  private prepareRecordWith(
    command: PatchMapSemanticHistoryCommandInput<TDataset, TCompanion>,
    outcome: PatchMapHistoryCommitOutcome,
    prepareCommand: (
      input: PatchMapSemanticHistoryCommandInput<TDataset, TCompanion>,
    ) => PatchMapSemanticHistoryCommand<TDataset, TCompanion>,
    detectNoOp: boolean,
  ): PatchMapHistoryPreparedRecord {
    this.assertMutable('prepare record');
    assertCommitOutcome(outcome);
    const baseEntries = this.entriesValue;
    let plannedStatus: PatchMapHistoryRecordStatus;
    let nextEntries = baseEntries;
    let nextCursor = this.cursorValue;
    let nextContinuationId = this.continuationId;

    if (outcome !== 'accepted') {
      plannedStatus = outcome;
    } else {
      const detached = prepareCommand(command);
      if (detectNoOp && semanticEqual(detached.before, detached.after)) {
        plannedStatus = 'no-op';
      } else if (this.capacityValue === 0) {
        plannedStatus = 'disabled';
        nextContinuationId = null;
      } else {
        plannedStatus = 'recorded';
        const previous = baseEntries[this.cursorValue - 1];
        const canContinue =
          this.cursorValue === baseEntries.length &&
          this.continuationId === detached.id &&
          previous?.id === detached.id;
        const branch = canContinue && previous !== undefined
          ? [
              ...baseEntries.slice(0, -1),
              mergeCommands(previous, detached),
            ]
          : [...baseEntries.slice(0, this.cursorValue), detached];
        const overflow = Math.max(0, branch.length - this.capacityValue);
        nextEntries = Object.freeze(overflow === 0 ? branch : branch.slice(overflow));
        nextCursor = nextEntries.length;
        nextContinuationId = detached.id;
      }
    }

    const token = Object.freeze({
      plannedStatus,
      baseEpoch: this.epochValue,
      baseCursor: this.cursorValue,
    });
    const plan: PatchMapPreparedRecordPlan<TDataset, TCompanion> = {
      phase: 'pending',
      baseEntries,
      nextEntries,
      nextCursor,
      nextContinuationId,
      pendingRef: null,
    };
    this.pendingPlanRegistrationsSincePrune += 1;
    if (this.pendingPlanRegistrationsSincePrune >= PENDING_PLAN_PRUNE_INTERVAL) {
      this.prunePendingPreparedRecords();
      this.pendingPlanRegistrationsSincePrune = 0;
    }
    const pendingRef = new WeakRef(plan);
    plan.pendingRef = pendingRef;
    this.preparedRecords.set(token, plan);
    this.pendingPreparedRecords.add(pendingRef);
    return token;
  }

  /**
   * Apply a prepared stack transition without cloning, callbacks, equality work,
   * or any fallible user-code boundary. Unknown, consumed, cancelled, and
   * state-stale tokens fail closed as status values.
   */
  public commitPrepared(
    token: PatchMapHistoryPreparedRecord,
  ): PatchMapHistoryPreparedCommitStatus {
    const plan = this.preparedRecords.get(token);
    if (plan === undefined) return 'invalid';
    if (plan.phase === 'cancelled') return 'cancelled';
    if (plan.phase !== 'pending') return 'stale';
    const nextEntries = plan.nextEntries;
    const nextCursor = plan.nextCursor;
    const nextContinuationId = plan.nextContinuationId;
    if (!this.isPreparedPlanCurrent(token, plan) || nextEntries === null) {
      this.finishPreparedRecord(plan, 'stale');
      return 'stale';
    }

    this.finishPreparedRecord(plan, 'committed');
    this.entriesValue = nextEntries;
    this.cursorValue = nextCursor;
    this.continuationId = nextContinuationId;
    this.epochValue += 1;
    return token.plannedStatus;
  }

  /** Check a prepared token without consuming it or changing history state. */
  public canCommitPrepared(token: PatchMapHistoryPreparedRecord): boolean {
    const plan = this.preparedRecords.get(token);
    return plan !== undefined && this.isPreparedPlanCurrent(token, plan);
  }

  /** Discard a refused surface publication without touching history authority. */
  public cancelPrepared(token: PatchMapHistoryPreparedRecord): boolean {
    const plan = this.preparedRecords.get(token);
    if (plan === undefined || plan.phase !== 'pending') return false;
    this.finishPreparedRecord(plan, 'cancelled');
    return true;
  }

  private isPreparedPlanCurrent(
    token: PatchMapHistoryPreparedRecord,
    plan: PatchMapPreparedRecordPlan<TDataset, TCompanion>,
  ): boolean {
    return (
      plan.phase === 'pending' &&
      plan.baseEntries !== null &&
      plan.nextEntries !== null &&
      !this.destroyedValue &&
      !this.transitioning &&
      token.baseEpoch === this.epochValue &&
      token.baseCursor === this.cursorValue &&
      plan.baseEntries === this.entriesValue
    );
  }

  /**
   * Compatibility wrapper for callers that have no separate surface commit.
   * Refused and declared no-op attempts still do not inspect their command.
   */
  public record(
    command: PatchMapSemanticHistoryCommandInput<TDataset, TCompanion>,
    outcome: PatchMapHistoryCommitOutcome = 'accepted',
  ): PatchMapHistoryRecordStatus {
    const prepared = this.prepareRecord(command, outcome);
    const status = this.commitPrepared(prepared);
    if (
      status === 'cancelled' ||
      status === 'stale' ||
      status === 'invalid'
    ) {
      throw new Error(`history record preflight unexpectedly became ${status}`);
    }
    return status;
  }

  /**
   * Reconcile the prior semantic snapshot. A false result or thrown error leaves
   * the history cursor unchanged; thrown errors propagate with their provenance.
   */
  public undo(
    apply: PatchMapHistoryApply<TDataset, TCompanion>,
  ): PatchMapHistoryTransition<TDataset, TCompanion> | null {
    return this.transition('undo', apply);
  }

  /** Apply the next semantic snapshot under the same atomic cursor rule as undo. */
  public redo(
    apply: PatchMapHistoryApply<TDataset, TCompanion>,
  ): PatchMapHistoryTransition<TDataset, TCompanion> | null {
    return this.transition('redo', apply);
  }

  public clear(): boolean {
    this.assertMutable('clear');
    const changed = this.entriesValue.length > 0;
    if (!changed && this.continuationId === null) return false;
    this.entriesValue = Object.freeze([]);
    this.cursorValue = 0;
    this.continuationId = null;
    this.epochValue += 1;
    return changed;
  }

  /**
   * End consecutive action-ID grouping without changing the visible stack.
   * Accepted unrecorded mutations use this barrier so a later reused action ID
   * cannot absorb changes that were intentionally outside history.
   */
  public closeActionGroup(): boolean {
    this.assertMutable('close action group');
    if (this.continuationId === null) return false;
    this.continuationId = null;
    this.epochValue += 1;
    return true;
  }

  /** Reconfigure bounded retention while preserving the newest valid branch. */
  public setCapacity(capacity: number): PatchMapHistoryCapacityChange {
    this.assertMutable('set capacity');
    assertCapacity(capacity);
    const previousCapacity = this.capacityValue;
    if (capacity === previousCapacity) {
      return capacityChange(
        false,
        previousCapacity,
        capacity,
        [],
        this.entriesValue,
        this.state(),
      );
    }
    const overflow = capacity === 0
      ? this.entriesValue.length
      : Math.max(0, this.entriesValue.length - capacity);
    const evicted = this.entriesValue.slice(0, overflow);
    this.entriesValue = Object.freeze(
      capacity === 0 ? [] : this.entriesValue.slice(overflow),
    );
    this.cursorValue = Math.max(0, this.cursorValue - overflow);
    this.capacityValue = capacity;
    this.continuationId = null;
    this.epochValue += 1;
    return capacityChange(
      true,
      previousCapacity,
      capacity,
      evicted,
      this.entriesValue,
      this.state(),
    );
  }

  public state(): PatchMapHistoryState {
    const depth = this.entriesValue.length;
    const cursor = this.cursorValue;
    return Object.freeze({
      capacity: this.capacityValue,
      depth,
      cursor,
      undoDepth: cursor,
      redoDepth: depth - cursor,
      canUndo: !this.destroyedValue && cursor > 0,
      canRedo: !this.destroyedValue && cursor < depth,
      destroyed: this.destroyedValue,
    });
  }

  /** Detached array shell containing already-detached immutable commands. */
  public inspect(): PatchMapHistoryInspection<TDataset, TCompanion> {
    return Object.freeze({
      state: this.state(),
      commands: Object.freeze([...this.entriesValue]),
    });
  }

  /** Clear all semantic and companion snapshots. Destruction is idempotent. */
  public destroy(): boolean {
    if (this.destroyedValue) return false;
    if (this.transitioning) {
      throw new Error('cannot destroy PatchMapSemanticHistory during a transition');
    }
    for (const pendingRef of this.pendingPreparedRecords) {
      const plan = pendingRef.deref();
      if (plan === undefined) continue;
      plan.phase = 'stale';
      plan.baseEntries = null;
      plan.nextEntries = null;
      plan.nextContinuationId = null;
      plan.pendingRef = null;
    }
    this.pendingPreparedRecords.clear();
    this.pendingPlanRegistrationsSincePrune = 0;
    this.entriesValue = Object.freeze([]);
    this.cursorValue = 0;
    this.continuationId = null;
    this.epochValue += 1;
    this.destroyedValue = true;
    return true;
  }

  private transition(
    direction: PatchMapHistoryDirection,
    apply: PatchMapHistoryApply<TDataset, TCompanion>,
  ): PatchMapHistoryTransition<TDataset, TCompanion> | null {
    this.assertMutable(direction);
    if (typeof apply !== 'function') throw new TypeError(`${direction} apply must be a function`);

    const commandIndex = direction === 'undo' ? this.cursorValue - 1 : this.cursorValue;
    if (commandIndex < 0 || commandIndex >= this.entriesValue.length) return null;
    const command = this.entriesValue[commandIndex];
    if (command === undefined) throw new Error(`${direction} command is missing`);
    const cursorAfter = direction === 'undo' ? this.cursorValue - 1 : this.cursorValue + 1;
    const transition = Object.freeze({
      direction,
      command,
      snapshot: direction === 'undo' ? command.before : command.after,
      cursorBefore: this.cursorValue,
      cursorAfter,
    });

    this.transitioning = true;
    let accepted: boolean;
    try {
      accepted = apply(transition);
    } finally {
      this.transitioning = false;
    }
    if (accepted !== true) return null;
    this.cursorValue = cursorAfter;
    this.continuationId = null;
    this.epochValue += 1;
    return transition;
  }

  private assertMutable(operation: string): void {
    if (this.destroyedValue) {
      throw new Error(`cannot ${operation}: PatchMapSemanticHistory is destroyed`);
    }
    if (this.transitioning) {
      throw new Error(`cannot ${operation}: a history transition is active`);
    }
  }

  private finishPreparedRecord(
    plan: PatchMapPreparedRecordPlan<TDataset, TCompanion>,
    phase: Exclude<PatchMapPreparedRecordPlan<TDataset, TCompanion>['phase'], 'pending'>,
  ): void {
    if (plan.pendingRef !== null) {
      this.pendingPreparedRecords.delete(plan.pendingRef);
      plan.pendingRef = null;
    }
    plan.phase = phase;
    plan.baseEntries = null;
    plan.nextEntries = null;
    plan.nextContinuationId = null;
  }

  private prunePendingPreparedRecords(): void {
    for (const pendingRef of this.pendingPreparedRecords) {
      if (pendingRef.deref() === undefined) {
        this.pendingPreparedRecords.delete(pendingRef);
      }
    }
  }
}

interface PatchMapPreparedRecordPlan<
  TDataset extends readonly unknown[],
  TCompanion,
> {
  phase: 'pending' | 'committed' | 'cancelled' | 'stale';
  baseEntries: readonly PatchMapSemanticHistoryCommand<TDataset, TCompanion>[] | null;
  nextEntries: readonly PatchMapSemanticHistoryCommand<TDataset, TCompanion>[] | null;
  readonly nextCursor: number;
  nextContinuationId: string | null;
  pendingRef: WeakRef<PatchMapPreparedRecordPlan<TDataset, TCompanion>> | null;
}

function assertCommitOutcome(value: string): asserts value is PatchMapHistoryCommitOutcome {
  if (value !== 'accepted' && value !== 'no-op' && value !== 'refused') {
    throw new TypeError('history outcome must be accepted, no-op, or refused');
  }
}

function assertCapacity(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('capacity must be a non-negative safe integer');
  }
}

function capacityChange<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  changed: boolean,
  previousCapacity: number,
  capacity: number,
  evicted: readonly PatchMapSemanticHistoryCommand<TDataset, TCompanion>[],
  retained: readonly PatchMapSemanticHistoryCommand<TDataset, TCompanion>[],
  state: PatchMapHistoryState,
): PatchMapHistoryCapacityChange {
  return Object.freeze({
    changed,
    previousCapacity,
    capacity,
    evictedActionIds: Object.freeze(evicted.map(({ id }) => id)),
    retainedActionIds: Object.freeze(retained.map(({ id }) => id)),
    state,
  });
}
