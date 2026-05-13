import { afterEach, describe, expect, it, vi } from 'vitest';
import { Patchmap } from '../../patchmap';

const createHost = () => {
  const element = document.createElement('div');
  element.style.width = '800px';
  element.style.height = '600px';
  document.body.appendChild(element);
  return element;
};

const createMinimapHost = ({ width = 180, height = 120 } = {}) => {
  const element = document.createElement('div');
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);
  return element;
};

const nextAnimationFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

const serializePoints = (points) =>
  points.map((point) => ({ x: point.x, y: point.y }));

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

  it('requires an explicit minimap container', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    expect(() => patchmap.createMinimap()).toThrow(
      'patchmap.createMinimap() requires a DOM container.',
    );
  });

  it('fills the given minimap host area', async () => {
    element = createHost();
    minimapHost = createMinimapHost({ width: 240, height: 144 });
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    const minimap = patchmap.createMinimap(minimapHost);

    expect(minimap.canvas.style.width).toBe('100%');
    expect(minimap.canvas.style.height).toBe('100%');
    expect(minimap.canvas.width).toBeGreaterThanOrEqual(240);
    expect(minimap.canvas.height).toBeGreaterThanOrEqual(144);
  });

  it('keeps the viewport indicator flush with minimap edges at canvas bounds', async () => {
    element = createHost();
    minimapHost = createMinimapHost({ width: 240, height: 144 });
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 5000, height: 12000 },
      },
    });

    const minimap = patchmap.createMinimap(minimapHost);
    patchmap.viewport.setZoom(1, true);
    patchmap.viewport.moveCenter(-100000, 6000);
    patchmap._canvasBoundsController.applyViewportClamp();
    minimap.render();

    const left = Math.min(
      ...minimap._snapshot.viewport.map((point) => point.x),
    );
    expect(left).toBeCloseTo(minimap._snapshot.canvas.x, 4);
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

  it('uses explicit minimap render color option names', async () => {
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
        objectFill: '#333333',
        viewportFill: 'rgba(1, 2, 3, 0.2)',
        viewportStroke: '#444444',
        viewportStrokeWidth: 3,
      },
    });

    expect(minimap.options.style).toEqual({
      objectFill: '#333333',
      viewportFill: 'rgba(1, 2, 3, 0.2)',
      viewportStroke: '#444444',
      viewportStrokeWidth: 3,
    });
  });

  it('leaves minimap host positioning and chrome to the caller', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    minimapHost.style.position = 'absolute';
    minimapHost.style.right = '24px';
    minimapHost.style.bottom = '24px';
    minimapHost.style.borderRadius = '8px';
    minimapHost.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.2)';
    minimapHost.style.background = 'rgb(24, 24, 27)';
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    const minimap = patchmap.createMinimap(minimapHost);

    expect(minimapHost.style.position).toBe('absolute');
    expect(minimapHost.style.right).toBe('24px');
    expect(minimapHost.style.bottom).toBe('24px');
    expect(minimapHost.style.borderRadius).toBe('8px');
    expect(minimapHost.style.boxShadow).toContain('rgba');
    expect(minimapHost.style.background).toBe('rgb(24, 24, 27)');
    expect(minimap.canvas.style.background).toBe('');
    expect(minimap.canvas.style.borderRadius).toBe('');
    expect(minimap.canvas.style.boxShadow).toBe('');

    minimap.destroy();

    expect(minimapHost.style.position).toBe('absolute');
    expect(minimapHost.style.right).toBe('24px');
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

  it('refreshes the viewport indicator after silent viewport transform changes', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 5000, height: 3000 },
      },
    });

    const minimap = patchmap.createMinimap(minimapHost);
    const firstViewport = serializePoints(minimap._snapshot.viewport);

    patchmap.viewport.position.set(
      patchmap.viewport.x - 120,
      patchmap.viewport.y - 80,
    );
    patchmap.viewport.dirty = true;
    patchmap.app.ticker.update();
    await nextAnimationFrame();

    expect(serializePoints(minimap._snapshot.viewport)).not.toEqual(
      firstViewport,
    );

    const movedViewport = serializePoints(minimap._snapshot.viewport);

    patchmap.viewport.setZoom(2, true);
    patchmap.app.ticker.update();
    await nextAnimationFrame();

    expect(serializePoints(minimap._snapshot.viewport)).not.toEqual(
      movedViewport,
    );
  });

  it('refreshes the viewport indicator after silent world matrix changes', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 5000, height: 3000 },
      },
    });

    const minimap = patchmap.createMinimap(minimapHost);
    const firstViewport = serializePoints(minimap._snapshot.viewport);

    patchmap.world.skew.set(0.12, 0);
    patchmap.app.ticker.update();
    await nextAnimationFrame();

    expect(serializePoints(minimap._snapshot.viewport)).not.toEqual(
      firstViewport,
    );
  });

  it('does not read the Pixi application screen getter while watching viewport transforms', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 5000, height: 3000 },
      },
    });
    patchmap._resizeObserver?.disconnect();
    Object.defineProperty(patchmap.app, 'screen', {
      configurable: true,
      get() {
        throw new TypeError('screen getter should not be read');
      },
    });

    const minimap = patchmap.createMinimap(minimapHost);

    expect(() => minimap.render()).not.toThrow();
  });

  it('attaches viewport updates when created while patchmap initialization is still pending', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    const initPromise = patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 5000, height: 3000 },
      },
    });
    const minimap = patchmap.createMinimap(minimapHost);

    expect(minimap._attachedViewport).toBeNull();

    await initPromise;

    expect(minimap._attachedViewport).toBe(patchmap.viewport);
    const firstViewport = serializePoints(minimap._snapshot.viewport);

    patchmap.viewport.moveCenter({ x: 1600, y: 900 });
    patchmap.app.ticker.update();
    await nextAnimationFrame();

    expect(serializePoints(minimap._snapshot.viewport)).not.toEqual(
      firstViewport,
    );
  });

  it('destroys minimaps created while initialization is still pending', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    const initPromise = patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 5000, height: 3000 },
      },
    });
    const minimap = patchmap.createMinimap(minimapHost);

    patchmap.destroy();
    await initPromise;

    expect(minimap.destroyed).toBe(true);
    expect(patchmap.isInit).toBe(false);
    expect(minimapHost.querySelector('canvas')).toBeNull();
  });

  it('clears minimap snapshots when finite canvas bounds are removed', async () => {
    element = createHost();
    minimapHost = createMinimapHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 1000, height: 500 },
      },
    });

    const minimap = patchmap.createMinimap(minimapHost);
    expect(minimap._snapshot).toBeTruthy();

    patchmap.setCanvasBounds(null);
    minimap.render();

    expect(minimap._snapshot).toBeNull();
    expect(minimap._objectSnapshot).toBeNull();
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
