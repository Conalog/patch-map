import { Container, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PatchMapV2Engine } from '../PatchMapV2Engine';
import { V2PixiRenderer } from './V2PixiRenderer';

describe('V2PixiRenderer', () => {
  it('attaches stable v2 layers in render order and reuses display objects across updates', () => {
    const world = new Container();
    const renderer = new V2PixiRenderer({
      store: {
        world,
        theme: {},
        textureResolver: () => Texture.WHITE,
      },
      target: world,
    });
    const engine = new PatchMapV2Engine();
    const snapshot = engine.draw([
      {
        type: 'item',
        id: 'item-1',
        size: { width: 100, height: 50 },
        components: [
          {
            type: 'background',
            source: { type: 'rect', fill: '#ffffff', radius: 4 },
          },
          {
            type: 'bar',
            source: { type: 'rect', fill: '#0ea5e9', radius: 3 },
            size: { width: '100%', height: '50%' },
            placement: 'bottom',
          },
          { type: 'icon', source: 'alert', show: true, size: 10 },
        ],
      },
    ]);

    renderer.render(snapshot);

    expect(world.children.map((child) => child.label)).toEqual([
      'patchmap-v2-background-layer',
      'patchmap-v2-bar-layer',
      'patchmap-v2-fallback-layer',
      'patchmap-v2-relations-layer',
    ]);
    const barNode = snapshot.renderIR.byFeature.get('bar')[0];
    const barObject = renderer.objectsById.get(barNode.id);
    expect(barObject.parent.label).toBe('patchmap-v2-bar-layer');
    expect(barObject.width).toBe(100);
    expect(barObject.height).toBe(25);
    expect(barObject.y).toBe(25);

    const nextSnapshot = engine.draw([
      {
        type: 'item',
        id: 'item-1',
        size: { width: 100, height: 50 },
        components: [
          {
            type: 'background',
            source: { type: 'rect', fill: '#ffffff', radius: 4 },
          },
          {
            type: 'bar',
            source: { type: 'rect', fill: '#0ea5e9', radius: 3 },
            size: { width: '100%', height: '80%' },
            placement: 'bottom',
          },
          { type: 'icon', source: 'alert', show: true, size: 10 },
        ],
      },
    ]);
    renderer.render(nextSnapshot);

    const nextBarNode = nextSnapshot.renderIR.byFeature.get('bar')[0];
    expect(renderer.objectsById.get(nextBarNode.id)).toBe(barObject);
    expect(barObject.height).toBe(40);
    expect(barObject.y).toBe(10);
  });

  it('renders aggregateable backgrounds and bars through particle layers', () => {
    const world = new Container();
    const renderer = new V2PixiRenderer({
      store: {
        world,
        theme: {},
        textureResolver: () => Texture.WHITE,
      },
      target: world,
    });
    const engine = new PatchMapV2Engine();
    const snapshot = engine.draw([
      {
        type: 'grid',
        id: 'panel-grid',
        cells: [['A', 'B']],
        gap: { x: 4, y: 0 },
        item: {
          size: { width: 100, height: 50 },
          components: [
            {
              type: 'background',
              source: { type: 'rect', fill: '#ffffff', radius: 4 },
            },
            {
              type: 'bar',
              source: { type: 'rect', fill: '#0ea5e9', radius: 3 },
              size: { width: '100%', height: '50%' },
              placement: 'bottom',
            },
          ],
        },
      },
    ]);

    renderer.render(snapshot);

    expect(renderer.objectsById.size).toBe(0);
    expect(renderer.aggregateLayers.background.particleChildren).toHaveLength(
      2,
    );
    expect(renderer.aggregateLayers.bar.particleChildren).toHaveLength(2);
    expect(renderer.particlesById.size).toBe(4);
    const firstBar = renderer.aggregateLayers.bar.particleChildren[0];
    expect(firstBar.x).toBe(0);
    expect(firstBar.y).toBe(25);
    expect(firstBar.scaleX).toBe(100);
    expect(firstBar.scaleY).toBe(25);
  });
});
