import { afterEach, describe, expect, it } from 'vitest';
import { Patchmap } from '../../patchmap';

const createHost = () => {
  const element = document.createElement('div');
  element.style.width = '800px';
  element.style.height = '600px';
  document.body.appendChild(element);
  return element;
};

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

  it('centers non-zero finite canvas bounds when the canvas underflows the viewport', async () => {
    element = createHost();
    patchmap = new Patchmap();

    await patchmap.init(element, {
      canvas: {
        bounds: { x: 100, y: 50, width: 120, height: 80 },
      },
    });

    patchmap._canvasBoundsController.applyViewportClamp();

    const center = patchmap.viewport.toWorld(
      patchmap.viewport.screenWidth / 2,
      patchmap.viewport.screenHeight / 2,
    );
    expect(center.x).toBeCloseTo(160, 1);
    expect(center.y).toBeCloseTo(90, 1);
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
