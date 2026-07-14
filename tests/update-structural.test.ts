import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import type { MapData } from '../src/contracts';
import { UndoRedoManager } from '../src/history';
import {
  materializeMapData,
  type MaterializedGridElement,
  type MaterializedGroupElement,
  type MaterializedItemElement,
} from '../src/model/materialize';
import {
  buildManagedScene,
  reindexManagedScene,
  type ManagedScene,
} from '../src/scene/build-scene';
import { ManagedNode } from '../src/scene/managed-node';
import { materializeTheme } from '../src/theme';
import { applyManagedUpdate } from '../src/update/apply';
import { ManagedUpdateCommand } from '../src/update/command';

const sceneFor = (data: MapData): ManagedScene =>
  buildManagedScene(materializeMapData(data), materializeTheme());

const isManagedNode = (value: unknown): value is ManagedNode =>
  value instanceof ManagedNode;

const managedChildren = (node: ManagedNode): ManagedNode[] =>
  node.children.filter(isManagedNode);

const managedChildIds = (node: ManagedNode): string[] =>
  managedChildren(node).map(({ id }) => id);

const child = (node: ManagedNode, id: string): ManagedNode => {
  const match = node.children.find(
    (candidate): candidate is ManagedNode =>
      isManagedNode(candidate) && candidate.id === id,
  );
  if (!match) throw new Error(`Missing child: ${id}`);
  return match;
};

const centerOf = (node: ManagedNode): { x: number; y: number } => {
  const bounds = node.getBounds();
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
};

describe('nested transform updates', () => {
  it('preserves the visible center through a rotated and scaled parent', () => {
    const scene = sceneFor([{
      type: 'group',
      id: 'parent',
      attrs: { x: 80, y: 45, angle: 35 },
      children: [{
        type: 'rect',
        id: 'nested',
        size: { width: 60, height: 20 },
        attrs: { x: 15, y: 25, angle: 10 },
      }],
    }]);
    const world = new Container();
    world.addChild(...scene.roots);
    const parent = scene.roots[0]!;
    parent.scale.set(1.5, 0.75);
    const nested = child(parent, 'nested');
    const before = centerOf(nested);

    applyManagedUpdate(nested, {
      changes: { attrs: { angle: 115 } },
      rotateOrigin: 'center',
    });

    const after = centerOf(nested);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    world.destroy({ children: true });
  });

  it('preserves centers for rotated items and components in transformed parents', () => {
    const scene = sceneFor([{
      type: 'group',
      id: 'parent',
      attrs: { x: 60, y: 35, angle: -25 },
      children: [{
        type: 'item',
        id: 'item',
        size: { width: 80, height: 50 },
        attrs: { x: 20, y: 15, angle: 10 },
        components: [{
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: '#fff' },
          size: { width: 40, height: 12 },
          animation: false,
          attrs: { angle: 5 },
        }],
      }],
    }]);
    const world = new Container();
    world.addChild(...scene.roots);
    const parent = scene.roots[0]!;
    parent.scale.set(-1.25, 0.8);
    const item = child(parent, 'item');
    const bar = child(item, 'bar');
    const itemCenter = centerOf(item);

    applyManagedUpdate(item, {
      changes: { attrs: { angle: 95 } },
      rotateOrigin: 'center',
    });
    expect(centerOf(item).x).toBeCloseTo(itemCenter.x, 5);
    expect(centerOf(item).y).toBeCloseTo(itemCenter.y, 5);

    const barCenter = centerOf(bar);
    applyManagedUpdate(bar, {
      changes: { attrs: { angle: 125 } },
      rotateOrigin: 'center',
    });
    expect(centerOf(bar).x).toBeCloseTo(barCenter.x, 5);
    expect(centerOf(bar).y).toBeCloseTo(barCenter.y, 5);
    world.destroy({ children: true });
  });
});

describe('theme-normalized relation updates', () => {
  it('keeps direct updates and structurally inserted relations on live theme colors', () => {
    const theme = materializeTheme({ black: '#010203', white: '#fefefe' });
    const scene = buildManagedScene(materializeMapData([
      { type: 'relations', id: 'direct', links: [], style: { color: 'black' } },
      { type: 'group', id: 'group', children: [] },
    ]), theme);
    const direct = scene.byId.get('direct');
    const group = scene.byId.get('group');
    if (!direct || !group) throw new Error('Expected managed relation fixtures');

    expect((direct.props as { style: { color: unknown } }).style.color).toBe('#010203');
    applyManagedUpdate(direct, { changes: { style: { color: 'white' } } });
    expect((direct.props as { style: { color: unknown } }).style.color).toBe('#fefefe');

    applyManagedUpdate(group, { changes: { children: [{
      type: 'relations',
      id: 'inserted',
      links: [],
      style: { color: 'black' },
    }] } });
    const inserted = child(group, 'inserted');
    expect((inserted.props as { style: { color: unknown } }).style.color).toBe('#010203');
    for (const root of scene.roots) root.destroy({ children: true });
  });
});

