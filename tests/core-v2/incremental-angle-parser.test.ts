import { describe, expect, it } from 'vitest';

import {
  parsePatchMapV010DirectElementAngleBatch,
} from '../../src/core-v2/incremental-parser';
import { parsePatchMapV010 } from '../../src/core-v2/parser';
import { materializeCoreV2Dataset } from '../../src/core-v2/semantic/dataset';
import { planCoreV2BulkPatch } from '../../src/core-v2/semantic/transaction';

describe('Core v2 direct element-angle projection', () => {
  it('matches canonical flat-root geometry across repeated owned batches', () => {
    const source = angleScene();
    const before = JSON.stringify(source);
    const current = materializeCoreV2Dataset(source);
    const parsed = parsePatchMapV010(current.dataset);
    const firstPlan = planCoreV2BulkPatch(current, {
      strict: true,
      actionId: 'angle-17',
      targets: current.rootIds.map((id) => ({ kind: 'element' as const, id })),
      changes: [{ path: ['attrs', 'angle'], value: 17 }],
    });
    expect(firstPlan.status).toBe('planned');
    if (
      firstPlan.status !== 'planned' ||
      firstPlan.directElementAngleUpdates === undefined
    ) {
      throw new Error('Expected a direct angle plan');
    }

    const first = parsePatchMapV010DirectElementAngleBatch(
      firstPlan.candidate.dataset,
      current.dataset,
      parsed,
      firstPlan.directElementAngleUpdates,
    );
    expect(first).not.toBeNull();
    assertCanonicalAngleProjection(
      first!,
      parsePatchMapV010(firstPlan.candidate.dataset),
    );

    const secondPlan = planCoreV2BulkPatch(firstPlan.candidate, {
      strict: true,
      actionId: 'angle-minus-11',
      targets: firstPlan.candidate.rootIds.map((id) => ({
        kind: 'element' as const,
        id,
      })),
      changes: [{ path: ['attrs', 'angle'], value: -11 }],
    });
    expect(secondPlan.status).toBe('planned');
    if (
      secondPlan.status !== 'planned' ||
      secondPlan.directElementAngleUpdates === undefined
    ) {
      throw new Error('Expected a repeated direct angle plan');
    }
    const second = parsePatchMapV010DirectElementAngleBatch(
      secondPlan.candidate.dataset,
      firstPlan.candidate.dataset,
      first!,
      secondPlan.directElementAngleUpdates,
    );
    expect(second).not.toBeNull();
    assertCanonicalAngleProjection(
      second!,
      parsePatchMapV010(secondPlan.candidate.dataset),
    );
    expect(JSON.stringify(source)).toBe(before);
  });

  it('falls back before publication when relations or unrelated root fields change', () => {
    const current = materializeCoreV2Dataset([
      ...angleScene(),
      {
        type: 'relations',
        id: 'links',
        links: [{ source: 'item-a', target: 'item-b' }],
      },
    ]);
    const parsed = parsePatchMapV010(current.dataset);
    const plan = planCoreV2BulkPatch(current, {
      strict: true,
      targets: [{ kind: 'element', id: 'item-a' }],
      changes: [{ path: ['attrs', 'angle'], value: 9 }],
    });
    expect(plan.status).toBe('planned');
    if (
      plan.status !== 'planned' ||
      plan.directElementAngleUpdates === undefined
    ) {
      throw new Error('Expected a direct angle plan');
    }
    expect(parsePatchMapV010DirectElementAngleBatch(
      plan.candidate.dataset,
      current.dataset,
      parsed,
      plan.directElementAngleUpdates,
    )).toBeNull();

    const unrelated = structuredClone(plan.candidate.dataset);
    const first = unrelated[0] as Record<string, unknown>;
    first.label = 'changed outside the angle batch';
    expect(parsePatchMapV010DirectElementAngleBatch(
      unrelated,
      current.dataset,
      parsePatchMapV010(current.dataset.slice(0, -1)),
      plan.directElementAngleUpdates,
    )).toBeNull();
  });
});

