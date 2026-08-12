import type {
  PatchMapPresentationCancelInput,
  PatchMapPresentationCancelReason,
  PatchMapPresentationCancelResult,
  PatchMapPresentationControllerOptions,
  PatchMapPresentationDestroyResult,
  PatchMapPresentationDiagnostic,
  PatchMapPresentationDirtyRange,
  PatchMapPresentationFrame,
  PatchMapPresentationProbe,
  PatchMapPresentationReconcileState,
  PatchMapPresentationRetargetInput,
  PatchMapPresentationRetargetResult,
  PatchMapPresentationSnapshot,
  PatchMapPresentationUpdate,
} from './presentation/contracts';

export type * from './presentation/contracts';

export const PATCH_MAP_PRESENTATION_DEFAULT_DURATION_MS = 200;

export class PatchMapPresentationError extends Error {
  public readonly diagnostic: PatchMapPresentationDiagnostic;

  public constructor(diagnostic: PatchMapPresentationDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.operation}`);
    this.name = 'PatchMapPresentationError';
    this.diagnostic = diagnostic;
  }
}

type MutableReconcileState = {
  -readonly [Key in keyof PatchMapPresentationReconcileState]:
    PatchMapPresentationReconcileState[Key];
};

/**
 * Ephemeral columnar publication owned by the controller. Core consumes this
 * synchronously before the next controller call; application code continues
 * to receive the immutable PatchMapPresentationFrame contract from advance().
 */
export interface PatchMapPresentationReconcileFrame {
  readonly timeMs: number;
  readonly activeCount: number;
  readonly changedCount: number;
  readonly settledCount: number;
  readonly totalSettlementCount: number;
  readonly published: boolean;
  readonly entityIds: readonly (string | undefined)[];
  readonly slots: Uint32Array;
  readonly generations: Uint32Array;
  readonly values: Float64Array;
}

type MutableReconcileFrame = {
  -readonly [Key in keyof PatchMapPresentationReconcileFrame]:
    PatchMapPresentationReconcileFrame[Key];
};

const EMPTY_IDS: readonly string[] = Object.freeze([]);
const EMPTY_UPDATES: readonly PatchMapPresentationUpdate[] = Object.freeze([]);
const EMPTY_RANGES: readonly PatchMapPresentationDirtyRange[] = Object.freeze([]);
const INITIAL_CAPACITY = 16;
const UINT32_MAX = 0xffff_ffff;

/**
 * One flat, manually-clocked scalar presentation sidecar.
 *
 * It owns no semantic destination, Pixi object, ticker, listener, RAF, or
 * per-entity closure. Engine integration commits semantics first, retargets
 * this controller with the renderer-visible value, applies returned updates to
 * aggregate buffers, marks returned ranges dirty, and requests another manual
 * frame only while `activeCount > 0`.
 */
export class PatchMapPresentationController {
  private readonly lifecycleGenerationValue: number;
  private readonly defaultDurationMs: number;
  private capacity: number;
  private countValue = 0;
  private ids: Array<string | undefined>;
  private slots: Uint32Array;
  private generations: Uint32Array;
  private startValues: Float64Array;
  private destinationValues: Float64Array;
  private currentValues: Float64Array;
  private startTimes: Float64Array;
  private durations: Float64Array;
  private reconcileEntityIds: Array<string | undefined>;
  private reconcileSlots: Uint32Array;
  private reconcileGenerations: Uint32Array;
  private reconcileValues: Float64Array;
  private readonly reconcileFrame: MutableReconcileFrame;
  private readonly indexById = new Map<string, number>();
  private clockMsValue = 0;
  private presentationRevisionValue = 0;
  private totalSettlementCountValue = 0;
  private totalCancellationCountValue = 0;
  private totalSupersessionCountValue = 0;
  private publishedFrameCountValue = 0;
  private destroyedValue = false;
  private readonly reconcileState: MutableReconcileState = {
    found: false,
    entityId: '',
    slot: 0,
    generation: 0,
    currentValue: 0,
    scheduled: false,
    replaced: false,
    startValue: 0,
    destinationValue: 0,
    durationMs: 0,
    changed: false,
    changedValue: 0,
    settled: false,
    published: false,
  };

  public constructor(options: PatchMapPresentationControllerOptions = {}) {
    this.lifecycleGenerationValue = uint32Positive(
      options.lifecycleGeneration ?? 1,
      'lifecycleGeneration',
    );
    this.defaultDurationMs = nonNegativeFinite(
      options.defaultDurationMs ?? PATCH_MAP_PRESENTATION_DEFAULT_DURATION_MS,
      'defaultDurationMs',
    );
    this.capacity = positiveInteger(options.initialCapacity ?? INITIAL_CAPACITY, 'initialCapacity');
    this.ids = new Array<string | undefined>(this.capacity);
    this.slots = new Uint32Array(this.capacity);
    this.generations = new Uint32Array(this.capacity);
    this.startValues = new Float64Array(this.capacity);
    this.destinationValues = new Float64Array(this.capacity);
    this.currentValues = new Float64Array(this.capacity);
    this.startTimes = new Float64Array(this.capacity);
    this.durations = new Float64Array(this.capacity);
    this.reconcileEntityIds = new Array<string | undefined>(this.capacity);
    this.reconcileSlots = new Uint32Array(this.capacity);
    this.reconcileGenerations = new Uint32Array(this.capacity);
    this.reconcileValues = new Float64Array(this.capacity);
    this.reconcileFrame = {
      timeMs: 0,
      activeCount: 0,
      changedCount: 0,
      settledCount: 0,
      totalSettlementCount: 0,
      published: false,
      entityIds: this.reconcileEntityIds,
      slots: this.reconcileSlots,
      generations: this.reconcileGenerations,
      values: this.reconcileValues,
    };
  }

  public get activeCount(): number {
    return this.destroyedValue ? 0 : this.countValue;
  }

  public get presentationRevision(): number {
    return this.presentationRevisionValue;
  }

  public get lifecycleGeneration(): number {
    return this.lifecycleGenerationValue;
  }

  public retarget(input: PatchMapPresentationRetargetInput): PatchMapPresentationRetargetResult {
    this.assertAlive('retarget');
    const entityId = nonEmptyString(input.entityId, 'entityId');
    const slot = uint32(input.slot, 'slot');
    const generation = uint32Positive(input.generation, 'generation');
    const currentVisibleValue = finite(input.currentVisibleValue, 'currentVisibleValue');
    const destinationValue = finite(input.destinationValue, 'destinationValue');
    const timeMs = finite(input.timeMs, 'timeMs');
    const durationMs = nonNegativeFinite(
      input.durationMs ?? this.defaultDurationMs,
      'durationMs',
    );
    const enabled = optionalBoolean(input.enabled, true, 'enabled');
    const state = this.retargetForReconcile(
      entityId,
      slot,
      generation,
      currentVisibleValue,
      destinationValue,
      timeMs,
      durationMs,
      enabled,
    );
    return this.materializeRetargetResult(state, timeMs);
  }

  /**
   * Internal allocation-free active-row view for the Core reconcile loop.
   * The returned controller-owned object is ephemeral and overwritten by the
   * next reconcile read, retarget, or cancel call.
   */
  public readActiveForReconcile(
    entityId: string,
  ): PatchMapPresentationReconcileState {
    const state = this.reconcileState;
    if (this.destroyedValue) {
      this.resetReconcileState(state);
      return state;
    }
    const index = this.indexById.get(entityId);
    state.found = index !== undefined;
    state.entityId = entityId;
    state.slot = index === undefined ? 0 : (this.slots[index] ?? 0);
    state.generation = index === undefined ? 0 : (this.generations[index] ?? 0);
    state.currentValue = index === undefined ? 0 : (this.currentValues[index] ?? 0);
    this.clearReconcileTransition(state);
    return state;
  }

  /**
   * Internal scalar retarget kernel. It preserves controller counters and
   * publication semantics without materializing public frame arrays.
   */
  public retargetForReconcile(
    entityIdInput: string,
    slotInput: number,
    generationInput: number,
    currentVisibleValueInput: number,
    destinationValueInput: number,
    timeMsInput: number,
    durationMsInput?: number,
    enabledInput?: boolean,
  ): PatchMapPresentationReconcileState {
    this.assertAlive('retarget');
    const entityId = nonEmptyString(entityIdInput, 'entityId');
    const slot = uint32(slotInput, 'slot');
    const generation = uint32Positive(generationInput, 'generation');
    const currentVisibleValue = finite(currentVisibleValueInput, 'currentVisibleValue');
    const destinationValue = finite(destinationValueInput, 'destinationValue');
    const timeMs = finite(timeMsInput, 'timeMs');
    const durationMs = nonNegativeFinite(
      durationMsInput ?? this.defaultDurationMs,
      'durationMs',
    );
    const enabled = optionalBoolean(enabledInput, true, 'enabled');
    this.assertMonotonic(timeMs, 'retarget');

    const state = this.reconcileState;
    state.found = false;
    state.entityId = entityId;
    state.slot = slot;
    state.generation = generation;
    state.currentValue = currentVisibleValue;
    state.scheduled = false;
    state.replaced = false;
    state.startValue = currentVisibleValue;
    state.destinationValue = destinationValue;
    state.durationMs = durationMs;
    state.changed = false;
    state.changedValue = currentVisibleValue;
    state.settled = false;
    state.published = false;

    const existing = this.indexById.get(entityId);
    const replaced = existing !== undefined;
    let startValue = currentVisibleValue;

    if (existing !== undefined) {
      this.totalSupersessionCountValue += 1;
      const sameIdentity = this.slots[existing] === slot &&
        this.generations[existing] === generation;
      if (sameIdentity) {
        startValue = this.sampleAt(existing, timeMs);
        if (!Object.is(startValue, this.currentValues[existing])) {
          this.currentValues[existing] = startValue;
          state.changed = true;
          state.changedValue = startValue;
        }
      } else {
        this.totalCancellationCountValue += 1;
      }
    }

    this.clockMsValue = timeMs;
    const immediate = !enabled || durationMs === 0;
    if (immediate || Object.is(startValue, destinationValue)) {
      if (existing !== undefined) this.removeAt(existing);
      if (!Object.is(startValue, destinationValue)) {
        state.changed = true;
        state.changedValue = destinationValue;
        state.settled = true;
        this.totalSettlementCountValue += 1;
      }
      this.publishReconcileTransition(state);
      state.replaced = replaced;
      state.startValue = startValue;
      state.currentValue = state.changed ? state.changedValue : startValue;
      return state;
    }

    const index = existing ?? this.append(entityId);
    if (existing !== undefined) this.ids[index] = entityId;
    this.slots[index] = slot;
    this.generations[index] = generation;
    this.startValues[index] = startValue;
    this.destinationValues[index] = destinationValue;
    this.currentValues[index] = startValue;
    this.startTimes[index] = timeMs;
    this.durations[index] = durationMs;
    this.indexById.set(entityId, index);

    this.publishReconcileTransition(state);
    state.found = true;
    state.scheduled = true;
    state.replaced = replaced;
    state.startValue = startValue;
    state.currentValue = startValue;
    return state;
  }

  public advance(timeMs: number): PatchMapPresentationFrame {
    this.assertAlive('advance');
    this.assertMonotonic(timeMs, 'advance');
    this.clockMsValue = timeMs;
    if (this.countValue === 0) return this.finishFrame('advance', timeMs, [], []);

    const updates: PatchMapPresentationUpdate[] = [];
    const settledIds: string[] = [];
    let index = 0;
    while (index < this.countValue) {
      const value = this.sampleAt(index, timeMs);
      if (!Object.is(value, this.currentValues[index])) {
        this.currentValues[index] = value;
        updates.push(this.updateAt(index, value));
      }
      const settled = timeMs - (this.startTimes[index] ?? 0) >= (this.durations[index] ?? 0);
      if (!settled) {
        index += 1;
        continue;
      }
      const id = this.requiredId(index);
      const destination = this.destinationValues[index] ?? 0;
      if (!Object.is(value, destination)) {
        this.currentValues[index] = destination;
        replaceUpdate(updates, this.updateAt(index, destination));
      }
      settledIds.push(id);
      this.totalSettlementCountValue += 1;
      this.removeAt(index);
    }
    return this.finishFrame('advance', timeMs, updates, settledIds);
  }

  /**
   * Internal frame kernel for aggregate publication. It writes changed rows
   * into controller-owned typed arrays instead of allocating and freezing one
   * object per active bar. The returned view is valid only until the next call
   * that advances or destroys this controller.
   */
  public advanceForReconcile(timeMs: number): PatchMapPresentationReconcileFrame {
    this.assertAlive('advance');
    this.assertMonotonic(timeMs, 'advance');
    this.clockMsValue = timeMs;

    let changedCount = 0;
    let settledCount = 0;
    let index = 0;
    while (index < this.countValue) {
      const value = this.sampleAt(index, timeMs);
      let changedIndex = -1;
      if (!Object.is(value, this.currentValues[index])) {
        this.currentValues[index] = value;
        changedIndex = changedCount;
        this.writeReconcileUpdate(changedCount, index, value);
        changedCount += 1;
      }
      const settled = timeMs - (this.startTimes[index] ?? 0) >=
        (this.durations[index] ?? 0);
      if (!settled) {
        index += 1;
        continue;
      }
      const destination = this.destinationValues[index] ?? 0;
      if (!Object.is(value, destination)) {
        this.currentValues[index] = destination;
        if (changedIndex === -1) {
          this.writeReconcileUpdate(changedCount, index, destination);
          changedCount += 1;
        } else {
          this.reconcileValues[changedIndex] = destination;
        }
      }
      settledCount += 1;
      this.totalSettlementCountValue += 1;
      this.removeAt(index);
    }

    const frame = this.reconcileFrame;
    frame.timeMs = timeMs;
    frame.activeCount = this.countValue;
    frame.changedCount = changedCount;
    frame.settledCount = settledCount;
    frame.totalSettlementCount = this.totalSettlementCountValue;
    frame.published = changedCount > 0;
    if (frame.published) {
      this.presentationRevisionValue += 1;
      this.publishedFrameCountValue += 1;
    }
    return frame;
  }

  /**
   * Settle every active presentation at its already-committed semantic
   * destination without interpreting a long wall-clock gap as animation time.
   * Page suspension uses this once before the manual scheduler is gated.
   */
  public settle(timeMs: number): PatchMapPresentationFrame {
    this.assertAlive('advance');
    this.assertMonotonic(timeMs, 'advance');
    this.clockMsValue = timeMs;
    if (this.countValue === 0) return this.finishFrame('advance', timeMs, [], []);

    const updates: PatchMapPresentationUpdate[] = [];
    const settledIds: string[] = [];
    while (this.countValue > 0) {
      const id = this.requiredId(0);
      const destination = this.destinationValues[0] ?? 0;
      if (!Object.is(this.currentValues[0], destination)) {
        this.currentValues[0] = destination;
        updates.push(this.updateAt(0, destination));
      }
      settledIds.push(id);
      this.totalSettlementCountValue += 1;
      this.removeAt(0);
    }
    return this.finishFrame('advance', timeMs, updates, settledIds);
  }

  public cancel(input: PatchMapPresentationCancelInput): PatchMapPresentationCancelResult {
    this.assertAlive('cancel');
    const entityId = nonEmptyString(input.entityId, 'entityId');
    const generation = uint32Positive(input.generation, 'generation');
    const reason = cancelReason(input.reason);
    const timeMs = input.timeMs;
    const cancelled = this.cancelForReconcile(
      entityId,
      generation,
      timeMs,
      reason,
    );
    return Object.freeze({
      lifecycleGeneration: this.lifecycleGenerationValue,
      presentationRevision: this.presentationRevisionValue,
      timeMs,
      entityId,
      reason,
      cancelled,
      activeCount: this.countValue,
      published: false,
    });
  }

  /** Internal allocation-free cancel kernel for Core reconciliation. */
  public cancelForReconcile(
    entityIdInput: string,
    generationInput: number,
    timeMs: number,
    reasonInput: Exclude<PatchMapPresentationCancelReason, 'destroy'>,
  ): boolean {
    this.assertAlive('cancel');
    const entityId = nonEmptyString(entityIdInput, 'entityId');
    const generation = uint32Positive(generationInput, 'generation');
    cancelReason(reasonInput);
    this.assertMonotonic(timeMs, 'cancel');
    this.clockMsValue = timeMs;
    const index = this.indexById.get(entityId);
    const cancelled = index !== undefined && this.generations[index] === generation;
    if (cancelled) {
      this.removeAt(index);
      this.totalCancellationCountValue += 1;
    }
    this.resetReconcileState(this.reconcileState);
    return cancelled;
  }

  public probe(entityId: string): PatchMapPresentationProbe | null {
    if (this.destroyedValue) return null;
    const active = this.readActiveForReconcile(entityId);
    if (!active.found) return null;
    const index = this.indexById.get(entityId);
    if (index === undefined) return null;
    return Object.freeze({
      entityId: active.entityId,
      slot: active.slot,
      generation: active.generation,
      currentValue: active.currentValue,
      startValue: this.startValues[index] ?? 0,
      destinationValue: this.destinationValues[index] ?? 0,
      startTimeMs: this.startTimes[index] ?? 0,
      durationMs: this.durations[index] ?? 0,
    });
  }

  public snapshot(): PatchMapPresentationSnapshot {
    return Object.freeze({
      lifecycleGeneration: this.lifecycleGenerationValue,
      presentationRevision: this.presentationRevisionValue,
      clockMs: this.clockMsValue,
      activeCount: this.destroyedValue ? 0 : this.countValue,
      indexedCount: this.indexById.size,
      capacity: this.capacity,
      totalSettlementCount: this.totalSettlementCountValue,
      totalCancellationCount: this.totalCancellationCountValue,
      totalSupersessionCount: this.totalSupersessionCountValue,
      publishedFrameCount: this.publishedFrameCountValue,
      destroyed: this.destroyedValue,
    });
  }

  public destroy(): PatchMapPresentationDestroyResult {
    if (this.destroyedValue) {
      this.resetReconcileState(this.reconcileState);
      return Object.freeze({
        lifecycleGeneration: this.lifecycleGenerationValue,
        presentationRevision: this.presentationRevisionValue,
        destroyed: true,
        cancelledCount: 0,
        cancelledEntityIds: EMPTY_IDS,
        published: false,
      });
    }
    const cancelledEntityIds: string[] = [];
    for (let index = 0; index < this.countValue; index += 1) {
      cancelledEntityIds.push(this.requiredId(index));
    }
    cancelledEntityIds.sort();
    this.totalCancellationCountValue += cancelledEntityIds.length;
    this.countValue = 0;
    this.indexById.clear();
    this.capacity = 0;
    this.ids = [];
    this.slots = new Uint32Array(0);
    this.generations = new Uint32Array(0);
    this.startValues = new Float64Array(0);
    this.destinationValues = new Float64Array(0);
    this.currentValues = new Float64Array(0);
    this.startTimes = new Float64Array(0);
    this.durations = new Float64Array(0);
    this.reconcileEntityIds = [];
    this.reconcileSlots = new Uint32Array(0);
    this.reconcileGenerations = new Uint32Array(0);
    this.reconcileValues = new Float64Array(0);
    this.reconcileFrame.entityIds = this.reconcileEntityIds;
    this.reconcileFrame.slots = this.reconcileSlots;
    this.reconcileFrame.generations = this.reconcileGenerations;
    this.reconcileFrame.values = this.reconcileValues;
    this.reconcileFrame.activeCount = 0;
    this.reconcileFrame.changedCount = 0;
    this.reconcileFrame.settledCount = 0;
    this.reconcileFrame.published = false;
    this.destroyedValue = true;
    this.resetReconcileState(this.reconcileState);
    return Object.freeze({
      lifecycleGeneration: this.lifecycleGenerationValue,
      presentationRevision: this.presentationRevisionValue,
      destroyed: true,
      cancelledCount: cancelledEntityIds.length,
      cancelledEntityIds: Object.freeze(cancelledEntityIds),
      published: false,
    });
  }

  private resetReconcileState(state: MutableReconcileState): void {
    state.found = false;
    state.entityId = '';
    state.slot = 0;
    state.generation = 0;
    state.currentValue = 0;
    this.clearReconcileTransition(state);
  }

  private clearReconcileTransition(state: MutableReconcileState): void {
    state.scheduled = false;
    state.replaced = false;
    state.startValue = state.currentValue;
    state.destinationValue = state.currentValue;
    state.durationMs = 0;
    state.changed = false;
    state.changedValue = state.currentValue;
    state.settled = false;
    state.published = false;
  }

  private publishReconcileTransition(state: MutableReconcileState): void {
    state.published = state.changed;
    if (!state.published) return;
    this.presentationRevisionValue += 1;
    this.publishedFrameCountValue += 1;
  }

  private materializeRetargetResult(
    state: PatchMapPresentationReconcileState,
    timeMs: number,
  ): PatchMapPresentationRetargetResult {
    const updates: readonly PatchMapPresentationUpdate[] = state.changed
      ? Object.freeze([Object.freeze({
          entityId: state.entityId,
          slot: state.slot,
          generation: state.generation,
          value: state.changedValue,
        })])
      : EMPTY_UPDATES;
    const dirtyEntityIds = state.changed
      ? Object.freeze([state.entityId])
      : EMPTY_IDS;
    const dirtyRanges: readonly PatchMapPresentationDirtyRange[] = state.changed
      ? Object.freeze([Object.freeze({ start: state.slot, end: state.slot + 1 })])
      : EMPTY_RANGES;
    const settledEntityIds = state.settled
      ? Object.freeze([state.entityId])
      : EMPTY_IDS;
    return Object.freeze({
      operation: 'retarget',
      lifecycleGeneration: this.lifecycleGenerationValue,
      presentationRevision: this.presentationRevisionValue,
      timeMs,
      activeCount: this.countValue,
      changedCount: updates.length,
      settledCount: settledEntityIds.length,
      totalSettlementCount: this.totalSettlementCountValue,
      published: state.published,
      updates,
      dirtyEntityIds,
      dirtyRanges,
      settledEntityIds,
      scheduled: state.scheduled,
      replaced: state.replaced,
      startValue: state.startValue,
      destinationValue: state.destinationValue,
      durationMs: state.durationMs,
    });
  }

  private assertAlive(operation: PatchMapPresentationDiagnostic['operation']): void {
    if (!this.destroyedValue) return;
    throw new PatchMapPresentationError(Object.freeze({
      code: 'DESTROYED',
      category: 'DESTROYED',
      operation,
      lifecycleGeneration: this.lifecycleGenerationValue,
      presentationRevision: this.presentationRevisionValue,
      recoverable: false,
      retryable: false,
    }));
  }

  private assertMonotonic(
    timeMs: number,
    operation: PatchMapPresentationDiagnostic['operation'],
  ): void {
    if (Number.isFinite(timeMs) && timeMs >= this.clockMsValue) return;
    throw new PatchMapPresentationError(Object.freeze({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
      operation,
      lifecycleGeneration: this.lifecycleGenerationValue,
      presentationRevision: this.presentationRevisionValue,
      recoverable: true,
      retryable: true,
      field: 'timeMs',
    }));
  }

  private sampleAt(index: number, timeMs: number): number {
    const startTime = this.startTimes[index] ?? 0;
    const duration = this.durations[index] ?? 0;
    if (timeMs <= startTime) return this.startValues[index] ?? 0;
    if (timeMs - startTime >= duration) return this.destinationValues[index] ?? 0;
    const progress = Math.max(0, Math.min(1, (timeMs - startTime) / duration));
    const inverse = 1 - progress;
    const eased = 1 - inverse * inverse * inverse;
    const from = this.startValues[index] ?? 0;
    const to = this.destinationValues[index] ?? 0;
    return canonicalNumber(from * (1 - eased) + to * eased);
  }

  private finishFrame(
    operation: PatchMapPresentationFrame['operation'],
    timeMs: number,
    mutableUpdates: PatchMapPresentationUpdate[],
    mutableSettledIds: string[],
  ): PatchMapPresentationFrame {
    if (
      mutableUpdates.length > 1 &&
      !updatesAreOrdered(mutableUpdates)
    ) {
      mutableUpdates.sort(compareUpdates);
    }
    if (mutableSettledIds.length > 1) mutableSettledIds.sort();
    const updates = mutableUpdates.length === 0
      ? EMPTY_UPDATES
      : Object.freeze(mutableUpdates);
    const settledEntityIds = mutableSettledIds.length === 0
      ? EMPTY_IDS
      : Object.freeze(mutableSettledIds);
    const published = updates.length > 0;
    if (published) {
      this.presentationRevisionValue += 1;
      this.publishedFrameCountValue += 1;
    }
    return Object.freeze({
      operation,
      lifecycleGeneration: this.lifecycleGenerationValue,
      presentationRevision: this.presentationRevisionValue,
      timeMs,
      activeCount: this.countValue,
      changedCount: updates.length,
      settledCount: settledEntityIds.length,
      totalSettlementCount: this.totalSettlementCountValue,
      published,
      updates,
      dirtyEntityIds: updates.length === 0 ? EMPTY_IDS : dirtyEntityIds(updates),
      dirtyRanges: updates.length === 0 ? EMPTY_RANGES : dirtyRanges(updates),
      settledEntityIds,
    });
  }

  private updateAt(index: number, value: number): PatchMapPresentationUpdate {
    return Object.freeze({
      entityId: this.requiredId(index),
      slot: this.slots[index] ?? 0,
      generation: this.generations[index] ?? 0,
      value,
    });
  }

  private writeReconcileUpdate(outputIndex: number, rowIndex: number, value: number): void {
    this.reconcileEntityIds[outputIndex] = this.requiredId(rowIndex);
    this.reconcileSlots[outputIndex] = this.slots[rowIndex] ?? 0;
    this.reconcileGenerations[outputIndex] = this.generations[rowIndex] ?? 0;
    this.reconcileValues[outputIndex] = value;
  }

  private append(entityId: string): number {
    this.ensureCapacity(this.countValue + 1);
    const index = this.countValue;
    this.countValue += 1;
    this.ids[index] = entityId;
    return index;
  }

  private removeAt(index: number): void {
    const removedId = this.requiredId(index);
    this.indexById.delete(removedId);
    const last = this.countValue - 1;
    this.countValue = last;
    if (index !== last) {
      const movedId = this.requiredId(last);
      this.ids[index] = movedId;
      this.slots[index] = this.slots[last] ?? 0;
      this.generations[index] = this.generations[last] ?? 0;
      this.startValues[index] = this.startValues[last] ?? 0;
      this.destinationValues[index] = this.destinationValues[last] ?? 0;
      this.currentValues[index] = this.currentValues[last] ?? 0;
      this.startTimes[index] = this.startTimes[last] ?? 0;
      this.durations[index] = this.durations[last] ?? 0;
      this.indexById.set(movedId, index);
    }
    this.ids[last] = undefined;
  }

  private requiredId(index: number): string {
    const id = this.ids[index];
    if (id === undefined) throw new Error('PatchMap presentation index corruption');
    return id;
  }

  private ensureCapacity(required: number): void {
    if (required <= this.capacity) return;
    let capacity = this.capacity;
    while (capacity < required) capacity *= 2;
    this.ids.length = capacity;
    this.slots = growUint32(this.slots, capacity);
    this.generations = growUint32(this.generations, capacity);
    this.startValues = growFloat64(this.startValues, capacity);
    this.destinationValues = growFloat64(this.destinationValues, capacity);
    this.currentValues = growFloat64(this.currentValues, capacity);
    this.startTimes = growFloat64(this.startTimes, capacity);
    this.durations = growFloat64(this.durations, capacity);
    this.reconcileEntityIds.length = capacity;
    this.reconcileSlots = growUint32(this.reconcileSlots, capacity);
    this.reconcileGenerations = growUint32(this.reconcileGenerations, capacity);
    this.reconcileValues = growFloat64(this.reconcileValues, capacity);
    this.reconcileFrame.entityIds = this.reconcileEntityIds;
    this.reconcileFrame.slots = this.reconcileSlots;
    this.reconcileFrame.generations = this.reconcileGenerations;
    this.reconcileFrame.values = this.reconcileValues;
    this.capacity = capacity;
  }
}

function dirtyRanges(
  updates: readonly PatchMapPresentationUpdate[],
): readonly PatchMapPresentationDirtyRange[] {
  const first = updates[0];
  if (first === undefined) return EMPTY_RANGES;
  const ranges: PatchMapPresentationDirtyRange[] = [];
  let start = first.slot;
  let end = start + 1;
  for (let index = 1; index < updates.length; index += 1) {
    const slot = updates[index]?.slot ?? end;
    if (slot <= end) {
      end = Math.max(end, slot + 1);
      continue;
    }
    ranges.push(Object.freeze({ start, end }));
    start = slot;
    end = slot + 1;
  }
  ranges.push(Object.freeze({ start, end }));
  return Object.freeze(ranges);
}

function replaceUpdate(
  updates: PatchMapPresentationUpdate[],
  update: PatchMapPresentationUpdate,
): void {
  for (let index = 0; index < updates.length; index += 1) {
    if (updates[index]?.entityId !== update.entityId) continue;
    updates[index] = update;
    return;
  }
  updates.push(update);
}

function dirtyEntityIds(updates: readonly PatchMapPresentationUpdate[]): readonly string[] {
  const ids = new Array<string>(updates.length);
  for (let index = 0; index < updates.length; index += 1) {
    ids[index] = updates[index]?.entityId ?? '';
  }
  return Object.freeze(ids);
}

function compareUpdates(left: PatchMapPresentationUpdate, right: PatchMapPresentationUpdate): number {
  return left.slot - right.slot || left.entityId.localeCompare(right.entityId);
}

function updatesAreOrdered(updates: readonly PatchMapPresentationUpdate[]): boolean {
  for (let index = 1; index < updates.length; index += 1) {
    const previous = updates[index - 1];
    const current = updates[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      compareUpdates(previous, current) > 0
    ) {
      return false;
    }
  }
  return true;
}

function growUint32(values: Uint32Array, capacity: number): Uint32Array {
  const next = new Uint32Array(capacity);
  next.set(values);
  return next;
}

function growFloat64(values: Float64Array, capacity: number): Float64Array {
  const next = new Float64Array(capacity);
  next.set(values);
  return next;
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return canonicalNumber(value);
}

function nonNegativeFinite(value: unknown, label: string): number {
  const normalized = finite(value, label);
  if (normalized < 0) throw new RangeError(`${label} must be non-negative`);
  return normalized;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function uint32(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > UINT32_MAX) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
  return value as number;
}

function uint32Positive(value: unknown, label: string): number {
  const normalized = uint32(value, label);
  if (normalized === 0) throw new RangeError(`${label} must be positive`);
  return normalized;
}

function optionalBoolean(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function cancelReason(value: unknown): Exclude<PatchMapPresentationCancelReason, 'destroy'> {
  if (value === 'hide' || value === 'remove' || value === 'replacement') return value;
  throw new TypeError('reason must be hide, remove, or replacement');
}