describe('structural group updates', () => {
  it.each(['merge', 'replace'] as const)(
    '%s replaces the named children array while preserving compatible live IDs',
    (mergeStrategy) => {
      const scene = sceneFor([
        {
          type: 'group',
          id: 'group',
          children: [
            { type: 'rect', id: 'keep', size: 10, fill: 'black' },
            { type: 'rect', id: 'remove', size: 8, fill: 'gray' },
          ],
        },
      ]);
      const group = scene.roots[0]!;
      const retained = child(group, 'keep');
      const removed = child(group, 'remove');
      const changes = {
        children: [
          {
            type: 'group',
            id: 'added-group',
            children: [{ type: 'text', id: 'nested-copy', text: 'new' }],
          },
          {
            type: 'rect',
            id: 'keep',
            size: { width: 20, height: 30 },
            fill: 'red',
          },
        ],
      };
      const before = structuredClone(changes);

      applyManagedUpdate(group, { changes, mergeStrategy });

      expect(changes).toEqual(before);
      expect(managedChildIds(group)).toEqual([
        'added-group',
        'keep',
      ]);
      expect(managedChildren(group)[1]).toBe(retained);
      expect(group.children).toHaveLength(3);
      expect(group.children.at(-1)).not.toBeInstanceOf(ManagedNode);
      expect(removed.destroyed).toBe(true);
      const added = child(group, 'added-group');
      const nested = child(added, 'nested-copy');
      expect(added.parent).toBe(group);
      expect(nested.parent).toBe(added);
      expect(nested.props).toMatchObject({ text: 'new' });
      expect(retained.props).toMatchObject({
        size: { width: 20, height: 30 },
        fill: 'red',
      });
      expect(
        (group.props as MaterializedGroupElement).children.map(({ id }) => id),
      ).toEqual(['added-group', 'keep']);

      reindexManagedScene(scene);
      expect(scene.byId.get('keep')).toBe(retained);
      expect(scene.byId.get('added-group')).toBe(added);
      expect(scene.byId.get('nested-copy')).toBe(nested);
      expect(scene.byId.has('remove')).toBe(false);

      const addedPatch = changes.children[0] as {
        children: Array<{ text: string }>;
      };
      addedPatch.children[0]!.text = 'caller mutation';
      expect(nested.props).toMatchObject({ text: 'new' });
      group.destroy({ children: true });
    },
  );
});

