import { describe, expect, it, vi } from 'vitest';

import type { SlotRange } from '../../src/patch-map/dense/contracts';
import type { RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import type { PatchMapResolvedPresentationPolicy } from '../../src/patch-map/presentation-policy';
import {
  PatchMapPixiRenderer,
  type PatchMapPixiRendererPublicationCheckpoint,
} from '../../src/patch-map/renderers/pixi-renderer';
import type { PatchMapPresentationStoreView } from '../../src/patch-map/renderers/presentation-store';

describe('PatchMap Pixi renderer publication checkpoint', () => {
  it('restores exact retained CPU state after load-side projection, policy, and rebuild mutations', () => {
    const originalProjection = projection('original');
    const originalStaleIds = new Set(['stale-before']);
    const originalRanges: SlotRange[] = [{ start: 1, end: 3 }];
    const originalOverlayRanges: SlotRange[] = [{ start: 4, end: 5 }];
    const originalPolicy = policy(1);
    const originalPresentationStore = Object.create(null) as PatchMapPresentationStoreView;
    const originalPresentationBaseStore = Object.freeze({
      capacity: 0,
    }) as unknown as RenderStoreView;
    const originalPendingSourceStore = renderStore(2, 'pending-before');
    const renderer = rendererHarness({
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

    renderer.destroyedValue = true;
    expect(() => restoreHarnessPublication(renderer, checkpoint)).not.toThrow();
    expect(renderer.projectionIndex).toBe(originalProjection);
  });

  it('leaves the checkpointed state exact when projection diff calculation throws', () => {
    const renderer = rendererHarness({
      lastStore: Object.freeze({
        capacity: 1,
        ids: Object.freeze(['entity-a']),
      }) as unknown as RenderStoreView,
      projectionIndex: projection('original'),
    });
    const checkpoint = captureHarnessPublication(renderer);
    const failure = new Error('projection getter failed');
    const throwingByEntityId: Record<string, unknown> = {};
    Object.defineProperty(throwingByEntityId, 'entity-a', {
      enumerable: true,
      get(): never {
        throw failure;
      },
    });
    const throwingProjection = Object.freeze({
      byEntityId: throwingByEntityId,
    }) as PatchMapProjectionIndex;

    expect(() => renderer.setProjection(throwingProjection)).toThrow(failure);
    expect(captureHarnessPublication(renderer)).toEqual(checkpoint);
  });

  it('does not publish a policy before its presentation store is constructed', () => {
    const renderer = rendererHarness({
      presentationPolicy: policy(1),
      lastSourceStore: Object.freeze({ capacity: 1 }) as RenderStoreView,
    });
    const checkpoint = captureHarnessPublication(renderer);

    expect(() => renderer.setPresentationPolicy(policy(2))).toThrow();
    expect(captureHarnessPublication(renderer)).toEqual(checkpoint);
  });

  it('owns a stable dense alpha column and restores its checkpointed values', () => {
    const renderer = rendererHarness();
    const initial = new Float32Array([0.4, 1, 1]);

    expect(renderer.setPresentationLayerMultipliers({
      revision: 1,
      layerCount: 1,
      full: true,
      alphaMultipliers: initial,
      dirtyRanges: undefined,
    })).toBe(true);
    const owned = renderer.presentationAlphaMultipliers;
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
    expect(renderer.presentationAlphaMultipliers).toBe(owned);
    expect(Array.from(owned)).toEqual(Array.from(retargeted));

    restoreHarnessPublication(renderer, checkpoint);
    expect(renderer.presentationAlphaMultipliers).toBe(owned);
    expect(Array.from(owned)).toEqual([expect.closeTo(0.4, 6), 1, 1]);
  });

  it.each([
    ['same', 2],
    ['different', 3],
  ] as const)(
    'binds immediate presentation replay to a pending %s-capacity replacement store',
    (_capacityKind, replacementCapacity) => {
      const previousStore = renderStore(2, 'previous');
      const replacementStore = renderStore(replacementCapacity, 'replacement');
      const renderer = rendererHarness({
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
      expect(renderer.pendingSourceStore).toBe(replacementStore);
      expect(() => renderer.flush(previousStore)).toThrow(
        'pending presentation source store changed before flush',
      );
      expect(() => renderer.setPresentationLayerMultipliers({
        revision: 1,
        layerCount: 1,
        full: true,
        alphaMultipliers: new Float32Array(replacementCapacity).fill(0.32),
        dirtyRanges: undefined,
      })).not.toThrow();
      expect(renderer.presentationBaseStore).toBe(replacementStore);
      expect(() => renderer.setPresentationLayerMultipliers({
        revision: 2,
        layerCount: 1,
        full: true,
        alphaMultipliers: new Float32Array(replacementCapacity + 1).fill(0.5),
        dirtyRanges: undefined,
      })).toThrow('presentation layer multiplier capacity changed');
    },
  );

  it('retains materialized presentation columns only for geometry-only bar frames', () => {
    const sourceStore = renderStore(2, 'source');
    const viewFailure = new Error('stop after presentation-store selection');
    const synchronize = vi.fn();
    const presentationStore = Object.create(null) as PatchMapPresentationStoreView;
    Object.defineProperties(presentationStore, {
      capacity: { value: sourceStore.capacity },
      synchronize: { value: synchronize },
      view: {
        get(): never {
          throw viewFailure;
        },
      },
    });
    const renderer = rendererHarness({
      lastSourceStore: sourceStore,
      presentationPolicy: policy(1),
      presentationStore,
      presentationBaseStore: sourceStore,
      pendingRanges: [{ start: 0, end: 2 }],
      pendingBarPresentationOnly: true,
    });

    expect(() => renderer.flush(sourceStore)).toThrow(viewFailure);
    expect(synchronize).not.toHaveBeenCalled();

    renderer.pendingBarPresentationOnly = false;
    expect(() => renderer.flush(sourceStore)).toThrow(viewFailure);
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(synchronize).toHaveBeenCalledWith(
      sourceStore,
      renderer.presentationPolicy,
      renderer.pendingRanges,
      renderer.instancePresentationOverrides,
      renderer.presentationAlphaMultipliers,
    );
  });
});

interface RendererCheckpointHarness {
  destroyedValue: boolean;
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
  slotByEntityId: Map<string, number>;
  setProjection(
    index: PatchMapProjectionIndex,
    changedRanges?: readonly SlotRange[],
    staleEntityIds?: ReadonlySet<string>,
    updateKind?: 'bar-presentation' | 'text',
    sourceStore?: RenderStoreView,
  ): boolean;
  setPresentationPolicy(policy: PatchMapResolvedPresentationPolicy | null): boolean;
  setPresentationLayerMultipliers(
    update: Readonly<{
      readonly revision: number;
      readonly layerCount: number;
      readonly full: boolean;
      readonly alphaMultipliers: Float32Array<ArrayBufferLike>;
      readonly dirtyRanges: readonly SlotRange[] | undefined;
    }>,
  ): boolean;
  flush(store: RenderStoreView): Readonly<{ rendered: boolean; commandCount: number }>;
  markChanges(
    ranges: readonly SlotRange[],
    reason: string,
    options?: Readonly<{ fullRebuild?: boolean; domain?: 'bar-only' | 'text-only' }>,
  ): void;
  capturePublicationCheckpoint(): PatchMapPixiRendererPublicationCheckpoint;
  restorePublicationCheckpoint(
    checkpoint: PatchMapPixiRendererPublicationCheckpoint,
  ): void;
}

function captureHarnessPublication(
  renderer: RendererCheckpointHarness,
): PatchMapPixiRendererPublicationCheckpoint {
  return renderer.capturePublicationCheckpoint();
}

function restoreHarnessPublication(
  renderer: RendererCheckpointHarness,
  checkpoint: PatchMapPixiRendererPublicationCheckpoint,
): void {
  renderer.restorePublicationCheckpoint(checkpoint);
}

function rendererHarness(
  overrides: Partial<RendererCheckpointHarness> = {},
): RendererCheckpointHarness {
  const renderer = Object.create(PatchMapPixiRenderer.prototype) as RendererCheckpointHarness;
  Object.assign(renderer, {
    destroyedValue: false,
    projectionIndex: projection('initial'),
    staleProjectionEntityIds: new Set<string>(),
    projectionRevision: 0,
    pendingRanges: [],
    pendingOverlayRanges: [],
    pendingProjectionTransformOnly: false,
    pendingBarPresentationOnly: false,
    pendingTextOnly: false,
    lastInvalidation: 'initial',
    storeEpoch: 0,
    presentationPolicy: null,
    presentationLayerRevision: 0,
    presentationLayerCount: 0,
    presentationAlphaMultipliers: new Float32Array(0),
    instancePresentationOverrides: new Map<string, never>(),
    presentationStore: null,
    presentationBaseStore: null,
    pendingSourceStore: null,
    lastStore: null,
    lastSourceStore: null,
    slotByEntityId: new Map<string, number>(),
    ...overrides,
  });
  return renderer;
}

function projection(marker: string): PatchMapProjectionIndex {
  return Object.freeze({
    byEntityId: Object.freeze({
      [marker]: Object.freeze({ marker }),
    }),
  }) as unknown as PatchMapProjectionIndex;
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
