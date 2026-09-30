const STABLE_ROOT_SERIALIZATIONS = new WeakMap<object, string>();
const STABLE_VALUE_SERIALIZATIONS = new WeakMap<object, string>();
const STABLE_SERIALIZATION_KEY_ORDERS = new Map<
  number,
  Array<Readonly<{
    readonly authored: readonly string[];
    readonly sorted: readonly string[];
  }>>
>();
const MAX_STABLE_SERIALIZATION_KEY_ORDER_SHAPES = 128;
let stableSerializationKeyOrderShapeCount = 0;
let semanticHashWasmModule: WebAssembly.Module | null | false = null;
let semanticHashWasmDatasetScratch: SemanticHashWasmDatasetScratch | null = null;
const SEMANTIC_HASH_WASM_BYTES = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 7, 1, 96, 2, 127, 127, 1, 126, 3, 2, 1,
  0, 5, 3, 1, 0, 1, 7, 17, 2, 6, 109, 101, 109, 111, 114, 121, 2, 0, 4, 104,
  97, 115, 104, 0, 0, 10, 73, 1, 71, 2, 1, 126, 1, 127, 66, 165, 198, 136,
  161, 200, 156, 167, 249, 75, 33, 2, 32, 0, 32, 1, 65, 1, 116, 106, 33, 3,
  2, 64, 3, 64, 32, 0, 32, 3, 79, 13, 1, 32, 2, 32, 0, 47, 1, 0, 173, 133,
  66, 179, 131, 128, 128, 128, 32, 126, 33, 2, 32, 0, 65, 2, 106, 33, 0,
  12, 0, 11, 11, 32, 2, 11,
]);

/** Hash one normalized immutable PATCH MAP dataset in canonical key order. */
export function patchMapSemanticHash(dataset: readonly unknown[]): string {
  const acceleratedDataset = wasmSemanticHashDataset(dataset);
  if (acceleratedDataset !== null) return acceleratedDataset;
  const serialized = stableDatasetSerialization(dataset);
  const accelerated = wasmSemanticHash(serialized);
  if (accelerated !== null) return accelerated;

  let high = 0xcbf29ce4;
  let low = 0x84222325;
  for (let index = 0; index < serialized.length; index += 1) {
    low = (low ^ serialized.charCodeAt(index)) >>> 0;
    const lowProduct = low * 0x1b3;
    high = (
      Math.imul(high, 0x1b3) +
      Math.floor(lowProduct / 0x1_0000_0000) +
      (low << 8)
    ) >>> 0;
    low = Math.imul(low, 0x1b3) >>> 0;
  }
  return `fnv1a64:${high.toString(16).padStart(8, '0')}${low
    .toString(16)
    .padStart(8, '0')}`;
}

/**
 * Release the latest exact-hash scratch without disturbing a different live
 * dataset. Canonical serialization caches remain weakly owned by their values.
 */
export function releasePatchMapSemanticHashScratch(
  dataset: readonly unknown[],
): void {
  if (semanticHashWasmDatasetScratch?.dataset.deref() === dataset) {
    semanticHashWasmDatasetScratch = null;
  }
}

function wasmSemanticHashDataset(roots: readonly unknown[]): string | null {
  if (typeof WebAssembly === 'undefined') return null;
  try {
    const previous = semanticHashWasmDatasetScratch?.dataset.deref();
    if (Array.isArray(previous) && roots.length < previous.length) {
      // Dirty-root normalization hashes a small temporary array immediately
      // before assembling the large structurally shared candidate. Keep the
      // large candidate buffer hot instead of evicting it for this transient.
      return wasmSemanticHash(stableDatasetSerialization(roots));
    }
    const reused = patchSemanticHashDatasetScratch(roots);
    if (reused !== null) return reused;
    return rebuildSemanticHashDatasetScratch(roots);
  } catch {
    semanticHashWasmModule = false;
    semanticHashWasmDatasetScratch = null;
    return null;
  }
}

interface SemanticHashWasmDatasetScratch {
  readonly dataset: WeakRef<object>;
  readonly memory: WebAssembly.Memory;
  readonly hash: (offset: number, length: number) => bigint;
  readonly rootStarts: number[];
  readonly rootLengths: number[];
  length: number;
}

