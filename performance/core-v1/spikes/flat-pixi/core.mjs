import { Application, Graphics } from 'pixi.js';

const DEFAULT_CHUNK_SIZE = 256;
const DEFAULT_CELL_SIZE = 96;
const FIELD_X = 1 << 0;
const FIELD_Y = 1 << 1;
const FIELD_WIDTH = 1 << 2;
const FIELD_HEIGHT = 1 << 3;
const FIELD_COLOR = 1 << 4;
const FIELD_VALUE = 1 << 5;
const FIELD_VISIBLE = 1 << 6;
const FIELD_SELECTED = 1 << 7;

const TYPE_CODES = new Map([
  ['unknown', 0],
  ['grid', 1],
  ['item', 2],
  ['relations', 3],
]);

const TYPE_NAMES = ['unknown', 'grid', 'item', 'relations'];

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Number(value) : fallback;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function parseColor(value, fallback) {
  if (Number.isInteger(value)) return value & 0xffffff;
  if (typeof value !== 'string') return fallback;
  if (/^#[\da-f]{6}$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  if (/^#[\da-f]{3}$/i.test(value)) {
    const [r, g, b] = value.slice(1);
    return Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
  }
  const hsl = value.match(/^hsl\(\s*(-?[\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%\s*\)$/i);
  if (!hsl) return fallback;
  const hue = ((Number(hsl[1]) % 360) + 360) % 360 / 360;
  const saturation = Math.max(0, Math.min(1, Number(hsl[2]) / 100));
  const lightness = Math.max(0, Math.min(1, Number(hsl[3]) / 100));
  const hueToRgb = (p, q, t0) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const r = Math.round(hueToRgb(p, q, hue + 1 / 3) * 255);
  const g = Math.round(hueToRgb(p, q, hue) * 255);
  const b = Math.round(hueToRgb(p, q, hue - 1 / 3) * 255);
  return (r << 16) | (g << 8) | b;
}

function sourceDimensions(source) {
  if (source?.type === 'grid') {
    const rows = Array.isArray(source.cells) ? source.cells.length : 1;
    let columns = 1;
    for (const row of source.cells ?? []) {
      if (Array.isArray(row)) columns = Math.max(columns, row.length);
    }
    const itemWidth = positiveNumber(source.item?.size?.width, 36);
    const itemHeight = positiveNumber(source.item?.size?.height, 36);
    const gapX = Math.max(0, finiteNumber(source.gap?.x, 0));
    const gapY = Math.max(0, finiteNumber(source.gap?.y, 0));
    return {
      width: columns * itemWidth + Math.max(0, columns - 1) * gapX,
      height: rows * itemHeight + Math.max(0, rows - 1) * gapY,
    };
  }
  return {
    width: positiveNumber(source?.size?.width, 28),
    height: positiveNumber(source?.size?.height, 28),
  };
}

function normalizeEntity(source, slot) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`entity at index ${slot} must be an object`);
  }
  if (typeof source.id !== 'string' || source.id.length === 0) {
    throw new TypeError(`entity at index ${slot} requires a non-empty string id`);
  }
  const hash = hashString(source.id);
  const { width, height } = sourceDimensions(source);
  const components = source.components ?? source.item?.components ?? [];
  const tint = Array.isArray(components)
    ? components.find((component) => Number.isInteger(component?.tint))?.tint
    : undefined;
  const color = parseColor(
    source.color ?? source.style?.color ?? tint,
    0x3f80df ^ (hash & 0x1f1f1f),
  );
  const typeName = typeof source.type === 'string' ? source.type : 'unknown';
  return {
    id: source.id,
    x: finiteNumber(source.attrs?.x ?? source.x, 24 + (hash % 860)),
    y: finiteNumber(source.attrs?.y ?? source.y, 24 + ((hash >>> 10) % 460)),
    width,
    height,
    color,
    value: Math.max(0, Math.min(1, finiteNumber(source.value, ((hash >>> 20) & 255) / 255))),
    type: TYPE_CODES.get(typeName) ?? 0,
    visible: source.show === false || source.visible === false ? 0 : 1,
    selected: source.selected === true ? 1 : 0,
  };
}

