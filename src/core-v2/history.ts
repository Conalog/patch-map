import {
  isOwnedCoreV2Dataset,
  type CoreV2Element,
} from './semantic/dataset';

export type CoreV2SemanticDataset = readonly CoreV2Element[];
export type CoreV2HistoryDirection = 'undo' | 'redo';
export type CoreV2HistoryCommitOutcome = 'accepted' | 'no-op' | 'refused';
export type CoreV2HistoryRecordStatus = 'recorded' | 'no-op' | 'refused' | 'disabled';
export type CoreV2HistoryPreparedCommitStatus =
  | CoreV2HistoryRecordStatus
  | 'cancelled'
  | 'stale'
  | 'invalid';

export interface CoreV2SemanticHistorySnapshotInput<
  TDataset extends readonly unknown[] = CoreV2SemanticDataset,
  TCompanion = never,
> {
  readonly dataset: TDataset;
  /** Host-owned editor state committed atomically with the semantic dataset. */
  readonly companion?: TCompanion;
}

export interface CoreV2SemanticHistorySnapshot<
  TDataset extends readonly unknown[] = CoreV2SemanticDataset,
  TCompanion = never,
> {
  readonly dataset: TDataset;
  /** Null means that this command has no host companion state. */
  readonly companion: TCompanion | null;
}

export interface CoreV2SemanticHistoryCommandInput<
  TDataset extends readonly unknown[] = CoreV2SemanticDataset,
  TCompanion = never,
> {
  /** Stable non-empty identity for one accepted human action. */
  readonly id: string;
  readonly before: CoreV2SemanticHistorySnapshotInput<TDataset, TCompanion>;
  readonly after: CoreV2SemanticHistorySnapshotInput<TDataset, TCompanion>;
}

export interface CoreV2SemanticHistoryCommand<
  TDataset extends readonly unknown[] = CoreV2SemanticDataset,
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
  readonly records: readonly CoreV2SemanticHistoryRecord<TDataset, TCompanion>[];
  readonly before: CoreV2SemanticHistorySnapshot<TDataset, TCompanion>;
  readonly after: CoreV2SemanticHistorySnapshot<TDataset, TCompanion>;
}

export interface CoreV2SemanticHistoryRecord<
  TDataset extends readonly unknown[] = CoreV2SemanticDataset,
  TCompanion = never,
> {
  readonly before: CoreV2SemanticHistorySnapshot<TDataset, TCompanion>;
  readonly after: CoreV2SemanticHistorySnapshot<TDataset, TCompanion>;
}

