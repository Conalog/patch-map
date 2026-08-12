import type {
  PatchMapBarProjection,
  PatchMapEntityProjection,
  ParseIdentityIndex,
  PatchMapProjectionIndex,
} from '../contracts';
import type { SlotRange } from '../dense/contracts';
import {
  PatchMapPresentationController,
  type PatchMapPresentationFrame,
  type PatchMapPresentationProbe,
  type PatchMapPresentationReconcileFrame,
  type PatchMapPresentationSnapshot,
} from '../presentation';
import type {
  PatchMapPresentationFillOverride,
  PatchMapPresentationPolicyInput,
} from '../presentation-policy';
import { PatchMapPresentationProjectionStore } from '../presentation-projection';
import type { PatchMapScene } from '../scene';
import { isPlainRecord } from '../shared/plain-record';
import {
  sameNullableStringArray,
  sameStringArray,
} from '../shared/string-array-values';
import type {
  PatchMapComponentVisualTarget,
  PatchMapInstanceBarTarget,
} from './contracts';
import {
  patchMapComponentProbeTargetKey,
  patchMapComponentTargetKey,
} from './product-probe-reader';
import {
  contiguousSlotRanges,
  contiguousSlotRangesInPlace,
} from './slot-ranges';

export interface PatchMapLogicalPresentationPolicy {
  readonly revision: number;
  readonly highlightIds: readonly string[] | null;
  readonly deEmphasisAlpha: number;
  readonly hiddenLayerIds: readonly string[];
  readonly fillOverrides: readonly PatchMapPresentationFillOverride[];
}

type PatchMapAnimatedBarTarget =
  | PatchMapComponentVisualTarget
  | PatchMapInstanceBarTarget;

/**
 * A replaceable bar-presentation state prepared before an atomic scene load.
 * It is installed only after semantic publication succeeds and can therefore
 * be restored without reconstructing active controller rows.
 */
export interface PatchMapBarPresentationLoadState {
  readonly projectionStore: PatchMapPresentationProjectionStore;
  readonly controller: PatchMapPresentationController;
  readonly generation: number;
  readonly ghostPublicationCount: number;
  readonly entityEpoch: number;
  readonly validatedEntityEpoch: number;
  readonly invalidEntityIds: Set<string>;
  readonly clockMs: number;
}

const EMPTY_RANGES: readonly SlotRange[] = Object.freeze([]);

/** Ephemeral frame summary consumed synchronously by frame publication. */
export interface PatchMapBarPresentationPublicationFrame {
  readonly activeCount: number;
  readonly changedCount: number;
  readonly settledCount: number;
  readonly totalSettlementCount: number;
  readonly published: boolean;
  readonly dirtyRanges: readonly SlotRange[];
}

type MutablePublicationFrame = {
  -readonly [Key in keyof PatchMapBarPresentationPublicationFrame]:
    PatchMapBarPresentationPublicationFrame[Key];
};

/**
 * Single writer for renderer-visible bar geometry and logical presentation
 * policy. It owns no renderer, scheduler, RAF, Pixi object, or listener.
 */
export class PatchMapBarPresentationAuthority {
  private projectionStore = new PatchMapPresentationProjectionStore();
  private controller: PatchMapPresentationController;
  private generation = 1;
  private ghostPublicationCountValue = 0;
  private entityEpoch = 0;
  private validatedEntityEpoch = 0;
  private invalidEntityIds = new Set<string>();
  private clockMsValue = 0;
  private reducedMotionValue = false;
  private logicalPolicyValue: PatchMapLogicalPresentationPolicy | null = null;
  private policyRevisionValue = 0;
  private publicationChangedCountValue = 0;
  private publicationDirtyRangesValue: readonly SlotRange[] = EMPTY_RANGES;
  private readonly publicationSlots: number[] = [];
  private readonly publicationFrame: MutablePublicationFrame = {
    activeCount: 0,
    changedCount: 0,
    settledCount: 0,
    totalSettlementCount: 0,
    published: false,
    dirtyRanges: EMPTY_RANGES,
  };

  public constructor() {
    this.controller = this.createController(this.generation);
  }

  public get activeCount(): number {
    return this.controller.activeCount;
  }

