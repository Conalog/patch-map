import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Transformer } from '../patch-map';
import { setupPatchmapTests } from '../tests/render/patchmap.setup';

const sampleData = [
  {
    type: 'group',
    id: 'group-1',
    attrs: { x: 100, y: 100 },
    children: [
      { type: 'item', id: 'item-1', size: 50, attrs: { x: 0, y: 0 } },
      { type: 'item', id: 'item-2', size: 60, attrs: { x: 100, y: 50 } },
    ],
  },
  {
    type: 'item',
    id: 'item-3',
    size: 80,
    attrs: { x: 300, y: 200 },
  },
];

describe('Transformer', () => {
  const { getPatchmap } = setupPatchmapTests();

  describe('Initialization', () => {
    it('should instantiate with default options', () => {
      const transformer = new Transformer();
      expect(transformer.elements).toEqual([]);
      expect(transformer.boundsDisplayMode).toBe('all');
      expect(transformer.wireframeStyle.thickness).toBe(1.5);
      expect(transformer.wireframeStyle.color).toBe('#1099FF');
      expect(transformer.children.length).toBe(2); // wireframe
    });

    it('should instantiate with custom options', () => {
      const patchmap = getPatchmap();
      patchmap.draw(sampleData);
      const elements = patchmap.selector('$..children');
      const transformer = new Transformer({
        elements: elements,
        wireframeStyle: { thickness: 3, color: '#FF0000' },
        boundsDisplayMode: 'groupOnly',
      });

      expect(transformer.elements).toEqual(elements);
      expect(transformer.boundsDisplayMode).toBe('groupOnly');
      expect(transformer.wireframeStyle.thickness).toBe(3);
      expect(transformer.wireframeStyle.color).toBe('#FF0000');
    });

    it('should be added to the patchmap viewport', () => {
      const patchmap = getPatchmap();
      const transformer = new Transformer();
      patchmap.transformer = transformer;
      expect(patchmap.viewport.children).toContain(transformer);
    });
  });

  describe('elements property', () => {
    it('should accept a single element and wrap it in an array', () => {
      const patchmap = getPatchmap();
      patchmap.draw(sampleData);
      const transformer = new Transformer();
      patchmap.transformer = transformer;

      const item = patchmap.selector('$..[?(@.id=="item-1")]')[0];
      transformer.elements = item;

      expect(transformer.elements).toEqual([item]);
    });

    it('should accept an array of elements', () => {
      const patchmap = getPatchmap();
      patchmap.draw(sampleData);
      const transformer = new Transformer();
      patchmap.transformer = transformer;

      const group = patchmap.selector('$..[?(@.id=="group-1")]')[0];
      const item3 = patchmap.selector('$..[?(@.id=="item-3")]')[0];
      transformer.elements = [group, item3];

      expect(transformer.elements).toEqual([group, item3]);
    });

    it('should trigger a redraw by setting _renderDirty to true', () => {
      const patchmap = getPatchmap();
      const transformer = new Transformer();
      patchmap.transformer = transformer;

      transformer._renderDirty = false;
      transformer.elements = [];
      expect(transformer._renderDirty).toBe(true);
    });
  });

  describe('Drawing Logic and boundsDisplayMode', () => {
    let patchmap;
    let transformer;
    let group;
    let item1;
    let item2;
    let item3;

    beforeEach(() => {
      patchmap = getPatchmap();
      patchmap.draw(sampleData);
      transformer = new Transformer();
      patchmap.transformer = transformer;
      group = patchmap.selector('$..[?(@.id=="group-1")]')[0];
      item1 = patchmap.selector('$..[?(@.id=="item-1")]')[0];
      item2 = patchmap.selector('$..[?(@.id=="item-2")]')[0];
      item3 = patchmap.selector('$..[?(@.id=="item-3")]')[0];
    });

    it('should clear the wireframe when elements array is empty', () => {
      const wireframeClearSpy = vi.spyOn(transformer.wireframe, 'clear');
      transformer.elements = [item1];
      transformer.draw(); // Draw something first
      expect(wireframeClearSpy).toHaveBeenCalledTimes(1);

      transformer.elements = [];
      transformer.draw();
      expect(wireframeClearSpy).toHaveBeenCalledTimes(2);
    });

    it('should draw both group and element bounds when mode is "all"', () => {
      const drawBoundsSpy = vi.spyOn(transformer.wireframe, 'drawBounds');
      transformer.elements = [group, item3];
      transformer.draw();
      // Called for group, item3, and then the combined group bounds
      expect(drawBoundsSpy).toHaveBeenCalledTimes(3);
    });

    it('should draw only the encompassing group bounds when mode is "groupOnly"', () => {
      const drawBoundsSpy = vi.spyOn(transformer.wireframe, 'drawBounds');
      transformer.boundsDisplayMode = 'groupOnly';
      transformer.elements = [item1, item2]; // Two elements
      transformer.draw();
      // Should be called only once for the combined bounds
      expect(drawBoundsSpy).toHaveBeenCalledTimes(1);
    });

    it('should draw only individual element bounds when mode is "elementOnly"', () => {
      const drawBoundsSpy = vi.spyOn(transformer.wireframe, 'drawBounds');
      transformer.boundsDisplayMode = 'elementOnly';
      transformer.elements = [item1, item2];
      transformer.draw();
      // Called once for each element
      expect(drawBoundsSpy).toHaveBeenCalledTimes(2);
    });

    it('should not draw anything when mode is "none"', () => {
      const drawBoundsSpy = vi.spyOn(transformer.wireframe, 'drawBounds');
      transformer.boundsDisplayMode = 'none';
      transformer.elements = [item1, item2];
      transformer.draw();
      expect(drawBoundsSpy).not.toHaveBeenCalled();
    });
  });

  describe('Viewport Interaction', () => {
    it('should adjust wireframe thickness on viewport zoom', () => {
      const patchmap = getPatchmap();
      patchmap.draw(sampleData);

      const transformer = new Transformer({ wireframeStyle: { thickness: 2 } });
      patchmap.transformer = transformer;
      transformer.elements = patchmap.selector('$..[?(@.id=="group-1")]')[0];

      patchmap.viewport.setZoom(2, true); // Zoom in
      patchmap.viewport.emit('zoomed'); // Manually emit for test reliability
      transformer.draw();
      expect(transformer.wireframe.strokeStyle.width).toBe(1); // 2 / 2 = 1

      patchmap.viewport.setZoom(0.5, true); // Zoom out
      patchmap.viewport.emit('zoomed');
      transformer.draw();
      expect(transformer.wireframe.strokeStyle.width).toBe(4); // 2 / 0.5 = 4
    });

    it('should remove "zoomed" listener on destroy', () => {
      const patchmap = getPatchmap();
      const transformer = new Transformer();
      patchmap.transformer = transformer;

      const offSpy = vi.spyOn(patchmap.viewport, 'off');
      transformer.destroy();

      expect(offSpy).toHaveBeenCalledWith('zoomed', transformer.update);
    });
  });
});