export interface CoreV2HistoryState {
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

export interface CoreV2HistoryInspection<
  TDataset extends readonly unknown[] = CoreV2SemanticDataset,
  TCompanion = never,
> {
  readonly state: CoreV2HistoryState;
  readonly commands: readonly CoreV2SemanticHistoryCommand<TDataset, TCompanion>[];
}

export interface CoreV2HistoryTransition<
  TDataset extends readonly unknown[] = CoreV2SemanticDataset,
  TCompanion = never,
> {
  readonly direction: CoreV2HistoryDirection;
  readonly command: CoreV2SemanticHistoryCommand<TDataset, TCompanion>;
  /** Detached target snapshot that the caller must reconcile atomically. */
  readonly snapshot: CoreV2SemanticHistorySnapshot<TDataset, TCompanion>;
  readonly cursorBefore: number;
  readonly cursorAfter: number;
}

export interface CoreV2SemanticHistoryOptions {
  /** Default 50 accepted user actions; zero disables recording. */
  readonly capacity?: number;
}

export interface CoreV2HistoryCapacityChange {
  readonly changed: boolean;
  readonly previousCapacity: number;
  readonly capacity: number;
  readonly evictedActionIds: readonly string[];
  readonly retainedActionIds: readonly string[];
  readonly state: CoreV2HistoryState;
}

/**
 * Opaque record preflight token. The public fields are diagnostic only;
 * commitPrepared validates instance ownership and the private prepared plan.
 */
export interface CoreV2HistoryPreparedRecord {
  readonly plannedStatus: CoreV2HistoryRecordStatus;
  readonly baseEpoch: number;
  readonly baseCursor: number;
}

export type CoreV2HistoryApply<
  TDataset extends readonly unknown[] = CoreV2SemanticDataset,
  TCompanion = never,
> = (transition: CoreV2HistoryTransition<TDataset, TCompanion>) => boolean;

const DEFAULT_HISTORY_CAPACITY = 50;

/**
 * Pure semantic history. It owns detached, deeply frozen full snapshots but
 * deliberately does not own dense slots, Pixi objects, selection reconciliation,
 * or scene revisions. The caller applies a transition through its stable-ID
 * reconcile seam; the cursor moves only after that synchronous apply accepts.
 */
export class CoreV2SemanticHistory<
  TDataset extends readonly unknown[] = CoreV2SemanticDataset,
  TCompanion = never,
> {
  private capacityValue: number;
  private entriesValue: readonly CoreV2SemanticHistoryCommand<TDataset, TCompanion>[] =
    Object.freeze([]);
  private readonly preparedRecords = new WeakMap<
    CoreV2HistoryPreparedRecord,
    CoreV2PreparedRecordPlan<TDataset, TCompanion>
  >();
  private cursorValue = 0;
  private epochValue = 0;
  private continuationId: string | null = null;
  private transitioning = false;
  private destroyedValue = false;

  public constructor(options: CoreV2SemanticHistoryOptions = {}) {
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
    command: CoreV2SemanticHistoryCommandInput<TDataset, TCompanion>,
    outcome: CoreV2HistoryCommitOutcome = 'accepted',
  ): CoreV2HistoryPreparedRecord {
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
    command: CoreV2SemanticHistoryCommandInput<TDataset, TCompanion>,
  ): CoreV2HistoryPreparedRecord {
    return this.prepareRecordWith(
      command,
      'accepted',
      retainOwnedImmutableCommand,
      false,
    );
  }

  private prepareRecordWith(
    command: CoreV2SemanticHistoryCommandInput<TDataset, TCompanion>,
    outcome: CoreV2HistoryCommitOutcome,
    prepareCommand: (
      input: CoreV2SemanticHistoryCommandInput<TDataset, TCompanion>,
    ) => CoreV2SemanticHistoryCommand<TDataset, TCompanion>,
    detectNoOp: boolean,
  ): CoreV2HistoryPreparedRecord {
    this.assertMutable('prepare record');
    assertCommitOutcome(outcome);
    const baseEntries = this.entriesValue;
    let plannedStatus: CoreV2HistoryRecordStatus;
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
    this.preparedRecords.set(token, {
      phase: 'pending',
      baseEntries,
      nextEntries,
      nextCursor,
      nextContinuationId,
    });
    return token;
  }

  /**
   * Apply a prepared stack transition without cloning, callbacks, equality work,
   * collection mutation, or any other fallible user-code boundary. Unknown,
   * consumed, cancelled, and state-stale tokens fail closed as status values.
   */
  public commitPrepared(
    token: CoreV2HistoryPreparedRecord,
  ): CoreV2HistoryPreparedCommitStatus {
    const plan = this.preparedRecords.get(token);
    if (plan === undefined) return 'invalid';
    if (plan.phase === 'cancelled') return 'cancelled';
    if (plan.phase !== 'pending') return 'stale';
    if (
      this.destroyedValue ||
      this.transitioning ||
      token.baseEpoch !== this.epochValue ||
      token.baseCursor !== this.cursorValue ||
      plan.baseEntries !== this.entriesValue
    ) {
      plan.phase = 'stale';
      return 'stale';
    }

    plan.phase = 'committed';
    this.entriesValue = plan.nextEntries;
    this.cursorValue = plan.nextCursor;
    this.continuationId = plan.nextContinuationId;
    this.epochValue += 1;
    return token.plannedStatus;
  }

  /** Discard a refused surface publication without touching history authority. */
  public cancelPrepared(token: CoreV2HistoryPreparedRecord): boolean {
    const plan = this.preparedRecords.get(token);
    if (plan === undefined || plan.phase !== 'pending') return false;
    plan.phase = 'cancelled';
    return true;
  }

  /**
   * Compatibility wrapper for callers that have no separate surface commit.
   * Refused and declared no-op attempts still do not inspect their command.
   */
  public record(
    command: CoreV2SemanticHistoryCommandInput<TDataset, TCompanion>,
    outcome: CoreV2HistoryCommitOutcome = 'accepted',
  ): CoreV2HistoryRecordStatus {
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
    apply: CoreV2HistoryApply<TDataset, TCompanion>,
  ): CoreV2HistoryTransition<TDataset, TCompanion> | null {
    return this.transition('undo', apply);
  }

  /** Apply the next semantic snapshot under the same atomic cursor rule as undo. */
  public redo(
    apply: CoreV2HistoryApply<TDataset, TCompanion>,
  ): CoreV2HistoryTransition<TDataset, TCompanion> | null {
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
  public setCapacity(capacity: number): CoreV2HistoryCapacityChange {
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

  public state(): CoreV2HistoryState {
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
  public inspect(): CoreV2HistoryInspection<TDataset, TCompanion> {
    return Object.freeze({
      state: this.state(),
      commands: Object.freeze([...this.entriesValue]),
    });
  }

  /** Clear all semantic and companion snapshots. Destruction is idempotent. */
  public destroy(): boolean {
    if (this.destroyedValue) return false;
    if (this.transitioning) {
      throw new Error('cannot destroy CoreV2SemanticHistory during a transition');
    }
    this.entriesValue = Object.freeze([]);
    this.cursorValue = 0;
    this.continuationId = null;
    this.epochValue += 1;
    this.destroyedValue = true;
    return true;
  }

  private transition(
    direction: CoreV2HistoryDirection,
    apply: CoreV2HistoryApply<TDataset, TCompanion>,
  ): CoreV2HistoryTransition<TDataset, TCompanion> | null {
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
      throw new Error(`cannot ${operation}: CoreV2SemanticHistory is destroyed`);
    }
    if (this.transitioning) {
      throw new Error(`cannot ${operation}: a history transition is active`);
    }
  }
}

interface CoreV2PreparedRecordPlan<
  TDataset extends readonly unknown[],
  TCompanion,
> {
  phase: 'pending' | 'committed' | 'cancelled' | 'stale';
  readonly baseEntries: readonly CoreV2SemanticHistoryCommand<TDataset, TCompanion>[];
  readonly nextEntries: readonly CoreV2SemanticHistoryCommand<TDataset, TCompanion>[];
  readonly nextCursor: number;
  readonly nextContinuationId: string | null;
}

function detachCommand<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  input: CoreV2SemanticHistoryCommandInput<TDataset, TCompanion>,
): CoreV2SemanticHistoryCommand<TDataset, TCompanion> {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('history command must be an object');
  }
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new TypeError('history command id must be a non-empty string');
  }
  const before = detachSnapshot(input.before, '$.before');
  const after = detachSnapshot(input.after, '$.after');
  const record = Object.freeze({ before, after });
  return Object.freeze({
    id: input.id,
    recordCount: 1,
    records: Object.freeze([record]),
    before,
    after,
  });
}