describe('structural grid updates', () => {
  it('keeps a changed grid ID and its deterministic cell IDs coherent in the index', () => {
    const scene = sceneFor([
      {
        type: 'grid',
        id: 'before',
        cells: [['A']],
        item: { size: 10 },
      },
    ]);
    const grid = scene.roots[0]!;
    const oldCell = child(grid, 'before.0.0');

    applyManagedUpdate(grid, { changes: { id: 'after' } });
    reindexManagedScene(scene);

    expect(scene.roots[0]).toBe(grid);
    expect(grid.id).toBe('after');
    expect(grid.props).toMatchObject({ id: 'after' });
    expect(oldCell.destroyed).toBe(false);
    expect(scene.byId.get('after')).toBe(grid);
    expect(child(grid, 'after.0.0')).toBe(oldCell);
    expect(scene.byId.get('after.0.0')).toBe(oldCell);
    expect(scene.byId.has('before')).toBe(false);
    expect(scene.byId.has('before.0.0')).toBe(false);
    grid.destroy({ children: true });
  });

  it('re-materializes cells and merged item templates without replacing surviving handles', () => {
    const scene = sceneFor([
      {
        type: 'grid',
        id: 'grid',
        cells: [['A', 'B']],
        gap: { x: 1, y: 2 },
        item: {
          size: { width: 10, height: 12 },
          components: [
            {
              type: 'text',
              id: 'template-copy',
              label: 'copy',
              text: 'before',
            },
            {
              type: 'icon',
              id: 'template-icon',
              label: 'glyph',
              source: 'device',
              size: 6,
            },
          ],
        },
      },
    ]);
    const grid = scene.roots[0]!;
    const cellA = child(grid, 'grid.0.0');
    const cellB = child(grid, 'grid.0.1');
    const initialComponents = (cellA.props as MaterializedItemElement).components;
    const copy = child(cellA, initialComponents[0]!.id);
    const icon = child(cellA, initialComponents[1]!.id);
    const changes = {
      cells: [['AA', 0], ['C', 0]],
      gap: { x: 3 },
      item: {
        size: { width: 20 },
        components: [
          {
            type: 'text',
            id: 'template-copy',
            text: 'after',
            style: { fill: 'red' },
          },
        ],
      },
    };
    const before = structuredClone(changes);

    applyManagedUpdate(grid, { changes });

    expect(changes).toEqual(before);
    const cellC = child(grid, 'grid.1.0');
    expect(child(grid, 'grid.0.0')).toBe(cellA);
    expect(cellB.destroyed).toBe(true);
    expect(cellA.children[0]).toBe(copy);
    expect(cellA.children[1]).toBe(icon);
    expect(cellA.props).toMatchObject({
      label: 'AA',
      size: { width: 20, height: 12 },
      attrs: { x: 0, y: 0 },
    });
    expect((cellA.props as MaterializedItemElement).components).toHaveLength(4);
    expect(copy.props).toMatchObject({ text: 'before' });
    const appendedCopy = child(cellA, 'template-copy');
    const appendedIcon = child(cellA, 'template-icon');
    expect(appendedCopy).not.toBe(copy);
    expect(appendedIcon).not.toBe(icon);
    expect(appendedCopy.props).toMatchObject({
      text: 'after',
      style: { fill: 'red' },
    });
    expect(managedChildren(cellA)).toEqual([
      copy,
      icon,
      appendedCopy,
      appendedIcon,
    ]);
    expect(cellC.props).toMatchObject({
      label: 'C',
      size: { width: 20, height: 12 },
      attrs: { x: 0, y: 14 },
    });
    expect((cellC.props as MaterializedItemElement).components).toHaveLength(2);
    expect(managedChildren(cellC).map(({ type }) => type)).toEqual([
      'text',
      'icon',
    ]);
    expect(grid.props).toMatchObject({
      gap: { x: 3, y: 2 },
      item: { size: { width: 20, height: 12 } },
    });

    reindexManagedScene(scene);
    expect(scene.byId.get('grid.0.0')).toBe(cellA);
    expect(scene.byId.get('grid.1.0')).toBe(cellC);
    expect(scene.byId.has('grid.0.1')).toBe(false);

    changes.cells[0]![0] = 'caller mutation';
    changes.item.size.width = 999;
    expect(cellA.props).toMatchObject({
      label: 'AA',
      size: { width: 20, height: 12 },
    });
    grid.destroy({ children: true });
  });

  it('honors hide/destroy cells and merge/replace component-array semantics', () => {
    const scene = sceneFor([
      {
        type: 'grid',
        id: 'grid',
        cells: [['A']],
        item: {
          size: 10,
          components: [
            { type: 'text', id: 'copy', text: 'before' },
            { type: 'icon', id: 'icon', source: 'device', size: 4 },
          ],
        },
      },
    ]);
    const grid = scene.roots[0]!;
    const cell = child(grid, 'grid.0.0');
    const initialComponents = (cell.props as MaterializedItemElement).components;
    const copy = child(cell, initialComponents[0]!.id);
    const icon = child(cell, initialComponents[1]!.id);

    applyManagedUpdate(grid, {
      changes: {
        item: {
          components: [{ type: 'text', id: 'copy', text: 'merged' }],
        },
      },
    });
    expect(child(grid, 'grid.0.0')).toBe(cell);
    const mergedCopy = child(cell, 'copy');
    const appendedIcon = child(cell, 'icon');
    expect(managedChildren(cell)).toEqual([
      copy,
      icon,
      mergedCopy,
      appendedIcon,
    ]);
    expect(copy.props).toMatchObject({ text: 'before' });
    expect(mergedCopy.props).toMatchObject({ text: 'merged' });
    expect(mergedCopy).not.toBe(copy);
    expect(appendedIcon).not.toBe(icon);

    applyManagedUpdate(grid, {
      mergeStrategy: 'replace',
      changes: {
        item: {
          size: 10,
          components: [{ type: 'text', text: 'only' }],
        },
      },
    });
    expect(child(grid, 'grid.0.0')).toBe(cell);
    const afterReplace = managedChildren(cell);
    expect(afterReplace.slice(0, 4)).toEqual([
      copy,
      icon,
      mergedCopy,
      appendedIcon,
    ]);
    expect(afterReplace).toHaveLength(5);
    const onlyCopy = afterReplace[4]!;
    expect(onlyCopy.props).toMatchObject({ text: 'only' });
    expect(icon.destroyed).toBe(false);
    expect((cell.props as MaterializedItemElement).components[4]!.id).toBe(
      onlyCopy.id,
    );

    applyManagedUpdate(grid, {
      changes: { cells: [[0]], inactiveCellStrategy: 'hide' },
    });
    expect(child(grid, 'grid.0.0')).toBe(cell);
    expect(managedChildren(cell)).toEqual([copy]);
    expect(copy.props).toMatchObject({ text: 'only' });
    expect(icon.destroyed).toBe(true);
    expect(mergedCopy.destroyed).toBe(true);
    expect(appendedIcon.destroyed).toBe(true);
    expect(onlyCopy.destroyed).toBe(true);
    expect(cell.renderable).toBe(false);
    expect(cell.props).toMatchObject({ label: '0', show: false });

    applyManagedUpdate(grid, { changes: { cells: [['active']] } });
    expect(child(grid, 'grid.0.0')).toBe(cell);
    expect(managedChildren(cell)).toEqual([copy]);
    expect(cell.renderable).toBe(true);
    expect(cell.props).toMatchObject({ label: 'active', show: true });

    applyManagedUpdate(grid, {
      changes: { cells: [[0]], inactiveCellStrategy: 'destroy' },
    });
    expect(grid.children).toHaveLength(0);
    expect(cell.destroyed).toBe(true);
    grid.destroy({ children: true });
  });
});

