import { describe, expect, it, vi } from 'vitest';

import type { SlotRange } from '../../src/patch-map/dense/contracts';
import type { RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import type { PatchMapResolvedPresentationPolicy } from '../../src/patch-map/presentation-policy';
import { PatchMapPixiRenderer } from '../../src/patch-map/renderers/pixi-renderer';
import { PatchMapPresentationStoreView } from '../../src/patch-map/renderers/presentation-store';
import { PatchMapPixiCpuPublicationAuthority } from '../../src/patch-map/renderers/pixi-renderer/cpu-publication-authority';
import type { PatchMapPixiRendererPublicationCheckpoint } from '../../src/patch-map/renderers/pixi-renderer/publication-checkpoint';
import { createTestProjectionIndex } from '../support/projection-index';

describe('PatchMap Pixi renderer publication checkpoint', () => {
  it('restores exact retained CPU state after load-side projection, policy, and rebuild mutations', () => {
    const originalProjection = projection('original');
    const originalStaleIds = new Set(['stale-before']);
    const originalRanges: SlotRange[] = [{ start: 1, end: 3 }];
    const originalOverlayRanges: SlotRange[] = [{ start: 4, end: 5 }];
    const originalPolicy = policy(1);
    const originalPresentationBaseStore = renderStore(2, 'base-before');
    const originalPresentationStore = new PatchMapPresentationStoreView(
      originalPresentationBaseStore,
      originalPolicy,
    );
    const originalPendingSourceStore = renderStore(2, 'pending-before');
    const renderer = publicationHarness({
      projectionIndex: originalProjection,
      staleProjectionEntityIds: originalStaleIds,
      projectionRevision: 7,
      pendingRanges: originalRanges,
      pendingOverlayRanges: originalOverlayRanges,
      pendingProjectionTransformOnly: true,
      pendingBarPresentationOnly: true,
      pendingTextOnly: false,
      lastInvalidation: 'before-load',
      storeEpoch: 13,
      presentationPolicy: originalPolicy,
      presentationStore: originalPresentationStore,
      presentationBaseStore: originalPresentationBaseStore,
      pendingSourceStore: originalPendingSourceStore,
    });
    const checkpoint = captureHarnessPublication(renderer);

    expect(Object.isFrozen(checkpoint)).toBe(true);
    expect(renderer.setProjection(
      projection('replacement'),
      [{ start: 8, end: 10 }],
      new Set(['stale-after']),
      'text',
      renderStore(3, 'pending-after'),
    )).toBe(true);
    expect(renderer.setPresentationPolicy(policy(2))).toBe(true);
    renderer.markChanges([{ start: 0, end: 20 }], 'load', { fullRebuild: true });
    expect(captureHarnessPublication(renderer)).not.toEqual(checkpoint);

    restoreHarnessPublication(renderer, checkpoint);
    const restored = captureHarnessPublication(renderer);
    expect(restored).toEqual(checkpoint);
    expect(restored.projectionIndex).toBe(originalProjection);
    expect(restored.staleProjectionEntityIds).toBe(originalStaleIds);
    expect(restored.pendingRanges).toBe(originalRanges);
    expect(restored.pendingOverlayRanges).toBe(originalOverlayRanges);
    expect(restored.presentationPolicy).toBe(originalPolicy);
    expect(restored.presentationStore).toBe(originalPresentationStore);
    expect(restored.presentationBaseStore).toBe(originalPresentationBaseStore);
    expect(restored.pendingSourceStore).toBe(originalPendingSourceStore);

    expect(() => restoreHarnessPublication(renderer, checkpoint)).not.toThrow();
    expect(captureHarnessPublication(renderer).projectionIndex).toBe(originalProjection);
  });

  it('leaves the checkpointed state exact when projection diff calculation throws', () => {
    const renderer = publicationHarness({
      lastStore: Object.freeze({
        capacity: 1,
        ids: Object.freeze(['entity-a']),
      }) as unknown as RenderStoreView,
      projectionIndex: projection('original'),
    });
    const checkpoint = captureHarnessPublication(renderer);
    const failure = new Error('projection getter failed');
    const throwingByEntityId = {} as Record<
      string,
      PatchMapProjectionIndex['byEntityId'][string]
    >;
    Object.defineProperty(throwingByEntityId, 'entity-a', {
      enumerable: true,
      get(): never {
        throw failure;
      },
    });
    const throwingProjection = createTestProjectionIndex({
      byEntityId: throwingByEntityId,
    });

    expect(() => renderer.setProjection(throwingProjection)).toThrow(failure);
    expect(captureHarnessPublication(renderer)).toEqual(checkpoint);
  });

  it('restores renderer-local conservative bar visibility with the CPU checkpoint tuple', () => {
    const renderer = Object.create(PatchMapPixiRenderer.prototype) as RendererOuterCheckpointHarness;
    Object.assign(renderer, {
      destroyedValue: false,
      cpuPublication: publicationHarness({ projectionIndex: projection('original') }),
      barPresentationVisibilityConservative: false,
    });
    const checkpoint = renderer.capturePublicationCheckpoint();
    expect(checkpoint.barPresentationVisibilityConservative).toBe(false);

    expect(renderer.setProjection(projection('replacement'))).toBe(true);
    expect(renderer.barPresentationVisibilityConservative).toBe(true);

    renderer.restorePublicationCheckpoint(checkpoint);
    expect(renderer.barPresentationVisibilityConservative).toBe(false);
    expect(renderer.capturePublicationCheckpoint().projectionIndex).toBe(
      checkpoint.projectionIndex,
    );
  });

  it('does not publish a policy before its presentation store is constructed', () => {
    const renderer = publicationHarness({
      presentationPolicy: policy(1),
      lastSourceStore: Object.freeze({ capacity: 1 }) as RenderStoreView,
    });
    const checkpoint = captureHarnessPublication(renderer);

    expect(() => renderer.setPresentationPolicy(policy(2))).toThrow();
    expect(captureHarnessPublication(renderer)).toEqual(checkpoint);
  });

  it('owns a stable dense alpha column and restores its checkpointed values', () => {
    const renderer = publicationHarness();
    const initial = new Float32Array([0.4, 1, 1]);

    expect(renderer.setPresentationLayerMultipliers({
      revision: 1,
      layerCount: 1,
      full: true,
      alphaMultipliers: initial,
      dirtyRanges: undefined,
    })).toBe(true);
    const owned = captureHarnessPublication(renderer).presentationAlphaMultipliers;
    expect(owned).not.toBe(initial);
    expect(Array.from(owned)).toEqual(Array.from(initial));
    initial[0] = 0.9;
    expect(owned[0]).toBeCloseTo(0.4, 6);

    const checkpoint = captureHarnessPublication(renderer);
    const retargeted = new Float32Array([0.4, 0.25, 1]);
    renderer.setPresentationLayerMultipliers({
      revision: 2,
      layerCount: 1,
      full: false,
      alphaMultipliers: retargeted,
      dirtyRanges: [{ start: 1, end: 2 }],
    });
    expect(captureHarnessPublication(renderer).presentationAlphaMultipliers).toBe(owned);
    expect(Array.from(owned)).toEqual(Array.from(retargeted));

    restoreHarnessPublication(renderer, checkpoint);
    expect(captureHarnessPublication(renderer).presentationAlphaMultipliers).toBe(owned);
    expect(Array.from(owned)).toEqual([expect.closeTo(0.4, 6), 1, 1]);
  });

  it('restores presentation store columns after a staged layer clear mutates them in place', () => {
    const sourceStore = renderStore(1, 'source');
    const renderer = publicationHarness({
      lastStore: sourceStore,
      lastSourceStore: sourceStore,
    });
    renderer.setPresentationPolicy(policy(1));
    renderer.setPresentationLayerMultipliers({
      revision: 1,
      layerCount: 1,
      full: true,
      alphaMultipliers: new Float32Array([0.4]),
      dirtyRanges: undefined,
    });
    const checkpoint = captureHarnessPublication(renderer);
    const presentationStore = checkpoint.presentationStore;
    expect(presentationStore).not.toBeNull();
    expect(presentationStore?.opacity[0]).toBeCloseTo(0.4, 6);

    renderer.setPresentationLayerMultipliers({
      revision: 2,
      layerCount: 0,
      full: true,
      alphaMultipliers: new Float32Array(0),
      dirtyRanges: undefined,
    });
    expect(presentationStore?.opacity[0]).toBeCloseTo(1, 6);

    restoreHarnessPublication(renderer, checkpoint);
    const restored = captureHarnessPublication(renderer);
    expect(restored.presentationStore).toBe(presentationStore);
    expect(restored.presentationStore?.opacity[0]).toBeCloseTo(0.4, 6);
    expect(restored.presentationStoreState?.base).toBe(sourceStore);
    expect(restored.presentationStoreState?.policy).toBe(checkpoint.presentationPolicy);
    expect(restored.presentationStoreState?.overrides).toBe(
      checkpoint.instancePresentationOverrides,
    );
  });

  it.each([
    ['same', 2],
    ['different', 3],
  ] as const)(
    'binds immediate presentation replay to a pending %s-capacity replacement store',
    (_capacityKind, replacementCapacity) => {
      const previousStore = renderStore(2, 'previous');
      const replacementStore = renderStore(replacementCapacity, 'replacement');
      const renderer = publicationHarness({
        lastStore: previousStore,
        lastSourceStore: previousStore,
      });

      expect(renderer.setProjection(
        projection('replacement'),
        undefined,
        undefined,
        undefined,
        replacementStore,
      )).toBe(true);
      expect(captureHarnessPublication(renderer).pendingSourceStore).toBe(replacementStore);
      expect(() => renderer.beginFlush(previousStore)).toThrow(
        'pending presentation source store changed before flush',
      );
      expect(() => renderer.setPresentationLayerMultipliers({
        revision: 1,
        layerCount: 1,
        full: true,
        alphaMultipliers: new Float32Array(replacementCapacity).fill(0.32),
        dirtyRanges: undefined,
      })).not.toThrow();
      expect(captureHarnessPublication(renderer).presentationBaseStore).toBe(replacementStore);
      expect(() => renderer.setPresentationLayerMultipliers({
        revision: 2,
        layerCount: 1,
        full: true,
        alphaMultipliers: new Float32Array(replacementCapacity + 1).fill(0.5),
        dirtyRanges: undefined,
      })).toThrow('presentation layer multiplier capacity changed');
    },
  );

  it('owns flush begin and commit transitions without a per-frame plan object', () => {
    const previousStore = renderStore(1, 'previous');
    const replacementStore = renderStore(2, 'replacement');
    const renderer = publicationHarness({
      lastStore: previousStore,
      lastSourceStore: previousStore,
      storeEpoch: 4,
      pendingRanges: [{ start: 0, end: 1 }],
      pendingOverlayRanges: [{ start: 0, end: 1 }],
      pendingProjectionTransformOnly: true,
    });

    const effectiveStore = renderer.beginFlush(replacementStore);
    expect(effectiveStore).toBe(replacementStore);
    expect(renderer.flushStoreReplaced).toBe(true);
    expect(renderer.storeEpoch).toBe(5);
    expect(renderer.pendingRanges).toBeUndefined();

    renderer.commitFlush(replacementStore, effectiveStore);
    expect(renderer.flushStoreReplaced).toBe(false);
    expect(renderer.lastStore).toBe(replacementStore);
    expect(renderer.pendingRanges).toEqual([]);
    expect(renderer.pendingOverlayRanges).toEqual([]);
    expect(renderer.beginFlush(replacementStore)).toBe(replacementStore);
    expect(renderer.flushStoreReplaced).toBe(false);
  });

  it('retains materialized presentation columns only for geometry-only bar frames', () => {
    const sourceStore = renderStore(2, 'source');
    const presentationStore = new PatchMapPresentationStoreView(
      sourceStore,
      policy(1),
    );
    const synchronize = vi.spyOn(presentationStore, 'synchronize');
    const renderer = publicationHarness({
      lastSourceStore: sourceStore,
      presentationPolicy: policy(1),
      presentationStore,
      presentationBaseStore: sourceStore,
      pendingRanges: [{ start: 0, end: 2 }],
      pendingBarPresentationOnly: true,
    });
    const checkpoint = captureHarnessPublication(renderer);

    expect(renderer.beginFlush(sourceStore)).toBe(presentationStore);
    expect(synchronize).not.toHaveBeenCalled();

    restoreHarnessPublication(renderer, checkpoint);
    renderer.markChanges([{ start: 0, end: 1 }], 'content');
    expect(renderer.beginFlush(sourceStore)).toBe(presentationStore);
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(synchronize).toHaveBeenCalledWith(
      sourceStore,
      checkpoint.presentationPolicy,
      renderer.pendingRanges,
      checkpoint.instancePresentationOverrides,
      checkpoint.presentationAlphaMultipliers,
    );
  });
});

interface PublicationSeed {
  projectionIndex: PatchMapProjectionIndex;
  staleProjectionEntityIds: ReadonlySet<string>;
  projectionRevision: number;
  pendingRanges: SlotRange[] | undefined;
  pendingOverlayRanges: SlotRange[] | undefined;
  pendingProjectionTransformOnly: boolean;
  pendingBarPresentationOnly: boolean;
  pendingTextOnly: boolean;
  lastInvalidation: string;
  storeEpoch: number;
  presentationPolicy: PatchMapResolvedPresentationPolicy | null;
  presentationLayerRevision: number;
  presentationLayerCount: number;
  presentationAlphaMultipliers: Float32Array<ArrayBufferLike>;
  presentationAlphaMultiplierValues?: Float32Array<ArrayBufferLike>;
  instancePresentationOverrides: ReadonlyMap<string, never>;
  presentationStore: PatchMapPresentationStoreView | null;
  presentationBaseStore: RenderStoreView | null;
  pendingSourceStore: RenderStoreView | null;
  lastStore: RenderStoreView | null;
  lastSourceStore: RenderStoreView | null;
}

interface RendererOuterCheckpointHarness {
  destroyedValue: boolean;
  cpuPublication: PatchMapPixiCpuPublicationAuthority;
  barPresentationVisibilityConservative: boolean;
  setProjection(index: PatchMapProjectionIndex): boolean;
  capturePublicationCheckpoint(): PatchMapPixiRendererPublicationCheckpoint;
  restorePublicationCheckpoint(checkpoint: PatchMapPixiRendererPublicationCheckpoint): void;
}

function captureHarnessPublication(
  renderer: PatchMapPixiCpuPublicationAuthority,
): PatchMapPixiRendererPublicationCheckpoint {
  return renderer.captureCheckpoint();
}

function restoreHarnessPublication(
  renderer: PatchMapPixiCpuPublicationAuthority,
  checkpoint: PatchMapPixiRendererPublicationCheckpoint,
): void {
  renderer.rollback(checkpoint);
}

interface PublicationStateHarness {
  projectionIndexValue: PatchMapProjectionIndex;
  staleProjectionEntityIdsValue: ReadonlySet<string>;
  projectionRevisionValue: number;
  pendingRangesValue: SlotRange[] | undefined;
  pendingOverlayRangesValue: SlotRange[] | undefined;
  pendingProjectionTransformOnlyValue: boolean;
  pendingBarPresentationOnlyValue: boolean;
  pendingTextOnlyValue: boolean;
  lastInvalidationValue: string;
  storeEpochValue: number;
  presentationPolicyValue: PatchMapResolvedPresentationPolicy | null;
  presentationLayerRevisionValue: number;
  presentationLayerCountValue: number;
  presentationAlphaMultipliersValue: Float32Array<ArrayBufferLike>;
  instancePresentationOverridesValue: ReadonlyMap<string, never>;
  presentationStoreValue: PatchMapPresentationStoreView | null;
  presentationBaseStoreValue: RenderStoreView | null;
  pendingSourceStoreValue: RenderStoreView | null;
  lastStoreValue: RenderStoreView | null;
  lastSourceStoreValue: RenderStoreView | null;
}

function publicationHarness(
  overrides: Partial<PublicationSeed> = {},
): PatchMapPixiCpuPublicationAuthority {
  const authority = new PatchMapPixiCpuPublicationAuthority(new Map());
  const state = authority as unknown as PublicationStateHarness;
  Object.assign(state, {
    projectionIndexValue: overrides.projectionIndex ?? projection('initial'),
    staleProjectionEntityIdsValue: overrides.staleProjectionEntityIds ?? new Set<string>(),
    projectionRevisionValue: overrides.projectionRevision ?? 0,
    pendingRangesValue: overrides.pendingRanges ?? [],
    pendingOverlayRangesValue: overrides.pendingOverlayRanges ?? [],
    pendingProjectionTransformOnlyValue: overrides.pendingProjectionTransformOnly ?? false,
    pendingBarPresentationOnlyValue: overrides.pendingBarPresentationOnly ?? false,
    pendingTextOnlyValue: overrides.pendingTextOnly ?? false,
    lastInvalidationValue: overrides.lastInvalidation ?? 'initial',
    storeEpochValue: overrides.storeEpoch ?? 0,
    presentationPolicyValue: overrides.presentationPolicy ?? null,
    presentationLayerRevisionValue: overrides.presentationLayerRevision ?? 0,
    presentationLayerCountValue: overrides.presentationLayerCount ?? 0,
    presentationAlphaMultipliersValue:
      overrides.presentationAlphaMultipliers ?? new Float32Array(0),
    instancePresentationOverridesValue:
      overrides.instancePresentationOverrides ?? new Map<string, never>(),
    presentationStoreValue: overrides.presentationStore ?? null,
    presentationBaseStoreValue: overrides.presentationBaseStore ?? null,
    pendingSourceStoreValue: overrides.pendingSourceStore ?? null,
    lastStoreValue: overrides.lastStore ?? null,
    lastSourceStoreValue: overrides.lastSourceStore ?? null,
  });
  return authority;
}

function projection(marker: string): PatchMapProjectionIndex {
  return createTestProjectionIndex({
    byEntityId: Object.freeze({
      [marker]: Object.freeze({ marker }),
    }) as unknown as PatchMapProjectionIndex['byEntityId'],
  });
}

function policy(revision: number): PatchMapResolvedPresentationPolicy {
  return Object.freeze({
    revision,
    highlightedEntityIds: null,
    deEmphasisAlpha: 0.25,
    hiddenEntityIds: Object.freeze([]),
    fillOverrides: Object.freeze([]),
  });
}

function renderStore(capacity: number, idPrefix: string): RenderStoreView {
  const ids = Array.from({ length: capacity }, (_, slot) => `${idPrefix}-${slot}`);
  const order = Uint32Array.from(ids.map((_, slot) => slot));
  return {
    capacity,
    liveCount: capacity,
    revision: 1,
    alive: new Uint8Array(capacity).fill(1),
    kind: new Uint8Array(capacity).fill(1),
    flags: new Uint8Array(capacity).fill(1),
    zIndex: new Int32Array(capacity),
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    width: new Float64Array(capacity).fill(10),
    height: new Float64Array(capacity).fill(10),
    rotation: new Float32Array(capacity),
    opacity: new Float32Array(capacity).fill(1),
    fill: new Uint32Array(capacity),
    stroke: new Uint32Array(capacity),
    strokeWidth: new Float32Array(capacity),
    radius: new Float32Array(capacity),
    text: ids.map(() => ''),
    color: new Uint32Array(capacity),
    fontSize: new Float32Array(capacity),
    fontFamily: ids.map(() => ''),
    fontWeight: new Uint32Array(capacity),
    align: new Uint8Array(capacity),
    maxLines: new Uint32Array(capacity),
    source: ids.map(() => ''),
    tint: new Uint32Array(capacity),
    fit: new Uint8Array(capacity),
    value: new Float64Array(capacity),
    min: new Float64Array(capacity),
    max: new Float64Array(capacity),
    trackFill: new Uint32Array(capacity),
    relationFrom: new Int32Array(capacity),
    relationTo: new Int32Array(capacity),
    lineWidth: new Float32Array(capacity),
    ids,
    view: Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 }),
    background: 0xffffffff,
    renderOrder: () => order,
  };
}
