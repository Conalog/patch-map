import type { AnimatableProperty } from './contracts';
import type { DenseStore } from './store';
import type { PreparedAnimation } from './transaction';

const enum PropertyCode {
  X = 1,
  Y = 2,
  Width = 3,
  Height = 4,
  Rotation = 5,
  Opacity = 6,
  Value = 7,
}

const INITIAL_CAPACITY = 16;

export class AnimationTable {
  public count = 0;

  private capacity = INITIAL_CAPACITY;
  private slot = new Uint32Array(this.capacity);
  private generation = new Uint32Array(this.capacity);
  private property = new Uint8Array(this.capacity);
  private easing = new Uint8Array(this.capacity);
  private from = new Float64Array(this.capacity);
  private to = new Float64Array(this.capacity);
  private start = new Float64Array(this.capacity);
  private duration = new Float64Array(this.capacity);
  private readonly indexByKey = new Map<string, number>();

  public schedule(store: DenseStore, animation: PreparedAnimation, startTime: number): boolean {
    const slot = store.slotOf(animation.id);
    if (slot === undefined) return false;
    const property = propertyCode(animation.property);
    if (animation.durationMs === 0) {
      this.removeKey(key(slot, property));
      const value = storedValue(property, animation.to);
      if (Object.is(value, readValue(store, slot, property))) return false;
      writeValue(store, slot, property, value);
      store.markDirty(slot, isGeometry(property), false);
      return true;
    }
    const animationKey = key(slot, property);
    const existing = this.indexByKey.get(animationKey);
    const index = existing ?? this.append();
    this.indexByKey.set(animationKey, index);
    this.slot[index] = slot;
    this.generation[index] = store.generation[slot] ?? 0;
    this.property[index] = property;
    this.easing[index] = animation.easing === 'easeInOut' ? 1 : 0;
    this.from[index] = readValue(store, slot, property);
    this.to[index] = animation.to;
    this.start[index] = startTime;
    this.duration[index] = animation.durationMs;
    return false;
  }

  public advance(
    store: DenseStore,
    timeMs: number,
  ): { changed: number; active: number; geometrySlots: readonly number[] } {
    let index = 0;
    let changed = 0;
    const geometrySlots = new Set<number>();
    while (index < this.count) {
      const slot = this.slot[index] ?? 0;
      const generation = this.generation[index] ?? 0;
      const property = this.property[index] as PropertyCode;
      if (store.alive[slot] !== 1 || store.generation[slot] !== generation) {
        this.removeAt(index);
        continue;
      }
      const duration = this.duration[index] ?? 0;
      const progress = Math.max(0, Math.min(1, (timeMs - (this.start[index] ?? 0)) / duration));
      const eased = this.easing[index] === 1 ? progress * progress * (3 - 2 * progress) : progress;
      const value = storedValue(
        property,
        (this.from[index] ?? 0) + ((this.to[index] ?? 0) - (this.from[index] ?? 0)) * eased,
      );
      if (!Object.is(value, readValue(store, slot, property))) {
        writeValue(store, slot, property, value);
        store.markDirty(slot, isGeometry(property), false);
        if (isGeometry(property)) geometrySlots.add(slot);
        changed += 1;
      }
      if (progress >= 1) this.removeAt(index);
      else index += 1;
    }
    return { changed, active: this.count, geometrySlots: Object.freeze([...geometrySlots]) };
  }

  public cancelSlot(slot: number): number {
    let index = 0;
    let removed = 0;
    while (index < this.count) {
      if (this.slot[index] !== slot) {
        index += 1;
        continue;
      }
      this.removeAt(index);
      removed += 1;
    }
    return removed;
  }

  public activeProperties(slot: number): readonly AnimatableProperty[] {
    const result: AnimatableProperty[] = [];
    for (let index = 0; index < this.count; index += 1) {
      if (this.slot[index] === slot) result.push(propertyName(this.property[index] as PropertyCode));
    }
    return Object.freeze(result);
  }

  public clear(): void {
    this.count = 0;
    this.indexByKey.clear();
  }

  public destroy(): void {
    this.clear();
    this.capacity = 0;
    this.slot = new Uint32Array(0);
    this.generation = new Uint32Array(0);
    this.property = new Uint8Array(0);
    this.easing = new Uint8Array(0);
    this.from = new Float64Array(0);
    this.to = new Float64Array(0);
    this.start = new Float64Array(0);
    this.duration = new Float64Array(0);
  }

  private append(): number {
    this.ensureCapacity(this.count + 1);
    const index = this.count;
    this.count += 1;
    return index;
  }

