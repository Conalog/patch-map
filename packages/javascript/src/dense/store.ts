import type {
  CoreBounds,
  CorePoint,
  CoreTarget,
  CoreView,
  EntityInput,
  EntityPatch,
  EntityRef,
  EntitySnapshot,
  HitTestOptions,
  QueryFilter,
  Rgba,
  SlotRange,
} from './contracts';
import type { CanonicalEntity } from './validation';
import { KindCode, kindFromCode } from './validation';

export const enum EntityFlag {
  Visible = 1,
  Interactive = 2,
  Selected = 4,
}

const DEFAULT_CAPACITY = 16;
const DEFAULT_CELL_SIZE = 128;

function nextCapacity(current: number, required: number): number {
  let capacity = Math.max(DEFAULT_CAPACITY, current);
  while (capacity < required) capacity *= 2;
  return capacity;
}

function growFloat64(source: Float64Array, capacity: number): Float64Array {
  const result = new Float64Array(capacity);
  result.set(source);
  return result;
}

function growFloat32(source: Float32Array, capacity: number): Float32Array {
  const result = new Float32Array(capacity);
  result.set(source);
  return result;
}

function growUint32(source: Uint32Array, capacity: number): Uint32Array {
  const result = new Uint32Array(capacity);
  result.set(source);
  return result;
}

function growInt32(source: Int32Array, capacity: number, fill = 0): Int32Array {
  const result = new Int32Array(capacity);
  result.fill(fill);
  result.set(source);
  return result;
}

function growUint8(source: Uint8Array, capacity: number): Uint8Array {
  const result = new Uint8Array(capacity);
  result.set(source);
  return result;
}

function growStrings(source: readonly string[], capacity: number): string[] {
  const result = new Array<string>(capacity).fill('');
  for (let index = 0; index < source.length; index += 1) result[index] = source[index] ?? '';
  return result;
}

function growTags(source: readonly (readonly string[])[], capacity: number): (readonly string[])[] {
  const result = new Array<readonly string[]>(capacity);
  for (let index = 0; index < capacity; index += 1) result[index] = Object.freeze([]);
  for (let index = 0; index < source.length; index += 1) result[index] = source[index] ?? Object.freeze([]);
  return result;
}

