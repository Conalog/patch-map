import { describe, expect, it, vi } from 'vitest';

import type { RectElementData } from '../src/contracts';
import { UndoRedoManager } from '../src/history';
import { materializeElement } from '../src/model/materialize';
import { ManagedNode, type ManagedNodeProps } from '../src/scene/managed-node';
import {
  AppliedTransformCommand,
  captureManagedTransforms,
  sameManagedTransforms,
} from '../src/transformer-command';

const createNode = (): ManagedNode => new ManagedNode(
  materializeElement({
    type: 'rect',
    id: 'rect',
    size: 20,
    attrs: { x: 1, y: 2, angle: 0 },
  } satisfies RectElementData) as ManagedNodeProps,
);

describe('AppliedTransformCommand', () => {
  it('records an already-applied gesture and restores both live and public state', async () => {
    const node = createNode();
    const before = captureManagedTransforms([node]);
    node.position.set(12, 18);
    node.scale.set(2, 3);
    node.angle = 45;
    node.props = {
      ...node.props,
      attrs: { ...node.props.attrs, x: 12, y: 18, angle: 45 },
    };
    const after = captureManagedTransforms([node]);
    const refreshed = vi.fn();
    const manager = new UndoRedoManager();

    expect(sameManagedTransforms(before, after)).toBe(false);
    await manager.execute(new AppliedTransformCommand(
      'transformer:resize:1',
      before,
      after,
      refreshed,
    ));
    expect(node.position).toMatchObject({ x: 12, y: 18 });
    expect(refreshed).not.toHaveBeenCalled();

    await manager.undo();
    expect(node.position).toMatchObject({ x: 1, y: 2 });
    expect(node.scale).toMatchObject({ x: 1, y: 1 });
    expect(node.angle).toBeCloseTo(0);
    expect(node.props.attrs).toMatchObject({ x: 1, y: 2, angle: 0 });

    await manager.redo();
    expect(node.position).toMatchObject({ x: 12, y: 18 });
    expect(node.scale).toMatchObject({ x: 2, y: 3 });
    expect(node.angle).toBeCloseTo(45);
    expect(node.props.attrs).toMatchObject({ x: 12, y: 18, angle: 45 });
    expect(refreshed).toHaveBeenCalledTimes(2);
    node.destroy();
  });

  it('ignores non-managed and destroyed selections', () => {
    const node = createNode();
    node.destroy();

    expect(captureManagedTransforms([{}, node])).toEqual([]);
    expect(sameManagedTransforms([], [])).toBe(true);
  });
});
