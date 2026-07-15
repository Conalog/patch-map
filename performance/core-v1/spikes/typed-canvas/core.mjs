const FLAG_VISIBLE = 1;
const FLAG_SELECTED = 2;

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function dimension(value, name) {
  finite(value, name);
  if (value < 0) throw new RangeError(`${name} must be non-negative`);
  return value;
}

function color(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new RangeError(`${name} must be a 24-bit integer`);
  }
  return value;
}

export class TypedCanvasCore {
  constructor(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('canvas must be an HTMLCanvasElement');
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) throw new Error('Canvas2D is unavailable');
    this.canvas = canvas;
    this.context = context;
    this.destroyed = false;
    this.count = 0;
    this.version = 0;
    this.frameVersion = -1;
    this.loadGeneration = 0;
    this.selectedSlot = -1;
    this.ids = [];
    this.slotById = new Map();
    this.colorCss = new Map();
    this.#installBuffers(0);
  }

  #installBuffers(count) {
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.width = new Float32Array(count);
    this.height = new Float32Array(count);
    this.colors = new Uint32Array(count);
    this.flags = new Uint32Array(count);
    this.generations = new Uint32Array(count);
    this.animationFrom = new Float32Array(count);
    this.animationTo = new Float32Array(count);
    this.animationStart = new Float64Array(count);
    this.animationDuration = new Float32Array(count);
    this.animationActive = new Uint8Array(count);
    this.animationSlots = new Uint32Array(count);
    this.animationCount = 0;
    this.drawOrder = new Uint32Array(count);
    this.groupColors = new Uint32Array(0);
    this.groupStarts = new Uint32Array(0);
    this.groupCount = 0;
    this.orderDirty = true;
    this.dirtyMin = count === 0 ? -1 : 0;
    this.dirtyMax = count - 1;
  }

  #assertAlive() {
    if (this.destroyed) throw new Error('core is destroyed');
  }

  #touch(slot) {
    if (this.dirtyMin < 0 || slot < this.dirtyMin) this.dirtyMin = slot;
    if (slot > this.dirtyMax) this.dirtyMax = slot;
  }

  load(entities) {
    this.#assertAlive();
    if (!Array.isArray(entities)) throw new TypeError('entities must be an array');
    const count = entities.length;
    const ids = new Array(count);
    const slotById = new Map();
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const width = new Float32Array(count);
    const height = new Float32Array(count);
    const colors = new Uint32Array(count);
    const flags = new Uint32Array(count);
    const generation = (this.loadGeneration + 1) >>> 0 || 1;
    const generations = new Uint32Array(count);

    for (let slot = 0; slot < count; slot += 1) {
      const entity = entities[slot];
      if (!entity || typeof entity !== 'object') throw new TypeError(`entities[${slot}] must be an object`);
      if (typeof entity.id !== 'string' || entity.id.length === 0) throw new TypeError(`entities[${slot}].id must be non-empty`);
      if (slotById.has(entity.id)) throw new Error(`duplicate id: ${entity.id}`);
      ids[slot] = entity.id;
      slotById.set(entity.id, slot);
      x[slot] = finite(entity.x, `entities[${slot}].x`);
      y[slot] = finite(entity.y, `entities[${slot}].y`);
      width[slot] = dimension(entity.width, `entities[${slot}].width`);
      height[slot] = dimension(entity.height, `entities[${slot}].height`);
      colors[slot] = color(entity.color ?? 0x3976d2, `entities[${slot}].color`);
      flags[slot] = Number.isInteger(entity.flags) ? entity.flags >>> 0 : FLAG_VISIBLE;
      generations[slot] = generation;
    }

    this.#installBuffers(count);
    this.count = count;
    this.ids = ids;
    this.slotById = slotById;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.colors = colors;
    this.flags = flags;
    this.generations = generations;
    this.loadGeneration = generation;
    this.selectedSlot = -1;
    this.version += 1;
    return Object.freeze({ count, version: this.version, generation });
  }

  resolve(ids) {
    this.#assertAlive();
    if (!Array.isArray(ids)) throw new TypeError('ids must be an array');
    const slots = new Uint32Array(ids.length);
    const generations = new Uint32Array(ids.length);
    for (let index = 0; index < ids.length; index += 1) {
      const slot = this.slotById.get(ids[index]);
      if (slot === undefined) throw new Error(`unknown id: ${ids[index]}`);
      slots[index] = slot;
      generations[index] = this.generations[slot];
    }
    return Object.freeze({ slots, generations });
  }

  updateBatch(batch) {
    this.#assertAlive();
    if (!batch || !Array.isArray(batch.ids)) throw new TypeError('batch.ids must be an array');
    const length = batch.ids.length;
    const fields = ['x', 'y', 'width', 'height', 'color', 'flags'].filter((key) => batch[key] !== undefined);
    if (fields.length === 0) throw new TypeError('batch must contain a changed column');
    for (const field of fields) {
      if (batch[field].length !== length) throw new RangeError(`${field}.length must equal ids.length`);
    }
    const slots = new Uint32Array(length);
    const seen = new Set();
    for (let index = 0; index < length; index += 1) {
      const id = batch.ids[index];
      if (seen.has(id)) throw new Error(`duplicate batch id: ${id}`);
      seen.add(id);
      const slot = this.slotById.get(id);
      if (slot === undefined) throw new Error(`unknown id: ${id}`);
      slots[index] = slot;
      if (batch.x !== undefined) finite(batch.x[index], `x[${index}]`);
      if (batch.y !== undefined) finite(batch.y[index], `y[${index}]`);
      if (batch.width !== undefined) dimension(batch.width[index], `width[${index}]`);
      if (batch.height !== undefined) dimension(batch.height[index], `height[${index}]`);
      if (batch.color !== undefined) color(batch.color[index], `color[${index}]`);
      if (batch.flags !== undefined && !Number.isInteger(batch.flags[index])) throw new TypeError(`flags[${index}] must be an integer`);
    }
    this.#applyColumns(slots, batch);
    return Object.freeze({ count: length, version: this.version, dirty: [this.dirtyMin, this.dirtyMax] });
  }

  updateResolved(resolved, columns) {
    this.#assertAlive();
    const slots = resolved?.slots;
    const generations = resolved?.generations;
    if (!(slots instanceof Uint32Array) || !(generations instanceof Uint32Array) || slots.length !== generations.length) {
      throw new TypeError('resolved slots and generations are required');
    }
    const length = slots.length;
    const fields = ['x', 'y', 'width', 'height', 'color', 'flags'].filter((key) => columns[key] !== undefined);
    for (const field of fields) if (columns[field].length !== length) throw new RangeError(`${field}.length mismatch`);
    for (let index = 0; index < length; index += 1) {
      const slot = slots[index];
      if (slot >= this.count || this.generations[slot] !== generations[index]) throw new Error('stale entity reference');
    }
    this.#applyColumns(slots, columns);
    return Object.freeze({ count: length, version: this.version, dirty: [this.dirtyMin, this.dirtyMax] });
  }

  #applyColumns(slots, columns) {
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      if (columns.x !== undefined) this.x[slot] = columns.x[index];
      if (columns.y !== undefined) this.y[slot] = columns.y[index];
      if (columns.width !== undefined) this.width[slot] = columns.width[index];
      if (columns.height !== undefined) this.height[slot] = columns.height[index];
      if (columns.color !== undefined) this.colors[slot] = columns.color[index];
      if (columns.flags !== undefined) this.flags[slot] = columns.flags[index] >>> 0;
      this.#touch(slot);
    }
    if (columns.color !== undefined) this.orderDirty = true;
    this.version += 1;
  }

  animateBatch(batch, startTime, durationMs) {
    this.#assertAlive();
    if (!batch || !Array.isArray(batch.ids) || batch.ids.length !== batch.height?.length) {
      throw new TypeError('animation ids/height columns must have equal length');
    }
    finite(startTime, 'startTime');
    dimension(durationMs, 'durationMs');
    const slots = new Uint32Array(batch.ids.length);
    for (let index = 0; index < slots.length; index += 1) {
      const slot = this.slotById.get(batch.ids[index]);
      if (slot === undefined) throw new Error(`unknown id: ${batch.ids[index]}`);
      dimension(batch.height[index], `height[${index}]`);
      slots[index] = slot;
    }
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      this.animationFrom[slot] = this.height[slot];
      this.animationTo[slot] = batch.height[index];
      this.animationStart[slot] = startTime;
      this.animationDuration[slot] = durationMs;
      if (this.animationActive[slot] === 0) {
        this.animationActive[slot] = 1;
        this.animationSlots[this.animationCount] = slot;
        this.animationCount += 1;
      }
    }
    return Object.freeze({ count: slots.length, active: this.animationCount });
  }

  stepAnimation(time) {
    this.#assertAlive();
    finite(time, 'time');
    let index = 0;
    let changed = 0;
    while (index < this.animationCount) {
      const slot = this.animationSlots[index];
      const duration = this.animationDuration[slot];
      const progress = duration === 0 ? 1 : Math.max(0, Math.min(1, (time - this.animationStart[slot]) / duration));
      this.height[slot] = this.animationFrom[slot] + (this.animationTo[slot] - this.animationFrom[slot]) * progress;
      this.#touch(slot);
      changed += 1;
      if (progress >= 1) {
        this.animationActive[slot] = 0;
        this.animationCount -= 1;
        this.animationSlots[index] = this.animationSlots[this.animationCount];
      } else {
        index += 1;
      }
    }
    if (changed > 0) this.version += 1;
    return changed;
  }

  #rebuildOrder() {
    const bucketByColor = new Map();
    const colors = [];
    const counts = [];
    for (let slot = 0; slot < this.count; slot += 1) {
      const value = this.colors[slot];
      let bucket = bucketByColor.get(value);
      if (bucket === undefined) {
        bucket = colors.length;
        bucketByColor.set(value, bucket);
        colors.push(value);
        counts.push(0);
      }
      counts[bucket] += 1;
    }
    const starts = new Uint32Array(colors.length + 1);
    for (let index = 0; index < colors.length; index += 1) starts[index + 1] = starts[index] + counts[index];
    const offsets = starts.slice(0, colors.length);
    const order = new Uint32Array(this.count);
    for (let slot = 0; slot < this.count; slot += 1) {
      const bucket = bucketByColor.get(this.colors[slot]);
      order[offsets[bucket]] = slot;
      offsets[bucket] += 1;
    }
    this.drawOrder = order;
    this.groupColors = Uint32Array.from(colors);
    this.groupStarts = starts;
    this.groupCount = colors.length;
    this.orderDirty = false;
  }

  flush() {
    this.#assertAlive();
    if (this.frameVersion === this.version) {
      return Object.freeze({ changed: false, version: this.version, dirty: null, drawCalls: 0 });
    }
    if (this.orderDirty) this.#rebuildOrder();
    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#f7f8fa';
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    let drawCalls = 1;
    for (let group = 0; group < this.groupCount; group += 1) {
      context.beginPath();
      let visible = 0;
      for (let cursor = this.groupStarts[group]; cursor < this.groupStarts[group + 1]; cursor += 1) {
        const slot = this.drawOrder[cursor];
        if ((this.flags[slot] & FLAG_VISIBLE) === 0 || this.width[slot] === 0 || this.height[slot] === 0) continue;
        context.rect(this.x[slot], this.y[slot], this.width[slot], this.height[slot]);
        visible += 1;
      }
      if (visible > 0) {
        const value = this.groupColors[group];
        let css = this.colorCss.get(value);
        if (css === undefined) {
          css = `#${value.toString(16).padStart(6, '0')}`;
          this.colorCss.set(value, css);
        }
        context.fillStyle = css;
        context.fill();
        drawCalls += 1;
      }
    }
    if (this.selectedSlot >= 0) {
      const slot = this.selectedSlot;
      context.lineWidth = 2;
      context.strokeStyle = '#ff9f1c';
      context.strokeRect(this.x[slot] - 1, this.y[slot] - 1, this.width[slot] + 2, this.height[slot] + 2);
      drawCalls += 1;
    }
    const dirty = this.dirtyMin < 0 ? null : [this.dirtyMin, this.dirtyMax];
    this.dirtyMin = -1;
    this.dirtyMax = -1;
    this.frameVersion = this.version;
    return Object.freeze({ changed: true, version: this.version, dirty, drawCalls });
  }

  hitTest(pointX, pointY) {
    this.#assertAlive();
    finite(pointX, 'pointX');
    finite(pointY, 'pointY');
    for (let slot = this.count - 1; slot >= 0; slot -= 1) {
      if ((this.flags[slot] & FLAG_VISIBLE) === 0) continue;
      if (pointX >= this.x[slot] && pointX <= this.x[slot] + this.width[slot]
        && pointY >= this.y[slot] && pointY <= this.y[slot] + this.height[slot]) {
        return Object.freeze({ id: this.ids[slot], slot, generation: this.generations[slot] });
      }
    }
    return null;
  }

  selectAt(pointX, pointY) {
    const hit = this.hitTest(pointX, pointY);
    const next = hit?.slot ?? -1;
    if (next === this.selectedSlot) return hit;
    if (this.selectedSlot >= 0) {
      this.flags[this.selectedSlot] &= ~FLAG_SELECTED;
      this.#touch(this.selectedSlot);
    }
    this.selectedSlot = next;
    if (next >= 0) {
      this.flags[next] |= FLAG_SELECTED;
      this.#touch(next);
    }
    this.version += 1;
    return hit;
  }

  snapshot(reference) {
    this.#assertAlive();
    const slot = typeof reference === 'string' ? this.slotById.get(reference) : reference?.slot;
    if (slot === undefined || slot < 0 || slot >= this.count) return null;
    if (reference && typeof reference === 'object' && reference.generation !== this.generations[slot]) return null;
    return Object.freeze({
      id: this.ids[slot], slot, generation: this.generations[slot],
      x: this.x[slot], y: this.y[slot], width: this.width[slot], height: this.height[slot],
      color: this.colors[slot], flags: this.flags[slot],
    });
  }

  query({ flagMask = 0 } = {}) {
    this.#assertAlive();
    const result = [];
    for (let slot = 0; slot < this.count; slot += 1) {
      if ((this.flags[slot] & flagMask) === flagMask) {
        result.push(Object.freeze({ id: this.ids[slot], slot, generation: this.generations[slot] }));
      }
    }
    return Object.freeze(result);
  }

  destroy() {
    if (this.destroyed) return false;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.slotById.clear();
    this.colorCss.clear();
    this.ids.length = 0;
    this.#installBuffers(0);
    this.count = 0;
    this.selectedSlot = -1;
    this.context = null;
    this.canvas = null;
    this.destroyed = true;
    return true;
  }
}

export const EntityFlags = Object.freeze({ VISIBLE: FLAG_VISIBLE, SELECTED: FLAG_SELECTED });
