import { AnimationTable } from './animations';
import type {
  AdvanceResult,
  CommitResult,
  CoreEvent,
  CorePoint,
  CoreSceneOptions,
  CoreTarget,
  EntityRef,
  EntitySnapshot,
  FrameReport,
  HitTestOptions,
  LoadResult,
  PointerRecord,
  PointerResult,
  QueryFilter,
  SceneDocument,
  SceneSnapshot,
  SelectionSnapshot,
  TransactionBatch,
} from './contracts';
import { CoreDestroyedError, CoreValidationError } from './errors';
import { NoopRenderer } from './renderer/noop-renderer';
import type { CoreRenderer } from './renderer/types';
import { DenseStore } from './store';
import {
  type PreparedTransaction,
  prepareTransaction,
} from './transaction';
import { type CanonicalEntity, KindCode, normalizeDocument } from './validation';

const DEFAULT_EVENT_LIMIT = 256;

export interface CoreSceneCreateOptions extends CoreSceneOptions {
  readonly renderer?: CoreRenderer;
}

interface HistoryEntry {
  readonly id?: string;
  readonly before: ReadonlyMap<string, CanonicalEntity | null>;
  readonly after: ReadonlyMap<string, CanonicalEntity | null>;
  readonly selectionBefore: ReadonlySet<string>;
  readonly selectionAfter: ReadonlySet<string>;
  readonly viewBefore: DenseStore['view'];
  readonly viewAfter: DenseStore['view'];
}

export class CoreScene {
  private store: DenseStore;
  private readonly renderer: CoreRenderer;
  private readonly animations = new AnimationTable();
  private readonly eventLimit: number;
  private readonly historyLimit: number;
  private readonly initialCapacity: number;
  private readonly events: CoreEvent[] = [];
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private selectedIds = new Set<string>();
  private revisionCounter = 0;
  private loadGeneration = 0;
  private frameCounter = 0;
  private clockMs = 0;
  private destroyed = false;

  public constructor(options: CoreSceneCreateOptions = {}) {
    this.initialCapacity = validateLimit(options.initialCapacity ?? 16, 'initialCapacity', false);
    this.historyLimit = validateLimit(options.historyLimit ?? 0, 'historyLimit', true);
    this.eventLimit = validateLimit(options.eventLimit ?? DEFAULT_EVENT_LIMIT, 'eventLimit', true);
    this.renderer = options.renderer ?? new NoopRenderer();
    this.store = new DenseStore(this.initialCapacity);
  }

  public get revision(): number {
    return this.revisionCounter;
  }

  public get entityCount(): number {
    return this.store.liveCount;
  }

  public get activeAnimations(): number {
    return this.animations.count;
  }

  public load(document: SceneDocument): LoadResult {
    this.assertAlive();
    const normalized = normalizeDocument(document);
    const view = validateDocumentView(document);
    const background = validateBackground(document.background);
    this.loadGeneration = ((this.loadGeneration + 1) >>> 0) || 1;
    const next = DenseStore.fromCanonical(normalized, {
      initialCapacity: Math.max(this.initialCapacity, normalized.length),
      view,
      background,
      generation: this.loadGeneration,
    });
    this.revisionCounter += 1;
    next.revision = this.revisionCounter;

    const previous = this.store;
    this.store = next;
    previous.destroy();
    this.animations.clear();
    this.selectedIds.clear();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.clockMs = 0;

    const result: LoadResult = Object.freeze({
      revision: this.revisionCounter,
      entityCount: next.liveCount,
      capacity: next.capacity,
      changedRanges: next.dirtyRanges(),
    });
    this.pushEvent(Object.freeze({ type: 'load', revision: this.revisionCounter, entityCount: next.liveCount }));
    return result;
  }

  public commit(batch: TransactionBatch): CommitResult {
    this.assertAlive();
    const prepared = prepareTransaction(this.store, batch, this.selectedIds);
    const result = this.applyPrepared(prepared);
    if (this.historyLimit > 0 && batch.recordHistory !== false && batch.operations.length > 0) {
      this.recordHistory(prepared);
    }
    this.pushEvent(Object.freeze({ type: 'commit', revision: result.revision, result }));
    return result;
  }

