import { describe, expect, it, vi } from 'vitest';

import { PatchMap } from '../../src/engine';
import {
  actualAt,
  executeCase,
  isRecord,
  requireRecord,
  selectedCase,
} from '../support/update-transactions-contract-runner';

describe('PatchMap UPD-008 component reconcile and resource lifecycle contract', () => {
  it('executes against public PatchMap state without mutating action inputs', async () => {
    const plan = selectedCase('UPD-008');
    const before = JSON.stringify(plan);
    const execution = await executeCase(plan);

    expect(execution.status).toBe('completed');
    expect(execution.eventJournalFailures).toEqual([]);
    expect(execution.cleanup).toMatchObject({ status: 'completed', errors: [] });
    expect(execution.actionResults).toHaveLength(plan.actionTrace.length);
    expect(execution.actionResults.every(({ status }) => status === 'completed')).toBe(true);
    expect(JSON.stringify(plan)).toBe(before);
    for (const result of execution.actionResults) {
      const actual = result.delta.actual;
      if (isRecord(actual.input)) expect(actual.input).toMatchObject({ unchanged: true });
      expect(requireRecord(actual.product, 'UPD-008 action product')).toHaveProperty('snapshot');
    }
    expect(actualAt(execution, 0).binding).toEqual({ bar: { id: 'bar' } });
    expect(actualAt(execution, 1)).toMatchObject({
      components: {
        order: ['label', 'bar', 'bg', 'status'],
        byId: {
          bar: { visual: { renderRole: 'ordinary-geometry' } },
          label: { visual: { renderRole: 'text' } },
        },
      },
      removed: { icon: { eventCallbacks: 0 } },
      retainedDelta: 0,
    });
    expect(actualAt(execution, 2)).toMatchObject({
      componentVisual: {
        logicalCount: 1,
        renderObjectCount: 0,
        show: false,
        rendererPaint: { primitiveCount: 0, renderObjectCount: 0 },
      },
    });
    expect(actualAt(execution, 3)).toMatchObject({
      currentTarget: { id: 'bar', show: true },
    });
  }, 20_000);

  it.each([
    ['component visual', 'missing-component'],
    ['interaction ownership', 'missing-interaction'],
    ['scene image', 'missing-scene-images'],
    ['renderer resource', 'missing-rendering'],
  ] as const)('fails closed when the %s probe is missing', async (_label, surfaceFault) => {
    await expect(executeCase(selectedCase('UPD-008'), { surfaceFault }))
      .rejects.toThrow(/Invalid PatchMap update transaction handler/u);
  });

  it('reports retained image target, renderer, binding, consumer, and lease facts', async () => {
    const execution = await executeCase(selectedCase('UPD-008'), {
      surfaceFault: 'retain-resource',
    });
    const reconcile = actualAt(execution, 1);
    expect(reconcile).toMatchObject({
      retainedDelta: 8,
      resources: {
        violations: {
          retainedImageTargets: 1,
          retainedActiveImageTargets: 1,
          retainedBindings: 1,
          retainedLeases: 1,
          retainedAcquisitions: 1,
          retainedRendererObjects: 1,
          retainedConsumers: 1,
          retainedAssetLaneObjects: 1,
        },
      },
      removed: {
        icon: {
          logicalCount: 0,
          resources: { retainedDelta: 8 },
        },
      },
    });
  });

  it('uses a real registered asset session and settle-publish-settle ordering', async () => {
    const registerAssets = vi.spyOn(PatchMap.prototype, 'registerAssets');
    const resourceJournal: string[] = [];
    try {
      const execution = await executeCase(selectedCase('UPD-008'), { resourceJournal });
      expect(registerAssets).toHaveBeenCalledTimes(1);
      expect(registerAssets).toHaveBeenCalledWith('contract-upd-008');
      const initialProduct = requireRecord(actualAt(execution, 0).product, 'initial product');
      const snapshot = requireRecord(initialProduct.snapshot, 'initial snapshot');
      const resources = requireRecord(snapshot.resources, 'initial resources');
      expect(resources.assets).toMatchObject({
        instanceId: 'contract-upd-008',
        pendingCount: 0,
        leaseCount: 1,
        acquisitionCount: 1,
        cleanupPendingCount: 0,
      });
      const sceneImages = requireRecord(initialProduct.sceneImages, 'initial scene images');
      expect(sceneImages).toMatchObject({
        targetCount: 2,
        activeTargetCount: 2,
        bindingCount: 2,
      });
      const initialImages = requireRecord(sceneImages.images, 'initial images');
      expect(initialImages['item-a::icon:icon']).toMatchObject({
        active: true,
        state: 'resolved',
        attachmentState: 'current',
        publication: { rendererFacts: 'current' },
        renderObjectCount: 1,
        bindingConsumerCount: 1,
      });
      expect(initialImages['image-a']).toMatchObject({
        active: true,
        state: 'failed',
        attachmentState: 'current',
        publication: { rendererFacts: 'current' },
        renderObjectCount: 1,
        placeholderCount: 1,
        bindingConsumerCount: 1,
        role: 'asset-placeholder',
      });
      const publishes = resourceJournal
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry === 'publish');
      expect(publishes).toHaveLength(4);
      for (const { index } of publishes) {
        expect(resourceJournal[index - 1]).toBe('settle');
        expect(resourceJournal[index + 1]).toBe('settle');
      }
    } finally {
      registerAssets.mockRestore();
    }
  });

  it.each([
    ['zero lease/acquisition', { adapterFault: 'zero-asset-session' }],
    ['root binding growth/entity callback', { surfaceFault: 'ownership-leak' }],
    ['root binding drop', { surfaceFault: 'root-drop' }],
    ['subscription drop', { adapterFault: 'subscription-drop' }],
    ['duplicate subscription', { adapterFault: 'duplicate-subscription' }],
    ['stale renderer publication', { surfaceFault: 'stale-publication' }],
    ['asset render lane orphan', { surfaceFault: 'lane-orphan' }],
  ] as const)('fails closed for %s', async (_label, options) => {
    await expect(executeCase(selectedCase('UPD-008'), options))
      .rejects.toThrow(/Invalid PatchMap update transaction handler/u);
  });
});
