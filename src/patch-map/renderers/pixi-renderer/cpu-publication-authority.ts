import type { PatchMapProjectionIndex } from '../../contracts';
import type { SlotRange } from '../../dense/contracts';
import { RenderFlags, type RenderStoreView } from '../../dense/renderer-types';
import type { PatchMapPresentationLayerRenderUpdate } from '../../presentation-layer-contracts';
import type {
  PatchMapRendererPresentationEntityProbe,
  PatchMapResolvedPresentationPolicy,
} from '../../presentation-policy';
import type {
  PatchMapProjectionQuadCache,
  PatchMapProjectionRenderContext,
  PatchMapWorldOrientation,
} from '../types';
import {
  PatchMapPresentationStoreView,
  type PatchMapRendererEntityPresentationOverride,
} from '../presentation-store';
import {
  mergeRanges,
  projectionChangedRanges,
  projectionOrientationRanges,
  projectionStalenessChangedRanges,
} from '../renderer-reconcile-ranges';
import type { PatchMapPixiRendererPublicationCheckpoint } from './publication-checkpoint';
import {
  normalizePresentationPolicy,
  samePresentationPolicy,
} from './presentation-values';
import { sameStringSet } from './value-atoms';

const EMPTY_PROJECTION_INDEX: PatchMapProjectionIndex = Object.freeze({
  byEntityId: Object.freeze({}),
  componentsByEntityId: Object.freeze({}),
  backgroundsByEntityId: Object.freeze({}),
  imagesByEntityId: Object.freeze({}),
  textsByEntityId: Object.freeze({}),
  barsByEntityId: Object.freeze({}),
  relationsByEntityId: Object.freeze({}),
  omittedRelations: Object.freeze([]),
});

export interface PatchMapPixiPublicationMarkOptions {
  readonly fullRebuild?: boolean;
  readonly domain?: 'bar-only' | 'text-only';
}

/**
 * Owns the CPU transaction that prepares a dense store for Pixi publication.
 *
 * Mutations accumulate projection, presentation, and dirty-range state here.
 * `beginFlush()` validates and materializes the effective store without
 * allocating a per-frame plan object; the renderer reads the retained state
 * while synchronizing Pixi objects, then calls `commitFlush()`. Load rollback
 * restores an exact checkpoint through `rollback()` without touching GPU state.
 */
export class PatchMapPixiCpuPublicationAuthority {
  private lastStoreValue: RenderStoreView | null = null;
  private lastSourceStoreValue: RenderStoreView | null = null;
  private presentationPolicyValue: PatchMapResolvedPresentationPolicy | null = null;
  private presentationLayerRevisionValue = 0;
  private presentationLayerCountValue = 0;
  private presentationAlphaMultipliersValue: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private instancePresentationOverridesValue: ReadonlyMap<
    string,
    PatchMapRendererEntityPresentationOverride
  > = new Map();
  private presentationStoreValue: PatchMapPresentationStoreView | null = null;
  private presentationBaseStoreValue: RenderStoreView | null = null;
  private pendingSourceStoreValue: RenderStoreView | null = null;
  private pendingRangesValue: SlotRange[] | undefined;
  private pendingOverlayRangesValue: SlotRange[] | undefined;
  private pendingProjectionTransformOnlyValue = false;
  private pendingBarPresentationOnlyValue = false;
  private pendingTextOnlyValue = false;
  private storeEpochValue = 0;
  private projectionIndexValue: PatchMapProjectionIndex = EMPTY_PROJECTION_INDEX;
  private staleProjectionEntityIdsValue: ReadonlySet<string> = new Set();
  private projectionRevisionValue = 0;
  private lastInvalidationValue = 'init';
  private synchronizeOnlyValue = false;
  private flushStoreReplacedValue = false;

  public constructor(
    private readonly slotByEntityId: ReadonlyMap<string, number>,
  ) {}

  public get lastStore(): RenderStoreView | null {
    return this.lastStoreValue;
  }

  public get projectionIndex(): PatchMapProjectionIndex {
    return this.projectionIndexValue;
  }

  public get projectionRevision(): number {
    return this.projectionRevisionValue;
  }

  public get pendingRanges(): SlotRange[] | undefined {
    return this.pendingRangesValue;
  }

  public get pendingOverlayRanges(): SlotRange[] | undefined {
    return this.pendingOverlayRangesValue;
  }