  public advance(timeMs: number): AdvanceResult {
    this.assertAlive();
    if (!Number.isFinite(timeMs) || timeMs < this.clockMs) {
      throw new CoreValidationError('timeMs', 'expected a finite monotonic time');
    }
    this.clockMs = timeMs;
    const advanced = this.animations.advance(this.store, timeMs);
    if (advanced.changed > 0) {
      this.revisionCounter += 1;
      this.store.revision = this.revisionCounter;
      this.store.finalizeMutations();
    }
    const result: AdvanceResult = Object.freeze({
      revision: this.revisionCounter,
      timeMs,
      activeAnimations: advanced.active,
      changed: advanced.changed,
      changedRanges: this.store.dirtyRanges(),
    });
    this.pushEvent(Object.freeze({ type: 'advance', revision: result.revision, result }));
    return result;
  }

  public flush(): FrameReport {
    this.assertAlive();
    const changedRanges = this.store.dirtyRanges();
    const started = clockNow();
    this.renderer.setView(this.store.view);
    const rendered = this.renderer.flush(this.store);
    const cpuMs = clockNow() - started;
    this.frameCounter += 1;
    this.store.clearDirty();
    const report: FrameReport = Object.freeze({
      revision: this.revisionCounter,
      frame: this.frameCounter,
      rendered: rendered.rendered,
      commandCount: rendered.commandCount,
      changedRanges,
      cpuMs,
    });
    this.pushEvent(Object.freeze({ type: 'flush', revision: report.revision, report }));
    return report;
  }

  public resize(width: number, height: number, pixelRatio = 1): boolean {
    this.assertAlive();
    const changed = this.renderer.resize(width, height, pixelRatio);
    if (changed) this.store.markAllDirty();
    return changed;
  }

  public ref(id: string): EntityRef | null {
    this.assertAlive();
    return this.store.ref(id);
  }

  public get(target: CoreTarget): EntitySnapshot | null {
    this.assertAlive();
    return this.store.getSnapshot(target);
  }

  public query(filter: QueryFilter = {}): readonly EntityRef[] {
    this.assertAlive();
    return this.store.query(filter);
  }

  public hitTest(point: CorePoint, options: HitTestOptions = {}): EntityRef | null {
    this.assertAlive();
    validatePoint(point);
    return this.store.hitTest(point, options);
  }

  public selection(): SelectionSnapshot {
    this.assertAlive();
    const refs: EntityRef[] = [];
    for (const id of this.selectedIds) {
      const ref = this.store.ref(id);
      if (ref) refs.push(ref);
    }
    refs.sort((left, right) => left.slot - right.slot);
    return Object.freeze({ revision: this.revisionCounter, refs: Object.freeze(refs) });
  }

  public dispatchPointer(record: PointerRecord): PointerResult {
    this.assertAlive();
    validatePointer(record);
    const target = this.hitTest(record, { interactiveOnly: true });
    if (record.type === 'down') {
      this.commit({
        id: `pointer:${record.pointerId}`,
        operations: [
          {
            type: 'selection',
            targets: target ? [target] : [],
            mode: 'replace',
          },
        ],
      });
    }
    this.pushEvent(
      Object.freeze({
        type: 'pointer',
        revision: this.revisionCounter,
        pointerType: record.type,
        target,
      }),
    );
    return Object.freeze({ target, selection: this.selection() });
  }

  public snapshot(): SceneSnapshot {
    this.assertAlive();
    const entities: EntitySnapshot[] = [];
    for (const ref of this.store.query()) {
      const entity = this.store.getSnapshot(ref);
      if (entity) entities.push(entity);
    }
    return Object.freeze({
      revision: this.revisionCounter,
      view: this.store.view,
      entityCount: entities.length,
      entities: Object.freeze(entities),
      selection: this.selection(),
    });
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): boolean {
    this.assertAlive();
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.restoreHistory(entry.before, entry.selectionBefore, entry.viewBefore);
    this.redoStack.push(entry);
    return true;
  }

