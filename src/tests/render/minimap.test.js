import { afterEach, describe, expect, it, vi } from 'vitest';
import { Patchmap } from '../../patchmap';

const createHost = () => {
  const element = document.createElement('div');
  element.style.width = '800px';
  element.style.height = '600px';
  document.body.appendChild(element);
  return element;
};

const createMinimapHost = () => {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return element;
};

describe('minimap', () => {
  let patchmap;
  let element;
  let minimapHost;

  afterEach(() => {
    patchmap?.destroy();
    patchmap = null;
    element?.remove();
    element = null;
    minimapHost?.remove();
    minimapHost = null;
    document.body.innerHTML = '';
  });

  it('requires finite canvas bounds', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element);

    expect(() => patchmap.createMinimap(minimapHost)).toThrow(
      'patchmap.createMinimap() requires canvas.bounds.',
    );
  });

  it('renders a minimap canvas and cleans it up', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    const minimap = patchmap.createMinimap(minimapHost, {
      width: 180,
      height: 120,
    });

    expect(minimapHost.querySelector('canvas')).toBe(minimap.canvas);
    expect(minimap.canvas.width).toBeGreaterThanOrEqual(180);
    expect(minimap.canvas.height).toBeGreaterThanOrEqual(120);

    minimap.destroy();

    expect(minimap.destroyed).toBe(true);
    expect(minimapHost.querySelector('canvas')).toBeNull();
  });

  it('rejects invalid minimap dimensions', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    expect(() => patchmap.createMinimap(minimapHost, { width: 0 })).toThrow(
      'minimap.width must be a positive finite number.',
    );
  });

  it('moves the viewport from minimap pointer navigation', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    const minimap = patchmap.createMinimap(minimapHost, {
      width: 180,
      height: 120,
    });
    const emitSpy = vi.spyOn(patchmap.viewport, 'emit');
    minimap.canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 180,
      height: 120,
      right: 180,
      bottom: 120,
    });

    minimap.canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 90,
        clientY: 60,
        bubbles: true,
      }),
    );

    const center = patchmap.viewport.toWorld(
      patchmap.viewport.screenWidth / 2,
      patchmap.viewport.screenHeight / 2,
    );
    expect(center.x).toBeCloseTo(500, 1);
    expect(center.y).toBeCloseTo(250, 1);
    expect(emitSpy).toHaveBeenCalledWith(
      'moved',
      expect.objectContaining({
        viewport: patchmap.viewport,
        type: 'minimap',
      }),
    );
  });

  it('refreshes from focus and fit viewport changes', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 2000, height: 1200 },
      },
    });
    patchmap.draw([
      {
        type: 'item',
        id: 'target',
        size: 50,
        components: [
          {
            type: 'background',
            source: { type: 'rect', fill: 'white' },
          },
        ],
        attrs: { x: 1000, y: 600 },
      },
    ]);

    const minimap = patchmap.createMinimap(minimapHost);
    const requestRenderSpy = vi.spyOn(minimap, 'requestRender');

    patchmap.focus('target');
    patchmap.fit('target');

    expect(requestRenderSpy).toHaveBeenCalledTimes(2);
  });

  it('omits hidden elements from the minimap snapshot', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });
    patchmap.draw([
      {
        type: 'item',
        id: 'visible',
        size: 50,
        components: [
          {
            type: 'background',
            source: { type: 'rect', fill: 'white' },
          },
        ],
        attrs: { x: 100, y: 100 },
      },
      {
        type: 'item',
        id: 'hidden',
        show: false,
        size: 50,
        components: [
          {
            type: 'background',
            source: { type: 'rect', fill: 'white' },
          },
        ],
        attrs: { x: 300, y: 100 },
      },
    ]);

    const minimap = patchmap.createMinimap(minimapHost);
    minimap.render();

    expect(minimap._snapshot.objects).toHaveLength(1);
  });

  it('projects rotated objects as minimap polygons', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });
    patchmap.draw([
      {
        type: 'item',
        id: 'rotated',
        size: { width: 80, height: 40 },
        components: [
          {
            type: 'background',
            source: { type: 'rect', fill: 'white' },
          },
        ],
        attrs: { x: 200, y: 120, angle: 30 },
      },
    ]);

    const minimap = patchmap.createMinimap(minimapHost);
    minimap.render();

    const points = minimap._snapshot.objects[0].points;
    expect(points).toHaveLength(4);
    expect(points[1].y).not.toBeCloseTo(points[0].y, 4);
  });

  it('renders a full grid as one minimap silhouette', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });
    patchmap.draw([
      {
        type: 'grid',
        id: 'full-grid',
        cells: [
          [1, 1],
          [1, 1],
        ],
        gap: 10,
        item: {
          size: { width: 50, height: 30 },
          components: [
            {
              type: 'background',
              source: { type: 'rect', fill: 'white' },
            },
          ],
        },
        attrs: { x: 100, y: 100, angle: 20 },
      },
    ]);

    const minimap = patchmap.createMinimap(minimapHost);
    minimap.render();

    expect(minimap._snapshot.objects).toHaveLength(1);
    expect(minimap._snapshot.objects[0].paths).toHaveLength(1);
    expect(minimap._snapshot.objects[0].points).toHaveLength(4);
  });

  it('reflects inactive grid cells as simplified minimap contours', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });
    patchmap.draw([
      {
        type: 'grid',
        id: 'sparse-grid',
        cells: [
          [1, 0],
          [1, 1],
        ],
        gap: 10,
        item: {
          size: { width: 50, height: 30 },
          components: [
            {
              type: 'background',
              source: { type: 'rect', fill: 'white' },
            },
          ],
        },
        attrs: { x: 100, y: 100, angle: 20 },
      },
    ]);

    const grid = patchmap.selector('$..[?(@.id=="sparse-grid")]')[0];
    const minimap = patchmap.createMinimap(minimapHost);
    minimap.render();

    expect(grid.children).toHaveLength(3);
    expect(minimap._snapshot.objects).toHaveLength(1);
    expect(minimap._snapshot.objects[0].paths).toHaveLength(1);
    expect(minimap._snapshot.objects[0].points.length).toBeGreaterThan(4);
  });

  it('reflects inactive interior grid cells as minimap holes', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });
    patchmap.draw([
      {
        type: 'grid',
        id: 'hole-grid',
        cells: [
          [1, 1, 1],
          [1, 0, 1],
          [1, 1, 1],
        ],
        gap: 10,
        item: {
          size: { width: 50, height: 30 },
          components: [
            {
              type: 'background',
              source: { type: 'rect', fill: 'white' },
            },
          ],
        },
        attrs: { x: 100, y: 100 },
      },
    ]);

    const minimap = patchmap.createMinimap(minimapHost);
    minimap.render();

    expect(minimap._snapshot.objects).toHaveLength(1);
    expect(minimap._snapshot.objects[0].paths).toHaveLength(2);
  });

  it('reuses minimap object silhouettes for viewport-only renders', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });
    patchmap.draw([
      {
        type: 'item',
        id: 'cached',
        size: 50,
        components: [
          {
            type: 'background',
            source: { type: 'rect', fill: 'white' },
          },
        ],
        attrs: { x: 100, y: 100 },
      },
    ]);

    const minimap = patchmap.createMinimap(minimapHost);
    const firstObjects = minimap._snapshot.objects;

    patchmap.viewport.emit('moved', { viewport: patchmap.viewport });
    minimap.render();

    expect(minimap._snapshot.objects).toBe(firstObjects);
  });

  it('refreshes minimap object silhouettes after object updates', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });
    patchmap.draw([
      {
        type: 'item',
        id: 'updated',
        size: 50,
        components: [
          {
            type: 'background',
            source: { type: 'rect', fill: 'white' },
          },
        ],
        attrs: { x: 100, y: 100 },
      },
    ]);

    const minimap = patchmap.createMinimap(minimapHost);
    const firstObjects = minimap._snapshot.objects;

    patchmap.emit('patchmap:updated', { patchmap });
    minimap.render();

    expect(minimap._snapshot.objects).not.toBe(firstObjects);
  });
});
