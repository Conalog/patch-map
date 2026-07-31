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
  validateSelectionIds(current, 'current selection');
  const source = input.source ?? 'programmatic';
  const requested = input.op === 'clear'
    ? Object.freeze([] as string[])
    : uniqueStrings(input.ids, 'selection operation IDs');
  const before = Object.freeze([...current]);
  const next = [...before];

  if (input.op === 'replace') {
    next.splice(0, next.length, ...requested.filter(isValid));
  } else if (input.op === 'add') {
    for (const id of requested) {
      if (isValid(id) && !next.includes(id)) next.push(id);
    }
  } else if (input.op === 'remove') {
    const removed = new Set(requested);
    next.splice(0, next.length, ...next.filter((id) => !removed.has(id)));
  } else if (input.op === 'toggle') {
    for (const id of requested) {
      const index = next.indexOf(id);
      if (index >= 0) {
        next.splice(index, 1);
      } else if (isValid(id)) {
        next.push(id);
      }
    }
  } else {
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

function validateSelectionIds(values: readonly string[], label: string): void {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  values.forEach((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
  });
}

function uniqueStrings(values: readonly string[], label: string): readonly string[] {
  validateSelectionIds(values, label);
  return Object.freeze([...new Set(values)]);
}
