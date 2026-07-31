import type { PatchMapProjectionIndex } from '../contracts';
import type {
  CorePoint,
  CoreTarget,
  EntityRef,
  EntitySnapshot,
  HitTestOptions,
  SceneSnapshot,
  TransactionBatch,
} from '../dense/contracts';
import {
  PatchMapEntityHitIndex,
  hitTestPatchMapEntityIndex,
  patchMapEntityContainsWorldPoint,
  patchMapEntityWorldAabb,
} from '../semantic/entity-hit-index';
import type { PatchMapBoundsTuple } from '../semantic/geometry';

export const PATCH_MAP_ANIMATED_BAR_HIT_PRIME_THRESHOLD = 1_024;

export interface PatchMapSpatialHitScene {
  snapshot(): SceneSnapshot;
  hitTest(point: CorePoint, options?: HitTestOptions): EntityRef | null;
  get(target: CoreTarget): EntitySnapshot | null;
  ref(id: string): EntityRef | null;
}

export interface PatchMapSpatialHitPresentation {
  readonly activeCount: number;
  probe(entityId: string): object | null;
}

export interface PatchMapSpatialHitCommitImpact {
  readonly invalidate: boolean;
  readonly staleProjectionIds: ReadonlySet<string>;
  readonly removedIds: ReadonlySet<string>;
  readonly spatialAnimations: readonly Readonly<{
    key: string;
    endTimeMs: number;
  }>[];
}

export interface PatchMapSpatialHitDebugSnapshot {
  readonly exactIndex: PatchMapEntityHitIndex | null;
  readonly animatedBarIndex: PatchMapEntityHitIndex | null;
  readonly presentationIndexActive: boolean;
  readonly staleProjectionIds: readonly string[];
  readonly spatialAnimationCount: number;
  readonly denseGeometryCompatible: boolean;
}

/**
 * Owns spatial hit geometry selection, exact-index cache lifetime, and the
 * stale/animated sidecars that decide when dense hit buckets remain valid.
 */
export class PatchMapSpatialHitAuthority {
  private exactIndexValue: PatchMapEntityHitIndex | null = null;
  private animatedBarIndexValue: PatchMapEntityHitIndex | null = null;
  private presentationIndexActiveValue = false;
  private readonly staleProjectionIdSet = new Set<string>();
  private readonly spatialAnimationEndByKey = new Map<string, number>();
  private denseGeometryCompatibleValue = true;
  private activeHitScene: PatchMapSpatialHitScene | null = null;
  private readonly getActiveHitEntity = (ref: EntityRef): EntitySnapshot | null =>
    this.activeHitScene?.get(ref) ?? null;

  public get staleProjectionIds(): ReadonlySet<string> {
    return this.staleProjectionIdSet;
  }

  public get hasSpatialAnimations(): boolean {
    return this.spatialAnimationEndByKey.size > 0;
  }

  public setDenseGeometryCompatible(compatible: boolean): void {
    this.denseGeometryCompatibleValue = compatible;
  }

  public clearStaleProjectionIds(): void {
    this.staleProjectionIdSet.clear();
  }

  public acceptCurrentProjectionIds(entityIds: readonly string[]): void {
    for (const entityId of entityIds) this.staleProjectionIdSet.delete(entityId);
  }

  public clearSpatialAnimations(): void {
    this.spatialAnimationEndByKey.clear();
  }

  public planCommit(
    batch: TransactionBatch,
    scene: PatchMapSpatialHitScene,
    animationClockMs: number,
  ): PatchMapSpatialHitCommitImpact {
    let invalidate = false;
    const staleProjectionIds = new Set<string>();
    const removedIds = new Set<string>();
    const spatialAnimations: Readonly<{ key: string; endTimeMs: number }>[] = [];
    for (const operation of batch.operations) {
      if (operation.type === 'add') {
        invalidate = true;
        staleProjectionIds.add(operation.entity.id);
        continue;
      }
      if (operation.type === 'remove') {
        invalidate = true;
        const id = spatialTargetId(operation.target, scene);
        if (id) removedIds.add(id);
        continue;
      }
      if (operation.type === 'patch') {
        const geometryChanged = operation.changes.x !== undefined ||
          operation.changes.y !== undefined ||
          operation.changes.width !== undefined ||
          operation.changes.height !== undefined ||
          operation.changes.rotation !== undefined;
        if (geometryChanged || operation.changes.zIndex !== undefined) invalidate = true;
        if (geometryChanged) {
          const id = spatialTargetId(operation.target, scene);
          if (id) staleProjectionIds.add(id);
        }
        continue;
      }
      if (
        operation.type === 'animate' &&
        isSpatialAnimationProperty(operation.property)
      ) {
        invalidate = true;
        const id = spatialTargetId(operation.target, scene);
        if (id) {
          staleProjectionIds.add(id);
          spatialAnimations.push(Object.freeze({
            key: spatialAnimationKey(id, operation.property),
            endTimeMs: animationClockMs + operation.durationMs,
          }));
        }
      }
    }
    return Object.freeze({
      invalidate,
      staleProjectionIds,
      removedIds,
      spatialAnimations: Object.freeze(spatialAnimations),
    });
  }

