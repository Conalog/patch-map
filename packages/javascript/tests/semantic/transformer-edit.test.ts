import { describe, expect, it } from 'vitest';

import { materializePatchMapDataset } from '../../src/semantic/dataset';
import {
  planPatchMapMoveTransform,
  planPatchMapResizeTransform,
  planPatchMapRotateTransform,
  resolvePatchMapEdgeAutoPan,
  resolvePatchMapRotationSnap,
} from '../../src/selection-transformer/edit';

describe('PatchMap transformer edit planning', () => {
  it('plans integer move, dominant-axis lock, and atomic mixed-set refusal', () => {
    const dataset = scene();
    const before = JSON.stringify(dataset);

    const move = planPatchMapMoveTransform(dataset, {
      selectionIds: ['rect-b'],
      deltaWorld: [10.4, 5.4],
    });
    expect(move).toMatchObject({
      status: 'planned',
      eligibleIds: ['rect-b'],
      after: { 'rect-b': { x: 170, y: 45 } },
    });
    expect(move.operations).toMatchObject([{
      op: 'merge',
      target: { kind: 'element', id: 'rect-b' },
      changes: [
        { path: ['attrs', 'x'], value: 170 },
        { path: ['attrs', 'y'], value: 45 },
      ],
    }]);

    expect(planPatchMapMoveTransform(dataset, {
      selectionIds: ['rect-b'],
      deltaWorld: [20, 8],
      axisLock: true,
    })).toMatchObject({
      status: 'planned',
      after: { 'rect-b': { x: 180, y: 40 } },
    });
    expect(planPatchMapMoveTransform(dataset, {
      selectionIds: ['rect-b', 'links'],
      deltaWorld: [10, 5],
    })).toMatchObject({
      status: 'rejected',
      code: 'INELIGIBLE_TARGET',
      operations: [],
    });
    expect(JSON.stringify(dataset)).toBe(before);
  });

  it('plans all eight resize directions, image resize, and integer minimum size', () => {
    const dataset = scene();
    const cases = {
      w: [-10, 0],
      e: [10, 0],
      n: [0, -10],
      s: [0, 10],
      nw: [-10, -10],
      ne: [10, -10],
      sw: [-10, 10],
      se: [10, 10],
    } as const;
    const expected = {
      w: [150, 40, 50, 30, 200, 55],
      e: [160, 40, 50, 30, 160, 55],
      n: [160, 30, 40, 40, 180, 70],
      s: [160, 40, 40, 40, 180, 40],
      nw: [150, 30, 50, 40, 200, 70],
      ne: [160, 30, 50, 40, 160, 70],
      sw: [150, 40, 50, 40, 200, 40],
      se: [160, 40, 50, 40, 160, 40],
    } as const;

    for (const [handle, deltaWorld] of Object.entries(cases)) {
      const plan = planPatchMapResizeTransform(dataset, {
        selectionIds: ['rect-b'],
        handle: handle as keyof typeof cases,
        deltaWorld,
      });
      expect(plan.status).toBe('planned');
      const geometry = plan.after['rect-b'];
      if (geometry === undefined) throw new Error(`missing ${handle} geometry`);
      const anchor = oppositeAnchor(geometry, handle as keyof typeof cases);
      expect([
        geometry.x,
        geometry.y,
        geometry.width,
        geometry.height,
        anchor[0],
        anchor[1],
      ]).toEqual(expected[handle as keyof typeof expected]);
    }

    expect(planPatchMapResizeTransform(dataset, {
      selectionIds: ['image-a'],
      handle: 'se',
      deltaWorld: [10, 10],
    })).toMatchObject({
      status: 'planned',
      after: { 'image-a': { width: 90, height: 50 } },
    });
    expect(planPatchMapResizeTransform(dataset, {
      selectionIds: ['rect-b'],
      handle: 'nw',
      deltaWorld: [1000, 1000],
      minSize: 1,
    })).toMatchObject({
      status: 'planned',
      after: { 'rect-b': { x: 199, y: 69, width: 1, height: 1 } },
    });
  });

  it('preserves the starting ratio for corner and symmetric edge resize', () => {
    const dataset = scene();
    expect(planPatchMapResizeTransform(dataset, {
      selectionIds: ['rect-b'],
      handle: 'se',
      deltaWorld: [40, 30],
      lockAspectRatio: true,
    })).toMatchObject({
      status: 'planned',
      after: { 'rect-b': { x: 160, y: 40, width: 80, height: 60 } },
    });
    expect(planPatchMapResizeTransform(dataset, {
      selectionIds: ['rect-b'],
      handle: 'e',
      deltaWorld: [40, 0],
      lockAspectRatio: true,
    })).toMatchObject({
      status: 'planned',
      after: { 'rect-b': { x: 160, y: 25, width: 80, height: 60 } },
    });
  });

  it('rotates only the eligible mixed subset around the full selection center', () => {
    const dataset = scene();
    const plan = planPatchMapRotateTransform(dataset, {
      selectionIds: ['rect-b', 'text-c', 'item-a', 'links'],
      lockedIds: ['text-c'],
      deltaDegrees: 45,
      centerWorld: [105, 90],
    });
    expect(plan).toMatchObject({
      status: 'planned',
      eligibleIds: ['rect-b', 'item-a'],
      lockedIds: ['text-c'],
      ineligibleIds: ['links'],
      selectionCenterBefore: [105, 90],
      selectionCenterAfter: [105, 90],
      after: {
        'rect-b': {
          x: 162.781746,
          y: 103.284271,
          rotationDegrees: 45,
          centerWorld: [182.781746, 118.284271],
        },
        'item-a': {
          x: 44.393398,
          y: -3.033009,
          rotationDegrees: 45,
          centerWorld: [94.393398, 36.966991],
        },
        'text-c': { x: 40, y: 140, rotationDegrees: 0 },
      },
    });
    expect(plan.operations).toHaveLength(2);
  });

  it('resolves final-angle snap across zero and preserves edge-pan world identity', () => {
    expect(resolvePatchMapRotationSnap(350, 7, false)).toEqual({
      startDegrees: 350,
      pointerDegrees: 7,
      continuousDeltaDegrees: 17,
      appliedDegrees: 7,
      snapped: false,
    });
    expect(resolvePatchMapRotationSnap(350, 7, true)).toMatchObject({
      continuousDeltaDegrees: 17,
      appliedDegrees: 0,
      snapped: true,
    });
    expect(resolvePatchMapRotationSnap(350, 2, true)).toMatchObject({
      continuousDeltaDegrees: 12,
      appliedDegrees: 0,
    });

    const pan = resolvePatchMapEdgeAutoPan(
      [799, 300],
      [20, 0],
      [400, 300],
      1,
      [800, 600],
    );
    expect(pan.pointerWorldBefore).toEqual(pan.pointerWorldAfter);
    expect(pan).toMatchObject({
      adjustedPointerScreen: [779, 300],
      centerWorld: [420, 300],
    });
  });
});