  public redo(): boolean {
    this.assertAlive();
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.restoreHistory(entry.after, entry.selectionAfter, entry.viewAfter);
    this.undoStack.push(entry);
    return true;
  }

  public drainEvents(): readonly CoreEvent[] {
    this.assertAlive();
    const result = Object.freeze(this.events.splice(0));
    return result;
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.animations.destroy();
    this.store.destroy();
    this.renderer.destroy();
    this.events.length = 0;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.selectedIds.clear();
    return true;
  }

  private applyPrepared(prepared: PreparedTransaction): CommitResult {
    let added = 0;
    let removed = 0;
    let changed = 0;
    let structural = false;
    let relationEndpointsChanged = false;

    for (const [id, after] of prepared.after) {
      const before = prepared.before.get(id) ?? null;
      if (before && (after === null || prepared.replacements.has(id))) {
        const slot = this.store.slotOf(id);
        if (slot !== undefined) this.store.remove(slot);
        removed += 1;
        structural = true;
      }
    }

    for (const [id, after] of prepared.after) {
      if (!after) continue;
      const before = prepared.before.get(id) ?? null;
      const slot = this.store.slotOf(id);
      if (slot === undefined) {
        this.store.addCanonical(after);
        added += 1;
        structural = true;
      } else {
        this.store.replaceCanonical(slot, after);
        if (before) changed += 1;
        if (
          after.kind === 'relation' &&
          before?.kind === 'relation' &&
          (after.from !== before.from || after.to !== before.to)
        ) {
          relationEndpointsChanged = true;
        }
      }
    }

    if (structural || relationEndpointsChanged) this.reconnectRelations();
    this.applySelection(prepared.selectionAfter);
    if (!sameView(this.store.view, prepared.viewAfter)) this.store.setView(prepared.viewAfter);
    this.animationsForPrepared(prepared);

    this.revisionCounter += 1;
    this.store.revision = this.revisionCounter;
    this.store.finalizeMutations();
    const result: CommitResult = Object.freeze({
      revision: this.revisionCounter,
      operationCount: prepared.batch.operations.length,
      added,
      changed,
      removed,
      changedRanges: this.store.dirtyRanges(),
    });
    return result;
  }

  private animationsForPrepared(prepared: PreparedTransaction): void {
    let immediateChange = false;
    for (const animation of prepared.animations) {
      if (this.animations.schedule(this.store, animation, this.clockMs)) immediateChange = true;
    }
    if (immediateChange) this.store.finalizeMutations();
  }

  private reconnectRelations(): void {
    for (const slot of this.store.renderOrder()) {
      if (this.store.kind[slot] !== KindCode.Relation) continue;
      const from = this.store.slotOf(this.store.relationFromId[slot] ?? '');
      const to = this.store.slotOf(this.store.relationToId[slot] ?? '');
      if (from === undefined || to === undefined) throw new Error('validated relation endpoint disappeared');
      this.store.connectRelation(slot, from, to);
    }
  }

  private applySelection(next: ReadonlySet<string>): void {
    for (const id of this.selectedIds) {
      if (next.has(id)) continue;
      const slot = this.store.slotOf(id);
      if (slot !== undefined) this.store.setSelected(slot, false);
    }
    for (const id of next) {
      if (this.selectedIds.has(id)) continue;
      const slot = this.store.slotOf(id);
      if (slot !== undefined) this.store.setSelected(slot, true);
    }
    this.selectedIds = new Set(next);
  }

