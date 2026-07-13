import { describe, expect, it } from 'vitest';

import type { ItemElementData } from '../src/contracts';
import {
  materializeElement,
  type MaterializedItemElement,
} from '../src/model/materialize';
import { ManagedNode, type ManagedNodeProps } from '../src/scene/managed-node';
import { applyManagedUpdate } from '../src/update/apply';
import {
  deepMerge,
  matchComponentUpdates,
  reconcileComponentArray,
} from '../src/update/merge';

const itemNode = (input: ItemElementData): ManagedNode => {
  const item = materializeElement(input) as MaterializedItemElement;
  const node = new ManagedNode(item as ManagedNodeProps);
  node.addChild(
    ...item.components.map(
      (component) => new ManagedNode(component as ManagedNodeProps),
    ),
  );
  return node;
};

describe('update merge semantics', () => {
  it('deep-merges records without retaining caller-owned nested values', () => {
    const base = { style: { fill: 'black', size: 12 }, values: [1, 2] };
    const patch = { style: { fill: 'red' }, values: [3] };
    const merged = deepMerge(base, patch);

    expect(merged).toEqual({
      style: { fill: 'red', size: 12 },
      values: [3],
    });
    patch.style.fill = 'blue';
    patch.values.push(4);
    expect(merged).toEqual({
      style: { fill: 'red', size: 12 },
      values: [3],
    });
  });

  it('reserves ID and label matches before stable same-type matches', () => {
    const existing = [
      { type: 'text', id: 'first', label: 'alpha' },
      { type: 'text', id: 'second', label: 'beta' },
      { type: 'icon', id: 'icon' },
    ];
    const incoming = [
      { type: 'text', text: 'ordered' },
      { type: 'text', id: 'second', text: 'by-id' },
      { type: 'icon', source: 'device' },
    ];

    expect(
      matchComponentUpdates(existing, incoming).map(
        ({ existingIndex, kind }) => ({ existingIndex, kind }),
      ),
    ).toEqual([
      { existingIndex: 0, kind: 'unique-type' },
      { existingIndex: 1, kind: 'id' },
      { existingIndex: 2, kind: 'unique-type' },
    ]);
  });

  it('retains unmatched merge entries but removes them during replace', () => {
    const existing = [
      { type: 'text', id: 'text', text: 'before' },
      { type: 'icon', id: 'icon', source: 'device' },
    ];
    const incoming = [{ type: 'text', id: 'text', text: 'after' }];

    expect(reconcileComponentArray(existing, incoming, 'merge').entries).toHaveLength(2);
    expect(reconcileComponentArray(existing, incoming, 'replace').entries).toHaveLength(1);
  });

  it('matches later updates against retained live IDs after replace divergence', () => {
    const node = itemNode({
      type: 'item',
      id: 'item',
      size: 64,
      components: [
        {
          type: 'text',
          id: 'retained-live-id',
          label: 'copy',
          text: 'before',
          style: { fontSize: 12 },
        },
      ],
    });
    const live = node.children[0] as ManagedNode;

    applyManagedUpdate(node, {
      mergeStrategy: 'replace',
      changes: { components: [{ type: 'text', text: 'replacement' }] },
    });

    const parentComponent = (node.props as MaterializedItemElement).components[0]!;
    expect(parentComponent.id).not.toBe(live.id);
    expect(live.id).toBe('retained-live-id');

    applyManagedUpdate(node, {
      changes: {
        components: [
          {
            type: 'text',
            id: 'retained-live-id',
            style: { fill: 'red' },
          },
        ],
      },
    });

    expect(node.children).toEqual([live]);
    expect(live.props).toMatchObject({
      id: 'retained-live-id',
      text: 'replacement',
      style: { fill: 'red' },
    });
    node.destroy({ children: true });
  });
});
