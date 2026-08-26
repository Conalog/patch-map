import { describe, expect, it } from 'vitest';

import {
  materializePatchMapDataset,
  type PatchMapComponent,
  type PatchMapElement,
  type PatchMapItemElement,
  type MaterializedPatchMapDataset,
} from '../../src/semantic/dataset';
import { applyPatchMapSemanticPatch } from '../../src/semantic/mutation';

describe('PatchMap pure semantic mutation candidate', () => {
  it('patches a nested element by stable ID while retaining hierarchy and sibling values', () => {
    const current = makeMaterializedScene();
    const before = JSON.stringify(current);
    const patch = {
      label: 'Primary item',
      size: { height: 90 },
      padding: { top: 12 },
      attrs: { position: { y: 7 }, telemetry: { sample: 2 } },
    };
    const patchBefore = JSON.stringify(patch);

    const result = applyPatchMapSemanticPatch(
      current,
      { kind: 'element', id: 'item-a' },
      patch,
    );

    expect(result.status).toBe('changed');
    if (result.status !== 'changed') throw new Error('Expected changed semantic candidate');
    const item = requireItem(result.candidate, 'item-a');
    expect(item).toMatchObject({
      id: 'item-a',
      type: 'item',
      label: 'Primary item',
      size: { width: 120, height: 90 },
      padding: { top: 12, right: 4, bottom: 5, left: 6 },
      attrs: {
        position: { x: 3, y: 7 },
        telemetry: { enabled: true, sample: 2 },
      },
    });
    expect(requireItem(result.candidate, 'item-b')).toEqual(requireItem(current, 'item-b'));
    expect(elementIds(result.candidate.dataset)).toEqual(elementIds(current.dataset));
    expect(JSON.stringify(current)).toBe(before);
    expect(JSON.stringify(patch)).toBe(patchBefore);
  });

  it('patches an owner-local component without changing its logical identity or peer owner', () => {
    const current = makeMaterializedScene();
    const patch = {
      size: { height: 30 },
      source: {
        fill: '#22c55eff',
        radius: { topLeft: 8 },
      },
      attrs: { channel: { value: 9 } },
    };

    const result = applyPatchMapSemanticPatch(
      current,
      { kind: 'component', ownerId: 'item-a', id: 'bar' },
      patch,
    );

    expect(result.status).toBe('changed');
    if (result.status !== 'changed') throw new Error('Expected changed component candidate');
    const changed = requireComponent(result.candidate, 'item-a', 'bar');
    expect(changed).toMatchObject({
      id: 'bar',
      type: 'bar',
      size: { width: '50%', height: 30 },
      source: {
        type: 'rect',
        fill: '#22c55eff',
        borderWidth: 2,
        borderColor: '#111827ff',
        radius: { topLeft: 8, topRight: 2, bottomRight: 3, bottomLeft: 4 },
      },
      attrs: { channel: { name: 'level', value: 9 } },
    });
    expect(requireComponent(result.candidate, 'item-b', 'bar')).toEqual(
      requireComponent(current, 'item-b', 'bar'),
    );
    expect(changed.id).toBe('bar');
    expect(result.target).toEqual({ kind: 'component', ownerId: 'item-a', id: 'bar' });
  });

  it('deep-merges text style and does not retain mutable aliases from the patch', () => {
    const current = makeMaterializedScene();
    const patch = {
      style: {
        fontSize: '12px',
        dropShadow: { blur: 7 },
      },
    };

    const result = applyPatchMapSemanticPatch(
      current,
      { kind: 'component', ownerId: 'item-a', id: 'label' },
      patch,
    );

    expect(result.status).toBe('changed');
    if (result.status !== 'changed') throw new Error('Expected changed style candidate');
    patch.style.dropShadow.blur = 99;
    const label = requireComponent(result.candidate, 'item-a', 'label');
    expect(label.type).toBe('text');
    if (label.type !== 'text') throw new Error('Expected text component');
    expect(label.style).toMatchObject({
      fontFamily: 'Inter',
      fontSize: '12px',
      fill: '#f9fafbff',
      dropShadow: {
        color: '#000000ff',
        alpha: 0.5,
        angle: 45,
        blur: 7,
        distance: 3,
      },
    });
    expect(Object.isFrozen(label.style)).toBe(true);
    expect(Object.isFrozen(label.style.dropShadow)).toBe(true);
  });

  it('returns a detached deterministic candidate for empty and semantically equal no-ops', () => {
    const current = makeMaterializedScene();

    const first = applyPatchMapSemanticPatch(
      current,
      { kind: 'element', id: 'item-a' },
      {},
    );
    const second = applyPatchMapSemanticPatch(
      current,
      { kind: 'element', id: 'item-a' },
      { show: true },
    );

    expect(first.status).toBe('unchanged');
    expect(second.status).toBe('unchanged');
    if (first.status !== 'unchanged' || second.status !== 'unchanged') {
      throw new Error('Expected deterministic no-op candidates');
    }
    expect(first.candidate).not.toBe(current);
    expect(first.candidate.dataset).not.toBe(current.dataset);
    expect(first.candidate.dataset).toEqual(current.dataset);
    expect(first.candidate.semanticHash).toBe(current.semanticHash);
    expect(second.candidate.semanticHash).toBe(first.candidate.semanticHash);
    expect(Object.isFrozen(first.candidate)).toBe(true);
    expect(Object.isFrozen(first.candidate.dataset)).toBe(true);
  });

  it('reports missing and ambiguous targets without publishing a candidate', () => {
    const current = makeMaterializedScene();
    const missing = applyPatchMapSemanticPatch(
      current,
      { kind: 'component', ownerId: 'item-a', id: 'missing' },
      { show: false },
    );
    const root = requireElement(current.dataset, 'root');
    const ambiguousCurrent = Object.freeze({
      ...current,
      dataset: Object.freeze([root, root]),
    }) as MaterializedPatchMapDataset;
    const ambiguous = applyPatchMapSemanticPatch(
      ambiguousCurrent,
      { kind: 'element', id: 'root' },
      { show: false },
    );

    expect(missing).toMatchObject({
      status: 'rejected',
      changed: false,
      candidate: null,
      diagnostic: { reason: 'missing-target', path: '$.target' },
    });
    expect(ambiguous).toMatchObject({
      status: 'rejected',
      changed: false,
      candidate: null,
      diagnostic: { reason: 'ambiguous-target', path: '$.target' },
    });
  });

  it.each([
    ['id', 'replacement'],
    ['type', 'rect'],
    ['parent', null],
    ['children', []],
    ['components', []],
  ] as const)('rejects structural patch field %s', (field, value) => {
    const result = applyPatchMapSemanticPatch(
      makeMaterializedScene(),
      { kind: 'element', id: 'item-a' },
      { [field]: value },
    );

    expect(result).toMatchObject({
      status: 'rejected',
      changed: false,
      candidate: null,
      diagnostic: {
        reason: 'unsupported-structure',
        path: `$.patch.${field}`,
      },
    });
  });

  it('rejects executable and extended target records without invoking accessors', () => {
    const current = makeMaterializedScene();
    let accessorReads = 0;
    const accessorTarget = Object.defineProperties({}, {
      kind: {
        enumerable: true,
        get: () => {
          accessorReads += 1;
          return 'element';
        },
      },
      id: { enumerable: true, value: 'item-a' },
    });
    const symbolTarget = { kind: 'element', id: 'item-a' };
    Object.defineProperty(symbolTarget, Symbol('executable'), {
      enumerable: true,
      value: 'hidden',
    });
    const hiddenTarget = { kind: 'element' };
    Object.defineProperty(hiddenTarget, 'id', {
      enumerable: false,
      value: 'item-a',
    });

    for (const [target, path] of [
      [accessorTarget, '$.target.kind'],
      [symbolTarget, '$.target'],
      [hiddenTarget, '$.target.id'],
      [{ kind: 'element', id: 'item-a', extra: true }, '$.target.extra'],
    ] as const) {
      expect(applyPatchMapSemanticPatch(
        current,
        target as unknown as Parameters<typeof applyPatchMapSemanticPatch>[1],
        {},
      )).toMatchObject({
        status: 'rejected',
        changed: false,
        candidate: null,
        diagnostic: { reason: 'invalid-target', path },
      });
    }
    expect(accessorReads).toBe(0);
  });

  it('rejects executable and extended patch JSON without invoking accessors', () => {
    const current = makeMaterializedScene();
    let accessorReads = 0;
    const accessorPatch = Object.defineProperty({}, 'show', {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return false;
      },
    });
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, 0, {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return 1;
      },
    });
    const symbolPatch = { show: false };
    Object.defineProperty(symbolPatch, Symbol('executable'), {
      enumerable: true,
      value: 'hidden',
    });
    const sparseArray = new Array<unknown>(1);
    const extraArray = [1];
    Object.defineProperty(extraArray, 'extra', {
      enumerable: true,
      value: 2,
    });

    for (const [patch, path] of [
      [accessorPatch, '$.patch.show'],
      [{ attrs: { values: accessorArray } }, '$.patch.attrs.values[0]'],
      [symbolPatch, '$.patch'],
      [{ attrs: { values: sparseArray } }, '$.patch.attrs.values[0]'],
      [{ attrs: { values: extraArray } }, '$.patch.attrs.values.extra'],
    ] as const) {
      expect(applyPatchMapSemanticPatch(
        current,
        { kind: 'element', id: 'item-a' },
        patch,
      )).toMatchObject({
        status: 'rejected',
        changed: false,
        candidate: null,
        diagnostic: { reason: 'invalid-value', path },
      });
    }
    expect(accessorReads).toBe(0);
  });

  it('reports invalid JSON and schema values with precise structured diagnostics', () => {
    const current = makeMaterializedScene();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const invalidJson = [
      { attrs: { value: Number.NaN } },
      { attrs: { value: undefined } },
      { attrs: { value: (): void => undefined } },
      { attrs: cyclic },
      JSON.parse('{"attrs":{"__proto__":{"polluted":true}}}') as unknown,
    ];

    invalidJson.forEach((patch) => {
      const result = applyPatchMapSemanticPatch(
        current,
        { kind: 'element', id: 'item-a' },
        patch,
      );
      expect(result).toMatchObject({
        status: 'rejected',
        changed: false,
        candidate: null,
        diagnostic: { reason: 'invalid-value' },
      });
    });

    const invalidCandidate = applyPatchMapSemanticPatch(
      current,
      { kind: 'element', id: 'item-a' },
      { size: { height: -1 } },
    );
    expect(invalidCandidate).toMatchObject({
      status: 'rejected',
      changed: false,
      candidate: null,
      diagnostic: {
        reason: 'invalid-candidate',
        datasetCode: 'INVALID_VALUE',
      },
    });
  });
});

