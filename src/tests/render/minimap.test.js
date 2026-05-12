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

  it('creates a default minimap container inside the init host', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    const minimap = patchmap.createMinimap({
      width: 180,
      height: 120,
    });
    const generatedHost = element.querySelector('[data-patchmap-minimap]');

    expect(generatedHost).toBe(minimap.container);
    expect(generatedHost.querySelector('canvas')).toBe(minimap.canvas);

    minimap.destroy();

    expect(element.querySelector('[data-patchmap-minimap]')).toBeNull();
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

  it('does not expose minimap padding as a public option', async () => {
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
      padding: 40,
    });
    minimap.render();

    expect(minimap.options.padding).toBeUndefined();
    expect(minimap._snapshot.canvas.x).toBeCloseTo(1, 4);
  });

  it('uses explicit minimap style fill and stroke option names', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    const minimap = patchmap.createMinimap(minimapHost, {
      style: {
        canvasFill: '#111111',
        canvasStroke: '#222222',
        objectFill: '#333333',
        viewportFill: 'rgba(1, 2, 3, 0.2)',
        viewportStroke: '#444444',
        viewportStrokeWidth: 3,
      },
    });

    expect(minimap.options.style).toEqual({
      canvasFill: '#111111',
      canvasStroke: '#222222',
      objectFill: '#333333',
      viewportFill: 'rgba(1, 2, 3, 0.2)',
      viewportStroke: '#444444',
      viewportStrokeWidth: 3,
    });
  });

  it('anchors the minimap to the bottom-right corner by default', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    const minimap = patchmap.createMinimap(minimapHost);

    expect(minimapHost.style.position).toBe('fixed');
    expect(minimapHost.style.right).toBe('16px');
    expect(minimapHost.style.bottom).toBe('16px');
    expect(minimapHost.style.top).toBe('');
    expect(minimapHost.style.left).toBe('');

    minimap.destroy();

    expect(minimapHost.style.position).toBe('');
    expect(minimapHost.style.right).toBe('');
    expect(minimapHost.style.bottom).toBe('');
  });

  it.each([
    ['top-left', { top: '12px', left: '12px', right: '', bottom: '' }],
    ['top-right', { top: '12px', right: '12px', left: '', bottom: '' }],
    ['bottom-left', { bottom: '12px', left: '12px', top: '', right: '' }],
    ['bottom-right', { bottom: '12px', right: '12px', top: '', left: '' }],
  ])('anchors the minimap to %s', async (position, expected) => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    patchmap.createMinimap(minimapHost, {
      position,
      positionOffset: 12,
    });

    expect(minimapHost.style.position).toBe('fixed');
    for (const [key, value] of Object.entries(expected)) {
      expect(minimapHost.style[key]).toBe(value);
    }
  });

  it('rejects invalid minimap positions', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    expect(() =>
      patchmap.createMinimap(minimapHost, { position: 'center' }),
    ).toThrow(
      'minimap.position must be one of top-left, top-right, bottom-left, bottom-right.',
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

  it('includes standalone rect elements but omits image and text', async () => {
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
        type: 'rect',
        id: 'rect-object',
        size: { width: 80, height: 40 },
        fill: 'white',
        attrs: { x: 100, y: 100, angle: 15 },
      },
      {
        type: 'image',
        id: 'image-object',
        source: '',
        size: { width: 90, height: 50 },
        attrs: { x: 250, y: 100, angle: 20 },
      },
      {
        type: 'text',
        id: 'text-object',
        text: 'Label',
        size: { width: 120, height: 40 },
        attrs: { x: 420, y: 100, angle: 25 },
      },
      {
        type: 'relations',
        id: 'relations-object',
        links: [],
        style: { width: 2 },
      },
    ]);

    const minimap = patchmap.createMinimap(minimapHost);
    minimap.render();

    expect(minimap._snapshot.objects).toHaveLength(1);
    expect(minimap._snapshot.objects.map((object) => object.type)).toEqual([
      'rect',
    ]);
    expect(
      minimap._snapshot.objects.every((object) => object.points.length === 4),
    ).toBe(true);
  });

  it('orders minimap objects by render z-index', async () => {
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
        type: 'rect',
        id: 'front-rect',
        size: { width: 100, height: 100 },
        fill: 'white',
        attrs: { x: 300, y: 100, zIndex: 20 },
      },
      {
        type: 'rect',
        id: 'back-rect',
        size: { width: 100, height: 100 },
        fill: 'white',
        attrs: { x: 100, y: 100, zIndex: 0 },
      },
      {
        type: 'item',
        id: 'middle-item',
        size: 100,
        components: [
          {
            type: 'background',
            source: { type: 'rect', fill: 'white' },
          },
        ],
        attrs: { x: 200, y: 100, zIndex: 10 },
      },
    ]);

    const minimap = patchmap.createMinimap(minimapHost);
    minimap.render();

    const objectXs = minimap._snapshot.objects.map(
      (object) => object.points[0].x,
    );
    expect(objectXs).toEqual([...objectXs].sort((a, b) => a - b));
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
