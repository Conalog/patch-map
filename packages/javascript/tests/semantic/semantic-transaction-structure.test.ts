import { describe, expect, it } from 'vitest';

import {
  materializePatchMapDataset,
  type PatchMapElement,
  type MaterializedPatchMapDataset,
} from '../../src/semantic/dataset';
import { planPatchMapMutationTransaction } from '../../src/semantic/transaction';
import {
  PATCH_MAP_IDENTITY_AFFINE,
  createPatchMapAffine,
  multiplyPatchMapAffine,
  type PatchMapAffineMatrix,
} from '../../src/semantic/geometry';

describe('PatchMap staged semantic transaction planner', () => {
  it('adds one detached element at an exact root or group-child index', () => {
    const source = hierarchyScene();
    const sourceBefore = JSON.stringify(source);
    const request = {
      strict: true,
      actionId: 'structure-add',
      operations: [{
        op: 'add',
        parent: elementTarget('group-b'),
        collection: 'children',
        index: 0,
        value: {
          type: 'rect',
          id: 'rect-c',
          size: { width: 12, height: 8 },
          fill: '#123456',
          attrs: { x: 4, y: 6 },
        },
      }],
    };
    const requestBefore = JSON.stringify(request);
    const added = planPatchMapMutationTransaction(source, request);

    expect(added.status).toBe('planned');
    if (added.status !== 'planned') throw new Error('Expected add plan');
    expect(parentId(added.candidate.dataset, 'rect-c')).toBe('group-b');
    expect(requireElement(added.candidate.dataset, 'rect-c')).toMatchObject({
      type: 'rect',
      size: { width: 12, height: 8 },
      attrs: { x: 4, y: 6 },
    });
    expect(added.applied).toEqual([elementTarget('rect-c')]);
    expect(added.selectionIds).toEqual(['rect-c']);
    expect(added.allowedElementOrderIds).toEqual(['rect-c']);
    expect(JSON.stringify(source)).toBe(sourceBefore);
    expect(JSON.stringify(request)).toBe(requestBefore);

    const rootAdded = planPatchMapMutationTransaction(added.candidate, {
      strict: true,
      operations: [{
        op: 'add',
        parent: null,
        collection: 'children',
        index: 0,
        value: {
          type: 'text',
          id: 'text-root',
          text: 'Added',
          style: { fontSize: 12, fill: '#111111' },
        },
      }],
    });
    expect(rootAdded.status).toBe('planned');
    if (rootAdded.status !== 'planned') throw new Error('Expected root add plan');
    expect(parentId(rootAdded.candidate.dataset, 'text-root')).toBeNull();
    expect(rootAdded.candidate.dataset[0]?.id).toBe('text-root');

    const duplicate = planPatchMapMutationTransaction(added.candidate, request);
    expect(duplicate).toMatchObject({
      status: 'rejected',
      candidate: null,
      diagnostic: { code: 'DUPLICATE_ID', category: 'INVALID_INPUT' },
    });

    const invalidIndex = planPatchMapMutationTransaction(source, {
      strict: true,
      operations: [{
        ...request.operations[0],
        index: 1,
      }],
    });
    expect(invalidIndex).toMatchObject({
      status: 'rejected',
      candidate: null,
      diagnostic: { code: 'INVALID_VALUE', category: 'INVALID_INPUT' },
    });
  });

  it('moves, groups, and ungroups one stable subtree while preserving pinned world geometry', () => {
    const source = hierarchyScene();
    const sourceBefore = JSON.stringify(source);
    const moved = planPatchMapMutationTransaction(source, {
      strict: true,
      actionId: 'structure-1',
      operations: [{
        op: 'move',
        target: elementTarget('rect-b'),
        parent: elementTarget('group-b'),
        index: 0,
      }],
    });

    expect(moved.status).toBe('planned');
    if (moved.status !== 'planned') throw new Error('Expected hierarchy move plan');
    expect(parentId(moved.candidate.dataset, 'rect-b')).toBe('group-b');
    expect(requireElement(moved.candidate.dataset, 'rect-b').attrs).toMatchObject({
      x: -80,
      y: 40,
    });
    expect(moved.allowedElementOrderIds).toEqual(['rect-b']);

    const grouped = planPatchMapMutationTransaction(moved.candidate, {
      strict: true,
      actionId: 'structure-2',
      operations: [{
        op: 'group',
        targets: [elementTarget('rect-b')],
        value: { type: 'group', id: 'group-c' },
      }],
    });
    expect(grouped.status).toBe('planned');
    if (grouped.status !== 'planned') throw new Error('Expected group plan');
    expect(parentId(grouped.candidate.dataset, 'group-c')).toBe('group-b');
    expect(parentId(grouped.candidate.dataset, 'rect-b')).toBe('group-c');
    expect(grouped.selectionIds).toEqual(['group-c']);
    expect(requireElement(grouped.candidate.dataset, 'rect-b').attrs).toMatchObject({
      x: -80,
      y: 40,
    });

    const ungrouped = planPatchMapMutationTransaction(grouped.candidate, {
      strict: true,
      actionId: 'structure-3',
      operations: [{ op: 'ungroup', target: elementTarget('group-c') }],
    });
    expect(ungrouped.status).toBe('planned');
    if (ungrouped.status !== 'planned') throw new Error('Expected ungroup plan');
    expect(findElement(ungrouped.candidate.dataset, 'group-c')).toBeUndefined();
    expect(parentId(ungrouped.candidate.dataset, 'rect-b')).toBe('group-b');
    expect(ungrouped.selectionIds).toEqual(['rect-b']);
    expect(requireElement(ungrouped.candidate.dataset, 'rect-b').attrs).toMatchObject({
      x: -80,
      y: 40,
    });
    expect(JSON.stringify(source)).toBe(sourceBefore);
  });

  it('falls back before removing external relation dependencies during owned ungroup', () => {
    const input = [
      {
        type: 'group',
        id: 'group-a',
        children: [{
          type: 'rect',
          id: 'child',
          size: { width: 20, height: 10 },
          fill: '#ff8800',
        }],
      },
      {
        type: 'relations',
        id: 'links',
        links: [
          { source: 'group-a', target: 'other' },
          { source: 'child', target: 'other' },
        ],
      },
      {
        type: 'rect',
        id: 'other',
        size: { width: 10, height: 10 },
        fill: '#00ff00',
      },
    ];
    const inputBefore = JSON.stringify(input);
    const current = materializePatchMapDataset(input);
    const currentBefore = JSON.stringify(current);
    const relationRoot = current.dataset[1];

    const ungrouped = planPatchMapMutationTransaction(current, {
      strict: true,
      actionId: 'ungroup-remove-relations',
      operations: [{
        op: 'ungroup',
        target: elementTarget('group-a'),
        relationPolicy: 'remove',
      }],
    });

    expect(ungrouped).toMatchObject({
      status: 'planned',
      changed: true,
      actionId: 'ungroup-remove-relations',
      applied: [elementTarget('group-a')],
      missing: [],
      unchanged: [],
      selectionIds: ['child'],
      allowedElementOrderIds: ['group-a', 'links', 'other', 'child'],
    });
    if (ungrouped.status !== 'planned') throw new Error('Expected relation-safe ungroup plan');
    expect(findElement(ungrouped.candidate.dataset, 'group-a')).toBeUndefined();
    expect(parentId(ungrouped.candidate.dataset, 'child')).toBeNull();
    expect(requireElement(ungrouped.candidate.dataset, 'links')).toMatchObject({
      type: 'relations',
      links: [{ source: 'child', target: 'other' }],
    });
    expect(JSON.stringify(input)).toBe(inputBefore);
    expect(JSON.stringify(current)).toBe(currentBefore);
    expect(current.dataset[1]).toBe(relationRoot);
  });

  it('rebases the pinned rotation and uniform-scale profile without changing world affine', () => {
    const source = materializePatchMapDataset([
      {
        type: 'group',
        id: 'group-a',
        attrs: { x: 10, y: 20, angle: 30, scaleX: 2, scaleY: 2 },
        children: [{
          type: 'rect',
          id: 'rect-b',
          size: { width: 40, height: 30 },
          fill: '#ff8800',
          attrs: { x: 5, y: 7, angle: 15, scaleX: 1.5, scaleY: 1.5 },
        }],
      },
      {
        type: 'group',
        id: 'group-b',
        attrs: { x: 100, y: 50, angle: -20 },
        children: [],
      },
    ]);
    const before = elementWorldAffine(source.dataset, 'rect-b');
    const moved = planPatchMapMutationTransaction(source, {
      strict: true,
      operations: [{
        op: 'move',
        target: elementTarget('rect-b'),
        parent: elementTarget('group-b'),
        index: 0,
      }],
    });

    expect(moved.status).toBe('planned');
    if (moved.status !== 'planned') throw new Error('Expected affine hierarchy move plan');
    const after = elementWorldAffine(moved.candidate.dataset, 'rect-b');
    after.forEach((value, index) => expect(value).toBeCloseTo(before[index] ?? Number.NaN, 10));
  });

  it('rejects hierarchy cycles, locked ancestry, cross-parent groups, and caller children atomically', () => {
    const moved = planPatchMapMutationTransaction(hierarchyScene(), {
      strict: true,
      recordHistory: false,
      operations: [{
        op: 'move',
        target: elementTarget('group-a'),
        parent: elementTarget('group-b'),
        index: 0,
      }],
    });
    expect(moved.status).toBe('planned');
    if (moved.status !== 'planned') throw new Error('Expected hierarchy setup plan');

    const cycle = planPatchMapMutationTransaction(moved.candidate, {
      strict: true,
      operations: [{
        op: 'move',
        target: elementTarget('group-b'),
        parent: elementTarget('group-a'),
        index: 0,
      }],
    });
    expect(cycle).toMatchObject({
      status: 'rejected',
      candidate: null,
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
    });
    expect(parentId(moved.candidate.dataset, 'group-a')).toBe('group-b');

    const locked = planPatchMapMutationTransaction(lockedHierarchyScene(), {
      strict: true,
      operations: [{
        op: 'move',
        target: elementTarget('rect-b'),
        parent: elementTarget('group-b'),
        index: 0,
      }],
    });
    expect(locked).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
    });

    const crossParent = planPatchMapMutationTransaction(hierarchyScene(), {
      strict: true,
      operations: [{
        op: 'group',
        targets: [elementTarget('rect-b'), elementTarget('other')],
        value: { type: 'group', id: 'group-c' },
      }],
    });
    expect(crossParent).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
    });

    const callerChildren = planPatchMapMutationTransaction(hierarchyScene(), {
      strict: true,
      operations: [{
        op: 'group',
        targets: [elementTarget('rect-b')],
        value: { type: 'group', id: 'group-c', children: [] },
      }],
    });
    expect(callerChildren).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'CONFLICTING_FIELDS' },
    });
  });

});