function createArrays(count) {
  return {
    ids: new Array(count),
    x: new Float32Array(count),
    y: new Float32Array(count),
    width: new Float32Array(count),
    height: new Float32Array(count),
    color: new Uint32Array(count),
    value: new Float32Array(count),
    targetValue: new Float32Array(count),
    animationFrom: new Float32Array(count),
    animationStart: new Float64Array(count),
    animationDuration: new Float32Array(count),
    animationActive: new Uint8Array(count),
    visible: new Uint8Array(count),
    selected: new Uint8Array(count),
    type: new Uint8Array(count),
    generation: new Uint32Array(count),
  };
}

export class FlatEntityStore {
  constructor({ chunkSize = DEFAULT_CHUNK_SIZE, cellSize = DEFAULT_CELL_SIZE } = {}) {
    if (!Number.isInteger(chunkSize) || chunkSize < 16) throw new RangeError('chunkSize must be an integer >= 16');
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('cellSize must be > 0');
    this.chunkSize = chunkSize;
    this.cellSize = cellSize;
    this.count = 0;
    this.version = 0;
    this.epoch = 0;
    this.destroyed = false;
    this.idToSlot = new Map();
    this.spatialBuckets = new Map();
    this.overflowSlots = [];
    Object.assign(this, createArrays(0));
    this.dirtyChunks = new Uint8Array(0);
    this.dirtyMinSlot = -1;
    this.dirtyMaxSlot = -1;
    this.worldBounds = { x: 0, y: 0, width: 1, height: 1 };
  }

  assertAlive() {
    if (this.destroyed) throw new Error('FlatEntityStore is destroyed');
  }

  load(source) {
    this.assertAlive();
    if (!Array.isArray(source)) throw new TypeError('load expects an array');
    const next = createArrays(source.length);
    const nextIndex = new Map();
    const nextGeneration = ((this.epoch + 1) >>> 0) || 1;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let slot = 0; slot < source.length; slot += 1) {
      const entity = normalizeEntity(source[slot], slot);
      if (nextIndex.has(entity.id)) throw new Error(`duplicate entity id: ${entity.id}`);
      nextIndex.set(entity.id, slot);
      next.ids[slot] = entity.id;
      next.x[slot] = entity.x;
      next.y[slot] = entity.y;
      next.width[slot] = entity.width;
      next.height[slot] = entity.height;
      next.color[slot] = entity.color;
      next.value[slot] = entity.value;
      next.targetValue[slot] = entity.value;
      next.visible[slot] = entity.visible;
      next.selected[slot] = entity.selected;
      next.type[slot] = entity.type;
      next.generation[slot] = nextGeneration;
      minX = Math.min(minX, entity.x);
      minY = Math.min(minY, entity.y);
      maxX = Math.max(maxX, entity.x + entity.width);
      maxY = Math.max(maxY, entity.y + entity.height);
    }
    Object.assign(this, next);
    this.count = source.length;
    this.epoch = nextGeneration;
    this.idToSlot = nextIndex;
    const chunkCount = Math.ceil(this.count / this.chunkSize);
    this.dirtyChunks = new Uint8Array(chunkCount);
    this.dirtyChunks.fill(1);
    this.dirtyMinSlot = this.count === 0 ? -1 : 0;
    this.dirtyMaxSlot = this.count - 1;
    this.worldBounds = this.count === 0
      ? { x: 0, y: 0, width: 1, height: 1 }
      : { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    this.version += 1;
    this.rebuildSpatialIndex();
    return { count: this.count, version: this.version };
  }

  slotOf(id) {
    this.assertAlive();
    const slot = this.idToSlot.get(id);
    if (slot === undefined) throw new Error(`unknown entity id: ${id}`);
    return slot;
  }

  ref(id) {
    const slot = this.slotOf(id);
    return Object.freeze({ id, slot, generation: this.generation[slot] });
  }

  isValidRef(ref) {
    return Boolean(
      !this.destroyed
      && ref
      && Number.isInteger(ref.slot)
      && ref.slot >= 0
      && ref.slot < this.count
      && this.ids[ref.slot] === ref.id
      && this.generation[ref.slot] === ref.generation,
    );
  }

