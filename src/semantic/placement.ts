import { PatchMapDatasetError } from './dataset';
import type { PatchMapEdges, PatchMapFixedSize, PatchMapPlacement } from './dataset';

export interface PatchMapPlacementReference extends PatchMapFixedSize {
  readonly x: number;
  readonly y: number;
}

export type PatchMapPlacementBounds = PatchMapPlacementReference;

const PLACEMENTS = new Set<string>([
  'left',
  'left-top',
  'left-bottom',
  'top',
  'right',
  'right-top',
  'right-bottom',
  'bottom',
  'center',
]);

/**
 * Resolve one component rectangle in item-local coordinates.
 *
 * Named placements anchor each named edge with its corresponding margin while
 * leaving an unanchored axis centered in the unmodified reference frame.
 */
export function resolvePatchMapPlacementBounds(
  reference: PatchMapPlacementReference,
  size: PatchMapFixedSize,
  placement: PatchMapPlacement,
  margin: PatchMapEdges,
  path = '$',
): PatchMapPlacementBounds {
  assertFinite(reference.x, `${path}.reference.x`, 'reference x');
  assertFinite(reference.y, `${path}.reference.y`, 'reference y');
  assertFiniteNonNegative(reference.width, `${path}.reference.width`, 'reference width');
  assertFiniteNonNegative(reference.height, `${path}.reference.height`, 'reference height');
  assertFiniteNonNegative(size.width, `${path}.size.width`, 'component width');
  assertFiniteNonNegative(size.height, `${path}.size.height`, 'component height');
  assertFiniteNonNegative(margin.top, `${path}.margin.top`, 'top margin');
  assertFiniteNonNegative(margin.right, `${path}.margin.right`, 'right margin');
  assertFiniteNonNegative(margin.bottom, `${path}.margin.bottom`, 'bottom margin');
  assertFiniteNonNegative(margin.left, `${path}.margin.left`, 'left margin');
  if (!PLACEMENTS.has(placement)) {
    invalid(`${path}.placement`, 'placement must be a supported PatchMap placement');
  }

  const left = reference.x + margin.left;
  const top = reference.y + margin.top;
  const right = reference.x + reference.width - margin.right - size.width;
  const bottom = reference.y + reference.height - margin.bottom - size.height;
  const centerX = reference.x + (reference.width - size.width) / 2;
  const centerY = reference.y + (reference.height - size.height) / 2;

  let x = centerX;
  let y = centerY;
  switch (placement) {
    case 'left':
      x = left;
      break;
    case 'left-top':
      x = left;
      y = top;
      break;
    case 'left-bottom':
      x = left;
      y = bottom;
      break;
    case 'top':
      y = top;
      break;
    case 'right':
      x = right;
      break;
    case 'right-top':
      x = right;
      y = top;
      break;
    case 'right-bottom':
      x = right;
      y = bottom;
      break;
    case 'bottom':
      y = bottom;
      break;
    case 'center':
      break;
  }

  assertFinite(x, `${path}.result.x`, 'resolved x');
  assertFinite(y, `${path}.result.y`, 'resolved y');
  return Object.freeze({ x, y, width: size.width, height: size.height });
}

function assertFinite(value: number, path: string, label: string): void {
  if (!Number.isFinite(value)) {
    invalid(path, `${label} must be finite`);
  }
}

function assertFiniteNonNegative(value: number, path: string, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    invalid(path, `${label} must be finite and non-negative`);
  }
}

function invalid(path: string, detail: string): never {
  throw new PatchMapDatasetError('INVALID_VALUE', path, detail);
}