describe('structural refresh', () => {
  it('reapplies equal group and grid structures without replacing live handles', () => {
    const scene = sceneFor([
      {
        type: 'group',
        id: 'group',
        children: [
          { type: 'rect', id: 'rect', size: 10, attrs: { x: 4, y: 5 } },
        ],
      },
      {
        type: 'grid',
        id: 'grid',
        cells: [['A']],
        item: { size: 10 },
      },
    ]);
    const group = scene.roots[0]!;
    const grid = scene.roots[1]!;
    const rectangle = child(group, 'rect');
    const cell = child(grid, 'grid.0.0');
    rectangle.position.set(100, 200);
    rectangle.renderable = false;
    cell.position.set(300, 400);
    cell.renderable = false;

    applyManagedUpdate(group, { refresh: true });
    applyManagedUpdate(grid, { refresh: true });

    expect(child(group, 'rect')).toBe(rectangle);
    expect(rectangle.position).toMatchObject({ x: 4, y: 5 });
    expect(rectangle.renderable).toBe(true);
    expect(child(grid, 'grid.0.0')).toBe(cell);
    expect(cell.position).toMatchObject({ x: 0, y: 0 });
    expect(cell.renderable).toBe(true);
    group.destroy({ children: true });
    grid.destroy({ children: true });
  });
});

describe('structural update snapshots', () => {
  it('undoes and redoes group child replacement through the owned snapshot', async () => {
    const scene = sceneFor([
      {
        type: 'group',
        id: 'group',
        children: [
          { type: 'rect', id: 'keep', size: 10 },
          { type: 'rect', id: 'drop', size: 5 },
        ],
      },
    ]);
    const group = scene.roots[0]!;
    const keep = child(group, 'keep');
    const manager = new UndoRedoManager();
    const refresh = (): void => reindexManagedScene(scene);

    await manager.execute(new ManagedUpdateCommand(
      [group],
      {
        changes: {
          children: [
            { type: 'rect', id: 'keep', size: 20 },
            { type: 'text', id: 'added', text: 'new' },
          ],
        },
      },
      refresh,
    ));
    expect(managedChildIds(group)).toEqual([
      'keep',
      'added',
    ]);
    expect(managedChildren(group)[0]).toBe(keep);

    await manager.undo();
    expect(managedChildIds(group)).toEqual([
      'keep',
      'drop',
    ]);
    expect(managedChildren(group)[0]).toBe(keep);
    expect(scene.byId.get('drop')).toBe(managedChildren(group)[1]);
    expect(scene.byId.has('added')).toBe(false);

    await manager.redo();
    expect(managedChildIds(group)).toEqual([
      'keep',
      'added',
    ]);
    expect(managedChildren(group)[0]).toBe(keep);
    expect(scene.byId.has('drop')).toBe(false);
    group.destroy({ children: true });
  });

  it('restores deterministic grid cells while preserving surviving cell identity', async () => {
    const scene = sceneFor([
      {
        type: 'grid',
        id: 'grid',
        cells: [['A', 'B']],
        item: { size: 10 },
      },
    ]);
    const grid = scene.roots[0]!;
    const cellA = child(grid, 'grid.0.0');
    const manager = new UndoRedoManager();
    const refresh = (): void => reindexManagedScene(scene);

    await manager.execute(new ManagedUpdateCommand(
      [grid],
      { changes: { cells: [['A', 0]] } },
      refresh,
    ));
    expect(grid.children).toEqual([cellA]);

    await manager.undo();
    expect(child(grid, 'grid.0.0')).toBe(cellA);
    expect(scene.byId.get('grid.0.1')).toBe(child(grid, 'grid.0.1'));
    expect((grid.props as MaterializedGridElement).cells).toEqual([['A', 'B']]);

    await manager.redo();
    expect(grid.children).toEqual([cellA]);
    expect(scene.byId.has('grid.0.1')).toBe(false);
    expect((grid.props as MaterializedGridElement).cells).toEqual([['A', 0]]);
    grid.destroy({ children: true });
  });
});
