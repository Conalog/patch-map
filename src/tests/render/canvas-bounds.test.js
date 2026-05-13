import { afterEach, describe, expect, it } from 'vitest';
import { Patchmap } from '../../patchmap';

const createHost = ({ width = 800, height = 600 } = {}) => {
  const element = document.createElement('div');
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);
  return element;
};

const waitForFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

const getRendererPoint = (patchmap, clientPoint) => {
  const point = { x: 0, y: 0 };
  patchmap.app.renderer.events.mapPositionToPoint(
    point,
    clientPoint.x,
    clientPoint.y,
  );
  return point;
};

const getViewportClientPoint = (patchmap, xRatio, yRatio) => {
  const rect = patchmap.app.canvas.getBoundingClientRect();
  return {
    x: rect.left + rect.width * xRatio,
    y: rect.top + rect.height * yRatio,
  };
};

const dispatchViewportWheel = (patchmap, clientPoint, deltaY) => {
  patchmap.app.canvas.dispatchEvent(
    new WheelEvent('wheel', {
      clientX: clientPoint.x,
      clientY: clientPoint.y,
      deltaY,
      bubbles: true,
      cancelable: true,
    }),
  );
};

const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('canvas bounds', () => {
  let patchmap;
  let element;

  afterEach(() => {
    patchmap?.destroy();
    patchmap = null;
    element?.remove();
    element = null;
    document.body.innerHTML = '';
  });

  it('keeps infinite canvas behavior when bounds are omitted', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element);

    expect(patchmap.canvas.bounds).toBeNull();
    expect(patchmap._canvasBoundsController).toBeNull();
  });

  it('installs finite canvas bounds without adding a render layer', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: -20, y: 30, width: 120, height: 80 },
      },
    });

    expect(patchmap.canvas.bounds).toEqual({
      x: -20,
      y: 30,
      width: 120,
      height: 80,
      right: 100,
      bottom: 110,
    });
    expect(patchmap._canvasBoundsController).toBeTruthy();
    expect(patchmap.viewport.forceHitArea).toMatchObject({
      x: -20,
      y: 30,
      width: 120,
      height: 80,
    });
  });

  it('keeps pre-init finite canvas bounds when init omits canvas options', async () => {
    element = createHost();
    patchmap = new Patchmap();

    patchmap.setCanvasBounds({ x: -500, y: -300, width: 5000, height: 3000 });
    await patchmap.init(element);

    expect(patchmap.canvas.bounds).toEqual({
      x: -500,
      y: -300,
      width: 5000,
      height: 3000,
      right: 4500,
      bottom: 2700,
    });
    expect(patchmap._canvasBoundsController).toBeTruthy();
    expect(patchmap.world.store.canvasBounds).toBe(patchmap.canvas.bounds);
  });

  it('keeps viewport clamping aligned with world transforms', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 2400, height: 2400 },
      },
    });

    patchmap.rotation.set(25);
    patchmap.flip.set({ x: true });
    patchmap.viewport.moveCenter(100000, 100000);
    patchmap.viewport.emit('world_transformed');

    const frame = getVisibleCanvasFrame(patchmap);
    expect(frame.x).toBeGreaterThanOrEqual(-0.01);
    expect(frame.y).toBeGreaterThanOrEqual(-0.01);
    expect(frame.x + frame.width).toBeLessThanOrEqual(2400.01);
    expect(frame.y + frame.height).toBeLessThanOrEqual(2400.01);
  });

  it('raises finite canvas minScale to the scale where the whole canvas fits', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 2000, height: 1000 },
      },
      viewport: {
        plugins: {
          clampZoom: { minScale: 0.1 },
        },
      },
    });

    const clampZoom = patchmap.viewport.plugins.get('clamp-zoom');
    expect(clampZoom.options.minScale).toBeCloseTo(0.4);
  });

  it('clamps viewport movement to finite canvas bounds', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: -20, y: 30, width: 2000, height: 1600 },
      },
    });

    patchmap.viewport.moveCenter(100000, 100000);
    patchmap.viewport.emit('moved');

    expect(patchmap.viewport.right).toBeLessThanOrEqual(1980);
    expect(patchmap.viewport.bottom).toBeLessThanOrEqual(1630);

    patchmap.viewport.moveCenter(-100000, -100000);
    patchmap.viewport.emit('moved');

    expect(patchmap.viewport.left).toBeGreaterThanOrEqual(-20);
    expect(patchmap.viewport.top).toBeGreaterThanOrEqual(30);
  });

  it('updates finite canvas bounds at runtime', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 5000, height: 3000 },
      },
    });

    const events = [];
    patchmap.on('patchmap:canvas-bounds-changed', (event) => {
      events.push(event.bounds);
    });

    patchmap.setCanvasBounds({
      x: -4000,
      y: -3000,
      width: 8000,
      height: 8000,
    });

    expect(patchmap.canvas.bounds).toEqual({
      x: -4000,
      y: -3000,
      width: 8000,
      height: 8000,
      right: 4000,
      bottom: 5000,
    });
    expect(patchmap.viewport.forceHitArea).toMatchObject({
      x: -4000,
      y: -3000,
      width: 8000,
      height: 8000,
    });
    expect(patchmap.world.store.canvasBounds).toBe(patchmap.canvas.bounds);
    expect(events).toEqual([patchmap.canvas.bounds]);

    patchmap.viewport.moveCenter(-100000, -100000);
    patchmap.viewport.emit('moved');

    const frame = getVisibleCanvasFrame(patchmap);
    expect(frame.x).toBeGreaterThanOrEqual(-4000.01);
    expect(frame.y).toBeGreaterThanOrEqual(-3000.01);
  });

  it('clamps viewport movement against rotated canvas bounds', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 2400, height: 2400 },
      },
    });

    patchmap.rotation.set(90);
    patchmap.viewport.moveCenter(100000, 100000);
    patchmap.viewport.emit('moved');

    const frame = getVisibleCanvasFrame(patchmap);
    expect(frame.x).toBeGreaterThanOrEqual(-0.01);
    expect(frame.y).toBeGreaterThanOrEqual(-0.01);
    expect(frame.x + frame.width).toBeLessThanOrEqual(2400.01);
    expect(frame.y + frame.height).toBeLessThanOrEqual(2400.01);
  });

  it('keeps wheel zoom anchored to the pointer while finite canvas bounds are clamped', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 5000, height: 3000 },
      },
      viewport: {
        plugins: {
          clampZoom: { minScale: 0.1 },
        },
      },
    });

    const minScale =
      patchmap.viewport.plugins.get('clamp-zoom').options.minScale;
    patchmap.viewport.setZoom(minScale, true);
    patchmap._canvasBoundsController.applyViewportClamp({
      centerUnderflow: true,
    });
    const clampOptions = [];
    const applyViewportClamp =
      patchmap._canvasBoundsController.applyViewportClamp.bind(
        patchmap._canvasBoundsController,
      );
    patchmap._canvasBoundsController.applyViewportClamp = (options) => {
      clampOptions.push(options ?? {});
      return applyViewportClamp(options);
    };

    const clientPoint = getViewportClientPoint(patchmap, 0.5, 0.5);
    const pointer = getRendererPoint(patchmap, clientPoint);
    const before = patchmap.viewport.toWorld(pointer.x, pointer.y);

    dispatchViewportWheel(patchmap, clientPoint, -120);
    await waitForFrame();

    const after = patchmap.viewport.toWorld(pointer.x, pointer.y);

    expect(patchmap.viewport.scale.x).toBeGreaterThan(minScale);
    expect(getDistance(after, before)).toBeLessThan(0.5);
  });

  it('keeps wheel zoom anchored when one finite canvas axis underflows the viewport', async () => {
    element = createHost({ width: 600, height: 900 });
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 5000, height: 3000 },
      },
      viewport: {
        plugins: {
          clampZoom: { minScale: 0.1 },
        },
      },
    });

    const minScale =
      patchmap.viewport.plugins.get('clamp-zoom').options.minScale;
    patchmap.viewport.setZoom(minScale, true);
    patchmap._canvasBoundsController.applyViewportClamp();

    const clientPoint = getViewportClientPoint(patchmap, 0.65, 0.48);
    const pointer = getRendererPoint(patchmap, clientPoint);
    const before = patchmap.viewport.toWorld(pointer.x, pointer.y);

    dispatchViewportWheel(patchmap, clientPoint, -120);
    await waitForFrame();

    const after = patchmap.viewport.toWorld(pointer.x, pointer.y);

    expect(patchmap.viewport.scale.x).toBeGreaterThan(minScale);
    expect(getDistance(after, before)).toBeLessThan(0.5);
  });

  it('keeps underflowing finite canvas bounds visible without forcing center alignment', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 100, y: 50, width: 120, height: 80 },
      },
    });

    patchmap._canvasBoundsController.applyViewportClamp();
    patchmap.viewport.top = 50;
    patchmap._canvasBoundsController.applyViewportClamp();

    const frame = getVisibleCanvasFrame(patchmap);
    expect(frame.x).toBeLessThanOrEqual(100.01);
    expect(frame.y).toBeLessThanOrEqual(50.01);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(219.99);
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(129.99);
    expect(frame.y).toBeCloseTo(50, 1);
  });

  it('keeps focus and fit inside finite canvas bounds', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: -20, y: 30, width: 2000, height: 1600 },
      },
    });
    patchmap.draw([
      {
        type: 'item',
        id: 'outside',
        size: 50,
        components: [
          {
            type: 'background',
            source: { type: 'rect', fill: 'white' },
          },
        ],
        attrs: { x: 100000, y: 100000 },
      },
    ]);

    patchmap.focus('outside');

    expect(patchmap.viewport.right).toBeLessThanOrEqual(1980);
    expect(patchmap.viewport.bottom).toBeLessThanOrEqual(1630);

    patchmap.viewport.moveCenter(-100000, -100000);
    patchmap.fit('outside', { padding: 0 });

    expect(patchmap.viewport.right).toBeLessThanOrEqual(1980);
    expect(patchmap.viewport.bottom).toBeLessThanOrEqual(1630);
  });

  it('keeps programmatic updates permissive in finite canvas mode', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 0, y: 0, width: 500, height: 300 },
      },
    });
    patchmap.draw([
      {
        type: 'item',
        id: 'bounded',
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
    const item = patchmap.selector('$..[?(@.id=="bounded")]')[0];

    patchmap.update({
      elements: [item],
      changes: { attrs: { x: 1000, y: -1000 } },
      history: true,
    });

    expect(item.x).toBeCloseTo(1000, 1);
    expect(item.y).toBeCloseTo(-1000, 1);
    expect(item.props.attrs.x).toBeCloseTo(1000, 1);
    expect(item.props.attrs.y).toBeCloseTo(-1000, 1);

    patchmap.undoRedoManager.undo();

    expect(item.x).toBeCloseTo(100, 1);
    expect(item.y).toBeCloseTo(100, 1);

    patchmap.undoRedoManager.redo();

    expect(item.x).toBeCloseTo(1000, 1);
    expect(item.y).toBeCloseTo(-1000, 1);
  });
});

const getVisibleCanvasFrame = (patchmap) => {
  const points = [
    { x: 0, y: 0 },
    { x: patchmap.app.screen.width, y: 0 },
    { x: patchmap.app.screen.width, y: patchmap.app.screen.height },
    { x: 0, y: patchmap.app.screen.height },
  ].map((point) => patchmap.world.toLocal(point));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
};