  public get presentationRevision(): number {
    return this.controller.presentationRevision;
  }

  public get visibleProjection(): PatchMapProjectionIndex | null {
    return this.projectionStore.presentation;
  }

  public get clockMs(): number {
    return this.clockMsValue;
  }

  public get reducedMotion(): boolean {
    return this.reducedMotionValue;
  }

  public get ghostPublicationCount(): number {
    return this.ghostPublicationCountValue;
  }

  public get logicalPolicy(): PatchMapLogicalPresentationPolicy | null {
    return this.logicalPolicyValue;
  }

  public get policyRevision(): number {
    return this.policyRevisionValue;
  }

  /** Number of valid sidecar records mutated by the latest advance/settle. */
  public get publicationChangedCount(): number {
    return this.publicationChangedCountValue;
  }

  /** Dense ranges safe to upload after the latest advance/settle. */
  public get publicationDirtyRanges(): readonly SlotRange[] {
    return this.publicationDirtyRangesValue;
  }

  public snapshot(): PatchMapPresentationSnapshot {
    return this.controller.snapshot();
  }

  public probe(entityId: string): PatchMapPresentationProbe | null {
    return this.controller.probe(entityId);
  }

  public visibleHeight(entityId: string): number | null {
    return this.projectionStore.visibleHeight(entityId);
  }

  public prepareLoadedState(
    projection: PatchMapProjectionIndex,
  ): PatchMapBarPresentationLoadState {
    const generation = this.generation + 1;
    const projectionStore = new PatchMapPresentationProjectionStore();
    projectionStore.replace(projection);
    const entityEpoch = this.entityEpoch + 1;
    return {
      projectionStore,
      controller: this.createController(generation),
      generation,
      ghostPublicationCount: 0,
      entityEpoch,
      validatedEntityEpoch: entityEpoch,
      invalidEntityIds: new Set(),
      clockMs: 0,
    };
  }

  public captureLoadedState(): PatchMapBarPresentationLoadState {
    return {
      projectionStore: this.projectionStore,
      controller: this.controller,
      generation: this.generation,
      ghostPublicationCount: this.ghostPublicationCountValue,
      entityEpoch: this.entityEpoch,
      validatedEntityEpoch: this.validatedEntityEpoch,
      invalidEntityIds: this.invalidEntityIds,
      clockMs: this.clockMsValue,
    };
  }

  public installLoadedState(state: PatchMapBarPresentationLoadState): void {
    this.projectionStore = state.projectionStore;
    this.controller = state.controller;
    this.generation = state.generation;
    this.ghostPublicationCountValue = state.ghostPublicationCount;
    this.entityEpoch = state.entityEpoch;
    this.validatedEntityEpoch = state.validatedEntityEpoch;
    this.invalidEntityIds = state.invalidEntityIds;
    this.clockMsValue = state.clockMs;
    this.resetPublication();
  }

  public disposeLoadedState(state: PatchMapBarPresentationLoadState): void {
    state.controller.destroy();
    state.projectionStore.clear();
    state.invalidEntityIds.clear();
  }