  public get pendingProjectionTransformOnly(): boolean {
    return this.pendingProjectionTransformOnlyValue;
  }

  public get pendingBarPresentationOnly(): boolean {
    return this.pendingBarPresentationOnlyValue;
  }

  public get pendingTextOnly(): boolean {
    return this.pendingTextOnlyValue;
  }

  public get storeEpoch(): number {
    return this.storeEpochValue;
  }

  public get lastInvalidation(): string {
    return this.lastInvalidationValue;
  }

  public get flushStoreReplaced(): boolean {
    return this.flushStoreReplacedValue;
  }

  public projectionContext(
    world: PatchMapWorldOrientation,
    quadCache: PatchMapProjectionQuadCache,
  ): PatchMapProjectionRenderContext {
    return Object.freeze({
      index: this.projectionIndexValue,
      revision: this.projectionRevisionValue,
      world,
      staleEntityIds: this.staleProjectionEntityIdsValue,
      quadCache,
    });
  }

  public markChanges(
    ranges: readonly SlotRange[],
    reason: string,
    options: PatchMapPixiPublicationMarkOptions = {},
  ): boolean {
    const previousIdle =
      this.pendingRangesValue !== undefined &&
      this.pendingRangesValue.length === 0;
    const barOnly =
      options.domain === 'bar-only' &&
      (previousIdle || this.pendingBarPresentationOnlyValue);
    const textOnly =
      options.domain === 'text-only' &&
      (previousIdle || this.pendingTextOnlyValue);
    const invalidatesProjectionTransform = options.fullRebuild || ranges.length > 0;
    const nextProjectionTransformOnly = invalidatesProjectionTransform
      ? false
      : this.pendingProjectionTransformOnlyValue;
    const nextBarPresentationOnly = invalidatesProjectionTransform
      ? barOnly
      : this.pendingBarPresentationOnlyValue;
    const nextTextOnly = invalidatesProjectionTransform
      ? textOnly
      : this.pendingTextOnlyValue;
    if (options.fullRebuild) {
      this.lastInvalidationValue = reason;
      this.pendingProjectionTransformOnlyValue = nextProjectionTransformOnly;
      this.pendingBarPresentationOnlyValue = nextBarPresentationOnly;
      this.pendingTextOnlyValue = nextTextOnly;
      this.storeEpochValue += 1;
      this.pendingRangesValue = undefined;
      return true;
    }
    this.lastInvalidationValue = reason;
    this.pendingProjectionTransformOnlyValue = nextProjectionTransformOnly;
    this.pendingBarPresentationOnlyValue = nextBarPresentationOnly;
    this.pendingTextOnlyValue = nextTextOnly;
    this.pendingRangesValue = mergeRanges(this.pendingRangesValue ?? [], ranges);
    return ranges.length > 0 && options.domain !== 'bar-only';
  }

  public markOverlayChanges(ranges: readonly SlotRange[], reason: string): void {
    this.lastInvalidationValue = reason;
    this.pendingOverlayRangesValue = mergeRanges(this.pendingOverlayRangesValue ?? [], ranges);
  }

  public invalidateOverlay(reason: string): void {
    this.pendingOverlayRangesValue = undefined;
    this.lastInvalidationValue = reason;
  }

  public invalidate(reason: string): void {
    this.lastInvalidationValue = reason;
  }

  public markRetainedLeafChange(reason: string): void {
    this.lastInvalidationValue = reason;
    this.pendingProjectionTransformOnlyValue = false;
    this.pendingRangesValue ??= [];
  }

  public markRetainedLeafRanges(ranges: readonly SlotRange[], reason: string): void {
    this.lastInvalidationValue = reason;
    this.pendingProjectionTransformOnlyValue = false;
    this.pendingRangesValue = mergeRanges(this.pendingRangesValue ?? [], ranges);
  }

