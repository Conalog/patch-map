import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCentroid, getObjectWorldCorners } from '../../utils/transform';
import { setupPatchmapTests } from './patchmap.setup';

describe('Relations Component Rendering Tests', () => {
  const { getPatchmap } = setupPatchmapTests();

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const baseMapData = [
    { type: 'item', id: 'item-A', size: 50, attrs: { x: 100, y: 100 } },
    { type: 'item', id: 'item-B', size: 50, attrs: { x: 300, y: 100 } },
    { type: 'item', id: 'item-C', size: 50, attrs: { x: 200, y: 300 } },
    {
      type: 'relations',
      id: 'rel-1',
      links: [{ source: 'item-A', target: 'item-B' }],
      style: { width: 2, color: 'primary.default' }, // 0x0c73bf
    },
  ];

  const getRelations = (patchmap) => {
    return patchmap.selector('$..[?(@.id=="rel-1")]')[0];
  };

  const getPath = (patchmap) => {
    return getRelations(patchmap).children[0];
  };

  const getWorldRoot = (patchmap) => patchmap.viewport.children[0];

  const withOffsetRelations = (data = baseMapData, attrs = { x: 60, y: 40 }) =>
    data.map((element) =>
      element.id === 'rel-1' ? { ...element, attrs } : element,
    );

  const createGroupedGridRelationsMap = ({ withFocusItem = false } = {}) => [
    {
      type: 'group',
      id: 'yard',
      attrs: { x: 56, y: 44 },
      children: [
        {
          type: 'grid',
          id: 'grid-1',
          attrs: { x: 0, y: 0, angle: -5 },
          gap: 4,
          cells: [
            [1, 1, 1],
            [1, 1, 1],
          ],
          item: {
            size: { width: 24, height: 48 },
            padding: { x: 3, y: 3 },
            components: [
              {
                type: 'background',
                source: {
                  type: 'rect',
                  fill: 'white',
                  borderWidth: 1,
                  borderColor: 'primary.dark',
                  radius: 3,
                },
              },
              {
                type: 'bar',
                source: {
                  type: 'rect',
                  fill: 'primary.default',
                  radius: 2,
                },
                size: { width: '100%', height: '38%' },
                placement: 'bottom',
              },
            ],
          },
        },
        ...(withFocusItem
          ? [
              {
                type: 'item',
                id: 'focus-item',
                size: 50,
                attrs: { x: 500, y: 200 },
              },
            ]
          : []),
      ],
    },
    {
      type: 'relations',
      id: 'rel-1',
      links: [{ source: 'grid-1.0.0', target: 'grid-1.0.1' }],
      style: { width: 2, color: 'primary.accent' },
    },
  ];

  const getRelationsLocalCenter = (relations, object) => {
    return relations.toLocal(getCentroid(getObjectWorldCorners(object)));
  };

  const expectFirstLinkAligned = (relations, source, target) => {
    const point = relations.linkPoints[0];
    const sourceCenter = getRelationsLocalCenter(relations, source);
    const targetCenter = getRelationsLocalCenter(relations, target);

    expect(point.sourcePoint[0]).toBeCloseTo(sourceCenter.x);
    expect(point.sourcePoint[1]).toBeCloseTo(sourceCenter.y);
    expect(point.targetPoint[0]).toBeCloseTo(targetCenter.x);
    expect(point.targetPoint[1]).toBeCloseTo(targetCenter.y);

    return point;
  };

  const renderRelationScene = async ({
    data = baseMapData,
    sourceId = 'item-A',
    targetId = 'item-B',
    beforeDraw,
    afterDraw,
    waitMs = 100,
  } = {}) => {
    const patchmap = getPatchmap();
    beforeDraw?.(patchmap);
    patchmap.draw(data);
    afterDraw?.(patchmap);
    await vi.advanceTimersByTimeAsync(waitMs);

    return {
      patchmap,
      relations: getRelations(patchmap),
      source: patchmap.selector(`$..[?(@.id=="${sourceId}")]`)[0],
      target: patchmap.selector(`$..[?(@.id=="${targetId}")]`)[0],
    };
  };

  const renderGroupedGridRelationScene = async (options = {}) => {
    return renderRelationScene({
      data: createGroupedGridRelationsMap({
        withFocusItem: options.withFocusItem ?? false,
      }),
      sourceId: 'grid-1.0.0',
      targetId: 'grid-1.0.1',
      waitMs: options.waitMs ?? 100,
      beforeDraw: options.beforeDraw,
      afterDraw: options.afterDraw,
    });
  };

  it('should render correctly with initial properties', async () => {
    const {
      patchmap,
      relations,
      source: itemA,
      target: itemB,
    } = await renderRelationScene();
    const path = getPath(patchmap);

    expect(relations).toBeDefined();
    expect(path).toBeDefined();
    expect(path.type).toBe('path');

    expect(relations.props.links).toHaveLength(1);
    expect(relations.props.style.width).toBe(2);

    expect(relations.linkPoints).toHaveLength(1);
    const points = relations.linkPoints[0];
    expect(points.sourcePoint).toEqual([itemA.x, itemA.y]);
    expect(points.targetPoint).toEqual([itemB.x, itemB.y]);
  });

  it('should update path style when the "style" property changes', async () => {
    const { patchmap } = await renderRelationScene();

    patchmap.update({
      path: '$..[?(@.id=="rel-1")]',
      changes: { style: { width: 5, color: 'primary.accent' } }, // 0xef4444
    });

    const path = getPath(patchmap);
    expect(path.strokeStyle.width).toBe(5);
    expect(path.strokeStyle.color).toBe(0xef4444);
  });

  it('should recalculate points and redraw when "links" property changes', async () => {
    const { patchmap, relations } = await renderRelationScene();
    const originalPointsLength = relations.linkPoints.length;
    expect(originalPointsLength).toBe(1);

    patchmap.update({
      path: '$..[?(@.id=="rel-1")]',
      changes: {
        links: [{ source: 'item-B', target: 'item-C' }],
      },
    });
    await vi.advanceTimersByTimeAsync(100);

    const updatedRelations = getRelations(patchmap);
    expect(updatedRelations.props.links).toHaveLength(2);
    expect(updatedRelations.linkPoints).toHaveLength(2);

    const newPoints = updatedRelations.linkPoints[1];
    const itemB = patchmap.selector('$..[?(@.id=="item-B")]')[0];
    const itemC = patchmap.selector('$..[?(@.id=="item-C")]')[0];
    expect(newPoints.sourcePoint).toEqual([itemB.x, itemB.y]);
    expect(newPoints.targetPoint).toEqual([itemC.x, itemC.y]);
  });

  it('should recalculate points and redraw when a linked item is moved', async () => {
    const { patchmap, relations } = await renderRelationScene();
    const originalPoint = [...relations.linkPoints[0].targetPoint];
    expect(originalPoint).toEqual([300, 100]);

    patchmap.update({
      path: '$..[?(@.id=="item-B")]',
      changes: { attrs: { x: 400, y: 250 } },
    });

    await vi.advanceTimersByTimeAsync(100);

    const updatedPoints = relations.linkPoints[0].targetPoint;
    expect(updatedPoints).not.toEqual(originalPoint);
    expect(updatedPoints).toEqual([400, 250]);

    const path = getPath(patchmap);
    expect(path.getBounds().width).toBeGreaterThan(0);
  });

  it('should keep link points in relations local coordinates when relations are offset', async () => {
    const { relations, source, target } = await renderRelationScene({
      data: withOffsetRelations(),
    });

    expect(relations.linkPoints).toHaveLength(1);
    expectFirstLinkAligned(relations, source, target);
  });

  it('should keep link points stable while world rotation/flip changes', async () => {
    const { patchmap, relations, source, target } = await renderRelationScene({
      data: withOffsetRelations(),
    });

    expect(relations.linkPoints).toHaveLength(1);
    expect(relations.parent).toBe(getWorldRoot(patchmap));
    const baselineAngle = relations.angle ?? 0;
    const baselineScaleX = relations.scale?.x ?? 1;
    const baselineScaleY = relations.scale?.y ?? 1;
    const baseline = structuredClone(relations.linkPoints[0]);

    const expectAligned = () => {
      const point = expectFirstLinkAligned(relations, source, target);
      expect(relations.parent).toBe(getWorldRoot(patchmap));
      expect(relations.angle ?? 0).toBeCloseTo(baselineAngle);
      expect(relations.scale?.x ?? 1).toBeCloseTo(baselineScaleX);
      expect(relations.scale?.y ?? 1).toBeCloseTo(baselineScaleY);
      expect(point.sourcePoint[0]).toBeCloseTo(baseline.sourcePoint[0]);
      expect(point.sourcePoint[1]).toBeCloseTo(baseline.sourcePoint[1]);
      expect(point.targetPoint[0]).toBeCloseTo(baseline.targetPoint[0]);
      expect(point.targetPoint[1]).toBeCloseTo(baseline.targetPoint[1]);
    };

    expectAligned();

    for (const state of [
      { rotation: 15 },
      { rotation: 30 },
      { rotation: 45 },
      { rotation: 90 },
      { rotation: 90, flip: { x: true, y: false } },
      { rotation: 90, flip: { x: false, y: true } },
      { rotation: 90, flip: { x: true, y: true } },
      { rotation: 0, flip: { x: false, y: false } },
    ]) {
      patchmap.rotation.set(state.rotation);
      if (state.flip) {
        patchmap.flip.set(state.flip);
      }
      await vi.advanceTimersByTimeAsync(100);
      expectAligned();
    }
  });

  it('should keep link points aligned immediately when world rotation changes', async () => {
    const { patchmap, relations, source, target } = await renderRelationScene({
      data: withOffsetRelations(),
    });

    patchmap.rotation.set(-45);

    expectFirstLinkAligned(relations, source, target);
  });

  it('should align link points after draw+fit when rotation is already set', async () => {
    const { relations, source, target } = await renderRelationScene({
      beforeDraw: (instance) => instance.rotation.set(-15),
      afterDraw: (instance) => instance.fit(),
    });

    expect(relations.linkPoints).toHaveLength(1);
    expectFirstLinkAligned(relations, source, target);
  });

  it('should keep grouped grid relation points aligned when rotation changes before relations settle', async () => {
    const { patchmap, relations, source, target } =
      await renderGroupedGridRelationScene();

    patchmap.rotation.set(-15);
    await vi.advanceTimersByTimeAsync(100);

    expectFirstLinkAligned(relations, source, target);
  });

  it('should keep grouped grid relation points aligned after focus and zoom', async () => {
    const { patchmap, relations, source, target } =
      await renderGroupedGridRelationScene({ withFocusItem: true });

    patchmap.focus('focus-item');
    patchmap.viewport.setZoom(0.5, true);
    await vi.advanceTimersByTimeAsync(100);

    expectFirstLinkAligned(relations, source, target);
  });
});