function patchSemanticHashDatasetScratch(
  roots: readonly unknown[],
): string | null {
  const scratch = semanticHashWasmDatasetScratch;
  const previousValue = scratch?.dataset.deref();
  if (
    scratch === null ||
    !Array.isArray(previousValue) ||
    previousValue.length !== roots.length
  ) {
    return null;
  }
  const previous = previousValue as readonly unknown[];
  const changes: Array<Readonly<{
    index: number;
    serialized: string;
    lengthDelta: number;
  }>> = [];
  let nextLength = scratch.length;
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    if (previous[index] === root) continue;
    const serialized = stableRootSerialization(root);
    const lengthDelta = serialized.length - (scratch.rootLengths[index] ?? 0);
    changes.push(Object.freeze({ index, serialized, lengthDelta }));
    nextLength += lengthDelta;
  }
  if (changes.length === 0) {
    semanticHashWasmDatasetScratch = {
      ...scratch,
      dataset: new WeakRef(roots as object),
    };
    return hashSemanticHashScratch(scratch);
  }

  const lengthChangingCount = changes.filter(({ lengthDelta }) => lengthDelta !== 0).length;
  if (lengthChangingCount > 8) return null;
  ensureSemanticHashMemory(scratch.memory, nextLength);
  const units = new Uint16Array(scratch.memory.buffer);
  let currentLength = scratch.length;
  for (const change of changes) {
    const start = scratch.rootStarts[change.index];
    const oldLength = scratch.rootLengths[change.index];
    if (start === undefined || oldLength === undefined) return null;
    const nextRootLength = change.serialized.length;
    if (change.lengthDelta !== 0) {
      units.copyWithin(
        start + nextRootLength,
        start + oldLength,
        currentLength,
      );
      currentLength += change.lengthDelta;
      scratch.rootLengths[change.index] = nextRootLength;
      for (
        let index = change.index + 1;
        index < scratch.rootStarts.length;
        index += 1
      ) {
        scratch.rootStarts[index] = (scratch.rootStarts[index] ?? 0) +
          change.lengthDelta;
      }
    }
    writeSemanticHashUnits(units, start, change.serialized);
  }
  scratch.length = currentLength;
  semanticHashWasmDatasetScratch = {
    ...scratch,
    dataset: new WeakRef(roots as object),
  };
  return hashSemanticHashScratch(semanticHashWasmDatasetScratch);
}

function rebuildSemanticHashDatasetScratch(
  roots: readonly unknown[],
): string | null {
  const exports = semanticHashExports();
  if (exports === null) return null;
  const serializedRoots = roots.map(stableRootSerialization);
  const length = 2 + Math.max(0, roots.length - 1) +
    serializedRoots.reduce((total, serialized) => total + serialized.length, 0);
  ensureSemanticHashMemory(exports.memory, length);
  const units = new Uint16Array(exports.memory.buffer);
  const rootStarts: number[] = [];
  const rootLengths: number[] = [];
  let offset = 0;
  units[offset++] = 91;
  for (let index = 0; index < serializedRoots.length; index += 1) {
    if (index > 0) units[offset++] = 44;
    const serialized = serializedRoots[index]!;
    rootStarts.push(offset);
    rootLengths.push(serialized.length);
    writeSemanticHashUnits(units, offset, serialized);
    offset += serialized.length;
  }
  units[offset] = 93;
  semanticHashWasmDatasetScratch = {
    dataset: new WeakRef(roots as object),
    memory: exports.memory,
    hash: exports.hash,
    rootStarts,
    rootLengths,
    length,
  };
  return hashSemanticHashScratch(semanticHashWasmDatasetScratch);
}

function semanticHashExports(): Readonly<{
  memory: WebAssembly.Memory;
  hash: (offset: number, length: number) => bigint;
}> | null {
  if (semanticHashWasmModule === null) {
    semanticHashWasmModule = new WebAssembly.Module(SEMANTIC_HASH_WASM_BYTES);
  }
  if (semanticHashWasmModule === false) return null;
  const exports = new WebAssembly.Instance(semanticHashWasmModule).exports as {
    readonly memory?: WebAssembly.Memory;
    readonly hash?: (offset: number, length: number) => bigint;
  };
  return exports.memory === undefined || exports.hash === undefined
    ? null
    : Object.freeze({ memory: exports.memory, hash: exports.hash });
}

function ensureSemanticHashMemory(memory: WebAssembly.Memory, length: number): void {
  const requiredPages = Math.max(
    1,
    Math.ceil((length * Uint16Array.BYTES_PER_ELEMENT) / 65_536),
  );
  const currentPages = memory.buffer.byteLength / 65_536;
  if (requiredPages > currentPages) memory.grow(requiredPages - currentPages);
}

function stableRootSerialization(root: unknown): string {
  if (root === null || typeof root !== 'object') return stableSerialize(root);
  const cached = STABLE_ROOT_SERIALIZATIONS.get(root);
  if (cached !== undefined) return cached;
  const serialized = stableSerialize(root);
  STABLE_ROOT_SERIALIZATIONS.set(root, serialized);
  return serialized;
}

