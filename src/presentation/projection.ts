import type {
  PatchMapEntityProjection,
  PatchMapProjectionIndex,
} from '../parsing/contracts';
import {
  patchMapAffineBasis,
  patchMapAffineCenter,
  freezePatchMapAffine,
  freezePatchMapBounds,
  type PatchMapAffineMatrix,
  type PatchMapBoundsTuple,
  type PatchMapPointTuple,
} from '../semantic/geometry';

interface MutableBarProjectionRecord {
  readonly destination: PatchMapEntityProjection;
  readonly projection: PatchMapEntityProjection;
  readonly localBounds: [number, number, number, number];
  readonly affine: [number, number, number, number, number, number];
  readonly visibleCenter: [number, number];
}

/**
 * Mutable only inside the presentation owner. The outer projection index stays
 * stable across animation frames so a frame changes O(active bars) records and
 * the renderer can upload only caller-declared dense ranges.
 */
export class PatchMapPresentationProjectionStore {
  private semanticValue: PatchMapProjectionIndex | null = null;
  private presentationValue: PatchMapProjectionIndex | null = null;
  private byEntityId: Record<string, PatchMapEntityProjection> | null = null;
  private readonly mutableBars = new Map<string, MutableBarProjectionRecord>();
  private readonly transientOverrides = new Map<string, PatchMapEntityProjection>();

  public get semantic(): PatchMapProjectionIndex | null {
    return this.semanticValue;
  }

  public get presentation(): PatchMapProjectionIndex | null {
    return this.presentationValue;
  }