  public invalidateFromCommit(
    impact: PatchMapSpatialHitCommitImpact,
    preserveAnimatedBars: boolean,
  ): void {
    if (impact.invalidate) this.invalidate(preserveAnimatedBars);
  }

  public applyCommitProjectionStaleness(
    impact: PatchMapSpatialHitCommitImpact,
    scene: PatchMapSpatialHitScene,
  ): boolean {
    let changed = false;
    for (const id of impact.removedIds) {
      changed = this.staleProjectionIdSet.delete(id) || changed;
      this.deleteSpatialAnimations(id);
    }
    for (const id of impact.staleProjectionIds) {
      if (scene.ref(id) !== null && !this.staleProjectionIdSet.has(id)) {
        this.staleProjectionIdSet.add(id);
        changed = true;
      }
    }
    return changed;
  }

  public retainCommitAnimations(impact: PatchMapSpatialHitCommitImpact): void {
    for (const animation of impact.spatialAnimations) {
      this.spatialAnimationEndByKey.set(animation.key, animation.endTimeMs);
    }
  }

  public pruneCompletedSpatialAnimations(timeMs: number): void {
    for (const [key, endTimeMs] of this.spatialAnimationEndByKey) {
      if (endTimeMs <= timeMs) this.spatialAnimationEndByKey.delete(key);
    }
  }

  public invalidate(preserveAnimatedBars = false): void {
    this.exactIndexValue = null;
    if (!preserveAnimatedBars) {
      this.animatedBarIndexValue = null;
      this.presentationIndexActiveValue = false;
    }
  }

  public settlePresentationIndex(activeCount: number): void {
    if (activeCount === 0 && this.presentationIndexActiveValue) this.invalidate();
  }

  public primeAnimatedBarsIfNeeded(
    pointerListenerCount: number,
    scene: PatchMapSpatialHitScene,
    semanticProjection: PatchMapProjectionIndex | null,
    presentationProjection: PatchMapProjectionIndex | null,
    presentation: PatchMapSpatialHitPresentation,
  ): boolean {
    if (
      pointerListenerCount === 0 ||
      !isLargePatchMapAnimatedBarBatch(presentation.activeCount)
    ) {
      return false;
    }
    this.animatedBarIndex(
      scene,
      semanticProjection,
      presentationProjection,
      presentation,
    );
    return true;
  }

  public hitTest(
    point: CorePoint,
    options: HitTestOptions,
    scene: PatchMapSpatialHitScene,
    semanticProjection: PatchMapProjectionIndex | null,
    presentationProjection: PatchMapProjectionIndex | null,
    presentation: PatchMapSpatialHitPresentation,
  ): EntityRef | null {
    if (
      this.denseGeometryCompatibleValue &&
      this.staleProjectionIdSet.size === 0
    ) {
      if (
        presentation.activeCount === 0 ||
        (options.kinds !== undefined && !options.kinds.includes('bar'))
      ) {
        return scene.hitTest(point, options);
      }
      return this.hitTestWithAnimatedBars(
        point,
        options,
        scene,
        semanticProjection,
        presentationProjection,
        presentation,
      );
    }
    return this.hitIndexed(
      this.exactIndex(
        scene,
        semanticProjection,
        presentationProjection,
        presentation.activeCount,
      ),
      point,
      options,
      scene,
      presentationProjection,
    );
  }

  public hitBounds(
    target: CoreTarget,
    scene: PatchMapSpatialHitScene,
    presentationProjection: PatchMapProjectionIndex | null,
  ): PatchMapBoundsTuple | null {
    const entity = scene.get(target);
    if (!entity || entity.kind === 'relation') return null;
    const projection = this.staleProjectionIdSet.has(entity.id)
      ? undefined
      : presentationProjection?.byEntityId[entity.id];
    return patchMapEntityWorldAabb(entity, projection);
  }

  public destroy(): void {
    this.exactIndexValue = null;
    this.animatedBarIndexValue = null;
    this.presentationIndexActiveValue = false;
    this.staleProjectionIdSet.clear();
    this.spatialAnimationEndByKey.clear();
    this.denseGeometryCompatibleValue = true;
    this.activeHitScene = null;
  }

  public debugSnapshot(): PatchMapSpatialHitDebugSnapshot {
    return Object.freeze({
      exactIndex: this.exactIndexValue,
      animatedBarIndex: this.animatedBarIndexValue,
      presentationIndexActive: this.presentationIndexActiveValue,
      staleProjectionIds: Object.freeze([...this.staleProjectionIdSet]),
      spatialAnimationCount: this.spatialAnimationEndByKey.size,
      denseGeometryCompatible: this.denseGeometryCompatibleValue,
    });
  }

  private exactIndex(
    scene: PatchMapSpatialHitScene,
    semanticProjection: PatchMapProjectionIndex | null,
    presentationProjection: PatchMapProjectionIndex | null,
    presentationActiveCount: number,
  ): PatchMapEntityHitIndex {
    if (this.exactIndexValue === null) {
      this.exactIndexValue = PatchMapEntityHitIndex.build(
        scene.snapshot(),
        presentationProjection,
        this.staleProjectionIdSet,
        { envelopeProjection: semanticProjection },
      );
      if (presentationActiveCount > 0) this.presentationIndexActiveValue = true;
    }
    return this.exactIndexValue;
  }