  public setReducedMotion(enabled: boolean): boolean {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('reduced motion must be a boolean');
    }
    if (this.reducedMotionValue === enabled) return false;
    this.reducedMotionValue = enabled;
    return true;
  }

  public setLogicalPolicy(input: PatchMapPresentationPolicyInput): boolean {
    const candidate = normalizeLogicalPresentationPolicy(
      input,
      this.policyRevisionValue + 1,
    );
    if (sameLogicalPresentationPolicy(this.logicalPolicyValue, candidate)) return false;
    this.policyRevisionValue += 1;
    this.logicalPolicyValue = Object.freeze({
      ...candidate,
      revision: this.policyRevisionValue,
    });
    return true;
  }

  public clearLogicalPolicy(): boolean {
    if (this.logicalPolicyValue === null) return false;
    this.policyRevisionValue += 1;
    this.logicalPolicyValue = null;
    return true;
  }

  public recordGeometryMutation(): void {
    this.entityEpoch += 1;
  }

  /**
   * Commit semantic bar destinations immediately while retaining only active
   * renderer-visible heights in the transient projection sidecar.
   */
  public reconcile(
    previousSemantic: PatchMapProjectionIndex | null,
    next: PatchMapProjectionIndex,
    scene: PatchMapScene,
    animateBarChanges: boolean,
    animatedBarTargets?: readonly PatchMapAnimatedBarTarget[],
    incrementalEntityIds?: readonly string[],
    entitySourceById?: ParseIdentityIndex['entitySourceById'],
  ): PatchMapProjectionIndex {
    const previousBars = previousSemantic?.barsByEntityId ?? {};
    const nextBars = next.barsByEntityId ?? {};
    const visibleHeights = new Map<string, number>();
    const timeMs = this.clockMsValue;
    const animatedTargetKeys = animatedBarTargets === undefined
      ? null
      : new Set(animatedBarTargets.map(animatedBarTargetKey));

    if (
      incrementalEntityIds !== undefined &&
      incrementalBarPresentationCompatible(previousBars, nextBars, incrementalEntityIds)
    ) {
      for (const entityId of incrementalEntityIds) {
        const bar = nextBars[entityId];
        const previous = previousBars[entityId];
        const active = this.controller.readActiveForReconcile(entityId);
        if (bar === undefined) {
          if (active.found) {
            this.controller.cancelForReconcile(
              entityId,
              active.generation,
              timeMs,
              'remove',
            );
          }
          continue;
        }
        const entity = scene.get(entityId);
        const ref = entity?.ref ?? null;
        const currentHeight = this.projectionStore.visibleHeight(entityId) ??
          previous?.destinationHeight ??
          bar.destinationHeight;
        const canAnimate = animateBarChanges &&
          (
            animatedTargetKeys === null ||
            barMatchesAnimatedTarget(
              entityId,
              bar,
              animatedTargetKeys,
              entitySourceById,
            )
          ) &&
          previous !== undefined &&
          entity?.kind === 'bar' &&
          entity.visible &&
          ref !== null &&
          bar.animation;
        const destinationChanged =
          previous?.destinationHeight !== bar.destinationHeight;
        if (!canAnimate) {
          if (active.found) {
            this.controller.cancelForReconcile(
              entityId,
              active.generation,
              timeMs,
              entity === null ? 'remove' : entity.visible ? 'replacement' : 'hide',
            );
          }
          continue;
        }
        if (destinationChanged) {
          const retargeted = this.controller.retargetForReconcile(
            entityId,
            ref.slot,
            ref.generation,
            currentHeight,
            bar.destinationHeight,
            timeMs,
            bar.animationDuration,
            bar.animation,
          );
          if (retargeted.scheduled) {
            visibleHeights.set(entityId, retargeted.startValue);
          }
          continue;
        }
        if (
          active.found &&
          active.slot === ref.slot &&
          active.generation === ref.generation
        ) {
          visibleHeights.set(entityId, active.currentValue);
        } else if (active.found) {
          this.controller.cancelForReconcile(
            entityId,
            active.generation,
            timeMs,
            'replacement',
          );
        }
      }
      const incremental = this.projectionStore.replaceIncremental(
        next,
        incrementalEntityIds,
        visibleHeights,
      );
      if (incremental !== null) {
        this.validatedEntityEpoch = this.entityEpoch;
        this.invalidEntityIds.clear();
        return incremental;
      }
    }

    for (const entityId of Object.keys(previousBars).sort()) {
      if (nextBars[entityId] !== undefined) continue;
      const active = this.controller.readActiveForReconcile(entityId);
      if (active.found) {
        this.controller.cancelForReconcile(
          entityId,
          active.generation,
          timeMs,
          'remove',
        );
      }
    }

    for (const entityId of Object.keys(nextBars).sort()) {
      const bar = nextBars[entityId];
      if (bar === undefined) continue;
      const previous = previousBars[entityId];
      const entity = scene.get(entityId);
      const ref = entity?.ref ?? null;
      const active = this.controller.readActiveForReconcile(entityId);
      const currentHeight = this.projectionStore.visibleHeight(entityId) ??
        previous?.destinationHeight ??
        bar.destinationHeight;
      const canAnimate = animateBarChanges &&
        (
          animatedTargetKeys === null ||
          barMatchesAnimatedTarget(
            entityId,
            bar,
            animatedTargetKeys,
            entitySourceById,
          )
        ) &&
        previous !== undefined &&
        entity?.kind === 'bar' &&
        entity.visible &&
        ref !== null &&
        bar.animation;
      const destinationChanged = previous?.destinationHeight !== bar.destinationHeight;

      if (!canAnimate) {
        if (active.found) {
          this.controller.cancelForReconcile(
            entityId,
            active.generation,
            timeMs,
            entity === null ? 'remove' : entity.visible ? 'replacement' : 'hide',
          );
        }
        continue;
      }

      if (destinationChanged) {
        const retargeted = this.controller.retargetForReconcile(
          entityId,
          ref.slot,
          ref.generation,
          currentHeight,
          bar.destinationHeight,
          timeMs,
          bar.animationDuration,
          bar.animation,
        );
        if (retargeted.scheduled) visibleHeights.set(entityId, retargeted.startValue);
        continue;
      }

      if (
        active.found &&
        active.slot === ref.slot &&
        active.generation === ref.generation
      ) {
        visibleHeights.set(entityId, active.currentValue);
      } else if (active.found) {
        this.controller.cancelForReconcile(
          entityId,
          active.generation,
          timeMs,
          'replacement',
        );
      }
    }

    this.validatedEntityEpoch = this.entityEpoch;
    this.invalidEntityIds.clear();
    return this.projectionStore.replace(next, visibleHeights);
  }

  public advance(
    timeMs: number,
    scene: PatchMapScene,
    semanticProjection: PatchMapProjectionIndex | null,
  ): PatchMapBarPresentationPublicationFrame {
    const source = this.controller.advanceForReconcile(timeMs);
    this.applyReconcileFrame(source, scene, semanticProjection);
    this.clockMsValue = timeMs;
    const frame = this.publicationFrame;
    frame.activeCount = source.activeCount;
    frame.changedCount = source.changedCount;
    frame.settledCount = source.settledCount;
    frame.totalSettlementCount = source.totalSettlementCount;
    frame.published = source.published;
    frame.dirtyRanges = this.publicationDirtyRangesValue;
    return frame;
  }

  public settle(
    timeMs: number,
    scene: PatchMapScene,
    semanticProjection: PatchMapProjectionIndex | null,
  ): PatchMapPresentationFrame {
    const frame = this.applyFrame(
      this.controller.settle(timeMs),
      scene,
      semanticProjection,
    );
    this.clockMsValue = timeMs;
    return frame;
  }

  public replaceProjectionPreservingVisibleBars(
    semanticProjection: PatchMapProjectionIndex,
  ): PatchMapProjectionIndex {
    return this.projectionStore.replace(
      semanticProjection,
      this.visibleBarHeights(semanticProjection),
    );
  }

  public applyTransientEntityProjections(
    overrides: Readonly<Record<string, PatchMapEntityProjection>>,
    entityIds: readonly string[],
  ): PatchMapProjectionIndex | null {
    return this.projectionStore.applyTransientEntityProjections(overrides, entityIds);
  }

  public clearTransientEntityProjections(): readonly string[] {
    return this.projectionStore.clearTransientEntityProjections();
  }

  public reset(): void {
    this.controller.destroy();
    this.generation += 1;
    this.controller = this.createController(this.generation);
    this.projectionStore.clear();
    this.ghostPublicationCountValue = 0;
    this.resetPublication();
  }

  public destroy(): void {
    this.controller.destroy();
    this.projectionStore.clear();
    this.invalidEntityIds.clear();
    this.logicalPolicyValue = null;
    this.resetPublication();
  }

  private applyFrame(
    frame: PatchMapPresentationFrame,
    scene: PatchMapScene,
    semanticProjection: PatchMapProjectionIndex | null,
  ): PatchMapPresentationFrame {
    this.resetPublication();
    if (frame.updates.length === 0) return frame;
    const validateEntities = this.validatedEntityEpoch !== this.entityEpoch;
    if (validateEntities) this.invalidEntityIds.clear();
    let filteredRanges = false;
    for (const update of frame.updates) {
      const ref = scene.ref(update.entityId);
      const bar = semanticProjection?.barsByEntityId?.[update.entityId];
      let invalid =
        ref === null ||
        ref.slot !== update.slot ||
        ref.generation !== update.generation ||
        bar === undefined ||
        this.invalidEntityIds.has(update.entityId);
      if (!invalid && validateEntities) {
        const entity = ref === null ? null : scene.get(ref);
        invalid = entity?.kind !== 'bar' || !entity.visible;
      }
      if (invalid) {
        this.invalidEntityIds.add(update.entityId);
        this.ghostPublicationCountValue += 1;
        filteredRanges = true;
        continue;
      }
      if (this.projectionStore.applyBarHeight(update.entityId, update.value)) {
        this.publicationChangedCountValue += 1;
      }
    }
    if (validateEntities) this.validatedEntityEpoch = this.entityEpoch;
    if (this.publicationChangedCountValue === 0) return frame;
    this.publicationDirtyRangesValue = filteredRanges
      ? contiguousSlotRanges(frame.updates.flatMap((update) =>
          this.invalidEntityIds.has(update.entityId) ? [] : [update.slot]))
      : frame.dirtyRanges;
    return frame;
  }

  private applyReconcileFrame(
    frame: PatchMapPresentationReconcileFrame,
    scene: PatchMapScene,
    semanticProjection: PatchMapProjectionIndex | null,
  ): void {
    this.resetPublication();
    if (frame.changedCount === 0) return;
    const validateEntities = this.validatedEntityEpoch !== this.entityEpoch;
    if (validateEntities) this.invalidEntityIds.clear();
    const validSlots = this.publicationSlots;
    validSlots.length = 0;
    for (let index = 0; index < frame.changedCount; index += 1) {
      const entityId = frame.entityIds[index];
      if (entityId === undefined) {
        throw new Error('PatchMap presentation publication corruption');
      }
      const slot = frame.slots[index] ?? 0;
      let invalid = this.invalidEntityIds.has(entityId);
      if (!invalid && validateEntities) {
        const generation = frame.generations[index] ?? 0;
        const ref = scene.ref(entityId);
        const bar = semanticProjection?.barsByEntityId?.[entityId];
        invalid =
          ref === null ||
          ref.slot !== slot ||
          ref.generation !== generation ||
          bar === undefined;
        if (!invalid) {
          const entity = ref === null ? null : scene.get(ref);
          invalid = entity?.kind !== 'bar' || !entity.visible;
        }
      }
      if (invalid) {
        this.invalidEntityIds.add(entityId);
        this.ghostPublicationCountValue += 1;
        continue;
      }
      if (this.projectionStore.applyBarHeight(entityId, frame.values[index] ?? 0)) {
        this.publicationChangedCountValue += 1;
        validSlots.push(slot);
      }
    }
    if (validateEntities) this.validatedEntityEpoch = this.entityEpoch;
    if (this.publicationChangedCountValue === 0) return;
    this.publicationDirtyRangesValue = contiguousSlotRangesInPlace(validSlots);
  }

  private visibleBarHeights(
    semanticProjection: PatchMapProjectionIndex,
  ): ReadonlyMap<string, number> {
    const heights = new Map<string, number>();
    const bars = semanticProjection.barsByEntityId ?? {};
    for (const entityId of Object.keys(bars).sort()) {
      if (this.controller.probe(entityId) === null) continue;
      const height = this.projectionStore.visibleHeight(entityId);
      if (height !== null) heights.set(entityId, height);
    }
    return heights;
  }

  private resetPublication(): void {
    this.publicationChangedCountValue = 0;
    this.publicationDirtyRangesValue = EMPTY_RANGES;
    this.publicationSlots.length = 0;
  }

  private createController(generation: number): PatchMapPresentationController {
    return new PatchMapPresentationController({ lifecycleGeneration: generation });
  }
}