function makeMaterializedScene(): MaterializedPatchMapDataset {
  return materializePatchMapDataset([
    {
      type: 'group',
      id: 'root',
      attrs: { section: 'primary' },
      children: [
        {
          type: 'item',
          id: 'item-a',
          label: 'Original item',
          size: { width: 120, height: 80 },
          padding: { top: 3, right: 4, bottom: 5, left: 6 },
          attrs: {
            position: { x: 3, y: 4 },
            telemetry: { enabled: true, sample: 1 },
          },
          components: [
            {
              type: 'bar',
              id: 'bar',
              source: {
                type: 'rect',
                fill: '#2563ebff',
                borderWidth: 2,
                borderColor: '#111827ff',
                radius: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 },
              },
              size: { width: '50%', height: 12 },
              attrs: { channel: { name: 'level', value: 4 } },
            },
            {
              type: 'text',
              id: 'label',
              text: 'A',
              style: {
                fontFamily: 'Inter',
                fontSize: 14,
                fill: '#f9fafbff',
                dropShadow: {
                  color: '#000000ff',
                  alpha: 0.5,
                  angle: 45,
                  blur: 2,
                  distance: 3,
                },
              },
            },
          ],
        },
        {
          type: 'item',
          id: 'item-b',
          size: { width: 100, height: 60 },
          components: [
            {
              type: 'bar',
              id: 'bar',
              source: { type: 'rect', fill: '#ef4444ff' },
              size: { width: 40, height: 8 },
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
  const owner = requireItem(materialized, ownerId);
  const component = owner.components.find((entry) => entry.id === id);
  if (component === undefined) throw new Error(`Missing component ${ownerId}/${id}`);
  return component;
}

function requireElement(elements: readonly PatchMapElement[], id: string): PatchMapElement {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElement(element.children, id);
      if (nested !== undefined) return nested;
    }
  }
  throw new Error(`Missing element ${id}`);
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

function elementIds(elements: readonly PatchMapElement[]): readonly string[] {
  const result: string[] = [];
  for (const element of elements) {
    result.push(element.id);
    if (element.type === 'group') result.push(...elementIds(element.children));
  }
  return result;
}
