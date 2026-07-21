import type {
  CoreV2EntityProjection,
  CoreV2ProjectionIndex,
} from './contracts';
import {
  coreV2AffineBasis,
  coreV2AffineCenter,
  freezeCoreV2Affine,
  freezeCoreV2Bounds,
} from './semantic/geometry';

/**
 * Mutable only inside the presentation owner. The outer projection index stays
 * stable across animation frames so a frame changes O(active bars) records and
 * the renderer can upload only caller-declared dense ranges.
 */
export class CoreV2PresentationProjectionStore {
  private semanticValue: CoreV2ProjectionIndex | null = null;
  private presentationValue: CoreV2ProjectionIndex | null = null;
  private byEntityId: Record<string, CoreV2EntityProjection> | null = null;

  public get semantic(): CoreV2ProjectionIndex | null {
    return this.semanticValue;
  }

  public get presentation(): CoreV2ProjectionIndex | null {
    return this.presentationValue;
  }

  /** Copy the entity index once per semantic commit, never once per frame. */
  public replace(
    semantic: CoreV2ProjectionIndex,
    visibleBarHeights: ReadonlyMap<string, number> = new Map(),
  ): CoreV2ProjectionIndex {
    const byEntityId: Record<string, CoreV2EntityProjection> = {
      ...semantic.byEntityId,
    };
    for (const [entityId, height] of visibleBarHeights) {
      const destination = semantic.byEntityId[entityId];
      if (destination !== undefined) {
        byEntityId[entityId] = projectCoreV2BarPresentationHeight(destination, height);
      }
    }
    this.semanticValue = semantic;
    this.byEntityId = byEntityId;
    this.presentationValue = Object.freeze({
      ...semantic,
      byEntityId,
    });
    return this.presentationValue;
  }

  /** Mutate one internal projection record; the semantic destination is untouched. */
  public applyBarHeight(entityId: string, height: number): boolean {
    const semantic = this.semanticValue?.byEntityId[entityId];
    const current = this.byEntityId?.[entityId];
    if (semantic === undefined || current === undefined || this.byEntityId === null) return false;
    const next = projectCoreV2BarPresentationHeight(semantic, height);
    if (sameProjectionGeometry(current, next)) return false;
    this.byEntityId[entityId] = next;
    return true;
  }

  public visibleHeight(entityId: string): number | null {
    return this.byEntityId?.[entityId]?.localBounds[3] ?? null;
  }

  public clear(): void {
    this.semanticValue = null;
    this.presentationValue = null;
    this.byEntityId = null;
  }
}

/**
 * Resize a bar from its semantic bottom edge. This remains correct under
 * rotation, signed scale, and reflection because the translation moves along
 * the destination affine y-axis rather than a screen axis.
 */
export function projectCoreV2BarPresentationHeight(
  destination: CoreV2EntityProjection,
  visibleHeight: number,
): CoreV2EntityProjection {
  if (!Number.isFinite(visibleHeight) || visibleHeight < 0) {
    throw new RangeError('visibleHeight must be finite and non-negative');
  }
  const [localX, localY, localWidth, destinationHeight] = destination.localBounds;
  const height = canonicalNumber(visibleHeight);
  if (Object.is(height, destinationHeight)) return destination;
  const [a, b, c, d, tx, ty] = destination.affine;
  const bottomAnchorOffset = destinationHeight - height;
  const affine = freezeCoreV2Affine(
    a,
    b,
    c,
    d,
    tx + c * bottomAnchorOffset,
    ty + d * bottomAnchorOffset,
  );
  const localBounds = freezeCoreV2Bounds(localX, localY, localWidth, height);
  return Object.freeze({
    ...destination,
    localBounds,
    affine,
    worldBasis: coreV2AffineBasis(affine),
    visibleCenter: coreV2AffineCenter(affine, localBounds),
  });
}

function sameProjectionGeometry(
  left: CoreV2EntityProjection,
  right: CoreV2EntityProjection,
): boolean {
  return sameNumbers(left.localBounds, right.localBounds) &&
    sameNumbers(left.affine, right.affine) &&
    sameNumbers(left.visibleCenter, right.visibleCenter);
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