  snapshot(idOrRef) {
    this.assertAlive();
    const slot = typeof idOrRef === 'string'
      ? this.slotOf(idOrRef)
      : this.isValidRef(idOrRef) ? idOrRef.slot : -1;
    if (slot < 0) throw new Error('stale entity ref');
    return Object.freeze({
      id: this.ids[slot],
      generation: this.generation[slot],
      type: TYPE_NAMES[this.type[slot]] ?? 'unknown',
      x: this.x[slot],
      y: this.y[slot],
      width: this.width[slot],
      height: this.height[slot],
      color: this.color[slot],
      value: this.value[slot],
      targetValue: this.targetValue[slot],
      visible: this.visible[slot] === 1,
      selected: this.selected[slot] === 1,
      animating: this.animationActive[slot] === 1,
    });
  }

  query({ type, selected, visible, bounds } = {}) {
    this.assertAlive();
    const typeCode = type === undefined ? undefined : TYPE_CODES.get(type);
    if (type !== undefined && typeCode === undefined) return [];
    const ids = [];
    for (let slot = 0; slot < this.count; slot += 1) {
      if (typeCode !== undefined && this.type[slot] !== typeCode) continue;
      if (selected !== undefined && this.selected[slot] !== Number(Boolean(selected))) continue;
      if (visible !== undefined && this.visible[slot] !== Number(Boolean(visible))) continue;
      if (bounds) {
        if (
          this.x[slot] + this.width[slot] < bounds.x
          || this.x[slot] > bounds.x + bounds.width
          || this.y[slot] + this.height[slot] < bounds.y
          || this.y[slot] > bounds.y + bounds.height
        ) continue;
      }
      ids.push(this.ids[slot]);
    }
    return ids;
  }

  batchUpdate(patches, { now = performance.now() } = {}) {
    this.assertAlive();
    if (!Array.isArray(patches)) throw new TypeError('batchUpdate expects an array');
    const prepared = new Array(patches.length);
    let spatialDirty = false;
    for (let index = 0; index < patches.length; index += 1) {
      const patch = patches[index];
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new TypeError(`patch at index ${index} must be an object`);
      }
      const slot = this.idToSlot.get(patch.id);
      if (slot === undefined) throw new Error(`unknown entity id: ${patch.id}`);
      let mask = 0;
      const next = { slot, mask, animate: patch.animate === true, duration: 0 };
      for (const [name, flag] of [
        ['x', FIELD_X], ['y', FIELD_Y], ['width', FIELD_WIDTH], ['height', FIELD_HEIGHT], ['value', FIELD_VALUE],
      ]) {
        if (patch[name] === undefined) continue;
        if (!Number.isFinite(patch[name])) throw new TypeError(`${name} must be finite`);
        if ((name === 'width' || name === 'height') && patch[name] <= 0) throw new RangeError(`${name} must be > 0`);
        if (name === 'value' && (patch[name] < 0 || patch[name] > 1)) throw new RangeError('value must be between 0 and 1');
        next[name] = Number(patch[name]);
        mask |= flag;
      }
      if (patch.color !== undefined) {
        if (!Number.isInteger(patch.color) || patch.color < 0 || patch.color > 0xffffff) {
          throw new RangeError('color must be an integer between 0 and 0xffffff');
        }
        next.color = patch.color;
        mask |= FIELD_COLOR;
      }
      if (patch.visible !== undefined) {
        if (typeof patch.visible !== 'boolean') throw new TypeError('visible must be boolean');
        next.visible = Number(patch.visible);
        mask |= FIELD_VISIBLE;
      }
      if (patch.selected !== undefined) {
        if (typeof patch.selected !== 'boolean') throw new TypeError('selected must be boolean');
        next.selected = Number(patch.selected);
        mask |= FIELD_SELECTED;
      }
      if (next.animate) {
        next.duration = positiveNumber(patch.duration, 200);
        if (!(mask & FIELD_VALUE)) throw new Error('animated patch requires value');
      }
      next.mask = mask;
      prepared[index] = next;
      if (mask & (FIELD_X | FIELD_Y | FIELD_WIDTH | FIELD_HEIGHT | FIELD_VISIBLE)) spatialDirty = true;
    }

