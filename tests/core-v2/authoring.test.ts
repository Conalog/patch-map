import { describe, expect, it } from 'vitest';

import {
  CORE_V2_AUTHORING_REVISION,
  planCoreV2AuthoringAction,
  type CoreV2AuthoringAction,
  type CoreV2AuthoringPlan,
} from '../../src/core-v2/authoring';
import {
  materializeCoreV2Dataset,
  type MaterializedCoreV2Dataset,
  type NormalizedCoreV2Element,
} from '../../src/core-v2/semantic/dataset';
import { planCoreV2MutationTransaction } from '../../src/core-v2/semantic/transaction';

describe('Core v2 authoring product planner', () => {
  it('creates every supported element at one world center with detached unique identities', () => {
    let current = materializeCoreV2Dataset([]);
    const kinds = [
      'item',
      'rect',
      'image',
      'text',
      'group',
      'grid',
      'relations',
    ] as const;
    const submitted: CoreV2AuthoringAction[] = [];

    for (const kind of kinds) {
      const action = {
        type: 'create-element',
        kind,
        id: `created-${kind}`,
        positionWorld: [400, 300],
        parentId: null,
        actionId: `create-${kind}`,
      } as const;
      submitted.push(action);
      const plan = requirePlanned(current, action);
      expect(plan).toMatchObject({
        schemaRevision: CORE_V2_AUTHORING_REVISION,
        actionType: 'create-element',
        facts: { createdId: `created-${kind}`, kind, positionWorld: [400, 300] },
      });
      current = applyPlan(current, plan);
    }

    expect(current.rootIds).toEqual(kinds.map((kind) => `created-${kind}`));
    expect(allElementIds(current.dataset)).toHaveLength(new Set(allElementIds(current.dataset)).size);
    expect(requireElement(current.dataset, 'created-item')).toMatchObject({
      type: 'item',
      components: [
        { id: 'created-item.background' },
        { id: 'created-item.bar' },
        { id: 'created-item.icon' },
        { id: 'created-item.text' },
      ],
    });
    expect(requireElement(current.dataset, 'created-grid')).toMatchObject({
      type: 'grid',
      item: { components: [{ id: 'created-grid.cell-background' }] },
    });
    expect(Object.isFrozen(current.dataset)).toBe(true);
    expect(submitted.every((action) => Object.isFrozen(action) === false)).toBe(true);

    const duplicate = planCoreV2AuthoringAction(current, {
      type: 'create-element',
      kind: 'rect',
      id: 'created-item',
      positionWorld: [0, 0],
      parentId: null,
      actionId: 'duplicate',
    }, { selectionIds: ['created-relations'] });
    expect(duplicate).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'DUPLICATE_ID', path: ['id'] },
    });
  });

  it('edits, aligns, and distributes ordered mixed-size targets idempotently', () => {
    let current = materializeCoreV2Dataset(interactiveScene());
    current = applyAction(current, {
      type: 'edit-position-angle',
      target: 'rect-b',
      x: 200,
      y: 100,
      angleDegrees: 30,
      actionId: 'position-1',
    });
    current = applyAction(current, {
      type: 'align-targets',
      targets: ['item-a', 'rect-b', 'text-c'],
      axis: 'left',
      actionId: 'align-1',
    });

    const first = requirePlanned(current, {
      type: 'distribute-targets',
      targets: ['item-a', 'rect-b', 'text-c'],
      axis: 'horizontal',
      basis: 'bounds',
      actionId: 'distribute-1',
    });
    current = applyPlan(current, first);
    const second = planCoreV2AuthoringAction(current, {
      type: 'distribute-targets',
      targets: ['item-a', 'rect-b', 'text-c'],
      axis: 'horizontal',
      basis: 'bounds',
      actionId: 'distribute-2',
    }, { selectionIds: ['item-a', 'rect-b', 'text-c'] });

    expect(requireElement(current.dataset, 'rect-b').attrs).toMatchObject({ angle: 30 });
    expect(first.facts.distributionDigest).toMatch(/^fnv1a32:/);
    expect(second).toMatchObject({
      status: 'unchanged',
      facts: { distributionDigest: first.facts.distributionDigest },
    });
    expect(planCoreV2AuthoringAction(current, {
      type: 'distribute-targets',
      targets: ['item-a', 'rect-b'],
      axis: 'horizontal',
      basis: 'bounds',
      actionId: 'invalid-distribution',
    }, { selectionIds: [] })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_VALUE', path: ['targets'] },
    });
  });

  it('normalizes a valid text style and rejects invalid alpha without a candidate', () => {
    const current = materializeCoreV2Dataset(interactiveScene());
    const valid = requirePlanned(current, {
      type: 'apply-style',
      target: 'text-c',
      changes: {
        alpha: 0.8,
        fill: '#112233',
        stroke: '#445566',
        strokeWidth: 2,
        cornerRadius: 4,
        fontSize: 18,
        letterSpacing: 1,
        lineHeight: 22,
      },
      strict: true,
      actionId: 'style-1',
    });
    const styled = applyPlan(current, valid);

    expect(requireElement(styled.dataset, 'text-c')).toMatchObject({
      style: {
        alpha: 0.8,
        fill: '#112233',
        stroke: '#445566',
        strokeWidth: 2,
        cornerRadius: 4,
        fontSize: 18,
        letterSpacing: 1,
        lineHeight: 22,
      },
    });
    const invalid = planCoreV2AuthoringAction(styled, {
      type: 'apply-style',
      target: 'text-c',
      changes: { alpha: 2 },
      strict: true,
      actionId: 'style-invalid',
    }, { selectionIds: ['text-c'] });
    expect(invalid).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_VALUE', path: ['alpha'] },
    });
    expect(styled.semanticHash).not.toBe(current.semanticHash);
  });

  it('groups and duplicates trees while preserving external references and atomic selection intent', () => {
    let current = materializeCoreV2Dataset(groupingScene());
    current = applyAction(current, {
      type: 'group-targets',
      targets: ['a', 'b'],
      groupId: 'g',
      actionId: 'group-1',
    }, ['a', 'b']);

    const duplicate = requirePlanned(current, {
      type: 'duplicate-tree',
      target: 'g',
      rootId: 'g-copy',
      offsetWorld: [10, 10],
      rewriteInternalReferences: true,
      preserveExternalReferences: true,
      actionId: 'duplicate-1',
    }, ['g']);
    expect(duplicate.facts).toMatchObject({
      rootId: 'g-copy',
      internalReferencesRewritten: true,
      externalReferencesPreserved: true,
      idMap: { g: 'g-copy', a: 'g-copy/a', b: 'g-copy/b' },
    });
    current = applyPlan(current, duplicate);
    current = applyAction(current, {
      type: 'copy-paste-tree',
      target: 'g',
      rootId: 'g-paste',
      offsetWorld: [20, 20],
      rewriteInternalReferences: true,
      preserveExternalReferences: true,
      actionId: 'paste-1',
    }, ['g-copy']);

    const relation = requireElement(current.dataset, 'r');
    expect(relation).toMatchObject({
      type: 'relations',
      links: [{ source: 'a', target: 'b' }],
    });
    expect(allElementIds(current.dataset)).toEqual(expect.arrayContaining([
      'g',
      'a',
      'b',
      'g-copy',
      'g-copy/a',
      'g-copy/b',
      'g-paste',
      'g-paste/a',
      'g-paste/b',
      'r',
    ]));

    const ungroup = requirePlanned(current, {
      type: 'ungroup-target',
      target: 'g',
      actionId: 'ungroup-1',
    }, ['g-paste']);
    expect(ungroup.transaction.history).toEqual({
      selectedIds: ['g-paste'],
      mode: 'select',
    });
    current = applyPlan(current, ungroup);
    expect(allElementIds(current.dataset)).not.toContain('g');
    expect(allElementIds(current.dataset)).toEqual(expect.arrayContaining(['a', 'b', 'g-paste']));

    expect(planCoreV2AuthoringAction(current, {
      type: 'duplicate-tree',
      target: 'g-copy',
      rootId: 'g-paste',
      offsetWorld: [0, 0],
      rewriteInternalReferences: true,
      preserveExternalReferences: true,
      actionId: 'duplicate-collision',
    }, { selectionIds: ['g-paste'] })).toMatchObject({
      status: 'planned',
    });
    const collisionPlan = requirePlanned(current, {
      type: 'duplicate-tree',
      target: 'g-copy',
      rootId: 'g-paste',
      offsetWorld: [0, 0],
      rewriteInternalReferences: true,
      preserveExternalReferences: true,
      actionId: 'duplicate-collision',
    }, ['g-paste']);
    expect(planCoreV2MutationTransaction(current, collisionPlan.transaction)).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'DUPLICATE_ID' },
    });
  });

  it('reorders same-parent targets and rejects unsupported item parenting and cycles', () => {
    let current = materializeCoreV2Dataset(interactiveScene());
    const reorder = requirePlanned(current, {
      type: 'reorder-z',
      targets: ['rect-b', 'text-c'],
      placement: 'front',
      preserveRelativeOrder: true,
      actionId: 'hierarchy-2',
    }, ['rect-b', 'text-c']);
    current = applyPlan(current, reorder);
    expect(current.rootIds.slice(-2)).toEqual(['rect-b', 'text-c']);

    expect(planCoreV2AuthoringAction(current, {
      type: 'move-hierarchy',
      target: 'rect-b',
      parentId: 'item-a',
      index: 0,
      actionId: 'hierarchy-1',
    }, { selectionIds: ['rect-b', 'text-c'] })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_MUTATION', path: ['parentId'] },
    });
    expect(planCoreV2AuthoringAction(current, {
      type: 'move-hierarchy',
      target: 'item-a',
      parentId: 'item-a',
      index: 0,
      actionId: 'hierarchy-cycle',
    }, { selectionIds: ['rect-b', 'text-c'] })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_MUTATION', path: ['parentId'] },
    });
  });
});