  private animatedBarIndex(
    scene: PatchMapSpatialHitScene,
    semanticProjection: PatchMapProjectionIndex | null,
    presentationProjection: PatchMapProjectionIndex | null,
    presentation: PatchMapSpatialHitPresentation,
  ): PatchMapEntityHitIndex {
    if (this.animatedBarIndexValue !== null) return this.animatedBarIndexValue;
    const bars = semanticProjection?.barsByEntityId ?? {};
    const activeBars: EntitySnapshot[] = [];
    for (const entityId of Object.keys(bars)) {
      if (presentation.probe(entityId) === null) continue;
      const entity = scene.get(entityId);
      if (entity?.kind === 'bar') activeBars.push(entity);
    }
    activeBars.sort(paintOrder);
    this.animatedBarIndexValue = PatchMapEntityHitIndex.buildEntities(
      activeBars,
      presentationProjection,
      this.staleProjectionIdSet,
      { envelopeProjection: semanticProjection },
    );
    this.presentationIndexActiveValue = true;
    return this.animatedBarIndexValue;
  }

  private hitTestWithAnimatedBars(
    point: CorePoint,
    options: HitTestOptions,
    scene: PatchMapSpatialHitScene,
    semanticProjection: PatchMapProjectionIndex | null,
    presentationProjection: PatchMapProjectionIndex | null,
    presentation: PatchMapSpatialHitPresentation,
  ): EntityRef | null {
    const denseHit = scene.hitTest(point, options);
    const animatedHit = this.hitIndexed(
      this.animatedBarIndex(
        scene,
        semanticProjection,
        presentationProjection,
        presentation,
      ),
      point,
      options,
      scene,
      presentationProjection,
    );
    if (denseHit === null) return animatedHit;
    const denseEntity = scene.get(denseHit);
    if (denseEntity === null) return animatedHit;
    if (
      presentation.probe(denseEntity.id) !== null &&
      !patchMapEntityContainsWorldPoint(
        denseEntity,
        point,
        presentationProjection?.byEntityId[denseEntity.id],
      )
    ) {
      return this.hitIndexed(
        this.exactIndex(
          scene,
          semanticProjection,
          presentationProjection,
          presentation.activeCount,
        ),
        point,
        options,
        scene,
        presentationProjection,
      );
    }
    return topmostHit(denseHit, animatedHit, scene);
  }

  private hitIndexed(
    index: PatchMapEntityHitIndex,
    point: CorePoint,
    options: HitTestOptions,
    scene: PatchMapSpatialHitScene,
    presentationProjection: PatchMapProjectionIndex | null,
  ): EntityRef | null {
    this.activeHitScene = scene;
    try {
      return hitTestPatchMapEntityIndex(
        index,
        point,
        options,
        this.getActiveHitEntity,
        presentationProjection,
        this.staleProjectionIdSet,
      );
    } finally {
      this.activeHitScene = null;
    }
  }

  private deleteSpatialAnimations(id: string): void {
    const prefix = `${id.length}:${id}:`;
    for (const key of this.spatialAnimationEndByKey.keys()) {
      if (key.startsWith(prefix)) this.spatialAnimationEndByKey.delete(key);
    }
  }
}

export function isLargePatchMapAnimatedBarBatch(activeCount: number): boolean {
  return activeCount >= PATCH_MAP_ANIMATED_BAR_HIT_PRIME_THRESHOLD;
}

function spatialTargetId(
  target: CoreTarget,
  scene: PatchMapSpatialHitScene,
): string | null {
  const id = typeof target === 'string' ? target : scene.get(target)?.id;
  return id || null;
}

function isSpatialAnimationProperty(
  property: string,
): property is 'x' | 'y' | 'width' | 'height' | 'rotation' {
  return property === 'x' ||
    property === 'y' ||
    property === 'width' ||
    property === 'height' ||
    property === 'rotation';
}

function spatialAnimationKey(
  id: string,
  property: 'x' | 'y' | 'width' | 'height' | 'rotation',
): string {
  return `${id.length}:${id}:${property}`;
}

function paintOrder(left: EntitySnapshot, right: EntitySnapshot): number {
  return left.zIndex - right.zIndex || left.ref.slot - right.ref.slot;
}

function topmostHit(
  left: EntityRef,
  right: EntityRef | null,
  scene: PatchMapSpatialHitScene,
): EntityRef {
  if (right === null || (
    left.slot === right.slot &&
    left.generation === right.generation
  )) {
    return left;
  }
  const leftEntity = scene.get(left);
  const rightEntity = scene.get(right);
  if (leftEntity === null) return right;
  if (rightEntity === null) return left;
  return rightEntity.zIndex > leftEntity.zIndex ||
    (rightEntity.zIndex === leftEntity.zIndex && right.slot > left.slot)
    ? right
    : left;
}
