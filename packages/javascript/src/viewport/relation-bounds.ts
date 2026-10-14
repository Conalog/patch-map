import { PATCH_MAP_IDENTITY_AFFINE, invertPatchMapAffine } from '../semantic/geometry';
import type { PatchMapViewportGeometryRelation, PatchMapViewportVisual } from './geometry-contracts';
import { logicalFrameBounds } from './logical-frame-bounds';

/** A relation owns one stroke across all authored, open subpaths. */
export function relationBoundsVisuals(relations: readonly PatchMapViewportGeometryRelation[]): readonly PatchMapViewportVisual[] {
  const paths: NonNullable<PatchMapViewportGeometryRelation['viewportPath']>[] = [];
  const visuals: PatchMapViewportVisual[] = [];
  for (const relation of relations) {
    if (relation.viewportPath !== undefined) paths.push(relation.viewportPath);
    else if (relation.worldBounds !== undefined) visuals.push({
      worldBounds: relation.worldBounds,
      ...(relation.worldQuad === undefined ? {} : { worldQuad: relation.worldQuad }),
    });
  }
  if (paths.length === 0) return visuals;
  // Reconciled dense slots need not follow current authored link order.
  if (paths.some((path, index) => index > 0 && path.authoredIndex < paths[index - 1]!.authoredIndex)) {
    paths.sort((left, right) => left.authoredIndex - right.authoredIndex);
  }
  const [a, b, c, d, tx, ty] = invertPatchMapAffine(paths[0]!.affine);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  let previousX = 0, previousY = 0, beforePreviousX = 0, beforePreviousY = 0;
  let hasPrevious = false, hasBeforePrevious = false;
  let maxMiter = 1, strokeWidth = 0;
  const append = (x: number, y: number): void => {
    if (!hasPrevious) { previousX = x; previousY = y; hasPrevious = true; return; }
    if (x === previousX && y === previousY) return;
    if (!hasBeforePrevious) {
      // A one-point subpath has no paint and cannot enlarge the rectangle.
      left = Math.min(left, previousX); top = Math.min(top, previousY);
      right = Math.max(right, previousX); bottom = Math.max(bottom, previousY);
    } else maxMiter = Math.max(maxMiter, miterRatio(beforePreviousX - previousX, beforePreviousY - previousY, x - previousX, y - previousY));
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
    beforePreviousX = previousX; beforePreviousY = previousY; hasBeforePrevious = true;
    previousX = x; previousY = y;
  };
  for (const path of paths) {
    strokeWidth = Math.max(strokeWidth, path.strokeWidth);
    const firstWorld = path.worldPoints[0];
    if (firstWorld === undefined) continue;
    // Render-local points may be snapped for numeric stability. Connectivity
    // follows exact coordinates, so almost-coincident endpoints stay separate.
    const firstX = a * firstWorld[0] + c * firstWorld[1] + tx;
    const firstY = b * firstWorld[0] + d * firstWorld[1] + ty;
    if (!hasPrevious || firstX !== previousX || firstY !== previousY) {
      hasPrevious = false; hasBeforePrevious = false; append(firstX, firstY);
    }
    // The geometry producer validates these points. Project with scalars so
    // each viewport call does not allocate another tuple for every path point.
    for (let index = 1; index < path.worldPoints.length; index += 1) {
      const point = path.worldPoints[index]!;
      append(a * point[0] + c * point[1] + tx, b * point[0] + d * point[1] + ty);
    }
  }
  const padding = strokeWidth / 2 * maxMiter;
  const localBounds = Number.isFinite(left)
    ? Object.freeze([left - padding, top - padding, right - left + padding * 2, bottom - top + padding * 2] as const)
    : Object.freeze([0, 0, 0, 0] as const);
  const worldQuad = Object.freeze({ affine: paths[0]!.affine, localBounds });
  const worldBounds = logicalFrameBounds(PATCH_MAP_IDENTITY_AFFINE, [{ worldBounds: localBounds, worldQuad }]);
  visuals.push(Object.freeze({ worldBounds, worldQuad }));
  return visuals;
}

function miterRatio(ax: number, ay: number, bx: number, by: number): number {
  const aSquared = ax * ax + ay * ay, bSquared = bx * bx + by * by;
  if (aSquared < 1e-12 || bSquared < 1e-12) return 1;
  const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / Math.sqrt(aSquared * bSquared)));
  const sineHalf = Math.sqrt((1 - cosine) / 2);
  return sineHalf >= 1e-6 ? Math.min(10, 1 / sineHalf) : 1;
}