function barMatchesAnimatedTarget(
  entityId: string,
  bar: PatchMapBarProjection,
  animatedTargetKeys: ReadonlySet<string>,
  entitySourceById: ParseIdentityIndex['entitySourceById'] | undefined,
): boolean {
  if (animatedTargetKeys.has(
    patchMapComponentTargetKey(bar.ownerId, bar.componentId),
  )) {
    return true;
  }
  const sourceElementId = entitySourceById?.[entityId]?.sourceElementId;
  return sourceElementId !== undefined && animatedTargetKeys.has(
    patchMapComponentTargetKey(sourceElementId, bar.componentId),
  );
}

function animatedBarTargetKey(target: PatchMapAnimatedBarTarget): string {
  return 'ownerId' in target
    ? patchMapComponentProbeTargetKey(target)
    : patchMapComponentTargetKey(target.id, target.componentId);
}

function incrementalBarPresentationCompatible(
  previous: Readonly<Record<string, PatchMapBarProjection>>,
  next: Readonly<Record<string, PatchMapBarProjection>>,
  entityIds: readonly string[],
): boolean {
  for (const entityId of entityIds) {
    const before = previous[entityId];
    const after = next[entityId];
    if (before === undefined || after === undefined) continue;
    if (
      before.ownerId !== after.ownerId ||
      before.componentId !== after.componentId ||
      before.animation !== after.animation ||
      before.animationDuration !== after.animationDuration
    ) {
      return false;
    }
  }
  return true;
}