  private ensureCapacity(required: number): void {
    if (required <= this.capacity) return;
    let capacity = this.capacity;
    while (capacity < required) capacity *= 2;
    this.slot = growUint32(this.slot, capacity);
    this.generation = growUint32(this.generation, capacity);
    this.property = growUint8(this.property, capacity);
    this.easing = growUint8(this.easing, capacity);
    this.from = growFloat64(this.from, capacity);
    this.to = growFloat64(this.to, capacity);
    this.start = growFloat64(this.start, capacity);
    this.duration = growFloat64(this.duration, capacity);
    this.capacity = capacity;
  }

  private removeKey(animationKey: string): void {
    const index = this.indexByKey.get(animationKey);
    if (index !== undefined) this.removeAt(index);
  }

  private removeAt(index: number): void {
    const removedKey = key(this.slot[index] ?? 0, this.property[index] as PropertyCode);
    this.indexByKey.delete(removedKey);
    const last = this.count - 1;
    this.count = last;
    if (index === last) return;
    this.slot[index] = this.slot[last] ?? 0;
    this.generation[index] = this.generation[last] ?? 0;
    this.property[index] = this.property[last] ?? 0;
    this.easing[index] = this.easing[last] ?? 0;
    this.from[index] = this.from[last] ?? 0;
    this.to[index] = this.to[last] ?? 0;
    this.start[index] = this.start[last] ?? 0;
    this.duration[index] = this.duration[last] ?? 0;
    this.indexByKey.set(key(this.slot[index] ?? 0, this.property[index] as PropertyCode), index);
  }
}

function propertyCode(property: AnimatableProperty): PropertyCode {
  switch (property) {
    case 'x':
      return PropertyCode.X;
    case 'y':
      return PropertyCode.Y;
    case 'width':
      return PropertyCode.Width;
    case 'height':
      return PropertyCode.Height;
    case 'rotation':
      return PropertyCode.Rotation;
    case 'opacity':
      return PropertyCode.Opacity;
    case 'value':
      return PropertyCode.Value;
  }
}

function propertyName(property: PropertyCode): AnimatableProperty {
  switch (property) {
    case PropertyCode.X:
      return 'x';
    case PropertyCode.Y:
      return 'y';
    case PropertyCode.Width:
      return 'width';
    case PropertyCode.Height:
      return 'height';
    case PropertyCode.Rotation:
      return 'rotation';
    case PropertyCode.Opacity:
      return 'opacity';
    case PropertyCode.Value:
      return 'value';
  }
}

function readValue(store: DenseStore, slot: number, property: PropertyCode): number {
  switch (property) {
    case PropertyCode.X:
      return store.x[slot] ?? 0;
    case PropertyCode.Y:
      return store.y[slot] ?? 0;
    case PropertyCode.Width:
      return store.width[slot] ?? 0;
    case PropertyCode.Height:
      return store.height[slot] ?? 0;
    case PropertyCode.Rotation:
      return store.rotation[slot] ?? 0;
    case PropertyCode.Opacity:
      return store.opacity[slot] ?? 1;
    case PropertyCode.Value:
      return store.value[slot] ?? 0;
  }
}

function writeValue(store: DenseStore, slot: number, property: PropertyCode, value: number): void {
  switch (property) {
    case PropertyCode.X:
      store.x[slot] = value;
      break;
    case PropertyCode.Y:
      store.y[slot] = value;
      break;
    case PropertyCode.Width:
      store.width[slot] = value;
      break;
    case PropertyCode.Height:
      store.height[slot] = value;
      break;
    case PropertyCode.Rotation:
      store.rotation[slot] = value;
      break;
    case PropertyCode.Opacity:
      store.opacity[slot] = value;
      break;
    case PropertyCode.Value:
      store.value[slot] = value;
      break;
  }
}

function storedValue(property: PropertyCode, value: number): number {
  return property === PropertyCode.Rotation || property === PropertyCode.Opacity
    ? Math.fround(value)
    : value;
}

function isGeometry(property: PropertyCode): boolean {
  return (
    property === PropertyCode.X ||
    property === PropertyCode.Y ||
    property === PropertyCode.Width ||
    property === PropertyCode.Height ||
    property === PropertyCode.Rotation
  );
}

function key(slot: number, property: PropertyCode): string {
  return `${slot}:${property}`;
}

function growUint32(source: Uint32Array, capacity: number): Uint32Array<ArrayBuffer> {
  const result = new Uint32Array(capacity);
  result.set(source);
  return result;
}

function growUint8(source: Uint8Array, capacity: number): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(capacity);
  result.set(source);
  return result;
}

function growFloat64(source: Float64Array, capacity: number): Float64Array<ArrayBuffer> {
  const result = new Float64Array(capacity);
  result.set(source);
  return result;
}
