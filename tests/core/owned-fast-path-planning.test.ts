import { describe, expect, it } from 'vitest';

import {
  materializePatchMapDataset,
  type PatchMapElement,
} from '../../src/patch-map/semantic/dataset';
import {
  ownedRootIndexById,
  planFlatOwnedMergeTransaction,
  planOwnedBarHeightTransaction,
  planOwnedElementAngleTransaction,
} from '../../src/patch-map/semantic/transaction/owned-fast-path-planning';
import {
  normalizeTransaction,
} from '../../src/patch-map/semantic/transaction/request-normalization';

describe('PatchMap owned transaction fast-path planning', () => {
  it('caches root identity and plans only changed direct element angles', () => {
    const current = materializePatchMapDataset([
      { type: 'rect', id: 'rect-a', size: 20 },
      { type: 'rect', id: 'rect-b', size: 20, attrs: { angle: 7 } },
    ]);
    const request = normalizeTransaction({
      strict: true,
      actionId: 'angles',
      operations: [
        {
          op: 'merge',
          target: { kind: 'element', id: 'rect-a' },
          changes: [{ path: ['attrs', 'angle'], value: 7 }],
        },
        {
          op: 'merge',
          target: { kind: 'element', id: 'rect-b' },
          changes: [{ path: ['attrs', 'angle'], value: 7 }],
        },
      ],
    });
    const index = ownedRootIndexById(current.dataset);

    const plan = planOwnedElementAngleTransaction(current, request);

    expect(ownedRootIndexById(current.dataset)).toBe(index);
    expect(plan).toMatchObject({
      status: 'planned',
      changed: true,
      actionId: 'angles',
      applied: [{ kind: 'element', id: 'rect-a' }],
      unchanged: [{ kind: 'element', id: 'rect-b' }],
      directElementAngleUpdates: [{ id: 'rect-a', angle: 7 }],
      summary: { appliedCount: 1, missingCount: 0, unchangedCount: 1 },
    });
    if (plan?.status !== 'planned') throw new Error('Expected direct angle plan');
    expect(plan.operations).toBe(request.operations);
    expect(plan.candidate.dataset[0]).not.toBe(current.dataset[0]);
    expect(plan.candidate.dataset[1]).toBe(current.dataset[1]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.directElementAngleUpdates)).toBe(true);

    const duplicateRoots: readonly PatchMapElement[] = Object.freeze([
      Object.freeze({
        type: 'rect' as const,
        id: 'duplicate',
        size: Object.freeze({ width: 10, height: 10 }),
        radius: 0,
        show: true,
        locked: false,
      }),
      Object.freeze({
        type: 'rect' as const,
        id: 'duplicate',
        size: Object.freeze({ width: 20, height: 20 }),
        radius: 0,
        show: true,
        locked: false,
      }),
    ]);
    expect(ownedRootIndexById(duplicateRoots)).toBeNull();
    expect(ownedRootIndexById(duplicateRoots)).toBeNull();
  });

  it('coalesces ordered bar outcomes without mutating the owned source', () => {
    const current = materializePatchMapDataset([{
      type: 'item',
      id: 'item-a',
      size: 100,
      components: [{
        type: 'bar',
        id: 'bar-a',
        source: { type: 'rect', fill: '#2563ebff' },
        size: { width: 40, height: 10 },
      }],
    }]);
    const request = normalizeTransaction({
      strict: true,
      operations: [20, 20].map((height) => ({
        op: 'merge',
        target: { kind: 'component', ownerId: 'item-a', id: 'bar-a' },
        changes: [{ path: ['size', 'height'], value: height }],
      })),
    });
    const before = JSON.stringify(current);

    const plan = planOwnedBarHeightTransaction(current, request);

    expect(plan).toMatchObject({
      status: 'planned',
      changed: true,
      applied: [{ kind: 'component', ownerId: 'item-a', id: 'bar-a' }],
      missing: [],
      unchanged: [],
      summary: { appliedCount: 1, missingCount: 0, unchangedCount: 0 },
    });
    expect(JSON.stringify(current)).toBe(before);
    if (plan?.status !== 'planned') throw new Error('Expected direct bar plan');
    expect(plan.candidate.dataset[0]).toMatchObject({
      components: [{ id: 'bar-a', size: { width: 40, height: 20 } }],
    });
  });

  it('plans detached flat merges and rejects hierarchy paths for generic fallback', () => {
    const current = materializePatchMapDataset([
      { type: 'rect', id: 'rect-a', size: 20, attrs: { x: 1 } },
      { type: 'rect', id: 'rect-b', size: 20, attrs: { x: 2 } },
    ]);
    const request = normalizeTransaction({
      strict: true,
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'rect-a' },
        changes: [{ path: ['attrs', 'telemetry'], value: { sample: 2 } }],
      }],
    });

    const plan = planFlatOwnedMergeTransaction(current, request);

    expect(plan).toMatchObject({
      status: 'planned',
      changed: true,
      applied: [{ kind: 'element', id: 'rect-a' }],
      summary: { appliedCount: 1, missingCount: 0, unchangedCount: 0 },
    });
    if (plan?.status !== 'planned') throw new Error('Expected flat merge plan');
    expect(plan.candidate.dataset[0]).not.toBe(current.dataset[0]);
    expect(plan.candidate.dataset[1]).toBe(current.dataset[1]);
    expect(current.dataset[0]).not.toHaveProperty('attrs.telemetry');

    const hierarchy = normalizeTransaction({
      strict: true,
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'rect-a' },
        changes: [{ path: ['children'], value: [] }],
      }],
    });
    expect(planFlatOwnedMergeTransaction(current, hierarchy)).toBeNull();
  });

  it('preserves the exact invalid-path diagnostic and operation index', () => {
    const current = materializePatchMapDataset([{
      type: 'rect',
      id: 'rect-a',
      size: 20,
      attrs: { x: 1 },
    }]);
    const request = normalizeTransaction({
      strict: true,
      actionId: 'invalid-flat-path',
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'rect-a' },
        changes: [{ path: ['attrs', 0], value: 2 }],
      }],
    });

    const plan = planFlatOwnedMergeTransaction(current, request);

    expect(plan).toEqual({
      status: 'rejected',
      changed: false,
      schemaRevision: 'patch-map-mutation-transaction/1',
      actionId: 'invalid-flat-path',
      candidate: null,
      applied: [],
      missing: [],
      unchanged: [],
      summary: { appliedCount: 0, missingCount: 0, unchangedCount: 0 },
      diagnostic: {
        code: 'INVALID_PATH',
        category: 'INVALID_INPUT',
        path: '$.operations[0].changes.path[1]',
        message: 'path ["attrs",0] does not address a mergeable staged value',
        operationIndex: 0,
        target: { kind: 'element', id: 'rect-a' },
      },
    });
    expect(Object.isFrozen(plan)).toBe(true);
  });
});