function writeSemanticHashUnits(
  units: Uint16Array,
  offset: number,
  serialized: string,
): void {
  for (let index = 0; index < serialized.length; index += 1) {
    units[offset + index] = serialized.charCodeAt(index);
  }
}

function hashSemanticHashScratch(
  scratch: SemanticHashWasmDatasetScratch,
): string {
  const value = BigInt.asUintN(64, scratch.hash(0, scratch.length));
  return `fnv1a64:${value.toString(16).padStart(16, '0')}`;
}

function stableDatasetSerialization(value: unknown): string {
  if (Array.isArray(value)) {
    const roots = value as readonly unknown[];
    const fragments = ['['];
    for (let index = 0; index < roots.length; index += 1) {
      if (index > 0) fragments.push(',');
      const root: unknown = roots[index];
      if (root !== null && typeof root === 'object') {
        let serialized = STABLE_ROOT_SERIALIZATIONS.get(root);
        if (serialized === undefined) {
          serialized = stableSerialize(root);
          STABLE_ROOT_SERIALIZATIONS.set(root, serialized);
        }
        fragments.push(serialized);
      } else {
        fragments.push(stableSerialize(root));
      }
    }
    fragments.push(']');
    return fragments.join('');
  }
  return stableSerialize(value);
}

function wasmSemanticHash(serialized: string): string | null {
  if (typeof WebAssembly === 'undefined') return null;
  try {
    if (semanticHashWasmModule === null) {
      semanticHashWasmModule = new WebAssembly.Module(SEMANTIC_HASH_WASM_BYTES);
    }
    if (semanticHashWasmModule === false) return null;
    const exports = new WebAssembly.Instance(semanticHashWasmModule).exports as {
      readonly memory?: WebAssembly.Memory;
      readonly hash?: (offset: number, length: number) => bigint;
    };
    const memory = exports.memory;
    const hash = exports.hash;
    if (memory === undefined || hash === undefined) return null;
    const requiredPages = Math.max(
      1,
      Math.ceil((serialized.length * Uint16Array.BYTES_PER_ELEMENT) / 65_536),
    );
    if (requiredPages > 1) memory.grow(requiredPages - 1);
    const units = new Uint16Array(memory.buffer, 0, serialized.length);
    for (let index = 0; index < serialized.length; index += 1) {
      units[index] = serialized.charCodeAt(index);
    }
    const value = BigInt.asUintN(64, hash(0, serialized.length));
    return `fnv1a64:${value.toString(16).padStart(16, '0')}`;
  } catch {
    semanticHashWasmModule = false;
    return null;
  }
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  const cached = STABLE_VALUE_SERIALIZATIONS.get(value as object);
  if (cached !== undefined) return cached;
  if (Array.isArray(value)) {
    const fragments = ['['];
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) fragments.push(',');
      fragments.push(stableSerialize(value[index]));
    }
    fragments.push(']');
    const serialized = fragments.join('');
    if (Object.isFrozen(value)) STABLE_VALUE_SERIALIZATIONS.set(value, serialized);
    return serialized;
  }
  if (isCanonicalRecord(value)) {
    const fragments = ['{'];
    const authoredKeys = Object.keys(value);
    const keys = stableSerializationKeyOrder(authoredKeys);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]!;
      if (index > 0) fragments.push(',');
      fragments.push(JSON.stringify(key), ':', stableSerialize(value[key]));
    }
    fragments.push('}');
    const serialized = fragments.join('');
    if (Object.isFrozen(value)) STABLE_VALUE_SERIALIZATIONS.set(value, serialized);
    return serialized;
  }
  throw new TypeError('normalized dataset contains a non-canonical value');
}

function stableSerializationKeyOrder(
  authoredKeys: readonly string[],
): readonly string[] {
  let candidates = STABLE_SERIALIZATION_KEY_ORDERS.get(authoredKeys.length);
  if (candidates !== undefined) {
    for (const candidate of candidates) {
      let matches = true;
      for (let index = 0; index < authoredKeys.length; index += 1) {
        if (candidate.authored[index] !== authoredKeys[index]) {
          matches = false;
          break;
        }
      }
      if (matches) return candidate.sorted;
    }
  } else if (
    stableSerializationKeyOrderShapeCount >=
    MAX_STABLE_SERIALIZATION_KEY_ORDER_SHAPES
  ) {
    return Object.freeze([...authoredKeys].sort());
  } else {
    candidates = [];
    STABLE_SERIALIZATION_KEY_ORDERS.set(authoredKeys.length, candidates);
  }
  const authored = Object.freeze([...authoredKeys]);
  const sorted = Object.freeze([...authoredKeys].sort());
  candidates.push(Object.freeze({ authored, sorted }));
  stableSerializationKeyOrderShapeCount += 1;
  return sorted;
}

function isCanonicalRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
