import { describe, expect, it } from 'vitest';

import type { SlotRange } from '../../src/patch-map/dense/contracts';
import type { RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import type { PatchMapResolvedPresentationPolicy } from '../../src/patch-map/presentation-policy';
import {
  PatchMapPixiRenderer,
  capturePatchMapPixiRendererPublication,
  restorePatchMapPixiRendererPublication,
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
    });
    const checkpoint = captureHarnessPublication(renderer);

    expect(Object.isFrozen(checkpoint)).toBe(true);
    expect(renderer.setProjection(
      projection('replacement'),
      [{ start: 8, end: 10 }],
      new Set(['stale-after']),
      'text',
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
  presentationStore: PatchMapPresentationStoreView | null;
  presentationBaseStore: RenderStoreView | null;
  lastStore: RenderStoreView | null;
  lastSourceStore: RenderStoreView | null;
  slotByEntityId: Map<string, number>;
  setProjection(
    index: PatchMapProjectionIndex,
    changedRanges?: readonly SlotRange[],
    staleEntityIds?: ReadonlySet<string>,
    updateKind?: 'bar-presentation' | 'text',
  ): boolean;
  setPresentationPolicy(policy: PatchMapResolvedPresentationPolicy | null): boolean;
  markChanges(
    ranges: readonly SlotRange[],
    reason: string,
    options?: Readonly<{ fullRebuild?: boolean; domain?: 'bar-only' | 'text-only' }>,
  ): void;
}

function captureHarnessPublication(
  renderer: RendererCheckpointHarness,
): PatchMapPixiRendererPublicationCheckpoint {
  return capturePatchMapPixiRendererPublication(
    renderer as unknown as PatchMapPixiRenderer,
  );
}

function restoreHarnessPublication(
  renderer: RendererCheckpointHarness,
  checkpoint: PatchMapPixiRendererPublicationCheckpoint,
): void {
  restorePatchMapPixiRendererPublication(
    renderer as unknown as PatchMapPixiRenderer,
    checkpoint,
  );
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
    presentationStore: null,
    presentationBaseStore: null,
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