function normalizeLogicalPresentationPolicy(
  input: PatchMapPresentationPolicyInput,
  revision: number,
): PatchMapLogicalPresentationPolicy {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('presentation policy must be an object');
  }
  const deEmphasisAlpha = input.deEmphasisAlpha ?? 0.2;
  if (
    !Number.isFinite(deEmphasisAlpha) ||
    deEmphasisAlpha < 0 ||
    deEmphasisAlpha > 1
  ) {
    throw new RangeError('deEmphasisAlpha must be between zero and one');
  }
  return Object.freeze({
    revision,
    highlightIds: input.highlightIds === undefined || input.highlightIds === null
      ? null
      : freezeLogicalIds(input.highlightIds, 'highlightIds'),
    deEmphasisAlpha,
    hiddenLayerIds: freezeLogicalIds(input.hiddenLayerIds ?? [], 'hiddenLayerIds'),
    fillOverrides: freezePresentationFillOverrides(input.fillOverrides ?? []),
  });
}

function freezePresentationFillOverrides(
  values: readonly PatchMapPresentationFillOverride[],
): readonly PatchMapPresentationFillOverride[] {
  if (!Array.isArray(values)) throw new TypeError('fillOverrides must be an array');
  const byId = new Map<string, PatchMapPresentationFillOverride>();
  for (const [index, value] of values.entries()) {
    if (!isPlainRecord(value)) {
      throw new TypeError(`fillOverrides[${index}] must be an object`);
    }
    const { id, packedColor } = value;
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError(`fillOverrides[${index}].id must be a non-empty string`);
    }
    if (
      typeof packedColor !== 'number' ||
      !Number.isSafeInteger(packedColor) ||
      packedColor < 0 ||
      packedColor > 0xffffffff
    ) {
      throw new RangeError(`fillOverrides[${index}].packedColor must be a packed RGBA integer`);
    }
    if (byId.has(id)) throw new RangeError(`fillOverrides contains duplicate id ${id}`);
    byId.set(id, Object.freeze({ id, packedColor: packedColor >>> 0 }));
  }
  return Object.freeze([...byId.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  ));
}

function freezeLogicalIds(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return Object.freeze([...new Set(values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
    return value;
  }))].sort());
}

function sameLogicalPresentationPolicy(
  left: PatchMapLogicalPresentationPolicy | null,
  right: PatchMapLogicalPresentationPolicy,
): boolean {
  return left !== null &&
    left.deEmphasisAlpha === right.deEmphasisAlpha &&
    sameNullableStringArray(left.highlightIds, right.highlightIds) &&
    sameStringArray(left.hiddenLayerIds, right.hiddenLayerIds) &&
    samePresentationFillOverrides(left.fillOverrides, right.fillOverrides);
}

function samePresentationFillOverrides(
  left: readonly PatchMapPresentationFillOverride[],
  right: readonly PatchMapPresentationFillOverride[],
): boolean {
  return left.length === right.length && left.every((value, index) =>
    value.id === right[index]?.id && value.packedColor === right[index]?.packedColor
  );
}