function retainOwnedImmutableCommand<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  input: CoreV2SemanticHistoryCommandInput<TDataset, TCompanion>,
): CoreV2SemanticHistoryCommand<TDataset, TCompanion> {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('history command must be an object');
  }
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new TypeError('history command id must be a non-empty string');
  }
  const before = retainOwnedImmutableSnapshot(input.before, '$.before');
  const after = retainOwnedImmutableSnapshot(input.after, '$.after');
  const record = Object.freeze({ before, after });
  return Object.freeze({
    id: input.id,
    recordCount: 1,
    records: Object.freeze([record]),
    before,
    after,
  });
}

function retainOwnedImmutableSnapshot<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  input: CoreV2SemanticHistorySnapshotInput<TDataset, TCompanion>,
  path: string,
): CoreV2SemanticHistorySnapshot<TDataset, TCompanion> {
  if (input === null || typeof input !== 'object') {
    throw new TypeError(`${path} must be an object`);
  }
  if (!isOwnedCoreV2Dataset(input.dataset)) {
    throw new TypeError(`${path}.dataset must be an Engine-owned materialized array`);
  }
  const companion = input.companion === undefined ? null : input.companion;
  if (!isDeeplyFrozenJson(companion)) {
    throw new TypeError(`${path}.companion must be Engine-owned and deeply frozen`);
  }
  return Object.freeze({ dataset: input.dataset, companion });
}

