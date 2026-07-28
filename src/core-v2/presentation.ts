export const CORE_V2_PRESENTATION_DEFAULT_DURATION_MS = 200;

export type CoreV2PresentationCancelReason =
  | 'hide'
  | 'remove'
  | 'replacement'
  | 'destroy';

export interface CoreV2PresentationControllerOptions {
  /** Engine lifecycle generation copied into every result and diagnostic. */
  readonly lifecycleGeneration?: number;
  readonly defaultDurationMs?: number;
  readonly initialCapacity?: number;
}

export interface CoreV2PresentationRetargetInput {
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

export interface CoreV2PresentationCancelInput {
  readonly entityId: string;
  readonly generation: number;
  readonly timeMs: number;
  readonly reason: Exclude<CoreV2PresentationCancelReason, 'destroy'>;
}

export interface CoreV2PresentationDirtyRange {
  /** Inclusive dense slot. */
  readonly start: number;
  /** Exclusive dense slot. */
  readonly end: number;
}

export interface CoreV2PresentationUpdate {
  readonly entityId: string;
  readonly slot: number;
  readonly generation: number;
  readonly value: number;
}

export interface CoreV2PresentationFrame {
  readonly operation: 'advance' | 'retarget';
  readonly lifecycleGeneration: number;
  readonly presentationRevision: number;
  readonly timeMs: number;
  readonly activeCount: number;
  readonly changedCount: number;
  readonly settledCount: number;
  readonly totalSettlementCount: number;
  readonly published: boolean;
  readonly updates: readonly CoreV2PresentationUpdate[];
  readonly dirtyEntityIds: readonly string[];
  readonly dirtyRanges: readonly CoreV2PresentationDirtyRange[];
  readonly settledEntityIds: readonly string[];
}

export interface CoreV2PresentationRetargetResult extends CoreV2PresentationFrame {
  readonly operation: 'retarget';
  readonly scheduled: boolean;
  readonly replaced: boolean;
  readonly startValue: number;
  readonly destinationValue: number;
  readonly durationMs: number;
}

export interface CoreV2PresentationCancelResult {
  readonly lifecycleGeneration: number;
  readonly presentationRevision: number;
  readonly timeMs: number;
  readonly entityId: string;
  readonly reason: Exclude<CoreV2PresentationCancelReason, 'destroy'>;
  readonly cancelled: boolean;
  readonly activeCount: number;
  readonly published: false;
}

export interface CoreV2PresentationDestroyResult {
  readonly lifecycleGeneration: number;
  readonly presentationRevision: number;
  readonly destroyed: true;
  readonly cancelledCount: number;
  readonly cancelledEntityIds: readonly string[];
  readonly published: false;
}

export interface CoreV2PresentationProbe {
  readonly entityId: string;
  readonly slot: number;
  readonly generation: number;
  readonly currentValue: number;
  readonly startValue: number;
  readonly destinationValue: number;
  readonly startTimeMs: number;
  readonly durationMs: number;
}

export interface CoreV2PresentationSnapshot {
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

export interface CoreV2PresentationDiagnostic {
  readonly code: 'DESTROYED' | 'INVALID_VALUE';
  readonly category: 'DESTROYED' | 'INVALID_INPUT';
  readonly operation: 'advance' | 'cancel' | 'retarget';
  readonly lifecycleGeneration: number;
  readonly presentationRevision: number;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly field?: string;
}

export class CoreV2PresentationError extends Error {
  public readonly diagnostic: CoreV2PresentationDiagnostic;