function elementTarget(id: string): Readonly<{ kind: 'element'; id: string }> {
  return { kind: 'element', id };
}

function hierarchyScene(): MaterializedPatchMapDataset {
  return materializePatchMapDataset([
    {
      type: 'group',
      id: 'group-a',
      attrs: { x: 0, y: 0 },
      children: [{
        type: 'rect',
        id: 'rect-b',
        size: { width: 40, height: 30 },
        fill: '#ff8800',
        attrs: { x: 160, y: 40 },
      }],
    },
    {
      type: 'group',
      id: 'group-b',
      attrs: { x: 240, y: 0 },
      children: [],
    },
    {
      type: 'rect',
      id: 'other',
      size: { width: 10, height: 10 },
      fill: '#00ff00',
    },
  ]);
}

function lockedHierarchyScene(): MaterializedPatchMapDataset {
  return materializePatchMapDataset([
    {
      type: 'group',
      id: 'group-a',
      locked: true,
      children: [{
        type: 'rect',
        id: 'rect-b',
        size: { width: 40, height: 30 },
        fill: '#ff8800',
        attrs: { x: 160, y: 40 },
      }],
    },
    { type: 'group', id: 'group-b', children: [] },
  ]);
}

function requireElement(elements: readonly PatchMapElement[], id: string): PatchMapElement {
  const element = findElement(elements, id);
  if (element === undefined) throw new Error(`Missing element ${id}`);
  return element;
}

