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

  describe('Resize Handles', () => {
    const resizeSampleData = [
      {
        type: 'rect',
        id: 'rect-1',
        size: { width: 100, height: 80 },
        attrs: { x: 100, y: 100 },
      },
      {
        type: 'image',
        id: 'image-1',
        source: '',
        size: { width: 120, height: 90 },
        attrs: { x: 260, y: 120 },
      },
      {
        type: 'item',
        id: 'item-4',
        size: 70,
        attrs: { x: 420, y: 140 },
      },
    ];

    const getBottomRightHandle = (transformer) => {
      const handleLayer = getHandleLayer(transformer);
      if (!handleLayer) throw new Error('resize handle layer is missing');
      const visibleHandles = getVisibleHandles(transformer);
      if (visibleHandles.length === 0)
        throw new Error('visible resize handle is missing');
      return visibleHandles.reduce((maxHandle, handle) =>
        handle.x + handle.y > maxHandle.x + maxHandle.y ? handle : maxHandle,
      );
    };

    const getHandleLayer = (transformer) =>
      transformer.children.find((child) => child.label === 'resize-handles');

    const getVisibleHandles = (transformer) => {
      const handleLayer = getHandleLayer(transformer);
      return handleLayer
        ? handleLayer.children.filter(
            (child) =>
              child.visible && child.label?.startsWith('resize-handle:'),
          )
        : [];
    };

    const getVisibleEdges = (transformer) => {
      const handleLayer = getHandleLayer(transformer);
      return handleLayer
        ? handleLayer.children.filter(
            (child) => child.visible && child.label?.startsWith('resize-edge:'),
          )
        : [];
    };

    const getEdgeTarget = (transformer, edge) => {
      const handleLayer = getHandleLayer(transformer);
      const target = handleLayer?.children.find(
        (child) => child.label === `resize-edge:${edge}`,
      );
      if (!target || !target.visible) {
        throw new Error(`resize edge target is missing: ${edge}`);
      }
      return target;
    };

    const resizeWithBottomRightHandle = (
      patchmap,
      transformer,
      delta,
      { shiftKey = false } = {},
    ) => {
      transformer.draw();
      const handle = getBottomRightHandle(transformer);
      const startGlobal = transformer.toGlobal({ x: handle.x, y: handle.y });
      const endGlobal = {
        x: startGlobal.x + delta.x,
        y: startGlobal.y + delta.y,
      };

      handle.emit('pointerdown', {
        global: startGlobal,
        stopPropagation: vi.fn(),
      });
      patchmap.viewport.emit('pointermove', {
        global: endGlobal,
        shiftKey,
        stopPropagation: vi.fn(),
      });
      patchmap.viewport.emit('pointerup', {
        global: endGlobal,
        stopPropagation: vi.fn(),
      });
    };

    const resizeWithEdge = (
      patchmap,
      transformer,
      edge,
      delta,
      startPoint,
      { shiftKey = false } = {},
    ) => {
      transformer.draw();
      const edgeTarget = getEdgeTarget(transformer, edge);
      const edgeBounds = edgeTarget.getLocalBounds();
      const defaultCenter = edgeTarget.toGlobal({
        x: edgeBounds.x + edgeBounds.width / 2,
        y: edgeBounds.y + edgeBounds.height / 2,
      });
      const startGlobal = startPoint ?? {
        x: defaultCenter.x,
        y: defaultCenter.y,
      };
      const endGlobal = {
        x: startGlobal.x + delta.x,
        y: startGlobal.y + delta.y,
      };

      edgeTarget.emit('pointerdown', {
        global: startGlobal,
        stopPropagation: vi.fn(),
      });
      patchmap.viewport.emit('pointermove', {
        global: endGlobal,
        shiftKey,
        stopPropagation: vi.fn(),
      });
      patchmap.viewport.emit('pointerup', {
        global: endGlobal,
        stopPropagation: vi.fn(),
      });
    };

    it('should resize only rect and image elements', () => {
      const patchmap = getPatchmap();
      patchmap.draw(resizeSampleData);
      const transformer = new Transformer({ resizeHandles: true });
      patchmap.transformer = transformer;

      const rect = patchmap.selector('$..[?(@.id=="rect-1")]')[0];
      const image = patchmap.selector('$..[?(@.id=="image-1")]')[0];
      const item = patchmap.selector('$..[?(@.id=="item-4")]')[0];
      transformer.elements = [rect, image, item];

      const rectApplySpy = vi.spyOn(rect, 'apply');
      const imageApplySpy = vi.spyOn(image, 'apply');
      const itemApplySpy = vi.spyOn(item, 'apply');
      const initialItemProps = structuredClone(item.props);

      resizeWithBottomRightHandle(patchmap, transformer, { x: 40, y: 30 });

      expect(rectApplySpy).toHaveBeenCalled();
      expect(imageApplySpy).toHaveBeenCalled();
      expect(itemApplySpy).not.toHaveBeenCalled();

      const [rectChanges] = rectApplySpy.mock.calls.at(-1);
      expect(rectChanges.size.width).toBeGreaterThan(100);
      expect(rectChanges.size.height).toBeGreaterThan(80);
      expect(rectChanges.attrs.width).toBeUndefined();
      expect(rectChanges.attrs.height).toBeUndefined();

      expect(item.props.size).toEqual(initialItemProps.size);
      expect(item.props.attrs).toEqual(initialItemProps.attrs);
    });

    it('should emit update_elements while resizing', () => {
      const patchmap = getPatchmap();
      patchmap.draw(resizeSampleData);
      const transformer = new Transformer({ resizeHandles: true });
      patchmap.transformer = transformer;

      const rect = patchmap.selector('$..[?(@.id=="rect-1")]')[0];
      transformer.elements = [rect];

      const updateElementsSpy = vi.fn();
      transformer.on('update_elements', updateElementsSpy);

      resizeWithBottomRightHandle(patchmap, transformer, { x: 40, y: 30 });

      expect(updateElementsSpy).toHaveBeenCalled();
      const [payload] = updateElementsSpy.mock.calls.at(-1);
      expect(payload.target).toBe(transformer);
      expect(payload.current).toEqual([rect]);
      expect(payload.added).toEqual([]);
      expect(payload.removed).toEqual([]);
    });

    it('should apply integer sizes when resizing elements with decimal sizes', () => {
      const patchmap = getPatchmap();
      patchmap.draw([
        {
          type: 'rect',
          id: 'rect-decimal',
          size: { width: 100.4, height: 80.6 },
          attrs: { x: 100, y: 100 },
        },
      ]);
      const transformer = new Transformer({ resizeHandles: true });
      patchmap.transformer = transformer;

      const rect = patchmap.selector('$..[?(@.id=="rect-decimal")]')[0];
      transformer.elements = [rect];
      const rectApplySpy = vi.spyOn(rect, 'apply');

      resizeWithBottomRightHandle(patchmap, transformer, { x: 20, y: 20 });

      const [rectChanges] = rectApplySpy.mock.calls.at(-1);
      expect(Number.isInteger(rectChanges.size.width)).toBe(true);
      expect(Number.isInteger(rectChanges.size.height)).toBe(true);
    });

    it('should hide resize handles when selection has no resizable elements', () => {
      const patchmap = getPatchmap();
      patchmap.draw(resizeSampleData);
      const transformer = new Transformer({ resizeHandles: true });
      patchmap.transformer = transformer;

      const item = patchmap.selector('$..[?(@.id=="item-4")]')[0];
      transformer.elements = [item];
      transformer.draw();

      expect(getVisibleHandles(transformer)).toHaveLength(0);
    });

    it('should hide resize handles when boundsDisplayMode is none', () => {
      const patchmap = getPatchmap();
      patchmap.draw(resizeSampleData);
      const transformer = new Transformer({ resizeHandles: true });
      patchmap.transformer = transformer;

      const rect = patchmap.selector('$..[?(@.id=="rect-1")]')[0];
      transformer.elements = [rect];
      transformer.boundsDisplayMode = 'none';
      transformer.draw();

      expect(getVisibleHandles(transformer)).toHaveLength(0);
      expect(getVisibleEdges(transformer)).toHaveLength(0);
    });

    it('should render only four corner handles', () => {
      const patchmap = getPatchmap();
      patchmap.draw(resizeSampleData);
      const transformer = new Transformer({ resizeHandles: true });
      patchmap.transformer = transformer;

      const rect = patchmap.selector('$..[?(@.id=="rect-1")]')[0];
      const image = patchmap.selector('$..[?(@.id=="image-1")]')[0];
      transformer.elements = [rect, image];
      transformer.draw();

      expect(getVisibleHandles(transformer)).toHaveLength(4);
    });

    it('should prioritize corner handles over edge hit targets in overlap areas', () => {
      const patchmap = getPatchmap();
      patchmap.draw(resizeSampleData);
      const transformer = new Transformer({ resizeHandles: true });
      patchmap.transformer = transformer;

      const rect = patchmap.selector('$..[?(@.id=="rect-1")]')[0];
      transformer.elements = [rect];
      transformer.draw();

      const handleLayer = getHandleLayer(transformer);
      const visibleHandles = getVisibleHandles(transformer);
      const visibleEdges = getVisibleEdges(transformer);

      expect(handleLayer?.sortableChildren).toBe(true);
      expect(visibleEdges.length).toBeGreaterThan(0);
      visibleHandles.forEach((handle) => {
        visibleEdges.forEach((edge) => {
          expect(handle.zIndex).toBeGreaterThan(edge.zIndex);
        });
      });
    });

    it('should resize width from the right edge without changing height', () => {
      const patchmap = getPatchmap();
      patchmap.draw(resizeSampleData);
      const transformer = new Transformer({ resizeHandles: true });
      patchmap.transformer = transformer;

      const rect = patchmap.selector('$..[?(@.id=="rect-1")]')[0];
      transformer.elements = [rect];
      const rectApplySpy = vi.spyOn(rect, 'apply');
      const startOnRightEdge = transformer.toGlobal({
        x: rect.x + rect.props.size.width,
        y: rect.y + rect.props.size.height / 2,
      });

      resizeWithEdge(
        patchmap,
        transformer,
        'right',
        { x: 40, y: 0 },
        startOnRightEdge,
      );

      const [rectChanges] = rectApplySpy.mock.calls.at(-1);
      expect(rectChanges.size.width).toBeGreaterThan(100);
      expect(rectChanges.size.height).toBeCloseTo(80);
    });

    it('should keep aspect ratio when shift is pressed on edge resize', () => {
      const patchmap = getPatchmap();
      patchmap.draw(resizeSampleData);
      const transformer = new Transformer({ resizeHandles: true });
      patchmap.transformer = transformer;

      const rect = patchmap.selector('$..[?(@.id=="rect-1")]')[0];
      transformer.elements = [rect];
      const rectApplySpy = vi.spyOn(rect, 'apply');
      const startOnRightEdge = transformer.toGlobal({
        x: rect.x + rect.props.size.width,
        y: rect.y + rect.props.size.height / 2,
      });

      resizeWithEdge(
        patchmap,
        transformer,
        'right',
        { x: 40, y: 0 },
        startOnRightEdge,
        { shiftKey: true },
      );

      const [rectChanges] = rectApplySpy.mock.calls.at(-1);
      expect(rectChanges.size.width / rectChanges.size.height).toBeCloseTo(
        100 / 80,
        3,
      );
    });

    it('should share one historyId for a single resize gesture when resizeHistory is true', () => {
      const patchmap = getPatchmap();
      patchmap.draw(resizeSampleData);
      const transformer = new Transformer({
        resizeHandles: true,
        resizeHistory: true,
      });
      patchmap.transformer = transformer;

      const rect = patchmap.selector('$..[?(@.id=="rect-1")]')[0];
      const image = patchmap.selector('$..[?(@.id=="image-1")]')[0];
      transformer.elements = [rect, image];

      const rectApplySpy = vi.spyOn(rect, 'apply');
      const imageApplySpy = vi.spyOn(image, 'apply');

      resizeWithBottomRightHandle(patchmap, transformer, { x: 30, y: 20 });

      const rectOptionsWithHistory = rectApplySpy.mock.calls
        .map(([, options]) => options)
        .find((options) => typeof options?.historyId === 'string');
      const imageOptionsWithHistory = imageApplySpy.mock.calls
        .map(([, options]) => options)
        .find((options) => typeof options?.historyId === 'string');

      expect(typeof rectOptionsWithHistory?.historyId).toBe('string');
      expect(rectOptionsWithHistory?.historyId).toBe(
        imageOptionsWithHistory?.historyId,
      );
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
