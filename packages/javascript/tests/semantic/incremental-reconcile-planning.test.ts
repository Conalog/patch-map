import { describe, expect, it } from 'vitest';

import {
  assembleOwnedPatchMapDataset,
  materializePatchMapDataset,
} from '../../src/semantic/dataset';
import type { PatchMapMutationOperation } from '../../src/semantic/transaction';
import {
  componentOrderOwners,
  directAnimatedBarTargets,
  directBarHeightUpdatesFor,
  historyReconcileOrderScope,
  incrementalBarHeightRootIds,
  incrementalFlatRootIds,
  incrementalOwnedRootIds,
  operationsMayChangeElementStructure,
  operationsOnlyUpdateBarSize,
  operationsOnlyUpdateElementGeometry,
} from '../../src/engine/reconcile-planning';
import { indexComponentSemantics } from '../../src/engine/semantic-index';

describe('incremental reconcile planning', () => {
  it('authorizes only root and component orders changed across history boundaries', () => {
    const before = materializePatchMapDataset([
      itemRecord('item-a', [barComponent(), textComponent()]),
      rectRecord('rect-b', 100),
    ]).dataset;
    const after = materializePatchMapDataset([
      rectRecord('rect-b', 100),
      itemRecord('item-a', [textComponent(), barComponent()]),
    ]).dataset;

    expect(historyReconcileOrderScope(before, after)).toEqual({
      allowedElementOrderIds: ['item-a', 'rect-b'],
      allowedComponentOrderOwners: ['item-a'],
    });
  });

  it('derives bar fast-path targets and exact candidate heights', () => {
    const candidate = materializePatchMapDataset([
      itemRecord('item-a', [barComponent(37), textComponent()]),
    ]).dataset;
    const semantics = indexComponentSemantics(candidate);
    const operations = [mergeComponent('item-a', 'bar', ['size', 'height'], 37)];

    expect(directAnimatedBarTargets(operations, semantics)).toEqual([
      { ownerId: 'item-a', componentId: 'bar' },
    ]);
    expect(operationsOnlyUpdateBarSize(operations, semantics)).toBe(true);
    expect(directBarHeightUpdatesFor(operations, semantics)).toEqual([
      { ownerId: 'item-a', componentId: 'bar', height: 37 },
    ]);
    expect(directBarHeightUpdatesFor(
      [mergeComponent('item-a', 'bar', ['size', 'width'], 40)],
      semantics,
    )).toBeUndefined();
  });

  it('keeps owned sparse root decisions ordered and rejects structural ambiguity', () => {
    const current = materializePatchMapDataset([
      itemRecord('item-a', [barComponent(10)]),
      rectRecord('rect-b', 100),
    ]);
    const replacement = materializePatchMapDataset([
      itemRecord('item-a', [barComponent(37)]),
    ]).dataset[0]!;
    const candidate = assembleOwnedPatchMapDataset(current, [
      replacement,
      current.dataset[1]!,
    ]).dataset;
    const operations = [mergeComponent('item-a', 'bar', ['size', 'height'], 37)];

    expect(incrementalOwnedRootIds(current.dataset, candidate)).toEqual(['item-a']);
    expect(incrementalFlatRootIds(current.dataset, candidate, operations)).toEqual(['item-a']);
    expect(incrementalBarHeightRootIds(current.dataset, candidate, [
      { ownerId: 'item-a', componentId: 'bar', height: 37 },
    ])).toEqual(['item-a']);
    expect(incrementalOwnedRootIds(current.dataset, [...candidate].reverse())).toBeUndefined();
  });

  it('classifies reconcile permissions without broadening geometry updates', () => {
    const geometry = [mergeElement('rect-a', ['attrs', 'x'], 20)];
    const reconcile: PatchMapMutationOperation = {
      op: 'reconcile-components',
      target: { kind: 'element', id: 'item-a' },
      components: [],
    };
    const move: PatchMapMutationOperation = {
      op: 'move',
      target: { kind: 'element', id: 'rect-a' },
      parent: null,
      index: 0,
    };

    expect(operationsOnlyUpdateElementGeometry(geometry)).toBe(true);
    expect(operationsOnlyUpdateElementGeometry([
      mergeElement('rect-a', ['attrs', 'fill'], '#fff'),
    ])).toBe(false);
    expect(componentOrderOwners([reconcile, reconcile])).toEqual(['item-a']);
    expect(operationsMayChangeElementStructure(geometry)).toBe(false);
    expect(operationsMayChangeElementStructure([move])).toBe(true);
  });
});

function itemRecord(
  id: string,
  components: readonly Readonly<Record<string, unknown>>[],
): Readonly<Record<string, unknown>> {
  return {
    type: 'item',
    id,
    size: { width: 80, height: 60 },
    attrs: { x: 0, y: 0 },
    components,
  };
}

function rectRecord(id: string, x: number): Readonly<Record<string, unknown>> {
  return {
    type: 'rect',
    id,
    size: { width: 20, height: 20 },
    attrs: { x, y: 0 },
  };
}

function barComponent(height = 10): Readonly<Record<string, unknown>> {
  return {
    type: 'bar',
    id: 'bar',
    source: { type: 'rect', fill: '#00aa66' },
    size: { width: 40, height },
    placement: 'bottom',
  };
}

function textComponent(): Readonly<Record<string, unknown>> {
  return {
    type: 'text',
    id: 'label',
    text: 'Label',
    placement: 'center',
    style: { fontFamily: 'sans-serif', fontSize: 12, fill: '#111111' },
  };
}

function mergeComponent(
  ownerId: string,
  id: string,
  path: readonly string[],
  value: number,
): PatchMapMutationOperation {
  return {
    op: 'merge',
    target: { kind: 'component', ownerId, id },
    changes: [{ path, value }],
  };
}

function mergeElement(
  id: string,
  path: readonly string[],
  value: number | string,
): PatchMapMutationOperation {
  return {
    op: 'merge',
    target: { kind: 'element', id },
    changes: [{ path, value }],
  };
}