  public setPresentationPolicy(
    policy: PatchMapResolvedPresentationPolicy | null,
  ): boolean {
    const normalized = policy === null ? null : normalizePresentationPolicy(policy);
    const sourceStore = this.presentationSourceStore();
    const needsView = normalized !== null ||
      this.instancePresentationOverridesValue.size > 0 ||
      this.presentationLayerCountValue > 0;
    if (
      samePresentationPolicy(this.presentationPolicyValue, normalized) &&
      (
        !needsView ||
        sourceStore === null ||
        (
          this.presentationStoreValue !== null &&
          this.presentationBaseStoreValue === sourceStore
        )
      )
    ) return false;
    const nextPresentationStore =
      !needsView || sourceStore === null
        ? null
        : new PatchMapPresentationStoreView(
            sourceStore,
            normalized,
            this.instancePresentationOverridesValue,
            this.presentationAlphaMultipliersValue,
          );
    this.presentationPolicyValue = normalized;
    this.presentationStoreValue = nextPresentationStore;
    this.presentationBaseStoreValue = nextPresentationStore === null ? null : sourceStore;
    this.resetDirtyState();
    this.lastInvalidationValue = normalized === null
      ? 'presentation-policy:clear'
      : `presentation-policy:${normalized.revision}`;
    return true;
  }

  public setPresentationLayerMultipliers(
    update: PatchMapPresentationLayerRenderUpdate,
  ): boolean {
    const sourceStore = this.presentationSourceStore();
    if (
      update.layerCount > 0 &&
      sourceStore !== null &&
      update.alphaMultipliers.length !== sourceStore.capacity
    ) {
      throw new RangeError('presentation layer multiplier capacity changed');
    }
    if (update.layerCount === 0) {
      this.presentationAlphaMultipliersValue = new Float32Array(0);
    } else if (
      this.presentationAlphaMultipliersValue.length !== update.alphaMultipliers.length
    ) {
      this.presentationAlphaMultipliersValue = update.alphaMultipliers.slice();
    } else if (update.full) {
      this.presentationAlphaMultipliersValue.set(update.alphaMultipliers);
    } else {
      for (const { start, end } of update.dirtyRanges ?? []) {
        this.presentationAlphaMultipliersValue.set(
          update.alphaMultipliers.subarray(start, end),
          start,
        );
      }
    }
    this.presentationLayerRevisionValue = update.revision;
    this.presentationLayerCountValue = update.layerCount;

    const ranges = update.full ? undefined : update.dirtyRanges ?? [];
    if (sourceStore !== null) {
      const needsView = this.presentationPolicyValue !== null ||
        this.instancePresentationOverridesValue.size > 0 ||
        this.presentationLayerCountValue > 0;
      if (!needsView) {
        this.presentationStoreValue = null;
        this.presentationBaseStoreValue = null;
      } else if (
        this.presentationStoreValue === null ||
        this.presentationBaseStoreValue !== sourceStore ||
        this.presentationStoreValue.capacity !== sourceStore.capacity
      ) {
        this.presentationStoreValue = new PatchMapPresentationStoreView(
          sourceStore,
          this.presentationPolicyValue,
          this.instancePresentationOverridesValue,
          this.presentationAlphaMultipliersValue,
        );
        this.presentationBaseStoreValue = sourceStore;
      } else {
        this.presentationStoreValue.synchronizeAlphaMultipliers(
          this.presentationAlphaMultipliersValue,
          ranges,
        );
      }
    }
    this.pendingRangesValue = ranges === undefined || this.pendingRangesValue === undefined
      ? undefined
      : mergeRanges(this.pendingRangesValue, ranges);
    this.pendingOverlayRangesValue = ranges === undefined || this.pendingOverlayRangesValue === undefined
      ? undefined
      : mergeRanges(this.pendingOverlayRangesValue, ranges);
    this.clearPublicationKinds();
    this.lastInvalidationValue = `presentation-layer:${update.revision}`;
    return true;
  }

