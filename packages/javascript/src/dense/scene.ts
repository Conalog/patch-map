import { AnimationTable } from './animations';
import type {
  AdvanceResult,
  AnimatableProperty,
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
import { NoopRenderer } from './noop-renderer';
import type { CoreRenderer, RenderStoreView } from './renderer-types';
import { DenseStore } from './store';
import {
  type PreparedTransaction,
  prepareTransaction,
} from './transaction';
import { type CanonicalEntity, KindCode, normalizeDocument } from './validation';

const DEFAULT_EVENT_LIMIT = 256;
const EMPTY_IDS: ReadonlySet<string> = new Set();

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
  readonly nonHistoricalAnimationProperties: ReadonlyMap<string, ReadonlySet<AnimatableProperty>>;
}

export class CoreScene {
  private store: DenseStore;
  private renderer: CoreRenderer | null;
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
    this.assertAlive();
    return this.revisionCounter;
  }

  public get entityCount(): number {
    this.assertAlive();
    return this.store.liveCount;
  }

  public get activeAnimations(): number {
    this.assertAlive();
    return this.animations.count;
  }

  /** Internal zero-allocation view read for renderer-owned frame planning. */
  public get view(): DenseStore['view'] {
    this.assertAlive();
    return this.store.view;
  }

  /** Internal zero-allocation renderer column view for transient presentation planning. */
  public get renderStore(): RenderStoreView {
    this.assertAlive();
    return this.store;
  }

  /**
   * Seed a fresh private replacement so its first load advances the same
   * revision and EntityRef generation sequences as this scene would in place.
   */
  protected seedReplacementLoadAuthority(revision: number, generation: number): void {
    this.assertAlive();
    if (
      this.revisionCounter !== 0 ||
      this.loadGeneration !== 0 ||
      this.store.liveCount !== 0 ||
      this.frameCounter !== 0
    ) {
      throw new Error('CoreScene replacement authority requires a fresh scene');
    }
    if (!Number.isInteger(revision) || revision < 0) {
      throw new RangeError('replacement revision must be a non-negative integer');
    }
    if (!Number.isInteger(generation) || generation < 0 || generation > 0xffff_ffff) {
      throw new RangeError('replacement generation must be a uint32');
    }
    this.revisionCounter = revision;
    this.loadGeneration = generation;
    this.store.revision = revision;
  }

  protected get replacementLoadGeneration(): number {
    this.assertAlive();
    return this.loadGeneration;
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
    const selection = this.selectionForPrepared(prepared);
    const result = this.applyPrepared(prepared, selection.after, selection.reboundIds);
    this.excludeAnimationsFromExistingHistory(prepared.animations);
    if (
      this.historyLimit > 0 &&
      batch.recordHistory !== false &&
      batch.operations.some((operation) => operation.type !== 'animate')
    ) {
      this.recordHistory(prepared, selection.after);
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
      this.refreshRelationsForEndpointSlots(advanced.geometrySlots);
      this.revisionCounter += 1;
      this.store.revision = this.revisionCounter;
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
    const renderer = this.rendererInstance();
    renderer.setView(this.store.view);
    const rendered = renderer.flush(this.store);
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
    const changed = this.rendererInstance().resize(width, height, pixelRatio);
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
    this.assertAlive();
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    this.assertAlive();
    return this.redoStack.length > 0;
  }

  public undo(): boolean {
    this.assertAlive();
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.restoreHistory(
      entry.before,
      entry.selectionBefore,
      entry.viewBefore,
      entry.nonHistoricalAnimationProperties,
    );
    this.redoStack.push(entry);
    return true;
  }

  public redo(): boolean {
    this.assertAlive();
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.restoreHistory(
      entry.after,
      entry.selectionAfter,
      entry.viewAfter,
      entry.nonHistoricalAnimationProperties,
    );
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
    this.events.length = 0;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.selectedIds.clear();
    const renderer = this.renderer;
    this.renderer = null;
    renderer?.destroy();
    return true;
  }

  private applyPrepared(
    prepared: PreparedTransaction,
    selectionAfter: ReadonlySet<string>,
    reboundSelectionIds: ReadonlySet<string>,
  ): CommitResult {
    let added = 0;
    let removed = 0;
    let changed = 0;
    const reconnectRelationIds = new Set<string>();
    const replacedEndpointIds = new Set<string>();
    const changedEndpointIds = new Set<string>();

    for (const [id, after] of prepared.after) {
      const before = prepared.before.get(id) ?? null;
      if (before && (after === null || prepared.replacements.has(id))) {
        if (prepared.replacements.has(id) && before.kind !== 'relation') {
          replacedEndpointIds.add(id);
        }
        const slot = this.store.slotOf(id);
        if (slot !== undefined) {
          this.animations.cancelSlot(slot);
          this.store.remove(slot);
        }
        removed += 1;
      }
    }

    for (const [id, after] of prepared.after) {
      if (!after) continue;
      const before = prepared.before.get(id) ?? null;
      const slot = this.store.slotOf(id);
      if (slot === undefined) {
        this.store.addCanonical(after);
        added += 1;
        if (after.kind === 'relation') reconnectRelationIds.add(id);
        else if (prepared.replacements.has(id)) changedEndpointIds.add(id);
      } else {
        const spatialChanged = before ? spatiallyChanged(before, after) : true;
        this.store.replaceCanonical(slot, after, {
          spatial: spatialChanged,
          order: before ? before.zIndex !== after.zIndex : true,
        });
        if (before) changed += 1;
        if (
          after.kind === 'relation' &&
          before?.kind === 'relation' &&
          (after.from !== before.from || after.to !== before.to)
        ) {
          reconnectRelationIds.add(id);
        } else if (after.kind !== 'relation' && spatialChanged) {
          changedEndpointIds.add(id);
        }
      }
    }

    this.refreshChangedRelations(reconnectRelationIds, replacedEndpointIds, changedEndpointIds);
    this.applySelection(selectionAfter, reboundSelectionIds);
    if (!sameView(this.store.view, prepared.viewAfter)) this.store.setView(prepared.viewAfter);
    this.animationsForPrepared(prepared);

    this.revisionCounter += 1;
    this.store.revision = this.revisionCounter;
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
    const changedEndpointIds = new Set<string>();
    for (const animation of prepared.animations) {
      if (!this.animations.schedule(this.store, animation, this.clockMs)) continue;
      immediateChange = true;
      if (
        animation.property === 'x' ||
        animation.property === 'y' ||
        animation.property === 'width' ||
        animation.property === 'height' ||
        animation.property === 'rotation'
      ) {
        changedEndpointIds.add(animation.id);
      }
    }
    if (immediateChange) {
      this.refreshChangedRelations(EMPTY_IDS, EMPTY_IDS, changedEndpointIds);
    }
  }

  private refreshRelationsForEndpointSlots(slots: readonly number[]): void {
    if (slots.length === 0) return;
    const endpointIds = new Set<string>();
    for (const slot of slots) {
      const id = this.store.ids[slot];
      if (id) endpointIds.add(id);
    }
    this.refreshChangedRelations(EMPTY_IDS, EMPTY_IDS, endpointIds);
  }

  private refreshChangedRelations(
    reconnectRelationIds: ReadonlySet<string>,
    replacedEndpointIds: ReadonlySet<string>,
    changedEndpointIds: ReadonlySet<string>,
  ): void {
    const reconnectSlots = new Set<number>();
    for (const id of reconnectRelationIds) {
      const slot = this.store.slotOf(id);
      if (slot !== undefined) reconnectSlots.add(slot);
    }
    for (const slot of this.store.relationSlotsForEndpointIds(replacedEndpointIds)) {
      reconnectSlots.add(slot);
    }
    const dirtySlots = this.store.relationSlotsForEndpointIds(changedEndpointIds);
    for (const slot of reconnectSlots) this.reconnectRelation(slot);
    for (const slot of dirtySlots) {
      if (!reconnectSlots.has(slot)) this.store.markDirty(slot, true, false);
    }
  }

  private reconnectRelation(slot: number): void {
    const from = this.store.slotOf(this.store.relationFromId[slot] ?? '');
    const to = this.store.slotOf(this.store.relationToId[slot] ?? '');
    if (from === undefined || to === undefined) throw new Error('validated relation endpoint disappeared');
    this.store.connectRelation(slot, from, to);
  }

  private reconnectRelations(): void {
    for (const slot of this.store.renderOrder()) {
      if (this.store.kind[slot] !== KindCode.Relation) continue;
      this.reconnectRelation(slot);
    }
  }

  private applySelection(next: ReadonlySet<string>, reboundIds: ReadonlySet<string> = EMPTY_IDS): void {
    for (const id of this.selectedIds) {
      if (next.has(id)) continue;
      const slot = this.store.slotOf(id);
      if (slot !== undefined) this.store.setSelected(slot, false);
    }
    for (const id of next) {
      if (this.selectedIds.has(id) && !reboundIds.has(id)) continue;
      const slot = this.store.slotOf(id);
      if (slot !== undefined) this.store.setSelected(slot, true);
    }
    this.selectedIds = new Set(next);
  }

  private selectionForPrepared(prepared: PreparedTransaction): {
    readonly after: ReadonlySet<string>;
    readonly reboundIds: ReadonlySet<string>;
  } {
    const stableReplacements = new Set<string>();
    for (const id of prepared.replacements) {
      if (prepared.after.get(id)) stableReplacements.add(id);
    }
    if (stableReplacements.size === 0) {
      return { after: prepared.selectionAfter, reboundIds: EMPTY_IDS };
    }

    const selection = new Set(prepared.selectionBefore);
    for (const operation of prepared.batch.operations) {
      if (operation.type === 'remove') {
        const id = this.idForPreparedTarget(operation.target);
        if (!stableReplacements.has(id)) selection.delete(id);
        continue;
      }
      if (operation.type !== 'selection') continue;
      const ids = operation.targets.map((target) => this.idForPreparedTarget(target));
      const mode = operation.mode ?? 'replace';
      if (mode === 'replace') {
        selection.clear();
        for (const id of ids) selection.add(id);
      } else if (mode === 'add') {
        for (const id of ids) selection.add(id);
      } else if (mode === 'remove') {
        for (const id of ids) selection.delete(id);
      } else {
        for (const id of ids) {
          if (selection.has(id)) selection.delete(id);
          else selection.add(id);
        }
      }
    }

    const reboundIds = new Set<string>();
    for (const id of stableReplacements) {
      if (selection.has(id)) reboundIds.add(id);
    }
    return { after: selection, reboundIds };
  }

  private idForPreparedTarget(target: CoreTarget): string {
    if (typeof target === 'string') return target;
    const slot = this.store.resolve(target);
    if (slot === undefined) throw new Error('validated transaction target disappeared before commit');
    return this.store.ids[slot] ?? '';
  }

  private recordHistory(prepared: PreparedTransaction, selectionAfter: ReadonlySet<string>): void {
    const nonHistoricalAnimationProperties = new Map<string, Set<AnimatableProperty>>();
    for (const animation of prepared.animations) {
      addAnimationProperty(nonHistoricalAnimationProperties, animation.id, animation.property);
    }
    const stateIds = new Set([...prepared.before.keys(), ...prepared.after.keys()]);
    for (const id of stateIds) {
      const slot = this.store.slotOf(id);
      if (slot === undefined) continue;
      for (const property of this.animations.activeProperties(slot)) {
        addAnimationProperty(nonHistoricalAnimationProperties, id, property);
      }
    }
    const entry: HistoryEntry = {
      ...(prepared.batch.id === undefined ? {} : { id: prepared.batch.id }),
      before: prepared.before,
      after: prepared.after,
      selectionBefore: prepared.selectionBefore,
      selectionAfter,
      viewBefore: prepared.viewBefore,
      viewAfter: prepared.viewAfter,
      nonHistoricalAnimationProperties,
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

  private excludeAnimationsFromExistingHistory(
    animations: PreparedTransaction['animations'],
  ): void {
    if (animations.length === 0) return;
    const update = (entry: HistoryEntry): HistoryEntry => {
      let properties: Map<string, Set<AnimatableProperty>> | undefined;
      for (const animation of animations) {
        if (!entry.before.has(animation.id) && !entry.after.has(animation.id)) continue;
        if (entry.nonHistoricalAnimationProperties.get(animation.id)?.has(animation.property)) continue;
        properties ??= cloneAnimationProperties(entry.nonHistoricalAnimationProperties);
        addAnimationProperty(properties, animation.id, animation.property);
      }
      return properties ? { ...entry, nonHistoricalAnimationProperties: properties } : entry;
    };
    for (let index = 0; index < this.undoStack.length; index += 1) {
      this.undoStack[index] = update(this.undoStack[index]!);
    }
    for (let index = 0; index < this.redoStack.length; index += 1) {
      this.redoStack[index] = update(this.redoStack[index]!);
    }
  }

  private restoreHistory(
    state: ReadonlyMap<string, CanonicalEntity | null>,
    selection: ReadonlySet<string>,
    view: DenseStore['view'],
    nonHistoricalAnimationProperties: ReadonlyMap<string, ReadonlySet<AnimatableProperty>>,
  ): void {
    let structural = false;
    const changedEndpointIds = new Set<string>();
    for (const [id, entity] of state) {
      const slot = this.store.slotOf(id);
      if (!entity && slot !== undefined) {
        this.animations.cancelSlot(slot);
        this.store.remove(slot);
        structural = true;
      } else if (entity && slot === undefined) {
        this.store.addCanonical(entity);
        structural = true;
      } else if (entity && slot !== undefined) {
        const current = this.store.canonicalAt(slot);
        if (current.kind !== entity.kind) {
          this.animations.cancelSlot(slot);
          this.store.remove(slot);
          this.store.addCanonical(entity);
          structural = true;
          continue;
        }
        const properties = new Set(nonHistoricalAnimationProperties.get(id));
        for (const property of this.animations.activeProperties(slot)) properties.add(property);
        this.store.replaceCanonical(slot, preserveProperties(entity, this.store, slot, properties));
        if (entity.kind !== 'relation') changedEndpointIds.add(id);
      }
    }
    if (structural || [...state.values()].some((entity) => entity?.kind === 'relation')) {
      this.reconnectRelations();
    } else {
      this.refreshChangedRelations(EMPTY_IDS, EMPTY_IDS, changedEndpointIds);
    }
    // History can replace a selected ID with a different entity kind. The
    // identity set remains equal, but the new dense slot still needs its bit.
    this.applySelection(selection, selection);
    if (!sameView(this.store.view, view)) this.store.setView(view);
    this.revisionCounter += 1;
    this.store.revision = this.revisionCounter;
  }

  private pushEvent(event: CoreEvent): void {
    if (this.eventLimit === 0) return;
    if (this.events.length === this.eventLimit) this.events.shift();
    this.events.push(event);
  }

  private assertAlive(): void {
    if (this.destroyed) throw new CoreDestroyedError('CoreScene is destroyed');
  }

  private rendererInstance(): CoreRenderer {
    this.assertAlive();
    const renderer = this.renderer;
    if (renderer === null) throw new CoreDestroyedError('CoreScene renderer is released');
    return renderer;
  }
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

function spatiallyChanged(left: CanonicalEntity, right: CanonicalEntity): boolean {
  return (
    left.x !== right.x ||
    left.y !== right.y ||
    left.width !== right.width ||
    left.height !== right.height ||
    left.rotation !== right.rotation ||
    left.visible !== right.visible ||
    left.from !== right.from ||
    left.to !== right.to ||
    left.lineWidth !== right.lineWidth
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
    nonHistoricalAnimationProperties: mergeAnimationProperties(
      previous.nonHistoricalAnimationProperties,
      next.nonHistoricalAnimationProperties,
    ),
  };
}

function addAnimationProperty(
  properties: Map<string, Set<AnimatableProperty>>,
  id: string,
  property: AnimatableProperty,
): void {
  const existing = properties.get(id);
  if (existing) {
    existing.add(property);
  } else {
    properties.set(id, new Set([property]));
  }
}

function mergeAnimationProperties(
  left: ReadonlyMap<string, ReadonlySet<AnimatableProperty>>,
  right: ReadonlyMap<string, ReadonlySet<AnimatableProperty>>,
): ReadonlyMap<string, ReadonlySet<AnimatableProperty>> {
  const result = cloneAnimationProperties(left);
  for (const [id, properties] of right) {
    for (const property of properties) addAnimationProperty(result, id, property);
  }
  return result;
}

function cloneAnimationProperties(
  source: ReadonlyMap<string, ReadonlySet<AnimatableProperty>>,
): Map<string, Set<AnimatableProperty>> {
  const result = new Map<string, Set<AnimatableProperty>>();
  for (const [id, properties] of source) result.set(id, new Set(properties));
  return result;
}

function preserveProperties(
  entity: CanonicalEntity,
  store: DenseStore,
  slot: number,
  properties: ReadonlySet<AnimatableProperty>,
): CanonicalEntity {
  if (properties.size === 0) return entity;
  const result = { ...entity };
  for (const property of properties) {
    result[property] = storedProperty(store, slot, property);
  }
  return result;
}

function storedProperty(store: DenseStore, slot: number, property: AnimatableProperty): number {
  switch (property) {
    case 'x':
      return store.x[slot] ?? 0;
    case 'y':
      return store.y[slot] ?? 0;
    case 'width':
      return store.width[slot] ?? 0;
    case 'height':
      return store.height[slot] ?? 0;
    case 'rotation':
      return store.rotation[slot] ?? 0;
    case 'opacity':
      return store.opacity[slot] ?? 1;
    case 'value':
      return store.value[slot] ?? 0;
  }
}

function clockNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}