    for (const next of prepared) {
      const { slot, mask } = next;
      if (mask & FIELD_X) this.x[slot] = next.x;
      if (mask & FIELD_Y) this.y[slot] = next.y;
      if (mask & FIELD_WIDTH) this.width[slot] = next.width;
      if (mask & FIELD_HEIGHT) this.height[slot] = next.height;
      if (mask & FIELD_COLOR) this.color[slot] = next.color;
      if (mask & FIELD_VISIBLE) this.visible[slot] = next.visible;
      if (mask & FIELD_SELECTED) this.selected[slot] = next.selected;
      if (mask & FIELD_VALUE) {
        if (next.animate) {
          this.animationFrom[slot] = this.value[slot];
          this.targetValue[slot] = next.value;
          this.animationStart[slot] = now;
          this.animationDuration[slot] = next.duration;
          this.animationActive[slot] = 1;
        } else {
          this.value[slot] = next.value;
          this.targetValue[slot] = next.value;
          this.animationActive[slot] = 0;
        }
      }
      if (mask !== 0) this.markSlotDirty(slot);
    }
    if (prepared.length > 0) this.version += 1;
    if (spatialDirty) this.rebuildSpatialIndex();
    return { count: prepared.length, version: this.version };
  }

  animateStep(now) {
    this.assertAlive();
    if (!Number.isFinite(now)) throw new TypeError('animateStep now must be finite');
    let changed = 0;
    let active = 0;
    for (let slot = 0; slot < this.count; slot += 1) {
      if (this.animationActive[slot] === 0) continue;
      const progress = Math.max(0, Math.min(1, (now - this.animationStart[slot]) / this.animationDuration[slot]));
      const eased = progress * progress * (3 - 2 * progress);
      const next = this.animationFrom[slot] + (this.targetValue[slot] - this.animationFrom[slot]) * eased;
      if (next !== this.value[slot]) {
        this.value[slot] = next;
        this.markSlotDirty(slot);
        changed += 1;
      }
      if (progress >= 1) {
        this.value[slot] = this.targetValue[slot];
        this.animationActive[slot] = 0;
      } else {
        active += 1;
      }
    }
    if (changed > 0) this.version += 1;
    return { changed, active, version: this.version };
  }

  markSlotDirty(slot) {
    this.dirtyChunks[Math.floor(slot / this.chunkSize)] = 1;
    this.dirtyMinSlot = this.dirtyMinSlot < 0 ? slot : Math.min(this.dirtyMinSlot, slot);
    this.dirtyMaxSlot = Math.max(this.dirtyMaxSlot, slot);
  }

  markAllDirty() {
    this.dirtyChunks.fill(1);
    this.dirtyMinSlot = this.count === 0 ? -1 : 0;
    this.dirtyMaxSlot = this.count - 1;
  }

  clearDirty() {
    this.dirtyChunks.fill(0);
    this.dirtyMinSlot = -1;
    this.dirtyMaxSlot = -1;
  }

  rebuildSpatialIndex() {
    const buckets = new Map();
    const overflow = [];
    const cell = this.cellSize;
    for (let slot = 0; slot < this.count; slot += 1) {
      if (this.visible[slot] === 0) continue;
      const minCellX = Math.floor(this.x[slot] / cell);
      const maxCellX = Math.floor((this.x[slot] + this.width[slot]) / cell);
      const minCellY = Math.floor(this.y[slot] / cell);
      const maxCellY = Math.floor((this.y[slot] + this.height[slot]) / cell);
      const coverage = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);
      if (coverage > 256) {
        overflow.push(slot);
        continue;
      }
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
          const key = `${cellX}:${cellY}`;
          let slots = buckets.get(key);
          if (!slots) {
            slots = [];
            buckets.set(key, slots);
          }
          slots.push(slot);
        }
      }
    }
    this.spatialBuckets = buckets;
    this.overflowSlots = overflow;
  }

  hitTest(x, y) {
    this.assertAlive();
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('hitTest coordinates must be finite');
    const key = `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
    const slots = this.spatialBuckets.get(key) ?? [];
    for (let index = slots.length - 1; index >= 0; index -= 1) {
      const slot = slots[index];
      if (
        this.visible[slot] === 1
        && x >= this.x[slot]
        && x <= this.x[slot] + this.width[slot]
        && y >= this.y[slot]
        && y <= this.y[slot] + this.height[slot]
      ) return this.ref(this.ids[slot]);
    }
    for (let index = this.overflowSlots.length - 1; index >= 0; index -= 1) {
      const slot = this.overflowSlots[index];
      if (
        x >= this.x[slot]
        && x <= this.x[slot] + this.width[slot]
        && y >= this.y[slot]
        && y <= this.y[slot] + this.height[slot]
      ) return this.ref(this.ids[slot]);
    }
    return null;
  }

  checksum() {
    this.assertAlive();
    let checksum = 0;
    for (let slot = 0; slot < this.count; slot += 1) {
      checksum = (checksum + Math.round(this.value[slot] * 1000) + this.color[slot] + this.selected[slot]) >>> 0;
    }
    return checksum;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.count = 0;
    this.idToSlot.clear();
    this.spatialBuckets.clear();
    this.overflowSlots.length = 0;
    Object.assign(this, createArrays(0));
    this.dirtyChunks = new Uint8Array(0);
    this.dirtyMinSlot = -1;
    this.dirtyMaxSlot = -1;
  }
}

function dimColor(color) {
  return (((color & 0xfefefe) >>> 1) + 0x202020) & 0xffffff;
}

export class AggregatePixiRenderer {
  static async create(store, options = {}) {
    const renderer = new AggregatePixiRenderer(store, options);
    await renderer.initialize();
    return renderer;
  }

  constructor(store, { width = 960, height = 540, host = document.body } = {}) {
    if (!(store instanceof FlatEntityStore)) throw new TypeError('renderer requires a FlatEntityStore');
    this.store = store;
    this.width = width;
    this.height = height;
    this.host = host;
    this.app = null;
    this.surfaces = [];
    this.renderVersion = 0;
    this.destroyed = false;
  }

  async initialize() {
    const app = new Application();
    await app.init({
      width: this.width,
      height: this.height,
      preference: 'webgl',
      powerPreference: 'high-performance',
      antialias: false,
      resolution: 1,
      autoDensity: false,
      autoStart: false,
      background: 0x111827,
      backgroundAlpha: 1,
    });
    app.stop();
    app.stage.eventMode = 'none';
    this.app = app;
    this.host.appendChild(app.canvas);
    this.ensureSurfaces();
    const bounds = this.store.worldBounds;
    const scale = Math.min(
      1,
      (this.width - 16) / Math.max(1, bounds.width),
      (this.height - 16) / Math.max(1, bounds.height),
    );
    app.stage.scale.set(scale);
    app.stage.position.set(8 - bounds.x * scale, 8 - bounds.y * scale);
  }

  ensureSurfaces() {
    const wanted = Math.ceil(this.store.count / this.store.chunkSize);
    while (this.surfaces.length < wanted) {
      const surface = new Graphics();
      surface.eventMode = 'none';
      this.surfaces.push(surface);
      this.app.stage.addChild(surface);
    }
  }

  redrawChunk(chunk) {
    const graphics = this.surfaces[chunk];
    graphics.clear();
    const start = chunk * this.store.chunkSize;
    const end = Math.min(this.store.count, start + this.store.chunkSize);
    for (let slot = start; slot < end; slot += 1) {
      if (this.store.visible[slot] === 0) continue;
      const x = this.store.x[slot];
      const y = this.store.y[slot];
      const width = this.store.width[slot];
      const height = this.store.height[slot];
      const color = this.store.color[slot];
      graphics.rect(x, y, width, height).fill(dimColor(color));
      const fillHeight = Math.max(1, height * this.store.value[slot]);
      graphics.rect(x, y + height - fillHeight, width, fillHeight).fill(color);
      if (this.store.selected[slot] === 1) {
        graphics.rect(x, y, width, height).stroke({ color: 0xffffff, width: 2, alignment: 1 });
      }
    }
  }

  flush({ force = false } = {}) {
    if (this.destroyed) throw new Error('AggregatePixiRenderer is destroyed');
    this.ensureSurfaces();
    if (force) this.store.markAllDirty();
    let redrawnChunks = 0;
    if (this.store.dirtyMinSlot >= 0) {
      const first = Math.floor(this.store.dirtyMinSlot / this.store.chunkSize);
      const last = Math.floor(this.store.dirtyMaxSlot / this.store.chunkSize);
      for (let chunk = first; chunk <= last; chunk += 1) {
        if (this.store.dirtyChunks[chunk] === 0) continue;
        this.redrawChunk(chunk);
        redrawnChunks += 1;
      }
      this.store.clearDirty();
    }
    this.app.renderer.render({ container: this.app.stage });
    this.renderVersion = this.store.version;
    return { renderVersion: this.renderVersion, redrawnChunks, surfaces: this.surfaces.length };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    );
    this.surfaces.length = 0;
    this.app = null;
    this.store = null;
    this.host = null;
  }
}