  public setInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
    changedRanges?: readonly SlotRange[],
  ): boolean {
    this.instancePresentationOverridesValue = overrides;
    const sourceStore = this.presentationSourceStore();
    if (sourceStore !== null) {
      if (this.presentationStoreValue === null) {
        if (
          overrides.size > 0 ||
          this.presentationPolicyValue !== null ||
          this.presentationLayerCountValue > 0
        ) {
          this.presentationStoreValue = new PatchMapPresentationStoreView(
            sourceStore,
            this.presentationPolicyValue,
            overrides,
            this.presentationAlphaMultipliersValue,
          );
          this.presentationBaseStoreValue = sourceStore;
        }
      } else if (
        overrides.size === 0 &&
        this.presentationPolicyValue === null &&
        this.presentationLayerCountValue === 0
      ) {
        this.presentationStoreValue = null;
        this.presentationBaseStoreValue = null;
      } else {
        this.presentationStoreValue.synchronize(
          sourceStore,
          this.presentationPolicyValue,
          changedRanges,
          overrides,
          this.presentationAlphaMultipliersValue,
        );
      }
      this.pendingRangesValue = changedRanges === undefined || this.pendingRangesValue === undefined
        ? undefined
        : mergeRanges(this.pendingRangesValue, changedRanges);
    }
    this.pendingOverlayRangesValue = changedRanges === undefined || this.pendingOverlayRangesValue === undefined
      ? undefined
      : mergeRanges(this.pendingOverlayRangesValue, changedRanges);
    this.clearPublicationKinds();
    this.lastInvalidationValue = overrides.size === 0
      ? 'instance-presentation:clear'
      : 'instance-presentation';
    return true;
  }

  public presentationEntityProbe(
    entityId: string,
  ): PatchMapRendererPresentationEntityProbe | null {
    const active = this.presentationStoreValue?.entityProbe(entityId);
    if (active !== null && active !== undefined) {
      return Object.freeze({ entityId, ...active });
    }
    const store = this.presentationPolicyValue === null && this.presentationLayerCountValue === 0
      ? this.presentationSourceStore() ?? this.lastStoreValue
      : this.presentationStoreValue;
    if (store === null) return null;
    const slot = this.slotByEntityId.get(entityId);
    if (slot === undefined || (store.alive[slot] ?? 0) === 0) return null;
    const visible = ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0 &&
      (store.opacity[slot] ?? 0) > 0;
    return Object.freeze({
      entityId,
      emphasis: 1,
      visible,
      renderObjectCount: visible ? 1 : 0,
      packedFill: (store.fill[slot] ?? 0) >>> 0,
    });
  }

  public setProjection(
    index: PatchMapProjectionIndex,
    changedRanges?: readonly SlotRange[],
    staleEntityIds?: ReadonlySet<string>,
    updateKind?: 'bar-presentation' | 'text',
    sourceStore?: RenderStoreView,
  ): boolean {
    const nextStaleEntityIds = staleEntityIds === undefined
      ? this.staleProjectionEntityIdsValue
      : new Set(staleEntityIds);
    const stalenessChanged = !sameStringSet(
      this.staleProjectionEntityIdsValue,
      nextStaleEntityIds,
    );
    if (
      this.projectionIndexValue === index &&
      changedRanges === undefined &&
      !stalenessChanged &&
      (sourceStore === undefined || this.pendingSourceStoreValue === sourceStore)
    ) {
      return false;
    }
    const previous = this.projectionIndexValue;
    const previousStaleEntityIds = this.staleProjectionEntityIdsValue;
    const projectionRanges = changedRanges === undefined
      ? this.lastStoreValue
        ? projectionChangedRanges(this.lastStoreValue, previous, index)
        : []
      : mergeRanges([], changedRanges);
    const stalenessRanges = stalenessChanged && this.lastStoreValue
      ? projectionStalenessChangedRanges(
          previousStaleEntityIds,
          nextStaleEntityIds,
          this.slotByEntityId,
        )
      : [];
    const ranges = mergeRanges(projectionRanges, stalenessRanges);
    const barPresentationOnly =
      updateKind === 'bar-presentation' &&
      changedRanges !== undefined &&
      this.pendingRangesValue !== undefined &&
      (
        this.pendingRangesValue.length === 0 ||
        this.pendingBarPresentationOnlyValue
      );
    const textOnly =
      updateKind === 'text' &&
      changedRanges !== undefined &&
      this.pendingRangesValue !== undefined &&
      (
        this.pendingRangesValue.length === 0 ||
        this.pendingTextOnlyValue
      );
    const paintBoundsProjectionChanged = previous !== index && updateKind !== 'bar-presentation';
    this.projectionIndexValue = index;
    this.pendingProjectionTransformOnlyValue = false;
    this.staleProjectionEntityIdsValue = nextStaleEntityIds;
    this.projectionRevisionValue += 1;
    this.pendingRangesValue = mergeRanges(this.pendingRangesValue ?? [], ranges);
    this.pendingOverlayRangesValue = paintBoundsProjectionChanged
      ? undefined
      : mergeRanges(this.pendingOverlayRangesValue ?? [], ranges);
    this.pendingBarPresentationOnlyValue = barPresentationOnly;
    this.pendingTextOnlyValue = textOnly;
    if (sourceStore !== undefined) this.pendingSourceStoreValue = sourceStore;
    this.lastInvalidationValue = changedRanges === undefined
      ? 'projection'
      : 'presentation-projection';
    return true;
  }

  public markProjectionOrientationChanged(): void {
    this.projectionRevisionValue += 1;
    this.pendingBarPresentationOnlyValue = false;
    this.pendingTextOnlyValue = false;
    const transformOnlyEligible =
      this.pendingRangesValue !== undefined && this.pendingRangesValue.length === 0;
    if (this.lastStoreValue) {
      const upright = projectionOrientationRanges(
        this.lastStoreValue,
        this.projectionIndexValue,
        'upright',
      );
      this.pendingRangesValue = mergeRanges(this.pendingRangesValue ?? [], upright);
      this.pendingOverlayRangesValue = mergeRanges(this.pendingOverlayRangesValue ?? [], upright);
    }
    this.pendingProjectionTransformOnlyValue = transformOnlyEligible;
    this.lastInvalidationValue = 'world-orientation';
  }

  public invalidateOverlayForView(): void {
    this.pendingOverlayRangesValue = undefined;
  }

  /** Begin a synchronous flush without allocating a per-frame plan object. */
  public beginFlush(store: RenderStoreView): RenderStoreView {
    if (this.pendingSourceStoreValue !== null && this.pendingSourceStoreValue !== store) {
      throw new Error('pending presentation source store changed before flush');
    }
    const storeReplaced = this.lastSourceStoreValue !== store;
    const reusableBarPresentationStore =
      this.pendingBarPresentationOnlyValue &&
      !storeReplaced &&
      this.pendingRangesValue !== undefined;
    const effectiveStore = this.presentationStoreFor(store, !reusableBarPresentationStore);
    this.flushStoreReplacedValue = storeReplaced;
    if (storeReplaced) {
      this.storeEpochValue += 1;
      this.resetDirtyState();
    }
    return effectiveStore;
  }

  public consumeSynchronizedRender(): boolean {
    const rendered = !this.synchronizeOnlyValue;
    this.synchronizeOnlyValue = false;
    return rendered;
  }

  public commitFlush(store: RenderStoreView, effectiveStore: RenderStoreView): void {
    this.lastStoreValue = effectiveStore;
    this.lastSourceStoreValue = store;
    this.pendingSourceStoreValue = null;
    this.pendingRangesValue = [];
    this.pendingOverlayRangesValue = [];
    this.clearPublicationKinds();
    this.flushStoreReplacedValue = false;
  }

  public synchronizeNextFlush(): void {
    this.synchronizeOnlyValue = true;
    this.lastInvalidationValue = 'synchronize';
  }

  public captureCheckpoint(
    barPresentationVisibilityConservative = false,
  ): PatchMapPixiRendererPublicationCheckpoint {
    return Object.freeze({
      projectionIndex: this.projectionIndexValue,
      staleProjectionEntityIds: this.staleProjectionEntityIdsValue,
      projectionRevision: this.projectionRevisionValue,
      pendingRanges: this.pendingRangesValue,
      pendingOverlayRanges: this.pendingOverlayRangesValue,
      pendingProjectionTransformOnly: this.pendingProjectionTransformOnlyValue,
      pendingBarPresentationOnly: this.pendingBarPresentationOnlyValue,
      pendingTextOnly: this.pendingTextOnlyValue,
      lastInvalidation: this.lastInvalidationValue,
      storeEpoch: this.storeEpochValue,
      barPresentationVisibilityConservative,
      presentationPolicy: this.presentationPolicyValue,
      presentationLayerRevision: this.presentationLayerRevisionValue,
      presentationLayerCount: this.presentationLayerCountValue,
      presentationAlphaMultipliers: this.presentationAlphaMultipliersValue,
      presentationAlphaMultiplierValues: this.presentationAlphaMultipliersValue.slice(),
      instancePresentationOverrides: this.instancePresentationOverridesValue,
      presentationStore: this.presentationStoreValue,
      presentationStoreState: this.presentationStoreValue?.captureCheckpoint() ?? null,
      presentationBaseStore: this.presentationBaseStoreValue,
      pendingSourceStore: this.pendingSourceStoreValue,
    });
  }

  /** Restore exact retained CPU state; no validation, renderer, or GPU work. */
  public rollback(checkpoint: PatchMapPixiRendererPublicationCheckpoint): boolean {
    this.projectionIndexValue = checkpoint.projectionIndex;
    this.staleProjectionEntityIdsValue = checkpoint.staleProjectionEntityIds;
    this.projectionRevisionValue = checkpoint.projectionRevision;
    this.pendingRangesValue = checkpoint.pendingRanges;
    this.pendingOverlayRangesValue = checkpoint.pendingOverlayRanges;
    this.pendingProjectionTransformOnlyValue = checkpoint.pendingProjectionTransformOnly;
    this.pendingBarPresentationOnlyValue = checkpoint.pendingBarPresentationOnly;
    this.pendingTextOnlyValue = checkpoint.pendingTextOnly;
    this.lastInvalidationValue = checkpoint.lastInvalidation;
    this.storeEpochValue = checkpoint.storeEpoch;
    this.presentationPolicyValue = checkpoint.presentationPolicy;
    this.presentationLayerRevisionValue = checkpoint.presentationLayerRevision;
    this.presentationLayerCountValue = checkpoint.presentationLayerCount;
    this.presentationAlphaMultipliersValue = checkpoint.presentationAlphaMultipliers;
    this.presentationAlphaMultipliersValue.set(checkpoint.presentationAlphaMultiplierValues);
    this.instancePresentationOverridesValue = checkpoint.instancePresentationOverrides;
    this.presentationStoreValue = checkpoint.presentationStore;
    if (this.presentationStoreValue !== null && checkpoint.presentationStoreState !== null) {
      this.presentationStoreValue.restoreCheckpoint(checkpoint.presentationStoreState);
    }
    this.presentationBaseStoreValue = checkpoint.presentationBaseStore;
    this.pendingSourceStoreValue = checkpoint.pendingSourceStore;
    this.flushStoreReplacedValue = false;
    return checkpoint.barPresentationVisibilityConservative;
  }

  public destroy(): void {
    this.lastStoreValue = null;
    this.lastSourceStoreValue = null;
    this.presentationPolicyValue = null;
    this.presentationLayerRevisionValue = 0;
    this.presentationLayerCountValue = 0;
    this.presentationAlphaMultipliersValue = new Float32Array(0);
    this.instancePresentationOverridesValue = new Map();
    this.presentationStoreValue = null;
    this.presentationBaseStoreValue = null;
    this.pendingSourceStoreValue = null;
    this.pendingRangesValue = [];
    this.pendingOverlayRangesValue = [];
    this.clearPublicationKinds();
    this.projectionIndexValue = EMPTY_PROJECTION_INDEX;
    this.staleProjectionEntityIdsValue = new Set();
    this.flushStoreReplacedValue = false;
  }

  private presentationStoreFor(
    store: RenderStoreView,
    synchronize: boolean,
  ): RenderStoreView {
    const policy = this.presentationPolicyValue;
    const overrides = this.instancePresentationOverridesValue;
    const alphaMultipliers = this.presentationAlphaMultipliersValue;
    if (policy === null && overrides.size === 0 && this.presentationLayerCountValue === 0) {
      return store;
    }
    if (
      this.presentationStoreValue === null ||
      this.presentationBaseStoreValue !== store ||
      this.presentationStoreValue.capacity !== store.capacity
    ) {
      this.presentationStoreValue = new PatchMapPresentationStoreView(
        store,
        policy,
        overrides,
        alphaMultipliers,
      );
      this.presentationBaseStoreValue = store;
      return this.presentationStoreValue;
    }
    if (synchronize) {
      this.presentationStoreValue.synchronize(
        store,
        policy,
        this.pendingRangesValue,
        overrides,
        alphaMultipliers,
      );
    }
    return this.presentationStoreValue;
  }

  private presentationSourceStore(): RenderStoreView | null {
    return this.pendingSourceStoreValue ?? this.lastSourceStoreValue;
  }

  private resetDirtyState(): void {
    this.pendingRangesValue = undefined;
    this.pendingOverlayRangesValue = undefined;
    this.clearPublicationKinds();
  }

  private clearPublicationKinds(): void {
    this.pendingProjectionTransformOnlyValue = false;
    this.pendingBarPresentationOnlyValue = false;
    this.pendingTextOnlyValue = false;
  }
}