  private recordHistory(prepared: PreparedTransaction): void {
    const entry: HistoryEntry = {
      ...(prepared.batch.id === undefined ? {} : { id: prepared.batch.id }),
      before: prepared.before,
      after: prepared.after,
      selectionBefore: prepared.selectionBefore,
      selectionAfter: prepared.selectionAfter,
      viewBefore: prepared.viewBefore,
      viewAfter: prepared.viewAfter,
    };
    const previous = this.undoStack.at(-1);
    if (entry.id && previous?.id === entry.id) {
      this.undoStack[this.undoStack.length - 1] = mergeHistory(previous, entry);
    } else {
      this.undoStack.push(entry);
      if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  private restoreHistory(
    state: ReadonlyMap<string, CanonicalEntity | null>,
    selection: ReadonlySet<string>,
    view: DenseStore['view'],
  ): void {
    this.animations.clear();
    let structural = false;
    for (const [id, entity] of state) {
      const slot = this.store.slotOf(id);
      if (!entity && slot !== undefined) {
        this.store.remove(slot);
        structural = true;
      } else if (entity && slot === undefined) {
        this.store.addCanonical(entity);
        structural = true;
      } else if (entity && slot !== undefined) {
        this.store.replaceCanonical(slot, entity);
      }
    }
    if (structural || [...state.values()].some((entity) => entity?.kind === 'relation')) {
      this.reconnectRelations();
    }
    this.applySelection(selection);
    this.store.setView(view);
    this.revisionCounter += 1;
    this.store.revision = this.revisionCounter;
    this.store.finalizeMutations();
  }

  private pushEvent(event: CoreEvent): void {
    if (this.eventLimit === 0) return;
    if (this.events.length === this.eventLimit) this.events.shift();
    this.events.push(event);
  }

  private assertAlive(): void {
    if (this.destroyed) throw new CoreDestroyedError('CoreScene is destroyed');
  }
}

export function createCoreScene(options: CoreSceneCreateOptions = {}): CoreScene {
  return new CoreScene(options);
}

function validateLimit(value: number, name: string, allowZero: boolean): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new RangeError(`${name} must be a ${allowZero ? 'non-negative' : 'positive'} safe integer`);
  }
  return value;
}

function validateDocumentView(document: SceneDocument): DenseStore['view'] {
  const view = document.view ?? { x: 0, y: 0, scale: 1, rotation: 0 };
  if (
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y) ||
    !Number.isFinite(view.scale) ||
    view.scale <= 0 ||
    !Number.isFinite(view.rotation ?? 0)
  ) {
    throw new CoreValidationError('$.view', 'expected finite x/y/rotation and positive scale');
  }
  return Object.freeze({ ...view });
}

function validateBackground(value: number | undefined): number {
  const background = value ?? 0xf7f8faff;
  if (!Number.isInteger(background) || background < 0 || background > 0xffffffff) {
    throw new CoreValidationError('$.background', 'expected a packed 0xRRGGBBAA integer');
  }
  return background >>> 0;
}

function validatePoint(point: CorePoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new CoreValidationError('point', 'expected finite x and y');
  }
}

function validatePointer(record: PointerRecord): void {
  validatePoint(record);
  if (!Number.isSafeInteger(record.pointerId)) {
    throw new CoreValidationError('pointerId', 'expected a safe integer');
  }
  if (!Number.isFinite(record.timeMs)) {
    throw new CoreValidationError('timeMs', 'expected a finite number');
  }
}

function sameView(left: DenseStore['view'], right: DenseStore['view']): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.scale === right.scale &&
    (left.rotation ?? 0) === (right.rotation ?? 0)
  );
}

function mergeHistory(previous: HistoryEntry, next: HistoryEntry): HistoryEntry {
  const before = new Map(previous.before);
  for (const [id, entity] of next.before) {
    if (!before.has(id)) before.set(id, entity);
  }
  const after = new Map(previous.after);
  for (const [id, entity] of next.after) after.set(id, entity);
  return {
    ...(previous.id === undefined ? {} : { id: previous.id }),
    before,
    after,
    selectionBefore: previous.selectionBefore,
    selectionAfter: next.selectionAfter,
    viewBefore: previous.viewBefore,
    viewAfter: next.viewAfter,
  };
}

function clockNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}
