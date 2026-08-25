import { describe, expect, it } from 'vitest';

import { PatchMapTransformerEditAuthority } from '../../src/patch-map/engine/transformer-edit-authority';
import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';
import { planPatchMapPreviewMutationTransaction } from '../../src/patch-map/semantic/transaction';
import { planPatchMapTransformerEdit } from '../../src/patch-map/transformer-edit';

describe('PatchMap transformer edit session authority', () => {
  it('owns one frozen session and records preview state without cloning its datasets', () => {
    const authority = new PatchMapTransformerEditAuthority();
    const start = materializedScene();
    const selectionIds = ['rect-a'];
    const session = authority.begin({
      pointerId: 7,
      actionId: 'move-7',
      kind: 'move',
      handle: 'frame',
      selectionIds,
      startMaterialized: start,
      startSelectionIds: selectionIds,
      historyDepthBefore: 2,
    });

    selectionIds.push('late');
    expect(session.selectionIds).toEqual(['rect-a']);
    expect(session.startSelectionIds).toEqual(['rect-a']);
    expect(Object.isFrozen(session)).toBe(true);
    expect(session.startMaterialized).toBe(start);
    expect(() => authority.begin({
      pointerId: 8,
      actionId: 'move-8',
      kind: 'move',
      handle: 'frame',
      selectionIds: ['rect-a'],
      startMaterialized: start,
      startSelectionIds: ['rect-a'],
      historyDepthBefore: 2,
    })).toThrowError('PatchMap transformer edit session is already active');

    const preview = plannedPreview(start);
    const next = authority.recordPreview(session, preview);
    expect(next.startMaterialized).toBe(start);
    expect(next.previewMaterialized).toBe(preview.previewMaterialized);
    expect(next.previewMaterialized?.dataset).toBe(preview.previewMaterialized.dataset);
    expect(authority.probe()).toMatchObject({
      activeSessionCount: 1,
      activePointerId: 7,
      previewCount: 1,
      previewOverlayCount: 1,
    });
  });

  it('keeps a planned completion active until the facade settles its side effects', () => {
    const authority = new PatchMapTransformerEditAuthority();
    const start = materializedScene();
    const session = authority.begin({
      pointerId: 11,
      actionId: 'move-11',
      kind: 'move',
      handle: 'frame',
      selectionIds: ['rect-a'],
      startMaterialized: start,
      startSelectionIds: ['rect-a'],
      historyDepthBefore: 0,
    });
    const previewed = authority.recordPreview(session, plannedPreview(start));

    expect(authority.prepareCompletion(99)).toEqual({
      status: 'stale',
      session: null,
    });
    expect(authority.current()).toBe(previewed);
    expect(authority.probe()).toMatchObject({
      activeSessionCount: 1,
      staleCompletionCount: 1,
      committedMutationCount: 0,
    });

    expect(authority.prepareCompletion(11)).toEqual({
      status: 'planned',
      session: previewed,
    });
    expect(authority.current()).toBe(previewed);
    authority.settle(previewed, 'committed');
    expect(authority.probe()).toMatchObject({
      activeSessionCount: 0,
      previewOverlayCount: 0,
      committedMutationCount: 1,
      cancelledSessionCount: 0,
      staleCompletionCount: 1,
    });
    expect(() => authority.settle(previewed, 'committed'))
      .toThrowError('transformer edit session effect is stale');
  });

  it('separates unchanged completion from cancellation bookkeeping', () => {
    const authority = new PatchMapTransformerEditAuthority();
    const start = materializedScene();
    const unchanged = authority.begin({
      pointerId: 1,
      actionId: 'unchanged',
      kind: 'move',
      handle: 'frame',
      selectionIds: ['rect-a'],
      startMaterialized: start,
      startSelectionIds: ['rect-a'],
      historyDepthBefore: 0,
    });
    expect(authority.prepareCompletion(1)).toEqual({
      status: 'unchanged',
      session: unchanged,
    });
    authority.settle(unchanged, 'unchanged');

    const cancelled = authority.begin({
      pointerId: 2,
      actionId: 'cancelled',
      kind: 'move',
      handle: 'frame',
      selectionIds: ['rect-a'],
      startMaterialized: start,
      startSelectionIds: ['rect-a'],
      historyDepthBefore: 0,
    });
    expect(authority.current()).toBe(cancelled);
    authority.settle(cancelled, 'cancelled');
    expect(authority.probe()).toMatchObject({
      activeSessionCount: 0,
      committedMutationCount: 0,
      cancelledSessionCount: 1,
      staleCompletionCount: 0,
    });
  });
});

function materializedScene() {
  return materializePatchMapDataset([{
    type: 'rect',
    id: 'rect-a',
    size: { width: 40, height: 30 },
    attrs: { x: 10, y: 20 },
  }]);
}

function plannedPreview(start: ReturnType<typeof materializedScene>) {
  const plan = planPatchMapTransformerEdit(start.dataset, {
    kind: 'move',
    selectionIds: ['rect-a'],
    deltaWorld: [5, 3],
  });
  if (plan.status !== 'planned') throw new Error(`expected planned edit, received ${plan.status}`);
  const mutation = planPatchMapPreviewMutationTransaction(start, {
    strict: true,
    recordHistory: false,
    operations: plan.operations,
  });
  if (mutation.status !== 'planned') {
    throw new Error(`expected planned preview, received ${mutation.status}`);
  }
  return Object.freeze({
    latestPlan: plan,
    latestMutationPlan: mutation,
    previewMaterialized: mutation.candidate,
    transientPreview: false,
  });
}
