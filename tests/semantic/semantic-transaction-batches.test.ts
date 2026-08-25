import { describe, expect, it } from 'vitest';

import {
  materializePatchMapDataset,
  type PatchMapComponent,
  type PatchMapElement,
  type PatchMapItemElement,
  type MaterializedPatchMapDataset,
} from '../../src/semantic/dataset';
import {
  planPatchMapBarHeightBatch,
  planPatchMapBulkPatch,
  planPatchMapTextBatch,
} from '../../src/semantic/transaction';

describe('PatchMap staged semantic transaction planner', () => {
  it('plans a compact typed-array bar batch without mutating caller input', () => {
    const current = materializePatchMapDataset([
      {
        type: 'item',
        id: 'item-a',
        size: { width: 100, height: 80 },
        components: [barComponent('bar-a', '#2563ebff')],
      },
      {
        type: 'item',
        id: 'item-b',
        size: { width: 100, height: 80 },
        components: [barComponent('bar-b', '#ef4444ff')],
      },
    ]);
    const targets = Object.freeze([
      Object.freeze({ ownerId: 'item-a', componentId: 'bar-a' }),
      Object.freeze({ ownerId: 'item-b', componentId: 'bar-b' }),
    ]);
    const heights = new Float64Array([42, 10]);
    const before = JSON.stringify(current);

    const result = planPatchMapBarHeightBatch(current, {
      targets,
      heights,
      actionId: 'compact-bars',
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected planned bar batch');
    expect(result).toMatchObject({
      changed: true,
      actionId: 'compact-bars',
      operations: [],
      applied: [{ kind: 'component', ownerId: 'item-a', id: 'bar-a' }],
      unchanged: [{ kind: 'component', ownerId: 'item-b', id: 'bar-b' }],
      summary: { appliedCount: 1, missingCount: 0, unchangedCount: 1 },
      directBarHeightUpdates: [
        { ownerId: 'item-a', componentId: 'bar-a', height: 42 },
      ],
    });
    expect(requireComponent(result.candidate, 'item-a', 'bar-a'))
      .toMatchObject({ size: { width: 60, height: 42 } });
    expect(JSON.stringify(current)).toBe(before);
    expect(targets).toEqual([
      { ownerId: 'item-a', componentId: 'bar-a' },
      { ownerId: 'item-b', componentId: 'bar-b' },
    ]);
    expect([...heights]).toEqual([42, 10]);
  });

  it('plans an ordered mixed animation column only for changed true targets', () => {
    const current = materializePatchMapDataset([
      {
        type: 'item',
        id: 'item-a',
        size: { width: 100, height: 80 },
        components: [barComponent('bar-a', '#2563ebff')],
      },
      {
        type: 'item',
        id: 'item-b',
        size: { width: 100, height: 80 },
        components: [barComponent('bar-b', '#ef4444ff')],
      },
    ]);
    const request = Object.freeze({
      targets: Object.freeze([
        Object.freeze({ ownerId: 'item-a', componentId: 'bar-a' }),
        Object.freeze({ ownerId: 'item-b', componentId: 'bar-b' }),
      ]),
      heights: new Float64Array([42, 28]),
      animate: Object.freeze([false, true]),
    });

    const result = planPatchMapBarHeightBatch(current, request);
    expect(result).toMatchObject({
      status: 'planned',
      changed: true,
      animatedBarTargets: [{ ownerId: 'item-b', componentId: 'bar-b' }],
      directBarHeightUpdates: [
        { ownerId: 'item-a', componentId: 'bar-a', height: 42 },
        { ownerId: 'item-b', componentId: 'bar-b', height: 28 },
      ],
    });
    expect(request.animate).toEqual([false, true]);

    expect(planPatchMapBarHeightBatch(current, {
      ...request,
      animate: [true],
    })).toMatchObject({
      status: 'rejected',
      changed: false,
      candidate: null,
      diagnostic: { path: '$.animate' },
    });
  });

  it('rejects a late missing or duplicate compact bar target atomically', () => {
    const current = materializePatchMapDataset([{
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      components: [barComponent('bar-a', '#2563ebff')],
    }]);

    for (const request of [
      {
        targets: [
          { ownerId: 'item-a', componentId: 'bar-a' },
          { ownerId: 'missing', componentId: 'bar' },
        ],
        heights: new Float64Array([42, 18]),
      },
      {
        targets: [
          { ownerId: 'item-a', componentId: 'bar-a' },
          { ownerId: 'item-a', componentId: 'bar-a' },
        ],
        heights: new Float64Array([42, 18]),
      },
    ]) {
      const result = planPatchMapBarHeightBatch(current, request);
      expect(result).toMatchObject({
        status: 'rejected',
        changed: false,
        candidate: null,
      });
      expect(current.semanticHash).toBe(
        materializePatchMapDataset(current.dataset).semanticHash,
      );
      expect(requireComponent(current, 'item-a', 'bar-a'))
        .toMatchObject({ size: { height: 10 } });
    }
  });

  it('plans a compact text batch with structural sharing and atomic rejection', () => {
    const current = materializePatchMapDataset([
      {
        type: 'item',
        id: 'item-a',
        size: { width: 100, height: 80 },
        components: [
          barComponent('bar-a', '#2563ebff'),
          textComponent('label-a', 'Alpha'),
        ],
      },
      {
        type: 'item',
        id: 'item-b',
        size: { width: 100, height: 80 },
        components: [textComponent('label-b', 'Bravo')],
      },
    ]);
    const targets = Object.freeze([
      Object.freeze({ ownerId: 'item-a', componentId: 'label-a' }),
      Object.freeze({ ownerId: 'item-b', componentId: 'label-b' }),
    ]);
    const texts = Object.freeze(['Changed', 'Bravo']);
    const styles = Object.freeze([
      Object.freeze({ fontSize: 22, fill: '#123456ff' }),
      Object.freeze({}),
    ]);
    const before = JSON.stringify(current);

    const result = planPatchMapTextBatch(current, {
      targets,
      texts,
      styles,
      actionId: 'compact-texts',
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected planned text batch');
    expect(result).toMatchObject({
      changed: true,
      actionId: 'compact-texts',
      operations: [],
      applied: [{ kind: 'component', ownerId: 'item-a', id: 'label-a' }],
      unchanged: [{ kind: 'component', ownerId: 'item-b', id: 'label-b' }],
      summary: { appliedCount: 1, missingCount: 0, unchangedCount: 1 },
      directTextUpdates: [
        { ownerId: 'item-a', componentId: 'label-a', text: 'Changed' },
      ],
    });
    expect(requireComponent(result.candidate, 'item-a', 'label-a'))
      .toMatchObject({
        text: 'Changed',
        style: { fontSize: 22, fill: '#123456ff' },
      });
    expect(result.candidate.dataset[1]).toBe(current.dataset[1]);
    expect(JSON.stringify(current)).toBe(before);
    expect(targets).toEqual([
      { ownerId: 'item-a', componentId: 'label-a' },
      { ownerId: 'item-b', componentId: 'label-b' },
    ]);
    expect(texts).toEqual(['Changed', 'Bravo']);
    expect(styles).toEqual([
      { fontSize: 22, fill: '#123456ff' },
      {},
    ]);

    const rejected = planPatchMapTextBatch(current, {
      targets: [
        { ownerId: 'item-a', componentId: 'label-a' },
        { ownerId: 'missing', componentId: 'label' },
      ],
      texts: ['Tentative', 'Never published'],
    });
    expect(rejected).toMatchObject({
      status: 'rejected',
      changed: false,
      candidate: null,
      diagnostic: { code: 'MISSING_TARGET', operationIndex: 1 },
    });
    expect(requireComponent(current, 'item-a', 'label-a'))
      .toMatchObject({ text: 'Alpha' });

    expect(planPatchMapTextBatch(current, {
      targets: [{ ownerId: 'item-a', componentId: 'label-a' }],
      texts: ['Tentative'],
      styles: [{ fontSize: -1 }],
    })).toMatchObject({
      status: 'rejected',
      changed: false,
      diagnostic: {
        code: 'INVALID_VALUE',
        path: '$.styles[0].fontSize',
      },
    });
  });

  it('rejects accessor-backed direct batch arrays without invoking caller code', () => {
    let accessorReads = 0;
    const targets = [] as unknown[];
    Object.defineProperty(targets, 0, {
      enumerable: true,
      configurable: true,
      get() {
        accessorReads += 1;
        return { ownerId: 'item-a', componentId: 'bar' };
      },
    });

    expect(planPatchMapBarHeightBatch(makeScene(), {
      targets,
      heights: [20],
    })).toMatchObject({ status: 'rejected', diagnostic: { code: 'INVALID_VALUE' } });
    expect(planPatchMapTextBatch(makeScene(), {
      targets,
      texts: ['value'],
    })).toMatchObject({ status: 'rejected', diagnostic: { code: 'INVALID_VALUE' } });
    expect(accessorReads).toBe(0);
  });

  it('rejects accessor-backed text styles without invoking nested caller code', () => {
    let accessorReads = 0;
    const style = Object.defineProperty({}, 'fontSize', {
      enumerable: true,
      configurable: true,
      get() {
        accessorReads += 1;
        return 20;
      },
    });

    expect(planPatchMapTextBatch(makeScene(), {
      targets: [{ ownerId: 'item-a', componentId: 'label' }],
      texts: ['updated'],
      styles: [style],
    })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'NON_SERIALIZABLE_VALUE' },
    });
    expect(accessorReads).toBe(0);
  });

  it('validates an empty bulk target set as a detached product no-op', () => {
    const current = makeScene();
    const request = Object.freeze({
      strict: true,
      actionId: 'empty-target-set',
      targets: Object.freeze([]),
      changes: Object.freeze([
        Object.freeze({ path: Object.freeze(['attrs', 'x']), value: 200 }),
      ]),
    });

    const result = planPatchMapBulkPatch(current, request);

    expect(result).toMatchObject({
      status: 'planned',
      changed: false,
      actionId: 'empty-target-set',
      operations: [],
      applied: [],
      missing: [],
      unchanged: [],
      summary: { appliedCount: 0, missingCount: 0, unchangedCount: 0 },
    });
    expect(result.status === 'planned' ? result.candidate : null).toBe(current);
    expect(planPatchMapBulkPatch(current, {
      strict: true,
      targets: [],
      changes: [{ path: ['__proto__'], value: 1 }],
    })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_PATH' },
    });
  });

  it('normalizes a multi-root flat bulk candidate as one exact owned batch', () => {
    const current = materializePatchMapDataset([
      {
        type: 'rect',
        id: 'rect-a',
        size: { width: 40, height: 20 },
        fill: '#2563ebff',
        attrs: { x: 10, y: 20 },
      },
      {
        type: 'rect',
        id: 'rect-b',
        size: { width: 50, height: 30 },
        fill: '#ef4444ff',
        attrs: { x: 70, y: 40 },
      },
      {
        type: 'rect',
        id: 'rect-c',
        size: { width: 60, height: 40 },
        fill: '#22c55eff',
        attrs: { x: 130, y: 60 },
      },
    ]);

    const result = planPatchMapBulkPatch(current, {
      strict: true,
      actionId: 'rotate-flat-roots',
      targets: current.rootIds.map((id) => ({ kind: 'element' as const, id })),
      changes: [{ path: ['attrs', 'angle'], value: 7 }],
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected planned flat bulk patch');
    expect(result).toMatchObject({
      changed: true,
      applied: [
        { kind: 'element', id: 'rect-a' },
        { kind: 'element', id: 'rect-b' },
        { kind: 'element', id: 'rect-c' },
      ],
      directElementAngleUpdates: [
        { id: 'rect-a', angle: 7 },
        { id: 'rect-b', angle: 7 },
        { id: 'rect-c', angle: 7 },
      ],
      summary: { appliedCount: 3, missingCount: 0, unchangedCount: 0 },
    });
    expect(result.candidate.dataset.map(({ attrs }) => attrs?.angle)).toEqual([7, 7, 7]);
    expect(result.candidate.semanticHash).toBe(
      materializePatchMapDataset(result.candidate.dataset).semanticHash,
    );
    expect(current.dataset.map(({ attrs }) => attrs?.angle)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

function textComponent(id: string, text: string): {
  type: 'text';
  id: string;
  text: string;
  placement: 'center';
  style: { fontFamily: string; fontSize: number; fill: string };
} {
  return {
    type: 'text',
    id,
    text,
    placement: 'center',
    style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#111111' },
  };
}

function barComponent(id: string, fill: string): Readonly<Record<string, unknown>> {
  return {
    type: 'bar',
    id,
    source: { type: 'rect', fill },
    size: { width: 60, height: 10 },
    placement: 'bottom',
    animation: true,
    animationDuration: 200,
  };
}

function backgroundComponent(id: string, fill: string): Readonly<Record<string, unknown>> {
  return { type: 'background', id, source: { type: 'rect', fill } };
}

function makeScene(): MaterializedPatchMapDataset {
  return materializePatchMapDataset([
    {
      type: 'group',
      id: 'root',
      children: [
        {
          type: 'item',
          id: 'item-a',
          size: { width: 120, height: 80 },
          padding: { top: 3, right: 4, bottom: 5, left: 6 },
          attrs: { position: { x: 20, y: 30 } },
          components: [
            backgroundComponent('bg', '#336699'),
            {
              type: 'bar',
              id: 'bar',
              source: { type: 'rect', fill: '#2563ebff' },
              size: { width: 60, height: 12 },
              attrs: {
                telemetry: { enabled: true, sample: 1 },
                tags: ['initial', 'retained'],
              },
            },
            {
              type: 'icon',
              id: 'icon',
              source: 'icon.png',
              size: 16,
            },
            textComponent('label', 'Alpha'),
            { ...textComponent('hidden-label', 'Hidden'), show: false },
          ],
        },
        {
          type: 'item',
          id: 'item-b',
          size: { width: 100, height: 60 },
          components: [barComponent('bar', '#ef4444ff')],
        },
        {
          type: 'rect',
          id: 'rect-b',
          size: { width: 40, height: 30 },
          fill: '#ff0000',
          attrs: { x: 160, y: 40, tags: ['original'] },
        },
        {
          type: 'group',
          id: 'nested',
          children: [
            {
              type: 'rect',
              id: 'nested-rect',
              size: { width: 10, height: 10 },
            },
          ],
        },
      ],
    },
  ]);
}

function requireItem(materialized: MaterializedPatchMapDataset, id: string): PatchMapItemElement {
  const element = requireElement(materialized.dataset, id);
  if (element.type !== 'item') throw new Error(`Expected item ${id}`);
  return element;
}

function requireComponent(
  materialized: MaterializedPatchMapDataset,
  ownerId: string,
  id: string,
): PatchMapComponent {
  const component = requireItem(materialized, ownerId).components.find((entry) => entry.id === id);
  if (component === undefined) throw new Error(`Missing component ${ownerId}/${id}`);
  return component;
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
