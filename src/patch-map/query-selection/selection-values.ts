import type {
  PatchMapLogicalTargetKey,
  PatchMapLogicalTargetSnapshot,
  PatchMapSelectionChange,
  PatchMapSelectionClickType,
  PatchMapSelectionEligibilityOptions,
  PatchMapSelectionSetOperation,
} from './contracts';

interface PatchMapSelectionEligibilityContext {
  readonly locked: ReadonlySet<string>;
  readonly rejected: ReadonlySet<string>;
  readonly predicate: PatchMapSelectionEligibilityOptions['predicate'];
}

const CLEAR_SELECTION_FIELDS = new Set(['op', 'source']);
const SET_SELECTION_FIELDS = new Set(['op', 'source', 'ids']);

export function patchMapSelectionClickType(clickCount: number): PatchMapSelectionClickType {
  const normalized = normalizeClickCount(clickCount);
  if (normalized === 1) return 'single';
  if (normalized === 2) return 'double';
  return 'multi-click';
}

export function applyPatchMapSelectionOperation(
  current: readonly string[],
  input: PatchMapSelectionSetOperation,
  isValid: (id: string) => boolean,
): PatchMapSelectionChange {
  const operation = normalizeSelectionOperation(input);
  const before = strictSelectionIds(current, 'current selection');
  const source = operation.source;
  const requested = operation.op === 'clear'
    ? Object.freeze([] as string[])
    : uniqueStrings(operation.ids);
  const next = [...before];

  if (operation.op === 'replace') {
    next.splice(0, next.length, ...requested.filter(isValid));
  } else if (operation.op === 'add') {
    for (const id of requested) {
      if (isValid(id) && !next.includes(id)) next.push(id);
    }
  } else if (operation.op === 'remove') {
    const removed = new Set(requested);
    next.splice(0, next.length, ...next.filter((id) => !removed.has(id)));
  } else if (operation.op === 'toggle') {
    for (const id of requested) {
      const index = next.indexOf(id);
      if (index >= 0) {
        next.splice(index, 1);
      } else if (isValid(id)) {
        next.push(id);
      }
    }
  } else if (operation.op === 'clear') {
    next.splice(0, next.length);
  }

  const currentSet = new Set(next);
  const beforeSet = new Set(before);
  const added = next.filter((id) => !beforeSet.has(id));
  const removed = before.filter((id) => !currentSet.has(id));
  return Object.freeze({
    changed: added.length > 0 || removed.length > 0,
    source,
    current: Object.freeze(next),
    added: Object.freeze(added),
    removed: Object.freeze(removed),
  });
}

export function selectionPaintOrder(
  left: PatchMapLogicalTargetSnapshot,
  right: PatchMapLogicalTargetSnapshot,
): number {
  return right.zIndex - left.zIndex ||
    right.depth - left.depth ||
    right.sceneOrder - left.sceneOrder ||
    left.key.localeCompare(right.key);
}

export function selectionEligible(
  target: PatchMapLogicalTargetSnapshot,
  context: PatchMapSelectionEligibilityContext,
): boolean {
  if (target.locked || target.ancestorLocked) return false;
  const aliases = targetAliases(target);
  const ancestorAliases = target.ancestorKeys.flatMap(logicalKeyAliases);
  if (
    aliases.some((alias) => context.locked.has(alias) || context.rejected.has(alias)) ||
    ancestorAliases.some((alias) => context.locked.has(alias))
  ) return false;
  return context.predicate?.(target) ?? true;
}

export function compileSelectionEligibility(
  options: PatchMapSelectionEligibilityOptions,
): PatchMapSelectionEligibilityContext {
  return {
    locked: new Set(options.lockedIds ?? []),
    rejected: new Set(options.rejectIds ?? []),
    predicate: options.predicate,
  };
}

export function targetAliases(target: PatchMapLogicalTargetSnapshot | null): readonly string[] {
  if (target === null) return Object.freeze([]);
  return Object.freeze([
    target.key,
    target.selectionId,
    target.id,
    ...(target.ownerId === null ? [] : [`${target.ownerId}/${target.id}`]),
  ]);
}

function logicalKeyAliases(key: PatchMapLogicalTargetKey): readonly string[] {
  if (key.startsWith('element:')) return Object.freeze([key, key.slice('element:'.length)]);
  const body = key.slice('component:'.length);
  return Object.freeze([key, body]);
}

export function boundsContain(
  bounds: readonly [number, number, number, number],
  point: Readonly<{ readonly x: number; readonly y: number }>,
): boolean {
  if (bounds.some((value) => !Number.isFinite(value))) return false;
  const [x, y, width, height] = bounds;
  if (width < 0 || height < 0) return false;
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

export function validateFinitePoint(
  point: Readonly<{ readonly x: number; readonly y: number }>,
): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('selection point must contain finite coordinates');
  }
}

export function normalizeClickCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('clickCount must be a positive safe integer');
  }
  return value;
}

function strictSelectionIds(values: unknown, label: string): readonly string[] {
  const detached = strictSelectionArray(values, label);
  detached.forEach((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
  });
  return detached as readonly string[];
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function normalizeSelectionOperation(input: unknown): PatchMapSelectionSetOperation & Readonly<{
  readonly source: 'canvas' | 'external' | 'programmatic';
}> {
  const record = strictSelectionRecord(input);
  const op = record.op;
  if (op !== 'replace' && op !== 'add' && op !== 'remove' && op !== 'toggle' && op !== 'clear') {
    throw new TypeError(`unsupported selection operation ${JSON.stringify(op)}`);
  }
  const source = record.source ?? 'programmatic';
  if (source !== 'canvas' && source !== 'external' && source !== 'programmatic') {
    throw new TypeError(`unsupported selection source ${JSON.stringify(source)}`);
  }
  const allowed = op === 'clear' ? CLEAR_SELECTION_FIELDS : SET_SELECTION_FIELDS;
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw new TypeError(`selection operation contains unknown field ${JSON.stringify(unknown)}`);
  }
  if (op === 'clear') {
    return Object.freeze({
      op,
      source,
    });
  }
  if (!Object.hasOwn(record, 'ids')) {
    throw new TypeError('selection operation IDs must be provided');
  }
  return Object.freeze({
    op,
    source,
    ids: strictSelectionIds(record.ids, 'selection operation IDs'),
  });
}

function strictSelectionRecord(value: unknown): Readonly<Record<string, unknown>> {
  const prototype = value === null || typeof value !== 'object'
    ? undefined
    : Reflect.getPrototypeOf(value);
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (prototype !== Object.prototype && prototype !== null)
  ) {
    throw new TypeError('selection operation must be a strict plain record');
  }
  const detached: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new TypeError('selection operation must not contain symbol fields');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`selection operation field ${JSON.stringify(key)} must be data-only`);
    }
    Object.defineProperty(detached, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(detached);
}

function strictSelectionArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const detached: unknown[] = new Array(value.length);
  let entryCount = 0;
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string') throw new TypeError(`${label} must not contain symbol fields`);
    const index = Number(key);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= value.length ||
      String(index) !== key
    ) {
      throw new TypeError(`${label} must not contain extra fields`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`${label}[${index}] must be an own enumerable data entry`);
    }
    detached[index] = descriptor.value;
    entryCount += 1;
  }
  if (entryCount !== value.length) {
    for (let index = 0; index < detached.length; index += 1) {
      if (!Object.hasOwn(detached, index)) {
        throw new TypeError(`${label}[${index}] must be an own enumerable data entry`);
      }
    }
  }
  return Object.freeze(detached);
}