function scene() {
  return materializePatchMapDataset([
    {
      type: 'group',
      id: 'group-a',
      children: [
        {
          type: 'item',
          id: 'item-a',
          size: { width: 100, height: 80 },
          padding: 4,
          components: [],
          attrs: { x: 10, y: 20 },
        },
        {
          type: 'rect',
          id: 'rect-b',
          size: { width: 40, height: 30 },
          fill: '#ff8800',
          attrs: { x: 160, y: 40 },
        },
      ],
      attrs: { x: 0, y: 0 },
    },
    {
      type: 'relations',
      id: 'links',
      links: [{ source: 'item-a', target: 'rect-b' }],
      style: { color: '#222222', width: 2 },
    },
    {
      type: 'image',
      id: 'image-a',
      source: 'fixture://image-a.png',
      size: { width: 80, height: 40 },
      attrs: { x: -20, y: 200 },
    },
    {
      type: 'text',
      id: 'text-c',
      text: 'Bravo',
      style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#222222' },
      size: { width: 80, height: 20 },
      attrs: { x: 40, y: 140 },
    },
  ]).dataset;
}

function oppositeAnchor(
  geometry: Readonly<{ x: number; y: number; width: number; height: number }>,
  handle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w',
): readonly [number, number] {
  const x = handle.includes('w')
    ? geometry.x + geometry.width
    : handle.includes('e')
      ? geometry.x
      : geometry.x + geometry.width / 2;
  const y = handle.includes('n')
    ? geometry.y + geometry.height
    : handle.includes('s')
      ? geometry.y
      : geometry.y + geometry.height / 2;
  return [x, y];
}