function findElement(elements: readonly PatchMapElement[], id: string): PatchMapElement | undefined {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElement(element.children, id);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function parentId(elements: readonly PatchMapElement[], id: string): string | null | undefined {
  for (const element of elements) {
    if (element.id === id) return null;
    if (element.type !== 'group') continue;
    if (element.children.some((child) => child.id === id)) return element.id;
    const nested = parentId(element.children, id);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function elementWorldAffine(
  elements: readonly PatchMapElement[],
  id: string,
  parent: PatchMapAffineMatrix = PATCH_MAP_IDENTITY_AFFINE,
): PatchMapAffineMatrix {
  for (const element of elements) {
    const attrs = element.attrs ?? {};
    const rotation = finiteAttribute(attrs.rotation, 0);
    const angle = typeof attrs.angle === 'number' && Number.isFinite(attrs.angle)
      ? attrs.angle
      : rotation * 180 / Math.PI;
    const local = createPatchMapAffine(
      finiteAttribute(attrs.x, 0),
      finiteAttribute(attrs.y, 0),
      angle,
      finiteAttribute(attrs.scaleX, 1),
      finiteAttribute(attrs.scaleY, 1),
    );
    const world = multiplyPatchMapAffine(parent, local);
    if (element.id === id) return world;
    if (element.type === 'group') {
      try {
        return elementWorldAffine(element.children, id, world);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== `Missing affine element ${id}`) {
          throw error;
        }
      }
    }
  }
  throw new Error(`Missing affine element ${id}`);
}

function finiteAttribute(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