function targetLabel(target: CoreTarget): string {
  return typeof target === 'string' ? target : `${target.slot}@${target.generation}`;
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function pointInRotatedRect(store: DenseStore, slot: number, point: CorePoint): boolean {
  const x = store.x[slot] ?? 0;
  const y = store.y[slot] ?? 0;
  const width = store.width[slot] ?? 0;
  const height = store.height[slot] ?? 0;
  const rotation = store.rotation[slot] ?? 0;
  if (rotation === 0) {
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  }
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radians = (-rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const deltaX = point.x - centerX;
  const deltaY = point.y - centerY;
  const localX = deltaX * cos - deltaY * sin + width / 2;
  const localY = deltaX * sin + deltaY * cos + height / 2;
  return localX >= 0 && localX <= width && localY >= 0 && localY <= height;
}

function distanceToSegment(point: CorePoint, start: CorePoint, end: CorePoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const progress = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(point.x - (start.x + progress * dx), point.y - (start.y + progress * dy));
}

export class DenseStore {
  public capacity: number;
  public liveCount = 0;
  public highWater = 0;
  public revision = 0;
  public view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  public background: Rgba = 0xf7f8faff;

  public alive: Uint8Array;
  public kind: Uint8Array;
  public flags: Uint8Array;
  public generation: Uint32Array;
  public zIndex: Int32Array;
  public x: Float64Array;
  public y: Float64Array;
  public width: Float64Array;
  public height: Float64Array;
  public rotation: Float32Array;
  public opacity: Float32Array;
  public fill: Uint32Array;
  public stroke: Uint32Array;
  public strokeWidth: Float32Array;
  public radius: Float32Array;
  public color: Uint32Array;
  public fontSize: Float32Array;
  public fontWeight: Uint32Array;
  public align: Uint8Array;
  public maxLines: Uint32Array;
  public tint: Uint32Array;
  public fit: Uint8Array;
  public value: Float64Array;
  public min: Float64Array;
  public max: Float64Array;
  public trackFill: Uint32Array;
  public relationFrom: Int32Array;
  public relationTo: Int32Array;
  public lineWidth: Float32Array;
  public ids: string[];
  public tags: (readonly string[])[];
  public text: string[];
  public fontFamily: string[];
  public source: string[];
  public relationFromId: string[];
  public relationToId: string[];

  private readonly idToSlot = new Map<string, number>();
  private readonly freeSlots: number[] = [];
  private dirty: Uint8Array;
  private orderDirty = true;
  private spatialDirty = true;
  private spatialRebuildAll = true;
  private readonly spatialDirtySlots = new Set<number>();
  private orderedSlots: number[] = [];
  private spatialBuckets = new Map<string, number[]>();
  private spatialOverflow: number[] = [];
  private spatialMembership: (readonly string[] | null | undefined)[];
  private readonly relationSlotsByEndpoint = new Map<string, Set<number>>();
  private relationAdjacencyFrom: string[];
  private relationAdjacencyTo: string[];
  private readonly cellSize: number;
  private destroyed = false;

  public constructor(initialCapacity = DEFAULT_CAPACITY, cellSize = DEFAULT_CELL_SIZE) {
    this.capacity = nextCapacity(0, Math.max(1, initialCapacity));
    this.cellSize = cellSize;
    this.alive = new Uint8Array(this.capacity);
    this.kind = new Uint8Array(this.capacity);
    this.flags = new Uint8Array(this.capacity);
    this.generation = new Uint32Array(this.capacity);
    this.zIndex = new Int32Array(this.capacity);
    this.x = new Float64Array(this.capacity);
    this.y = new Float64Array(this.capacity);
    this.width = new Float64Array(this.capacity);
    this.height = new Float64Array(this.capacity);
    this.rotation = new Float32Array(this.capacity);
    this.opacity = new Float32Array(this.capacity);
    this.fill = new Uint32Array(this.capacity);
    this.stroke = new Uint32Array(this.capacity);
    this.strokeWidth = new Float32Array(this.capacity);
    this.radius = new Float32Array(this.capacity);
    this.color = new Uint32Array(this.capacity);
    this.fontSize = new Float32Array(this.capacity);
    this.fontWeight = new Uint32Array(this.capacity);
    this.align = new Uint8Array(this.capacity);
    this.maxLines = new Uint32Array(this.capacity);
    this.tint = new Uint32Array(this.capacity);
    this.fit = new Uint8Array(this.capacity);
    this.value = new Float64Array(this.capacity);
    this.min = new Float64Array(this.capacity);
    this.max = new Float64Array(this.capacity);
    this.trackFill = new Uint32Array(this.capacity);
    this.relationFrom = new Int32Array(this.capacity);
    this.relationFrom.fill(-1);
    this.relationTo = new Int32Array(this.capacity);
    this.relationTo.fill(-1);
    this.lineWidth = new Float32Array(this.capacity);
    this.ids = new Array<string>(this.capacity).fill('');
    this.tags = growTags([], this.capacity);
    this.text = new Array<string>(this.capacity).fill('');
    this.fontFamily = new Array<string>(this.capacity).fill('');
    this.source = new Array<string>(this.capacity).fill('');
    this.relationFromId = new Array<string>(this.capacity).fill('');
    this.relationToId = new Array<string>(this.capacity).fill('');
    this.dirty = new Uint8Array(this.capacity);
    this.spatialMembership = new Array<readonly string[] | null | undefined>(this.capacity);
    this.relationAdjacencyFrom = new Array<string>(this.capacity).fill('');
    this.relationAdjacencyTo = new Array<string>(this.capacity).fill('');
  }

  public static fromCanonical(
    entities: readonly CanonicalEntity[],
    options: { initialCapacity?: number; view?: CoreView; background?: Rgba; generation?: number } = {},
  ): DenseStore {
    const store = new DenseStore(Math.max(options.initialCapacity ?? 0, entities.length));
    if (options.view) store.view = Object.freeze({ ...options.view });
    if (options.background !== undefined) store.background = options.background;
    for (const entity of entities) store.addCanonical(entity);
    const generation = options.generation ?? 1;
    for (let slot = 0; slot < store.highWater; slot += 1) {
      if (store.alive[slot] === 1) store.generation[slot] = generation;
    }
    store.resolveAllRelations(entities);
    store.revision = 1;
    store.markAllDirty();
    store.finalizeMutations();
    return store;
  }

  public assertAlive(): void {
    if (this.destroyed) throw new Error('DenseStore is destroyed');
  }

  public isDestroyed(): boolean {
    return this.destroyed;
  }

  public has(id: string): boolean {
    return this.idToSlot.has(id);
  }

  public slotOf(id: string): number | undefined {
    return this.idToSlot.get(id);
  }

  public resolve(target: CoreTarget): number | undefined {
    if (typeof target === 'string') return this.idToSlot.get(target);
    const slot = target.slot;
    if (
      !Number.isSafeInteger(slot) ||
      slot < 0 ||
      slot >= this.highWater ||
      this.alive[slot] !== 1 ||
      this.generation[slot] !== target.generation
    ) {
      return undefined;
    }
    return slot;
  }

  public label(target: CoreTarget): string {
    return targetLabel(target);
  }

  public ref(target: CoreTarget): EntityRef | null {
    const slot = this.resolve(target);
    if (slot === undefined) return null;
    return Object.freeze({ slot, generation: this.generation[slot] ?? 0 });
  }

  public addCanonical(entity: CanonicalEntity): number {
    this.assertAlive();
    if (this.idToSlot.has(entity.id)) throw new Error(`duplicate ID ${entity.id}`);
    const slot = this.allocateSlot();
    this.writeCanonical(slot, entity);
    this.idToSlot.set(entity.id, slot);
    this.liveCount += 1;
    this.markDirty(slot, true, true);
    return slot;
  }

  public connectRelation(slot: number, from: number, to: number): void {
    this.detachRelation(slot);
    this.relationFrom[slot] = from;
    this.relationTo[slot] = to;
    const fromId = this.relationFromId[slot] ?? '';
    const toId = this.relationToId[slot] ?? '';
    this.attachRelation(fromId, slot);
    if (toId !== fromId) this.attachRelation(toId, slot);
    this.relationAdjacencyFrom[slot] = fromId;
    this.relationAdjacencyTo[slot] = toId;
    this.markDirty(slot, true, false);
  }

  public relationSlotsForEndpointIds(ids: ReadonlySet<string>): ReadonlySet<number> {
    const slots = new Set<number>();
    for (const id of ids) {
      const adjacent = this.relationSlotsByEndpoint.get(id);
      if (!adjacent) continue;
      for (const slot of adjacent) {
        if (this.alive[slot] === 1 && this.kind[slot] === KindCode.Relation) slots.add(slot);
      }
    }
    return slots;
  }

  public replaceCanonical(
    slot: number,
    entity: CanonicalEntity,
    dirty: { spatial?: boolean; order?: boolean } = { spatial: true, order: true },
  ): void {
    this.assertAlive();
    const currentId = this.ids[slot];
    if (currentId !== entity.id) throw new Error('replaceCanonical cannot change an entity ID');
    const selected = this.hasFlag(slot, EntityFlag.Selected);
    this.writeCanonical(slot, entity);
    if (selected) this.setFlag(slot, EntityFlag.Selected, true);
    this.markDirty(slot, dirty.spatial ?? false, dirty.order ?? false);
  }

  public remove(slot: number): EntityInput {
    this.assertAlive();
    const previous = this.toInput(slot);
    if (this.kind[slot] === KindCode.Relation) this.detachRelation(slot);
    this.idToSlot.delete(this.ids[slot] ?? '');
    this.alive[slot] = 0;
    this.flags[slot] = 0;
    this.ids[slot] = '';
    this.tags[slot] = Object.freeze([]);
    this.text[slot] = '';
    this.fontFamily[slot] = '';
    this.source[slot] = '';
    this.relationFromId[slot] = '';
    this.relationToId[slot] = '';
    this.relationFrom[slot] = -1;
    this.relationTo[slot] = -1;
    this.relationAdjacencyFrom[slot] = '';
    this.relationAdjacencyTo[slot] = '';
    const nextGeneration = ((this.generation[slot] ?? 0) + 1) >>> 0;
    this.generation[slot] = nextGeneration === 0 ? 1 : nextGeneration;
    this.liveCount -= 1;
    this.freeSlots.push(slot);
    this.markDirty(slot, true, true);
    return previous;
  }

  public applyPatch(slot: number, patch: EntityPatch): void {
    if (patch.x !== undefined) this.x[slot] = patch.x;
    if (patch.y !== undefined) this.y[slot] = patch.y;
    if (patch.width !== undefined) this.width[slot] = patch.width;
    if (patch.height !== undefined) this.height[slot] = patch.height;
    if (patch.rotation !== undefined) this.rotation[slot] = patch.rotation;
    if (patch.opacity !== undefined) this.opacity[slot] = patch.opacity;
    if (patch.visible !== undefined) this.setFlag(slot, EntityFlag.Visible, patch.visible);
    if (patch.interactive !== undefined) this.setFlag(slot, EntityFlag.Interactive, patch.interactive);
    if (patch.zIndex !== undefined) this.zIndex[slot] = patch.zIndex;
    if (patch.tags !== undefined) this.tags[slot] = Object.freeze([...patch.tags]);
    if (patch.fill !== undefined) this.fill[slot] = patch.fill;
    if (patch.stroke !== undefined) this.stroke[slot] = patch.stroke;
    if (patch.strokeWidth !== undefined) this.strokeWidth[slot] = patch.strokeWidth;
    if (patch.radius !== undefined) this.radius[slot] = patch.radius;
    if (patch.text !== undefined) this.text[slot] = patch.text;
    if (patch.color !== undefined) this.color[slot] = patch.color;
    if (patch.fontSize !== undefined) this.fontSize[slot] = patch.fontSize;
    if (patch.fontFamily !== undefined) this.fontFamily[slot] = patch.fontFamily;
    if (patch.fontWeight !== undefined) this.fontWeight[slot] = patch.fontWeight;
    if (patch.align !== undefined) this.align[slot] = alignCode(patch.align);
    if (patch.maxLines !== undefined) this.maxLines[slot] = patch.maxLines;
    if (patch.source !== undefined) this.source[slot] = patch.source;
    if (patch.tint !== undefined) this.tint[slot] = patch.tint;
    if (patch.fit !== undefined) this.fit[slot] = fitCode(patch.fit);
    if (patch.value !== undefined) this.value[slot] = patch.value;
    if (patch.min !== undefined) this.min[slot] = patch.min;
    if (patch.max !== undefined) this.max[slot] = patch.max;
    if (patch.trackFill !== undefined) this.trackFill[slot] = patch.trackFill;
    if (patch.from !== undefined) this.relationFromId[slot] = patch.from;
    if (patch.to !== undefined) this.relationToId[slot] = patch.to;
    if (patch.lineWidth !== undefined) this.lineWidth[slot] = patch.lineWidth;
    this.markDirty(slot, geometryPatch(patch), patch.zIndex !== undefined);
  }

  public setRelationEndpoints(slot: number, from: number, to: number): void {
    this.relationFrom[slot] = from;
    this.relationTo[slot] = to;
    this.markDirty(slot, true, false);
  }

  public setVisible(slot: number, visible: boolean): void {
    this.setFlag(slot, EntityFlag.Visible, visible);
    this.markDirty(slot, true, false);
  }

  public setSelected(slot: number, selected: boolean): void {
    this.setFlag(slot, EntityFlag.Selected, selected);
    this.markDirty(slot, false, false);
  }

  public setView(view: CoreView): void {
    this.view = Object.freeze({ ...view });
    this.markAllDirty();
  }

  public markDirty(slot: number, spatial = false, order = false): void {
    if (slot >= 0 && slot < this.capacity) this.dirty[slot] = 1;
    if (spatial) {
      this.spatialDirty = true;
      if (!this.spatialRebuildAll) this.spatialDirtySlots.add(slot);
    }
    if (order) this.orderDirty = true;
  }

  public markAllDirty(): void {
    for (let slot = 0; slot < this.highWater; slot += 1) this.dirty[slot] = 1;
  }

  public dirtyRanges(): readonly SlotRange[] {
    const ranges: SlotRange[] = [];
    let start = -1;
    for (let slot = 0; slot < this.highWater; slot += 1) {
      if (this.dirty[slot] === 1 && start < 0) start = slot;
      const ends = start >= 0 && (this.dirty[slot] === 0 || slot === this.highWater - 1);
      if (!ends) continue;
      const end = this.dirty[slot] === 1 && slot === this.highWater - 1 ? slot + 1 : slot;
      ranges.push(Object.freeze({ start, end }));
      start = -1;
    }
    return Object.freeze(ranges);
  }

  public clearDirty(): void {
    this.dirty.fill(0);
  }

  public renderOrder(): readonly number[] {
    if (this.orderDirty) {
      const slots: number[] = [];
      for (let slot = 0; slot < this.highWater; slot += 1) {
        if (this.alive[slot] === 1) slots.push(slot);
      }
      slots.sort((left, right) => (this.zIndex[left] ?? 0) - (this.zIndex[right] ?? 0) || left - right);
      this.orderedSlots = slots;
      this.orderDirty = false;
    }
    return this.orderedSlots;
  }

  public finalizeMutations(): void {
    this.renderOrder();
    if (!this.spatialDirty) return;
    if (this.spatialRebuildAll) this.rebuildSpatialIndex();
    else this.updateSpatialIndex();
  }

  public getSnapshot(target: CoreTarget): EntitySnapshot | null {
    const slot = this.resolve(target);
    return slot === undefined ? null : this.snapshotAt(slot);
  }

  public query(filter: QueryFilter = {}): readonly EntityRef[] {
    this.assertAlive();
    const kinds = filter.kinds ? new Set(filter.kinds) : undefined;
    const ids = filter.ids ? new Set(filter.ids) : undefined;
    const tags = filter.tags;
    const result: EntityRef[] = [];
    const candidates = ids === undefined
      ? this.renderOrder()
      : [...ids]
          .map((id) => this.idToSlot.get(id))
          .filter((slot): slot is number => slot !== undefined)
          .sort((left, right) => (this.zIndex[left] ?? 0) - (this.zIndex[right] ?? 0) || left - right);
    for (const slot of candidates) {
      const kind = kindFromCode(this.kind[slot] as KindCode);
      if (kinds && !kinds.has(kind)) continue;
      if (filter.visible !== undefined && this.hasFlag(slot, EntityFlag.Visible) !== filter.visible) continue;
      if (
        filter.interactive !== undefined &&
        this.hasFlag(slot, EntityFlag.Interactive) !== filter.interactive
      ) {
        continue;
      }
      if (tags && !tags.every((tag) => this.tags[slot]?.includes(tag))) continue;
      if (filter.intersects && !this.intersects(slot, filter.intersects)) continue;
      result.push(Object.freeze({ slot, generation: this.generation[slot] ?? 0 }));
    }
    return Object.freeze(result);
  }

  public hitTest(point: CorePoint, options: HitTestOptions = {}): EntityRef | null {
    this.assertAlive();
    if (this.spatialDirty) {
      if (this.spatialRebuildAll) this.rebuildSpatialIndex();
      else this.updateSpatialIndex();
    }
    const kinds = options.kinds ? new Set(options.kinds) : undefined;
    const bucket = this.spatialBuckets.get(
      cellKey(Math.floor(point.x / this.cellSize), Math.floor(point.y / this.cellSize)),
    );
    const local = bucket ?? [];
    const findTopmost = (candidates: readonly number[]): number | undefined => {
      let top: number | undefined;
      for (let index = 0; index < candidates.length; index += 1) {
        const slot = candidates[index];
        if (slot === undefined || this.alive[slot] !== 1 || !this.hasFlag(slot, EntityFlag.Visible)) {
          continue;
        }
        if (options.interactiveOnly !== false && !this.hasFlag(slot, EntityFlag.Interactive)) continue;
        const kind = kindFromCode(this.kind[slot] as KindCode);
        if (kinds && !kinds.has(kind)) continue;
        if (this.contains(slot, point)) top = topmostSlot(this, top, slot);
      }
      return top;
    };
    const localHit = findTopmost(local);
    const overflowHit = findTopmost(this.spatialOverflow);
    const slot = topmostSlot(this, localHit, overflowHit);
    return slot === undefined
      ? null
      : Object.freeze({ slot, generation: this.generation[slot] ?? 0 });
  }

  public toInput(slot: number): EntityInput {
    const kind = kindFromCode(this.kind[slot] as KindCode);
    const base = {
      id: this.ids[slot] ?? '',
      x: this.x[slot] ?? 0,
      y: this.y[slot] ?? 0,
      width: this.width[slot] ?? 0,
      height: this.height[slot] ?? 0,
      rotation: this.rotation[slot] ?? 0,
      opacity: this.opacity[slot] ?? 1,
      visible: this.hasFlag(slot, EntityFlag.Visible),
      interactive: this.hasFlag(slot, EntityFlag.Interactive),
      zIndex: this.zIndex[slot] ?? 0,
      tags: Object.freeze([...(this.tags[slot] ?? [])]),
    };
    switch (kind) {
      case 'rect':
        return {
          ...base,
          kind,
          fill: this.fill[slot] ?? 0,
          stroke: this.stroke[slot] ?? 0,
          strokeWidth: this.strokeWidth[slot] ?? 0,
          radius: this.radius[slot] ?? 0,
        };
      case 'text':
        return {
          ...base,
          kind,
          text: this.text[slot] ?? '',
          color: this.color[slot] ?? 0,
          fontSize: this.fontSize[slot] ?? 0,
          fontFamily: this.fontFamily[slot] ?? 'sans-serif',
          fontWeight: this.fontWeight[slot] ?? 400,
          align: alignName(this.align[slot] ?? 0),
          maxLines: this.maxLines[slot] ?? 0,
        };
      case 'image':
        return {
          ...base,
          kind,
          source: this.source[slot] ?? '',
          tint: this.tint[slot] ?? 0xffffffff,
          fit: fitName(this.fit[slot] ?? 0),
        };
      case 'bar':
        return {
          ...base,
          kind,
          value: this.value[slot] ?? 0,
          min: this.min[slot] ?? 0,
          max: this.max[slot] ?? 1,
          fill: this.fill[slot] ?? 0,
          trackFill: this.trackFill[slot] ?? 0,
          radius: this.radius[slot] ?? 0,
        };
      case 'relation': {
        return {
          kind,
          id: base.id,
          from: this.relationFromId[slot] ?? '',
          to: this.relationToId[slot] ?? '',
          color: this.color[slot] ?? 0,
          lineWidth: this.lineWidth[slot] ?? 1,
          opacity: base.opacity,
          visible: base.visible,
          interactive: base.interactive,
          zIndex: base.zIndex,
          tags: base.tags,
        };
      }
    }
  }

  /** Internal immutable copy used by atomic transaction planning without re-validating trusted store state. */
  public canonicalAt(slot: number): CanonicalEntity {
    this.assertAlive();
    if (slot < 0 || slot >= this.highWater || this.alive[slot] !== 1) {
      throw new RangeError(`slot ${slot} is not a live entity`);
    }
    const kindCode = this.kind[slot] as KindCode;
    return Object.freeze({
      id: this.ids[slot] ?? '',
      kind: kindFromCode(kindCode),
      kindCode,
      x: this.x[slot] ?? 0,
      y: this.y[slot] ?? 0,
      width: this.width[slot] ?? 0,
      height: this.height[slot] ?? 0,
      rotation: this.rotation[slot] ?? 0,
      opacity: this.opacity[slot] ?? 1,
      visible: this.hasFlag(slot, EntityFlag.Visible),
      interactive: this.hasFlag(slot, EntityFlag.Interactive),
      zIndex: this.zIndex[slot] ?? 0,
      tags: this.tags[slot] ?? Object.freeze([]),
      fill: this.fill[slot] ?? 0,
      stroke: this.stroke[slot] ?? 0,
      strokeWidth: this.strokeWidth[slot] ?? 0,
      radius: this.radius[slot] ?? 0,
      text: this.text[slot] ?? '',
      color: this.color[slot] ?? 0,
      fontSize: this.fontSize[slot] ?? 0,
      fontFamily: this.fontFamily[slot] ?? 'sans-serif',
      fontWeight: this.fontWeight[slot] ?? 400,
      align: alignName(this.align[slot] ?? 0),
      maxLines: this.maxLines[slot] ?? 0,
      source: this.source[slot] ?? '',
      tint: this.tint[slot] ?? 0xffffffff,
      fit: fitName(this.fit[slot] ?? 0),
      value: this.value[slot] ?? 0,
      min: this.min[slot] ?? 0,
      max: this.max[slot] ?? 1,
      trackFill: this.trackFill[slot] ?? 0,
      from: this.relationFromId[slot] ?? '',
      to: this.relationToId[slot] ?? '',
      lineWidth: this.lineWidth[slot] ?? 0,
    });
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.idToSlot.clear();
    this.freeSlots.length = 0;
    this.spatialBuckets.clear();
    this.spatialOverflow.length = 0;
    this.spatialDirtySlots.clear();
    this.spatialMembership.length = 0;
    this.relationSlotsByEndpoint.clear();
    this.orderedSlots.length = 0;
    this.liveCount = 0;
    this.highWater = 0;
    this.capacity = 0;
    this.alive = new Uint8Array(0);
    this.kind = new Uint8Array(0);
    this.flags = new Uint8Array(0);
    this.generation = new Uint32Array(0);
    this.zIndex = new Int32Array(0);
    this.x = new Float64Array(0);
    this.y = new Float64Array(0);
    this.width = new Float64Array(0);
    this.height = new Float64Array(0);
    this.rotation = new Float32Array(0);
    this.opacity = new Float32Array(0);
    this.fill = new Uint32Array(0);
    this.stroke = new Uint32Array(0);
    this.strokeWidth = new Float32Array(0);
    this.radius = new Float32Array(0);
    this.color = new Uint32Array(0);
    this.fontSize = new Float32Array(0);
    this.fontWeight = new Uint32Array(0);
    this.align = new Uint8Array(0);
    this.maxLines = new Uint32Array(0);
    this.tint = new Uint32Array(0);
    this.fit = new Uint8Array(0);
    this.value = new Float64Array(0);
    this.min = new Float64Array(0);
    this.max = new Float64Array(0);
    this.trackFill = new Uint32Array(0);
    this.relationFrom = new Int32Array(0);
    this.relationTo = new Int32Array(0);
    this.lineWidth = new Float32Array(0);
    this.ids = [];
    this.tags = [];
    this.text = [];
    this.fontFamily = [];
    this.source = [];
    this.relationFromId = [];
    this.relationToId = [];
    this.relationAdjacencyFrom = [];
    this.relationAdjacencyTo = [];
    this.dirty = new Uint8Array(0);
    this.spatialRebuildAll = false;
    this.spatialDirty = false;
    return true;
  }

  private allocateSlot(): number {
    const reused = this.freeSlots.pop();
    if (reused !== undefined) return reused;
    const slot = this.highWater;
    this.ensureCapacity(slot + 1);
    this.highWater += 1;
    return slot;
  }

  private ensureCapacity(required: number): void {
    if (required <= this.capacity) return;
    const capacity = nextCapacity(this.capacity, required);
    this.alive = growUint8(this.alive, capacity);
    this.kind = growUint8(this.kind, capacity);
    this.flags = growUint8(this.flags, capacity);
    this.generation = growUint32(this.generation, capacity);
    this.zIndex = growInt32(this.zIndex, capacity);
    this.x = growFloat64(this.x, capacity);
    this.y = growFloat64(this.y, capacity);
    this.width = growFloat64(this.width, capacity);
    this.height = growFloat64(this.height, capacity);
    this.rotation = growFloat32(this.rotation, capacity);
    this.opacity = growFloat32(this.opacity, capacity);
    this.fill = growUint32(this.fill, capacity);
    this.stroke = growUint32(this.stroke, capacity);
    this.strokeWidth = growFloat32(this.strokeWidth, capacity);
    this.radius = growFloat32(this.radius, capacity);
    this.color = growUint32(this.color, capacity);
    this.fontSize = growFloat32(this.fontSize, capacity);
    this.fontWeight = growUint32(this.fontWeight, capacity);
    this.align = growUint8(this.align, capacity);
    this.maxLines = growUint32(this.maxLines, capacity);
    this.tint = growUint32(this.tint, capacity);
    this.fit = growUint8(this.fit, capacity);
    this.value = growFloat64(this.value, capacity);
    this.min = growFloat64(this.min, capacity);
    this.max = growFloat64(this.max, capacity);
    this.trackFill = growUint32(this.trackFill, capacity);
    this.relationFrom = growInt32(this.relationFrom, capacity, -1);
    this.relationTo = growInt32(this.relationTo, capacity, -1);
    this.lineWidth = growFloat32(this.lineWidth, capacity);
    this.ids = growStrings(this.ids, capacity);
    this.tags = growTags(this.tags, capacity);
    this.text = growStrings(this.text, capacity);
    this.fontFamily = growStrings(this.fontFamily, capacity);
    this.source = growStrings(this.source, capacity);
    this.relationFromId = growStrings(this.relationFromId, capacity);
    this.relationToId = growStrings(this.relationToId, capacity);
    this.relationAdjacencyFrom = growStrings(this.relationAdjacencyFrom, capacity);
    this.relationAdjacencyTo = growStrings(this.relationAdjacencyTo, capacity);
    this.dirty = growUint8(this.dirty, capacity);
    this.spatialMembership.length = capacity;
    this.capacity = capacity;
  }

  private writeCanonical(slot: number, entity: CanonicalEntity): void {
    const currentGeneration = this.generation[slot] ?? 0;
    this.generation[slot] = currentGeneration === 0 ? 1 : currentGeneration;
    this.alive[slot] = 1;
    this.kind[slot] = entity.kindCode;
    this.flags[slot] =
      (entity.visible ? EntityFlag.Visible : 0) | (entity.interactive ? EntityFlag.Interactive : 0);
    this.zIndex[slot] = entity.zIndex;
    this.x[slot] = entity.x;
    this.y[slot] = entity.y;
    this.width[slot] = entity.width;
    this.height[slot] = entity.height;
    this.rotation[slot] = entity.rotation;
    this.opacity[slot] = entity.opacity;
    this.fill[slot] = entity.fill;
    this.stroke[slot] = entity.stroke;
    this.strokeWidth[slot] = entity.strokeWidth;
    this.radius[slot] = entity.radius;
    this.color[slot] = entity.color;
    this.fontSize[slot] = entity.fontSize;
    this.fontWeight[slot] = entity.fontWeight;
    this.align[slot] = alignCode(entity.align);
    this.maxLines[slot] = entity.maxLines;
    this.tint[slot] = entity.tint;
    this.fit[slot] = fitCode(entity.fit);
    this.value[slot] = entity.value;
    this.min[slot] = entity.min;
    this.max[slot] = entity.max;
    this.trackFill[slot] = entity.trackFill;
    this.lineWidth[slot] = entity.lineWidth;
    this.ids[slot] = entity.id;
    this.tags[slot] = entity.tags;
    this.text[slot] = entity.text;
    this.fontFamily[slot] = entity.fontFamily;
    this.source[slot] = entity.source;
    this.relationFromId[slot] = entity.from;
    this.relationToId[slot] = entity.to;
  }

  private resolveAllRelations(entities: readonly CanonicalEntity[]): void {
    for (const entity of entities) {
      if (entity.kind !== 'relation') continue;
      const slot = this.idToSlot.get(entity.id);
      const from = this.idToSlot.get(entity.from);
      const to = this.idToSlot.get(entity.to);
      if (slot === undefined || from === undefined || to === undefined) {
        throw new Error(`unresolved relation ${entity.id}`);
      }
      this.connectRelation(slot, from, to);
    }
  }

  private setFlag(slot: number, flag: EntityFlag, enabled: boolean): void {
    const current = this.flags[slot] ?? 0;
    this.flags[slot] = enabled ? current | flag : current & ~flag;
  }

  private attachRelation(endpointId: string, slot: number): void {
    if (endpointId.length === 0) return;
    const existing = this.relationSlotsByEndpoint.get(endpointId);
    if (existing) existing.add(slot);
    else this.relationSlotsByEndpoint.set(endpointId, new Set([slot]));
  }

  private detachRelation(slot: number): void {
    const fromId = this.relationAdjacencyFrom[slot] ?? '';
    const toId = this.relationAdjacencyTo[slot] ?? '';
    this.detachRelationEndpoint(fromId, slot);
    if (toId !== fromId) this.detachRelationEndpoint(toId, slot);
    this.relationAdjacencyFrom[slot] = '';
    this.relationAdjacencyTo[slot] = '';
  }

  private detachRelationEndpoint(endpointId: string, slot: number): void {
    if (endpointId.length === 0) return;
    const existing = this.relationSlotsByEndpoint.get(endpointId);
    if (!existing) return;
    existing.delete(slot);
    if (existing.size === 0) this.relationSlotsByEndpoint.delete(endpointId);
  }

  private hasFlag(slot: number, flag: EntityFlag): boolean {
    return ((this.flags[slot] ?? 0) & flag) !== 0;
  }

  private snapshotAt(slot: number): EntitySnapshot {
    const input = this.toInput(slot);
    const { id, kind } = input;
    const data: Record<string, string | number | boolean | undefined> = {};
    switch (kind) {
      case 'rect':
        Object.assign(data, {
          fill: input.fill,
          stroke: input.stroke,
          strokeWidth: input.strokeWidth,
          radius: input.radius,
        });
        break;
      case 'text':
        Object.assign(data, {
          text: input.text,
          color: input.color,
          fontSize: input.fontSize,
          fontFamily: input.fontFamily,
          fontWeight: input.fontWeight,
          align: input.align,
          maxLines: input.maxLines,
        });
        break;
      case 'image':
        Object.assign(data, { source: input.source, tint: input.tint, fit: input.fit });
        break;
      case 'bar':
        Object.assign(data, {
          value: input.value,
          min: input.min,
          max: input.max,
          fill: input.fill,
          trackFill: input.trackFill,
          radius: input.radius,
        });
        break;
      case 'relation':
        Object.assign(data, {
          from: input.from,
          to: input.to,
          color: input.color,
          lineWidth: input.lineWidth,
        });
        break;
    }
    return Object.freeze({
      ref: Object.freeze({ slot, generation: this.generation[slot] ?? 0 }),
      id,
      kind,
      bounds: Object.freeze({
        x: this.x[slot] ?? 0,
        y: this.y[slot] ?? 0,
        width: this.width[slot] ?? 0,
        height: this.height[slot] ?? 0,
      }),
      rotation: this.rotation[slot] ?? 0,
      opacity: this.opacity[slot] ?? 1,
      visible: this.hasFlag(slot, EntityFlag.Visible),
      interactive: this.hasFlag(slot, EntityFlag.Interactive),
      zIndex: this.zIndex[slot] ?? 0,
      tags: Object.freeze([...(this.tags[slot] ?? [])]),
      data: Object.freeze(data),
    });
  }

  private intersects(slot: number, bounds: CoreBounds): boolean {
    if ((this.kind[slot] as KindCode) === KindCode.Relation) {
      const relationBounds = this.relationBounds(slot);
      return rectanglesIntersect(relationBounds, bounds);
    }
    return rectanglesIntersect(this.entityBounds(slot), bounds);
  }

  private contains(slot: number, point: CorePoint): boolean {
    if ((this.kind[slot] as KindCode) !== KindCode.Relation) return pointInRotatedRect(this, slot, point);
    const from = this.relationFrom[slot] ?? -1;
    const to = this.relationTo[slot] ?? -1;
    if (from < 0 || to < 0) return false;
    const start = this.center(from);
    const end = this.center(to);
    return distanceToSegment(point, start, end) <= Math.max(3, this.lineWidth[slot] ?? 1);
  }

  private center(slot: number): CorePoint {
    return {
      x: (this.x[slot] ?? 0) + (this.width[slot] ?? 0) / 2,
      y: (this.y[slot] ?? 0) + (this.height[slot] ?? 0) / 2,
    };
  }

  private relationBounds(slot: number): CoreBounds {
    const from = this.relationFrom[slot] ?? -1;
    const to = this.relationTo[slot] ?? -1;
    if (from < 0 || to < 0) return { x: 0, y: 0, width: 0, height: 0 };
    const start = this.center(from);
    const end = this.center(to);
    const pad = Math.max(3, this.lineWidth[slot] ?? 1);
    return {
      x: Math.min(start.x, end.x) - pad,
      y: Math.min(start.y, end.y) - pad,
      width: Math.abs(end.x - start.x) + pad * 2,
      height: Math.abs(end.y - start.y) + pad * 2,
    };
  }

  private entityBounds(slot: number): CoreBounds {
    const x = this.x[slot] ?? 0;
    const y = this.y[slot] ?? 0;
    const width = this.width[slot] ?? 0;
    const height = this.height[slot] ?? 0;
    const rotation = this.rotation[slot] ?? 0;
    if (rotation === 0) return { x, y, width, height };
    const radians = (rotation * Math.PI) / 180;
    const rotatedWidth = Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height;
    const rotatedHeight = Math.abs(Math.sin(radians)) * width + Math.abs(Math.cos(radians)) * height;
    return {
      x: x + (width - rotatedWidth) / 2,
      y: y + (height - rotatedHeight) / 2,
      width: rotatedWidth,
      height: rotatedHeight,
    };
  }

  private rebuildSpatialIndex(): void {
    this.spatialBuckets = new Map<string, number[]>();
    this.spatialOverflow = [];
    this.spatialMembership = new Array<readonly string[] | null | undefined>(this.capacity);
    for (const slot of this.renderOrder()) {
      this.indexSpatialSlot(slot);
    }
    this.spatialDirty = false;
    this.spatialRebuildAll = false;
    this.spatialDirtySlots.clear();
  }

  private updateSpatialIndex(): void {
    for (const slot of this.spatialDirtySlots) {
      this.removeSpatialSlot(slot);
      this.indexSpatialSlot(slot);
    }
    this.spatialDirtySlots.clear();
    this.spatialDirty = false;
  }

  private removeSpatialSlot(slot: number): void {
    const membership = this.spatialMembership[slot];
    if (membership === null) {
      const index = this.spatialOverflow.indexOf(slot);
      if (index >= 0) this.spatialOverflow.splice(index, 1);
    } else if (membership !== undefined) {
      for (const key of membership) {
        const bucket = this.spatialBuckets.get(key);
        if (!bucket) continue;
        const index = bucket.indexOf(slot);
        if (index >= 0) bucket.splice(index, 1);
        if (bucket.length === 0) this.spatialBuckets.delete(key);
      }
    }
    this.spatialMembership[slot] = undefined;
  }

  private indexSpatialSlot(slot: number): void {
    if (this.alive[slot] !== 1 || !this.hasFlag(slot, EntityFlag.Visible)) return;
    const bounds =
      (this.kind[slot] as KindCode) === KindCode.Relation
        ? this.relationBounds(slot)
        : this.entityBounds(slot);
    const minX = Math.floor(bounds.x / this.cellSize);
    const maxX = Math.floor((bounds.x + bounds.width) / this.cellSize);
    const minY = Math.floor(bounds.y / this.cellSize);
    const maxY = Math.floor((bounds.y + bounds.height) / this.cellSize);
    const coverage = (maxX - minX + 1) * (maxY - minY + 1);
    if (coverage > 256) {
      this.spatialOverflow.push(slot);
      this.spatialMembership[slot] = null;
      return;
    }
    const membership: string[] = [];
    for (let cellY = minY; cellY <= maxY; cellY += 1) {
      for (let cellX = minX; cellX <= maxX; cellX += 1) {
        const key = cellKey(cellX, cellY);
        membership.push(key);
        const existing = this.spatialBuckets.get(key);
        if (existing) existing.push(slot);
        else this.spatialBuckets.set(key, [slot]);
      }
    }
    this.spatialMembership[slot] = membership;
  }
}

function topmostSlot(
  store: Pick<DenseStore, 'zIndex'>,
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  const zDifference = (store.zIndex[left] ?? 0) - (store.zIndex[right] ?? 0);
  return zDifference > 0 || (zDifference === 0 && left > right) ? left : right;
}

function rectanglesIntersect(left: CoreBounds, right: CoreBounds): boolean {
  return !(
    left.x + left.width < right.x ||
    left.x > right.x + right.width ||
    left.y + left.height < right.y ||
    left.y > right.y + right.height
  );
}

function geometryPatch(patch: EntityPatch): boolean {
  return (
    patch.x !== undefined ||
    patch.y !== undefined ||
    patch.width !== undefined ||
    patch.height !== undefined ||
    patch.rotation !== undefined ||
    patch.visible !== undefined ||
    patch.interactive !== undefined ||
    patch.from !== undefined ||
    patch.to !== undefined ||
    patch.lineWidth !== undefined
  );
}

function alignCode(value: 'left' | 'center' | 'right' | 'justify'): number {
  return value === 'center' ? 1 : value === 'right' ? 2 : value === 'justify' ? 3 : 0;
}

function alignName(value: number): 'left' | 'center' | 'right' | 'justify' {
  return value === 1 ? 'center' : value === 2 ? 'right' : value === 3 ? 'justify' : 'left';
}

function fitCode(value: 'contain' | 'cover' | 'stretch'): number {
  return value === 'cover' ? 1 : value === 'stretch' ? 2 : 0;
}

function fitName(value: number): 'contain' | 'cover' | 'stretch' {
  return value === 1 ? 'cover' : value === 2 ? 'stretch' : 'contain';
}
