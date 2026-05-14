import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findIntersectObject } from '../../events/find';
import { Patchmap } from '../../patchmap';
import Transformer from '../../transformer/Transformer';

const createPanelData = () => [
  {
    type: 'item',
    id: 'panel-1',
    size: { width: 100, height: 50 },
    attrs: { display: 'panelItem' },
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
];

describe('Patchmap v2 opt-in mode', () => {
  let patchmap;
  let element;

  beforeEach(async () => {
    document.body.innerHTML = '';
    element = document.createElement('div');
    element.style.height = '100svh';
    document.body.appendChild(element);

    patchmap = new Patchmap();
    await patchmap.init(element, {
      engine: 'v2',
      transformer: new Transformer({
        resizeHandles: true,
        rotateHandles: true,
        boundsDisplayMode: 'all',
      }),
    });
  });

  afterEach(() => {
    patchmap?.destroy();
    element?.parentElement?.removeChild(element);
  });

  it('keeps draw, selector, update, and renderer object reuse behind the v2 option', () => {
    patchmap.draw(createPanelData());

    const [item] = patchmap.selector('$..[?(@.id=="panel-1")]');
    expect(item).toMatchObject({ id: 'panel-1', display: 'panelItem' });

    const barParticle =
      patchmap._v2Renderer.aggregateLayers.bar.particleChildren[0];
    expect(barParticle.scaleY).toBe(25);
    expect(barParticle.y).toBe(25);

    const updated = patchmap.update({
      elements: item,
      changes: {
        components: [{ type: 'bar', size: { height: '80%' } }],
      },
      validateSchema: false,
    });

    expect(updated).toEqual([item]);
    expect(patchmap._v2Renderer.aggregateLayers.bar.particleChildren[0]).toBe(
      barParticle,
    );
    expect(barParticle.scaleY).toBe(40);
    expect(barParticle.y).toBe(10);
  });

  it('exposes lightweight bounds refs for fit and transformer drawing', () => {
    patchmap.draw(createPanelData());

    const [item] = patchmap.selector('$..[?(@.id=="panel-1")]');
    expect(item.getBounds()).toMatchObject({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });

    patchmap.fit(null, { padding: 0 });
    patchmap.transformer.elements = [item];
    patchmap.transformer.draw();

    expect(patchmap.transformer.elements).toEqual([item]);
    expect(patchmap.transformer.children.length).toBeGreaterThan(0);
  });

  it('exposes v2 refs through the scene index for hit testing', () => {
    patchmap.draw(createPanelData());

    const hit = findIntersectObject(
      patchmap.viewport,
      { x: 50, y: 25 },
      {
        selectUnit: 'entity',
        filter: (target) => target.type === 'item',
      },
    );

    expect(hit).toMatchObject({ id: 'panel-1', type: 'item' });
  });

  it('batches emit:false v2 updates into the next frame', async () => {
    patchmap.draw(createPanelData());
    const [item] = patchmap.selector('$..[?(@.id=="panel-1")]');
    const barParticle =
      patchmap._v2Renderer.aggregateLayers.bar.particleChildren[0];

    patchmap.update({
      elements: item,
      changes: {
        components: [{ type: 'bar', size: { height: '80%' } }],
      },
      validateSchema: false,
      emit: false,
    });

    expect(patchmap._v2UpdateQueue).toHaveLength(1);
    expect(barParticle.scaleY).toBe(25);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(patchmap._v2UpdateQueue).toHaveLength(0);
    expect(patchmap._v2Engine.dirty).toBe(false);
    expect(barParticle.scaleY).toBe(40);
  });
});