  public constructor(diagnostic: CoreV2PresentationDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.operation}`);
    this.name = 'CoreV2PresentationError';
    this.diagnostic = diagnostic;
  }
}

interface NormalizedRetarget {
  readonly entityId: string;
  readonly slot: number;
  readonly generation: number;
  readonly currentVisibleValue: number;
  readonly destinationValue: number;
  readonly timeMs: number;
  readonly durationMs: number;
  readonly enabled: boolean;
}

const EMPTY_IDS: readonly string[] = Object.freeze([]);
const EMPTY_UPDATES: readonly CoreV2PresentationUpdate[] = Object.freeze([]);
const EMPTY_RANGES: readonly CoreV2PresentationDirtyRange[] = Object.freeze([]);
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
export class CoreV2PresentationController {
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
  private readonly indexById = new Map<string, number>();
  private clockMsValue = 0;
  private presentationRevisionValue = 0;
  private totalSettlementCountValue = 0;
  private totalCancellationCountValue = 0;
  private totalSupersessionCountValue = 0;
  private publishedFrameCountValue = 0;
  private destroyedValue = false;

  public constructor(options: CoreV2PresentationControllerOptions = {}) {
    this.lifecycleGenerationValue = uint32Positive(
      options.lifecycleGeneration ?? 1,
      'lifecycleGeneration',
    );
    this.defaultDurationMs = nonNegativeFinite(
      options.defaultDurationMs ?? CORE_V2_PRESENTATION_DEFAULT_DURATION_MS,
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
  }

  public get activeCount(): number {
    return this.destroyedValue ? 0 : this.countValue;
  }

  public get lifecycleGeneration(): number {
    return this.lifecycleGenerationValue;
  }

  public retarget(input: CoreV2PresentationRetargetInput): CoreV2PresentationRetargetResult {
    this.assertAlive('retarget');
    const normalized = this.normalizeRetarget(input);
    this.assertMonotonic(normalized.timeMs, 'retarget');

    const updates: CoreV2PresentationUpdate[] = [];
    const settledIds: string[] = [];
    const existing = this.indexById.get(normalized.entityId);
    const replaced = existing !== undefined;
    let startValue = normalized.currentVisibleValue;

    if (existing !== undefined) {
      this.totalSupersessionCountValue += 1;
      const sameIdentity = this.slots[existing] === normalized.slot &&
        this.generations[existing] === normalized.generation;
      if (sameIdentity) {
        startValue = this.sampleAt(existing, normalized.timeMs);
        if (!Object.is(startValue, this.currentValues[existing])) {
          this.currentValues[existing] = startValue;
          updates.push(this.updateAt(existing, startValue));
        }
      } else {
        this.totalCancellationCountValue += 1;
      }
    }

    this.clockMsValue = normalized.timeMs;
    const immediate = !normalized.enabled || normalized.durationMs === 0;
    if (immediate || Object.is(startValue, normalized.destinationValue)) {
      if (existing !== undefined) this.removeAt(existing);
      if (!Object.is(startValue, normalized.destinationValue)) {
        replaceUpdate(updates, Object.freeze({
          entityId: normalized.entityId,
          slot: normalized.slot,
          generation: normalized.generation,
          value: normalized.destinationValue,
        }));
        settledIds.push(normalized.entityId);
        this.totalSettlementCountValue += 1;
      }
      const frame = this.finishFrame('retarget', normalized.timeMs, updates, settledIds);
      return Object.freeze({
        ...frame,
        operation: 'retarget',
        scheduled: false,
        replaced,
        startValue,
        destinationValue: normalized.destinationValue,
        durationMs: normalized.durationMs,
      });
    }

    const index = existing ?? this.append(normalized.entityId);
    if (existing !== undefined) this.ids[index] = normalized.entityId;
    this.slots[index] = normalized.slot;
    this.generations[index] = normalized.generation;
    this.startValues[index] = startValue;
    this.destinationValues[index] = normalized.destinationValue;
    this.currentValues[index] = startValue;
    this.startTimes[index] = normalized.timeMs;
    this.durations[index] = normalized.durationMs;
    this.indexById.set(normalized.entityId, index);

    const frame = this.finishFrame('retarget', normalized.timeMs, updates, settledIds);
    return Object.freeze({
      ...frame,
      operation: 'retarget',
      scheduled: true,
      replaced,
      startValue,
      destinationValue: normalized.destinationValue,
      durationMs: normalized.durationMs,
    });
  }

  public advance(timeMs: number): CoreV2PresentationFrame {
    this.assertAlive('advance');
    this.assertMonotonic(timeMs, 'advance');
    this.clockMsValue = timeMs;
    if (this.countValue === 0) return this.finishFrame('advance', timeMs, [], []);

    const updates: CoreV2PresentationUpdate[] = [];
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
   * Settle every active presentation at its already-committed semantic
   * destination without interpreting a long wall-clock gap as animation time.
   * Page suspension uses this once before the manual scheduler is gated.
   */
  public settle(timeMs: number): CoreV2PresentationFrame {
    this.assertAlive('advance');
    this.assertMonotonic(timeMs, 'advance');
    this.clockMsValue = timeMs;
    if (this.countValue === 0) return this.finishFrame('advance', timeMs, [], []);

    const updates: CoreV2PresentationUpdate[] = [];
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

  public cancel(input: CoreV2PresentationCancelInput): CoreV2PresentationCancelResult {
    this.assertAlive('cancel');
    const entityId = nonEmptyString(input.entityId, 'entityId');
    const generation = uint32Positive(input.generation, 'generation');
    const reason = cancelReason(input.reason);
    this.assertMonotonic(input.timeMs, 'cancel');
    this.clockMsValue = input.timeMs;
    const index = this.indexById.get(entityId);
    const cancelled = index !== undefined && this.generations[index] === generation;
    if (cancelled) {
      this.removeAt(index);
      this.totalCancellationCountValue += 1;
    }
    return Object.freeze({
      lifecycleGeneration: this.lifecycleGenerationValue,
      presentationRevision: this.presentationRevisionValue,
      timeMs: input.timeMs,
      entityId,
      reason,
      cancelled,
      activeCount: this.countValue,
      published: false,
    });
  }

  public probe(entityId: string): CoreV2PresentationProbe | null {
    if (this.destroyedValue) return null;
    const index = this.indexById.get(entityId);
    if (index === undefined) return null;
    return Object.freeze({
      entityId: this.requiredId(index),
      slot: this.slots[index] ?? 0,
      generation: this.generations[index] ?? 0,
      currentValue: this.currentValues[index] ?? 0,
      startValue: this.startValues[index] ?? 0,
      destinationValue: this.destinationValues[index] ?? 0,
      startTimeMs: this.startTimes[index] ?? 0,
      durationMs: this.durations[index] ?? 0,
    });
  }

  public snapshot(): CoreV2PresentationSnapshot {
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

  public destroy(): CoreV2PresentationDestroyResult {
    if (this.destroyedValue) {
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
    this.destroyedValue = true;
    return Object.freeze({
      lifecycleGeneration: this.lifecycleGenerationValue,
      presentationRevision: this.presentationRevisionValue,
      destroyed: true,
      cancelledCount: cancelledEntityIds.length,
      cancelledEntityIds: Object.freeze(cancelledEntityIds),
      published: false,
    });
  }

  private normalizeRetarget(input: CoreV2PresentationRetargetInput): NormalizedRetarget {
    return {
      entityId: nonEmptyString(input.entityId, 'entityId'),
      slot: uint32(input.slot, 'slot'),
      generation: uint32Positive(input.generation, 'generation'),
      currentVisibleValue: finite(input.currentVisibleValue, 'currentVisibleValue'),
      destinationValue: finite(input.destinationValue, 'destinationValue'),
      timeMs: finite(input.timeMs, 'timeMs'),
      durationMs: nonNegativeFinite(input.durationMs ?? this.defaultDurationMs, 'durationMs'),
      enabled: optionalBoolean(input.enabled, true, 'enabled'),
    };
  }

  private assertAlive(operation: CoreV2PresentationDiagnostic['operation']): void {
    if (!this.destroyedValue) return;
    throw new CoreV2PresentationError(Object.freeze({
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
    operation: CoreV2PresentationDiagnostic['operation'],
  ): void {
    if (Number.isFinite(timeMs) && timeMs >= this.clockMsValue) return;
    throw new CoreV2PresentationError(Object.freeze({
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
    operation: CoreV2PresentationFrame['operation'],
    timeMs: number,
    mutableUpdates: CoreV2PresentationUpdate[],
    mutableSettledIds: string[],
  ): CoreV2PresentationFrame {
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

  private updateAt(index: number, value: number): CoreV2PresentationUpdate {
    return Object.freeze({
      entityId: this.requiredId(index),
      slot: this.slots[index] ?? 0,
      generation: this.generations[index] ?? 0,
      value,
    });
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
    if (id === undefined) throw new Error('Core v2 presentation index corruption');
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
    this.capacity = capacity;
  }
}

function dirtyRanges(
  updates: readonly CoreV2PresentationUpdate[],
): readonly CoreV2PresentationDirtyRange[] {
  const first = updates[0];
  if (first === undefined) return EMPTY_RANGES;
  const ranges: CoreV2PresentationDirtyRange[] = [];
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
  updates: CoreV2PresentationUpdate[],
  update: CoreV2PresentationUpdate,
): void {
  for (let index = 0; index < updates.length; index += 1) {
    if (updates[index]?.entityId !== update.entityId) continue;
    updates[index] = update;
    return;
  }
  updates.push(update);
}

function dirtyEntityIds(updates: readonly CoreV2PresentationUpdate[]): readonly string[] {
  const ids = new Array<string>(updates.length);
  for (let index = 0; index < updates.length; index += 1) {
    ids[index] = updates[index]?.entityId ?? '';
  }
  return Object.freeze(ids);
}

function compareUpdates(left: CoreV2PresentationUpdate, right: CoreV2PresentationUpdate): number {
  return left.slot - right.slot || left.entityId.localeCompare(right.entityId);
}

function updatesAreOrdered(updates: readonly CoreV2PresentationUpdate[]): boolean {
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

function cancelReason(value: unknown): Exclude<CoreV2PresentationCancelReason, 'destroy'> {
  if (value === 'hide' || value === 'remove' || value === 'replacement') return value;
  throw new TypeError('reason must be hide, remove, or replacement');
}