  /** Copy the entity index once per semantic commit, never once per frame. */
  public replace(
    semantic: PatchMapProjectionIndex,
    visibleBarHeights: ReadonlyMap<string, number> = new Map(),
  ): PatchMapProjectionIndex {
    this.mutableBars.clear();
    this.transientOverrides.clear();
    const byEntityId: Record<string, PatchMapEntityProjection> = {
      ...semantic.byEntityId,
    };
    for (const [entityId, height] of visibleBarHeights) {
      const destination = semantic.byEntityId[entityId];
      if (destination !== undefined) {
        const normalizedHeight = validateVisibleHeight(height);
        if (!Object.is(normalizedHeight, destination.localBounds[3])) {
          const mutable = createMutableBarProjection(destination, normalizedHeight);
          this.mutableBars.set(entityId, mutable);
          byEntityId[entityId] = mutable.projection;
        }
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

  /**
   * Publish a same-identity semantic projection by replacing only explicitly
   * changed entity records. This keeps the O(scene) by-entity table stable
   * during flat-root transformer previews.
   */
  public replaceIncremental(
    semantic: PatchMapProjectionIndex,
    changedEntityIds: readonly string[],
    visibleBarHeights: ReadonlyMap<string, number> = new Map(),
  ): PatchMapProjectionIndex | null {
    if (this.presentationValue === null || this.byEntityId === null) return null;
    this.clearTransientEntityProjections();
    for (const entityId of changedEntityIds) {
      const destination = semantic.byEntityId[entityId];
      this.mutableBars.delete(entityId);
      if (destination === undefined) {
        delete this.byEntityId[entityId];
        continue;
      }
      const visibleHeight = visibleBarHeights.get(entityId);
      if (
        visibleHeight !== undefined &&
        !Object.is(validateVisibleHeight(visibleHeight), destination.localBounds[3])
      ) {
        const mutable = createMutableBarProjection(destination, visibleHeight);
        this.mutableBars.set(entityId, mutable);
        this.byEntityId[entityId] = mutable.projection;
      } else {
        this.byEntityId[entityId] = destination;
      }
    }
    this.semanticValue = semantic;
    this.presentationValue = Object.freeze({
      ...semantic,
      byEntityId: this.byEntityId,
    });
    return this.presentationValue;
  }

  public applyTransientEntityProjections(
    overrides: Readonly<Record<string, PatchMapEntityProjection>>,
    entityIds: readonly string[],
  ): PatchMapProjectionIndex | null {
    if (
      this.semanticValue === null ||
      this.presentationValue === null ||
      this.byEntityId === null
    ) {
      return null;
    }
    if (entityIds.some((entityId) => overrides[entityId] === undefined)) return null;
    this.clearTransientEntityProjections();
    for (const entityId of entityIds) {
      const projection = overrides[entityId]!;
      const visibleHeight = this.visibleHeight(entityId);
      this.transientOverrides.set(entityId, projection);
      if (
        visibleHeight !== null &&
        !Object.is(visibleHeight, projection.localBounds[3]) &&
        this.mutableBars.has(entityId)
      ) {
        const mutable = createMutableBarProjection(projection, visibleHeight);
        this.mutableBars.set(entityId, mutable);
        this.byEntityId[entityId] = mutable.projection;
      } else {
        this.byEntityId[entityId] = projection;
      }
    }
    return this.presentationValue;
  }

  public clearTransientEntityProjections(): readonly string[] {
    if (this.semanticValue === null || this.byEntityId === null) {
      this.transientOverrides.clear();
      return Object.freeze([]);
    }
    const cleared = [...this.transientOverrides.keys()];
    for (const entityId of cleared) {
      const semantic = this.semanticValue.byEntityId[entityId];
      if (semantic === undefined) {
        delete this.byEntityId[entityId];
        this.mutableBars.delete(entityId);
        continue;
      }
      const mutable = this.mutableBars.get(entityId);
      if (mutable === undefined) {
        this.byEntityId[entityId] = semantic;
        continue;
      }
      const visibleHeight = mutable.projection.localBounds[3];
      if (Object.is(visibleHeight, semantic.localBounds[3])) {
        this.mutableBars.delete(entityId);
        this.byEntityId[entityId] = semantic;
      } else {
        const restored = createMutableBarProjection(semantic, visibleHeight);
        this.mutableBars.set(entityId, restored);
        this.byEntityId[entityId] = restored.projection;
      }
    }
    this.transientOverrides.clear();
    return Object.freeze(cleared);
  }

  /** Mutate one internal projection record; the semantic destination is untouched. */
  public applyBarHeight(entityId: string, height: number): boolean {
    const semantic = this.transientOverrides.get(entityId) ??
      this.semanticValue?.byEntityId[entityId];
    const current = this.byEntityId?.[entityId];
    if (semantic === undefined || current === undefined || this.byEntityId === null) return false;
    const normalizedHeight = validateVisibleHeight(height);
    if (Object.is(current.localBounds[3], normalizedHeight)) return false;
    if (Object.is(semantic.localBounds[3], normalizedHeight)) {
      this.mutableBars.delete(entityId);
      this.byEntityId[entityId] = semantic;
      return true;
    }
    let mutable = this.mutableBars.get(entityId);
    if (mutable === undefined || mutable.destination !== semantic) {
      mutable = createMutableBarProjection(semantic, normalizedHeight);
      this.mutableBars.set(entityId, mutable);
      this.byEntityId[entityId] = mutable.projection;
      return true;
    }
    updateMutableBarProjection(mutable, normalizedHeight);
    return true;
  }

  public visibleHeight(entityId: string): number | null {
    return this.byEntityId?.[entityId]?.localBounds[3] ?? null;
  }

  public clear(): void {
    this.semanticValue = null;
    this.presentationValue = null;
    this.byEntityId = null;
    this.mutableBars.clear();
    this.transientOverrides.clear();
  }
}

/**
 * Resize a bar from its semantic bottom edge. This remains correct under
 * rotation, signed scale, and reflection because the translation moves along
 * the destination affine y-axis rather than a screen axis.
 */
export function projectPatchMapBarPresentationHeight(
  destination: PatchMapEntityProjection,
  visibleHeight: number,
): PatchMapEntityProjection {
  validateVisibleHeight(visibleHeight);
  const [localX, localY, localWidth, destinationHeight] = destination.localBounds;
  const height = canonicalNumber(visibleHeight);
  if (Object.is(height, destinationHeight)) return destination;
  const [a, b, c, d, tx, ty] = destination.affine;
  const bottomAnchorOffset = destinationHeight - height;
  const affine = freezePatchMapAffine(
    a,
    b,
    c,
    d,
    tx + c * bottomAnchorOffset,
    ty + d * bottomAnchorOffset,
  );
  const localBounds = freezePatchMapBounds(localX, localY, localWidth, height);
  return Object.freeze({
    ...destination,
    localBounds,
    affine,
    worldBasis: patchMapAffineBasis(affine),
    visibleCenter: patchMapAffineCenter(affine, localBounds),
  });
}

function createMutableBarProjection(
  destination: PatchMapEntityProjection,
  height: number,
): MutableBarProjectionRecord {
  const localBounds: [number, number, number, number] = [
    destination.localBounds[0],
    destination.localBounds[1],
    destination.localBounds[2],
    height,
  ];
  const affine: [number, number, number, number, number, number] = [
    destination.affine[0],
    destination.affine[1],
    destination.affine[2],
    destination.affine[3],
    destination.affine[4],
    destination.affine[5],
  ];
  const visibleCenter: [number, number] = [0, 0];
  const projection = Object.freeze({
    ...destination,
    localBounds: localBounds as PatchMapBoundsTuple,
    affine: affine as PatchMapAffineMatrix,
    worldBasis: destination.worldBasis,
    visibleCenter: visibleCenter as PatchMapPointTuple,
  });
  const record = {
    destination,
    projection,
    localBounds,
    affine,
    visibleCenter,
  };
  updateMutableBarProjection(record, height);
  return record;
}

function updateMutableBarProjection(
  record: MutableBarProjectionRecord,
  height: number,
): void {
  const destination = record.destination;
  const [localX, localY, localWidth, destinationHeight] = destination.localBounds;
  const [a, b, c, d, tx, ty] = destination.affine;
  const bottomAnchorOffset = destinationHeight - height;
  const presentationTx = tx + c * bottomAnchorOffset;
  const presentationTy = ty + d * bottomAnchorOffset;
  record.localBounds[0] = localX;
  record.localBounds[1] = localY;
  record.localBounds[2] = localWidth;
  record.localBounds[3] = height;
  record.affine[0] = a;
  record.affine[1] = b;
  record.affine[2] = c;
  record.affine[3] = d;
  record.affine[4] = presentationTx;
  record.affine[5] = presentationTy;
  const centerX = localX + localWidth / 2;
  const centerY = localY + height / 2;
  record.visibleCenter[0] = a * centerX + c * centerY + presentationTx;
  record.visibleCenter[1] = b * centerX + d * centerY + presentationTy;
}

function validateVisibleHeight(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('visibleHeight must be finite and non-negative');
  }
  return canonicalNumber(value);
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
