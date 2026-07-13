import { describe, expect, it } from 'vitest';

import type { ItemElementData, RectElementData } from '../src/contracts';
import {
  materializeComponent,
  materializeElement,
  type MaterializedItemElement,
} from '../src/model/materialize';
import { ManagedNode, type ManagedNodeProps } from '../src/scene/managed-node';
import { applyManagedUpdate } from '../src/update/apply';

const rectNode = (): ManagedNode => {
  const props = materializeElement({
    type: 'rect',
    id: 'before',
    size: 10,
  } satisfies RectElementData);
  return new ManagedNode(props as ManagedNodeProps);
};

const itemNode = (): ManagedNode => {
  const item = materializeElement({
    type: 'item',
    id: 'item',
    size: 20,
    components: [{ type: 'text', id: 'copy', text: 'before' }],
  } satisfies ItemElementData) as MaterializedItemElement;
  const node = new ManagedNode(item as ManagedNodeProps);
  node.addChild(
    ...item.components.map(
      (component) => new ManagedNode(
        materializeComponent(component) as ManagedNodeProps,
      ),
    ),
  );
  return node;
};

describe('ManagedNode public identity invariants', () => {
  it('uses owned local geometry for both public bounds and pointer hit testing', () => {
    const node = rectNode();
    node.setLocalBounds({ x: 3, y: 4, width: 20, height: 10 });

    expect(node.getLocalBounds()).toMatchObject({
      minX: 3,
      minY: 4,
      maxX: 23,
      maxY: 14,
    });
    expect(node.hitArea).toMatchObject({ x: 3, y: 4, width: 20, height: 10 });

    node.clearLocalBounds();
    expect(node.boundsArea).toBeNull();
    expect(node.hitArea).toBeNull();
    node.destroy();
  });

  it('keeps the public id synchronized with replacement props', () => {
    const node = rectNode();

    applyManagedUpdate(node, { changes: { id: 'after' } });

    expect(node.id).toBe('after');
    expect(node.props.id).toBe('after');
    node.destroy();
  });

  it('rejects undocumented element discriminator changes atomically', () => {
    const node = rectNode();
    const before = node.props;

    expect(() => applyManagedUpdate(node, {
      changes: { type: 'text', text: 'replacement' } as never,
    })).toThrow('Element update changed its public type.');

    expect(node.type).toBe('rect');
    expect(node.props).toBe(before);
    node.destroy();
  });

  it('rejects undocumented component discriminator changes atomically', () => {
    const item = itemNode();
    const component = item.children[0] as ManagedNode;
    const before = component.props;

    expect(() => applyManagedUpdate(component, {
      changes: {
        type: 'icon',
        source: 'device',
        size: 10,
      } as never,
    })).toThrow('Component update changed its public type.');

    expect(component.type).toBe('text');
    expect(component.props).toBe(before);
    item.destroy({ children: true });
  });
});
