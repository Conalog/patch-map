import type { PatchMapSurfaceEntityGeometry } from '../engine/surface-contract';
import type { PatchMapLogicalTargetSnapshot } from '../query-selection/contracts';
import type {
  PatchMapAccessibilityDerivation,
  PatchMapAccessibilityTargetInput,
} from './contracts';

const ACCESSIBLE_ELEMENT_TYPES = new Set([
  'grid-cell',
  'image',
  'item',
  'rect',
  'text',
]);

/**
 * Build one focus order from the Engine logical index and renderer-aligned
 * screen geometry. Components stay aggregated under their owning logical
 * element; relations and non-visual hierarchy containers are not tab stops.
 */
export function derivePatchMapAccessibilityTargets(
  logicalTargets: readonly PatchMapLogicalTargetSnapshot[],
  geometries: readonly PatchMapSurfaceEntityGeometry[],
): PatchMapAccessibilityDerivation {
  const eligibleTargets = new Map<string, PatchMapLogicalTargetSnapshot>();
  const boundsByTarget = new Map<string, MutableBoundsAccumulator>();
  const targets: PatchMapAccessibilityTargetInput[] = [];
  let hiddenFocusableCount = 0;
  let invalidNodeCount = 0;
  let nonFiniteBoundsCount = 0;

  for (const target of logicalTargets) {
    if (
      target.kind !== 'element' ||
      !ACCESSIBLE_ELEMENT_TYPES.has(target.type)
    ) {
      continue;
    }
    if (target.value.show === false) {
      hiddenFocusableCount += 1;
      continue;
    }
    eligibleTargets.set(target.id, target);
    boundsByTarget.set(target.id, createBoundsAccumulator());
  }

  for (const geometry of geometries) {
    if (!geometry.visible) continue;
    const targetIds = geometry.ownerItemId === undefined ||
      geometry.ownerItemId === geometry.id
      ? [geometry.id]
      : [geometry.id, geometry.ownerItemId];
    for (const targetId of targetIds) {
      const bounds = boundsByTarget.get(targetId);
      if (bounds !== undefined) includeScreenBounds(bounds, geometry.screenBounds);
    }
  }

  for (const target of eligibleTargets.values()) {
    const accumulator = boundsByTarget.get(target.id);
    const bounds = accumulator === undefined
      ? null
      : finishScreenBounds(accumulator);
    if (bounds === null) {
      invalidNodeCount += 1;
      if (accumulator?.nonFinite === true) {
        nonFiniteBoundsCount += 1;
      }
      continue;
    }
    const locked = target.locked || target.ancestorLocked;
    targets.push(Object.freeze({
      id: target.id,
      label: accessibilityLabel(target),
      type: target.type,
      screenBounds: bounds,
      sceneOrder: target.sceneOrder,
      locked,
      actions: Object.freeze(
        locked
          ? ['focus'] as const
          : ['focus', 'activate', 'select'] as const,
      ),
    }));
  }

  targets.sort((left, right) =>
    left.sceneOrder - right.sceneOrder || left.id.localeCompare(right.id));
  return Object.freeze({
    targets: Object.freeze(targets),
    hiddenFocusableCount,
    invalidNodeCount,
    nonFiniteBoundsCount,
  });
}

interface MutableBoundsAccumulator {
  seen: boolean;
  invalid: boolean;
  nonFinite: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function createBoundsAccumulator(): MutableBoundsAccumulator {
  return {
    seen: false,
    invalid: false,
    nonFinite: false,
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

function includeScreenBounds(
  accumulator: MutableBoundsAccumulator,
  bounds: readonly [number, number, number, number],
): void {
  accumulator.seen = true;
  const [x, y, width, height] = bounds;
  if (![x, y, width, height].every(Number.isFinite)) {
    accumulator.invalid = true;
    accumulator.nonFinite = true;
    return;
  }
  if (width < 0 || height < 0) {
    accumulator.invalid = true;
    return;
  }
  accumulator.minX = Math.min(accumulator.minX, x);
  accumulator.minY = Math.min(accumulator.minY, y);
  accumulator.maxX = Math.max(accumulator.maxX, x + width);
  accumulator.maxY = Math.max(accumulator.maxY, y + height);
}

function finishScreenBounds(
  accumulator: MutableBoundsAccumulator,
): readonly [number, number, number, number] | null {
  if (
    !accumulator.seen ||
    accumulator.invalid ||
    ![
      accumulator.minX,
      accumulator.minY,
      accumulator.maxX,
      accumulator.maxY,
    ].every(Number.isFinite)
  ) {
    return null;
  }
  return Object.freeze([
    accumulator.minX,
    accumulator.minY,
    Math.max(0, accumulator.maxX - accumulator.minX),
    Math.max(0, accumulator.maxY - accumulator.minY),
  ] as const);
}

function accessibilityLabel(target: PatchMapLogicalTargetSnapshot): string {
  if (target.label !== null && target.label.length > 0) return target.label;
  const text = target.value.text;
  return typeof text === 'string' && text.length > 0 ? text : target.id;
}
