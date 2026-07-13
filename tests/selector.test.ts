import { Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MapElementData } from '../src/contracts';
import { materializeElement } from '../src/model/materialize';
import { selectScene } from '../src/scene-selector';
import {
  ManagedNode,
  type ManagedNodeProps,
} from '../src/scene/managed-node';

type SelectableElementData = MapElementData & {
  display?: boolean | number | string;
};

interface SelectorScene {
  world: Container;
  rackAlpha: ManagedNode;
  rackBeta: ManagedNode;
  nodeAlpha: ManagedNode;
  nodeBeta: ManagedNode;
  nodeGamma: ManagedNode;
  numericDisplay: ManagedNode;
}

const managedNode = (data: SelectableElementData): ManagedNode =>
  new ManagedNode(materializeElement(data) as ManagedNodeProps);

const ids = (values: unknown[]): unknown[] =>
  values.map((value) => (value as { id?: unknown }).id);

const createScene = (): SelectorScene => {
  const world = new Container({ label: 'world' });
  const rackAlpha = managedNode({
    type: 'group',
    id: 'rack-alpha',
    label: 'Rack Alpha',
    display: 'expanded',
    children: [],
  });
  const rackBeta = managedNode({
    type: 'group',
    id: 'rack-beta',
    label: 'Rack Beta',
    display: 'collapsed',
    children: [],
  });
  const nodeAlpha = managedNode({
    type: 'item',
    id: 'node-alpha',
    label: 'Node Alpha',
    display: 'visible',
    size: 10,
    components: [],
  });
  const nodeBeta = managedNode({
    type: 'item',
    id: 'node-beta',
    label: 'node Beta',
    display: 'hidden',
    size: 10,
    components: [],
  });
  const nodeGamma = managedNode({
    type: 'item',
    id: 'node-gamma',
    label: 'NODE Gamma',
    display: 'visible',
    size: 10,
    components: [],
  });
  const numericDisplay = managedNode({
    type: 'rect',
    id: 'display-one',
    label: 'Numeric Display',
    display: 1,
    size: 10,
  });

  rackAlpha.addChild(nodeAlpha, nodeBeta);
  rackBeta.addChild(nodeGamma);
  world.addChild(rackAlpha, rackBeta, numericDisplay);

  return {
    world,
    rackAlpha,
    rackBeta,
    nodeAlpha,
    nodeBeta,
    nodeGamma,
    numericDisplay,
  };
};

describe('selectScene documented expression families', () => {
  let scene: SelectorScene;

  beforeEach(() => {
    scene = createScene();
  });

  afterEach(() => {
    scene.world.destroy({ children: true });
  });

  it('returns the live root and direct child handles', () => {
    expect(selectScene(scene.world, '$')).toEqual([scene.world]);
    expect(selectScene(scene.world, '$.children[*]')).toEqual([
      scene.rackAlpha,
      scene.rackBeta,
      scene.numericDisplay,
    ]);
  });

  it('supports recursive descent and children/id projections', () => {
    expect(ids(selectScene(scene.world, '$..children[*]'))).toEqual([
      'rack-alpha',
      'rack-beta',
      'display-one',
      'node-alpha',
      'node-beta',
      'node-gamma',
    ]);
    expect(
      selectScene(
        scene.world,
        '$.children[?(@.id === "rack-alpha")].children[*]',
      ),
    ).toEqual([scene.nodeAlpha, scene.nodeBeta]);
    expect(selectScene(scene.world, '$.children[*].id')).toEqual([
      'rack-alpha',
      'rack-beta',
      'display-one',
    ]);
  });

  it('filters by id, type, label, display, and parent properties', () => {
    expect(
      selectScene(scene.world, '$..[?(@.label === "Rack Alpha")]'),
    ).toEqual([scene.rackAlpha]);
    expect(
      selectScene(scene.world, '$..children[?(@.id === "node-beta")]'),
    ).toEqual([scene.nodeBeta]);
    expect(ids(selectScene(scene.world, '$..children[?(@.type === "item")]'))).toEqual([
      'node-alpha',
      'node-beta',
      'node-gamma',
    ]);
    expect(
      selectScene(scene.world, '$..children[?(@.label === "Node Alpha")]'),
    ).toEqual([scene.nodeAlpha]);
    expect(ids(selectScene(scene.world, '$..children[?(@.display === "visible")]'))).toEqual([
      'node-alpha',
      'node-gamma',
    ]);
    expect(
      ids(
        selectScene(
          scene.world,
          '$..children[?(@.parent.id === "rack-alpha")]',
        ),
      ),
    ).toEqual(['node-alpha', 'node-beta']);
  });

  it('evaluates boolean filters with strict and loose equality', () => {
    expect(
      selectScene(
        scene.world,
        '$..children[?(@.type === "item" && @.display === "hidden")]',
      ),
    ).toEqual([scene.nodeBeta]);
    expect(
      ids(
        selectScene(
          scene.world,
          '$..children[?(@.id === "node-alpha" || @.id === "node-gamma")]',
        ),
      ),
    ).toEqual(['node-alpha', 'node-gamma']);
    expect(
      selectScene(scene.world, '$..children[?(@.display == "1")]'),
    ).toEqual([scene.numericDisplay]);
    expect(
      selectScene(scene.world, '$..children[?(@.display === "1")]'),
    ).toEqual([]);
  });

  it('evaluates documented toLowerCase and match string expressions', () => {
    expect(
      selectScene(
        scene.world,
        '$..children[?(@.label.toLowerCase() === "node beta")]',
      ),
    ).toEqual([scene.nodeBeta]);
    expect(
      ids(
        selectScene(
          scene.world,
          '$..children[?(@.label.match(/^node\\s/i))]',
        ),
      ),
    ).toEqual(['node-alpha', 'node-beta', 'node-gamma']);
  });

  it('projects parent handles back to the live scene objects', () => {
    expect(
      selectScene(
        scene.world,
        '$..children[?(@.id === "node-alpha")].parent',
      ),
    ).toEqual([scene.rackAlpha]);
  });
});