function requirePlanned(
  current: MaterializedCoreV2Dataset,
  action: unknown,
  selectionIds: readonly string[] = [],
): Extract<CoreV2AuthoringPlan, { readonly status: 'planned' }> {
  const plan = planCoreV2AuthoringAction(current, action, { selectionIds });
  expect(plan, JSON.stringify(plan)).toMatchObject({ status: 'planned', changed: true });
  if (plan.status !== 'planned') throw new Error(`Expected planned authoring action`);
  return plan;
}

function applyAction(
  current: MaterializedCoreV2Dataset,
  action: unknown,
  selectionIds: readonly string[] = [],
): MaterializedCoreV2Dataset {
  return applyPlan(current, requirePlanned(current, action, selectionIds));
}

function applyPlan(
  current: MaterializedCoreV2Dataset,
  plan: Extract<CoreV2AuthoringPlan, { readonly status: 'planned' }>,
): MaterializedCoreV2Dataset {
  const transaction = planCoreV2MutationTransaction(current, plan.transaction);
  expect(transaction, JSON.stringify(transaction)).toMatchObject({ status: 'planned' });
  if (transaction.status !== 'planned') throw new Error('Expected planned semantic transaction');
  return transaction.candidate;
}

function requireElement(
  elements: readonly NormalizedCoreV2Element[],
  id: string,
): NormalizedCoreV2Element {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElement(element.children, id);
      if (nested !== null) return nested;
    }
  }
  throw new Error(`Missing element ${id}`);
}

function findElement(
  elements: readonly NormalizedCoreV2Element[],
  id: string,
): NormalizedCoreV2Element | null {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElement(element.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function allElementIds(elements: readonly NormalizedCoreV2Element[]): string[] {
  return elements.flatMap((element) => [
    element.id,
    ...(element.type === 'group' ? allElementIds(element.children) : []),
  ]);
}

function interactiveScene(): unknown {
  return [
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
    {
      type: 'text',
      id: 'text-c',
      text: 'Bravo',
      style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#222222' },
      size: { width: 80, height: 20 },
      attrs: { x: 40, y: 140 },
    },
    {
      type: 'relations',
      id: 'links',
      links: [{ source: 'item-a', target: 'rect-b' }],
      style: { color: '#222222', width: 2 },
    },
  ];
}

function groupingScene(): unknown {
  return [
    {
      type: 'rect',
      id: 'a',
      size: { width: 20, height: 10 },
      attrs: { x: 10, y: 20 },
    },
    {
      type: 'rect',
      id: 'b',
      size: { width: 10, height: 20 },
      attrs: { x: 50, y: 30 },
    },
    {
      type: 'relations',
      id: 'r',
      links: [{ source: 'a', target: 'b' }],
    },
  ];
}
