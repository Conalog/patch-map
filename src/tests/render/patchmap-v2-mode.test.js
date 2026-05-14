import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Patchmap } from '../../patchmap';

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
    await patchmap.init(element, { engine: 'v2' });
  });

  afterEach(() => {
    patchmap?.destroy();
    element?.parentElement?.removeChild(element);
  });

  it('keeps draw, selector, update, and renderer object reuse behind the v2 option', () => {
    patchmap.draw(createPanelData());

    const [item] = patchmap.selector('$..[?(@.id=="panel-1")]');
    expect(item).toMatchObject({ id: 'panel-1', display: 'panelItem' });

    const barLayer = patchmap.world.children.find(
      (child) => child.label === 'patchmap-v2-bar-layer',
    );
    const barObject = barLayer.children[0];
    expect(barObject.height).toBe(25);
    expect(barObject.y).toBe(25);

    const updated = patchmap.update({
      elements: item,
      changes: {
        components: [{ type: 'bar', size: { height: '80%' } }],
      },
      validateSchema: false,
    });

    expect(updated).toEqual([item]);
    expect(barLayer.children[0]).toBe(barObject);
    expect(barObject.height).toBe(40);
    expect(barObject.y).toBe(10);
  });
});