function assertCanonicalAngleProjection(
  actual: ReturnType<typeof parsePatchMapV010>,
  expected: ReturnType<typeof parsePatchMapV010>,
): void {
  expect(actual.diagnostics).toEqual(expected.diagnostics);
  expect(actual.identity).toEqual(expected.identity);
  expect(actual.document.entities).toHaveLength(expected.document.entities.length);
  actual.document.entities.forEach((entity, index) => {
    const candidate = expected.document.entities[index]!;
    if (entity.kind === 'relation' || candidate.kind === 'relation') {
      throw new Error('Direct flat-angle projection cannot contain relations');
    }
    expect(withoutGeometry(entity)).toEqual(withoutGeometry(candidate));
    expect(entity.x).toBeCloseTo(candidate.x, 9);
    expect(entity.y).toBeCloseTo(candidate.y, 9);
    expect(entity.width).toBeCloseTo(candidate.width, 9);
    expect(entity.height).toBeCloseTo(candidate.height, 9);
    expect(entity.rotation ?? 0).toBeCloseTo(candidate.rotation ?? 0, 9);
  });
  expect(Object.keys(actual.projection.byEntityId)).toEqual(
    Object.keys(expected.projection.byEntityId),
  );
  for (const entityId of Object.keys(actual.projection.byEntityId)) {
    const projection = actual.projection.byEntityId[entityId]!;
    const candidate = expected.projection.byEntityId[entityId]!;
    expect(withoutProjectionGeometry(projection)).toEqual(
      withoutProjectionGeometry(candidate),
    );
    projection.affine.forEach((value, index) => {
      expect(value).toBeCloseTo(candidate.affine[index]!, 9);
    });
    projection.worldBasis.forEach((value, index) => {
      expect(value).toBeCloseTo(candidate.worldBasis[index]!, 9);
    });
    projection.visibleCenter.forEach((value, index) => {
      expect(value).toBeCloseTo(candidate.visibleCenter[index]!, 9);
    });
    expect(projection.rotationDegrees).toBeCloseTo(
      candidate.rotationDegrees,
      9,
    );
  }
  expect({
    ...actual.projection,
    byEntityId: undefined,
  }).toEqual({
    ...expected.projection,
    byEntityId: undefined,
  });
}

function withoutGeometry(value: object): Readonly<Record<string, unknown>> {
  const record = { ...value } as Record<string, unknown>;
  delete record.x;
  delete record.y;
  delete record.width;
  delete record.height;
  delete record.rotation;
  return record;
}

function withoutProjectionGeometry(
  value: object,
): Readonly<Record<string, unknown>> {
  const record = { ...value } as Record<string, unknown>;
  delete record.affine;
  delete record.worldBasis;
  delete record.visibleCenter;
  delete record.rotationDegrees;
  return record;
}

function angleScene(): readonly Readonly<Record<string, unknown>>[] {
  return [
    {
      type: 'item',
      id: 'item-a',
      label: 'A',
      size: { width: 100, height: 80 },
      padding: 4,
      contentOrientation: 'follow-item',
      attrs: { x: 10, y: 20, scaleX: -1, scaleY: 1 },
      components: [
        {
          type: 'background',
          id: 'bg',
          source: { type: 'rect', fill: '#e2e8f0ff' },
        },
        {
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: '#22c55eff' },
          size: { width: 80, height: 20 },
          placement: 'bottom',
        },
        {
          type: 'text',
          id: 'label',
          text: '42',
          placement: 'center',
          style: { fontFamily: 'FiraCode', fontSize: 12, fill: '#0f172aff' },
        },
      ],
    },
    {
      type: 'item',
      id: 'item-b',
      label: 'B',
      size: { width: 60, height: 50 },
      contentOrientation: 'upright',
      attrs: { x: 180, y: 30, angle: 3 },
      components: [{
        type: 'background',
        id: 'bg',
        source: { type: 'rect', fill: '#f97316ff' },
      }],
    },
    {
      type: 'text',
      id: 'text-c',
      text: '성능 5000',
      attrs: { x: 300, y: 40 },
      style: { fontFamily: 'Unifont', fontSize: 14, fill: '#111827ff' },
    },
  ];
}