function isDeeplyFrozenJson(
  value: unknown,
  visited: Set<object> = new Set(),
): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value !== 'object' || !Object.isFrozen(value)) return false;
  if (visited.has(value)) return false;
  visited.add(value);
  if (!Array.isArray(value) && !isPlainJsonRecord(value)) {
    visited.delete(value);
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const deeplyFrozen = Object.keys(value).every((key) => {
    const descriptor = descriptors[key];
    return descriptor !== undefined &&
      'value' in descriptor &&
      isDeeplyFrozenJson(descriptor.value, visited);
  });
  visited.delete(value);
  return deeplyFrozen;
}

function isPlainJsonRecord(value: object): value is Readonly<Record<string, unknown>> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mergeCommands<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  previous: CoreV2SemanticHistoryCommand<TDataset, TCompanion>,
  next: CoreV2SemanticHistoryCommand<TDataset, TCompanion>,
): CoreV2SemanticHistoryCommand<TDataset, TCompanion> {
  return Object.freeze({
    id: previous.id,
    recordCount: previous.recordCount + next.recordCount,
    records: Object.freeze([...previous.records, ...next.records]),
    before: previous.before,
    after: next.after,
  });
}

function detachSnapshot<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  input: CoreV2SemanticHistorySnapshotInput<TDataset, TCompanion>,
  path: string,
): CoreV2SemanticHistorySnapshot<TDataset, TCompanion> {
  if (input === null || typeof input !== 'object') {
    throw new TypeError(`${path} must be an object`);
  }
  if (!Array.isArray(input.dataset)) {
    throw new TypeError(`${path}.dataset must be an array`);
  }
  const dataset = cloneSemanticValue(input.dataset, `${path}.dataset`) as TDataset;
  const companion = input.companion === undefined
    ? null
    : cloneSemanticValue(input.companion, `${path}.companion`) as TCompanion;
  return Object.freeze({ dataset, companion });
}

function cloneSemanticValue(
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain finite numbers`);
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} must contain only JSON semantic values`);
  }
  if (ancestors.has(value)) throw new TypeError(`${path} must not contain cycles`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const clone: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError(`${path}[${index}] must not be sparse`);
        }
        clone.push(cloneSemanticValue(value[index], `${path}[${index}]`, ancestors));
      }
      return Object.freeze(clone);
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain semantic records`);
    }
    const clone: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new TypeError(`${path} must not contain symbol keys`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError(`${path}.${key} must be an enumerable data property`);
      }
      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: cloneSemanticValue(descriptor.value, `${path}.${key}`, ancestors),
      });
    }
    return Object.freeze(clone);
  } finally {
    ancestors.delete(value);
  }
}

function semanticEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => semanticEqual(entry, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => (
      key === rightKeys[index] && semanticEqual(left[key], right[key])
    ));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertCommitOutcome(value: string): asserts value is CoreV2HistoryCommitOutcome {
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
  evicted: readonly CoreV2SemanticHistoryCommand<TDataset, TCompanion>[],
  retained: readonly CoreV2SemanticHistoryCommand<TDataset, TCompanion>[],
  state: CoreV2HistoryState,
): CoreV2HistoryCapacityChange {
  return Object.freeze({
    changed,
    previousCapacity,
    capacity,
    evictedActionIds: Object.freeze(evicted.map(({ id }) => id)),
    retainedActionIds: Object.freeze(retained.map(({ id }) => id)),
    state,
  });
}
