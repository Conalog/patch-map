import { describe, expect, it } from 'vitest';

import {
  planPatchMapPaintOrder,
  type PatchMapPaintPrimitiveInput,
} from '../../src/semantic/paint-order';

describe('PatchMap semantic paint-order planner', () => {
  it('matches the exact LAY-003 initial and patched stacking orders', () => {
    const initial = stackingPrimitives();
    const callerBefore = structuredClone(initial);

    const initialPlan = planPatchMapPaintOrder(initial, {
      overlays: { selection: true, transformer: true },
    });
    const patchedPlan = planPatchMapPaintOrder(
      initial.map((entry) => entry.publicId === 'low' ? { ...entry, zIndex: 6 } : entry),
      { overlays: { selection: true, transformer: true } },
    );

    expect(initialPlan.renderOrder).toEqual([
      'low',
      'first',
      'second',
      'high',
      'selection',
      'transformer',
    ]);
    expect(patchedPlan.renderOrder).toEqual([
      'first',
      'second',
      'low',
      'high',
      'selection',
      'transformer',
    ]);
    expect(
      initialPlan.visibleEntries
        .filter((entry) => entry.zIndex === 4)
        .map((entry) => entry.publicId),
    ).toEqual(['first', 'second']);
    expect(initial).toEqual(callerBefore);
    expect(Object.isFrozen(initialPlan)).toBe(true);
    expect(Object.isFrozen(initialPlan.entries)).toBe(true);
    expect(initialPlan.entries.every(Object.isFrozen)).toBe(true);
  });

  it('keeps authored sibling order before pass order and pins overlays at the tail', () => {
    const plan = planPatchMapPaintOrder([
      primitive('later', 1, 4, 'bar', 'ordinary-geometry', { pass: 0 }),
      primitive('first-pass-one', 0, 4, 'bar', 'ordinary-geometry', { pass: 1 }),
      primitive('first-pass-zero', 0, 4, 'bar', 'ordinary-geometry', { pass: 0 }),
      primitive('very-high', 2, 1e100),
    ], {
      overlays: { selection: true, transformer: true },
    });

    expect(plan.renderOrder).toEqual([
      'first-pass-zero',
      'first-pass-one',
      'later',
      'very-high',
      'selection',
      'transformer',
    ]);
    expect(plan.entries.slice(-2).map((entry) => [
      entry.publicId,
      entry.entityId,
      entry.phase,
      entry.visible,
    ])).toEqual([
      ['selection', 'overlay:selection', 'overlay', true],
      ['transformer', 'overlay:transformer', 'overlay', true],
    ]);

    const selectionOnly = planPatchMapPaintOrder([primitive('box', 0, 0)], {
      overlays: { selection: true, transformer: false },
    });
    expect(selectionOnly.renderOrder).toEqual(['box', 'selection']);
    expect(selectionOnly.entries.at(-1)).toMatchObject({
      publicId: 'transformer',
      visible: false,
    });
  });

  it('forms only consecutive cross-kind-safe runs and splits every run at the bound', () => {
    const plan = planPatchMapPaintOrder([
      primitive('rect-a', 0, 0),
      primitive('rect-b', 1, 0),
      primitive('image', 2, 0, 'image', 'content-assets'),
      primitive('rect-c', 3, 0),
      primitive('rect-d', 4, 0),
      primitive('rect-e', 5, 0),
    ], { runLimit: 2 });

    expect(plan.renderOrder).toEqual([
      'rect-a',
      'rect-b',
      'image',
      'rect-c',
      'rect-d',
      'rect-e',
    ]);
    expect(plan.runs.map((run) => ({
      kind: run.kind,
      lane: run.lane,
      start: run.start,
      endExclusive: run.endExclusive,
      count: run.count,
    }))).toEqual([
      { kind: 'rect', lane: 'ordinary-geometry', start: 0, endExclusive: 2, count: 2 },
      { kind: 'image', lane: 'content-assets', start: 2, endExclusive: 3, count: 1 },
      { kind: 'rect', lane: 'ordinary-geometry', start: 3, endExclusive: 5, count: 2 },
      { kind: 'rect', lane: 'ordinary-geometry', start: 5, endExclusive: 6, count: 1 },
    ]);
    expect(plan.runs.every(Object.isFrozen)).toBe(true);
  });

  it('keeps invisible records inspectable without emitting paint work', () => {
    const plan = planPatchMapPaintOrder([
      primitive('visible', 0, 0),
      { ...primitive('hidden', 1, 1), visible: false },
    ]);

    expect(plan.entries.map((entry) => [entry.publicId, entry.visible])).toEqual([
      ['visible', true],
      ['hidden', false],
      ['selection', false],
      ['transformer', false],
    ]);
    expect(plan.renderOrder).toEqual(['visible']);
    expect(plan.runs).toHaveLength(1);
  });
});

function stackingPrimitives(): PatchMapPaintPrimitiveInput[] {
  return [
    primitive('low', 0, -1),
    primitive('first', 1, 4),
    primitive('second', 2, 4),
    primitive('high', 3, 10),
  ];
}

function primitive(
  id: string,
  authoredOrder: number,
  zIndex: number,
  kind: PatchMapPaintPrimitiveInput['kind'] = 'rect',
  lane: PatchMapPaintPrimitiveInput['lane'] = 'ordinary-geometry',
  overrides: Partial<PatchMapPaintPrimitiveInput> = {},
): PatchMapPaintPrimitiveInput {
  return {
    publicId: id,
    entityId: `dense:${id}`,
    kind,
    lane,
    zIndex,
    authoredOrder,
    pass: 0,
    visible: true,
    compatibilityKey: 'normal',
    ...overrides,
  };
}
