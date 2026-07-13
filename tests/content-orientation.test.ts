import { Container } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';

import { materializeMapData } from '../src/model/materialize';
import { buildManagedScene } from '../src/scene/build-scene';
import { applyContentOrientation } from '../src/scene/content-orientation';
import type { ManagedNode } from '../src/scene/managed-node';
import { materializeTheme } from '../src/theme';

const makeScene = (contentOrientation: 'upright' | 'follow-item') => {
  const scene = buildManagedScene(materializeMapData([
    {
      type: 'item',
      id: 'item',
      size: 80,
      attrs: { angle: 30 },
      contentOrientation,
      components: [
        { type: 'text', id: 'copy', text: 'copy', style: { fontSize: 12 } },
        { type: 'icon', id: 'icon', source: 'device', size: 16 },
      ],
    },
  ]), materializeTheme());
  const world = new Container();
  world.addChild(...scene.roots);
  return { scene, world };
};

describe('content orientation', () => {
  const worlds: Container[] = [];

  afterEach(() => {
    for (const world of worlds.splice(0)) world.destroy({ children: true });
  });

  it('counter-rotates and counter-flips upright item contents', () => {
    const { scene, world } = makeScene('upright');
    worlds.push(world);
    applyContentOrientation(scene, 90, { x: true, y: false });
    const item = scene.byId.get('item') as ManagedNode;
    const copy = scene.byId.get('copy') as ManagedNode;
    const icon = scene.byId.get('icon') as ManagedNode;

    expect(item.angle).toBeCloseTo(30);
    expect(copy.angle).toBeCloseTo(-120);
    expect(copy.scale.x).toBe(-1);
    expect(copy.scale.y).toBe(1);
    expect(icon.angle).toBeCloseTo(-120);
    expect(icon.scale.x).toBeCloseTo(-16 / 72);
  });

  it('leaves follow-item content on its own local transform', () => {
    const { scene, world } = makeScene('follow-item');
    worlds.push(world);
    applyContentOrientation(scene, 90, { x: true, y: true });
    const copy = scene.byId.get('copy') as ManagedNode;
    const icon = scene.byId.get('icon') as ManagedNode;

    expect(copy.angle).toBe(0);
    expect(copy.scale.x).toBe(1);
    expect(copy.scale.y).toBe(1);
    expect(icon.angle).toBe(0);
    expect(icon.scale.x).toBeCloseTo(16 / 72);
    expect(icon.scale.y).toBeCloseTo(16 / 72);
  });
});
