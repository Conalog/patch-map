import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calcOrientedBounds } from '../../utils/bounds';
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

  it('should render correctly with initial properties', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseMapData);
    await vi.advanceTimersByTimeAsync(100);

    const relations = getRelations(patchmap);
    const path = getPath(patchmap);

    expect(relations).toBeDefined();
    expect(path).toBeDefined();
    expect(path.type).toBe('path');

    expect(relations.props.links).toHaveLength(1);
    expect(relations.props.style.width).toBe(2);

    expect(relations.linkPoints).toHaveLength(1);
    const points = relations.linkPoints[0];
    const itemA = patchmap.selector('$..[?(@.id=="item-A")]')[0];
    const itemB = patchmap.selector('$..[?(@.id=="item-B")]')[0];

    expect(points.sourcePoint).toEqual([itemA.x, itemA.y]);
    expect(points.targetPoint).toEqual([itemB.x, itemB.y]);
  });

  it('should update path style when the "style" property changes', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseMapData);
    await vi.advanceTimersByTimeAsync(100);

    patchmap.update({
      path: '$..[?(@.id=="rel-1")]',
      changes: { style: { width: 5, color: 'primary.accent' } }, // 0xef4444
    });

    const path = getPath(patchmap);
    expect(path.strokeStyle.width).toBe(5);
    expect(path.strokeStyle.color).toBe(0xef4444);
  });

  it('should recalculate points and redraw when "links" property changes', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseMapData);
    await vi.advanceTimersByTimeAsync(100);

    const relations = getRelations(patchmap);
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
    const patchmap = getPatchmap();
    patchmap.draw(baseMapData);
    await vi.advanceTimersByTimeAsync(100);

    const relations = getRelations(patchmap);
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

  it('should keep link points aligned after world rotation/flip', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseMapData);
    await vi.advanceTimersByTimeAsync(100);

    patchmap.rotation.set(90);
    patchmap.flip.set({ x: true, y: true });
    await vi.advanceTimersByTimeAsync(100);

    const relations = getRelations(patchmap);
    expect(relations.linkPoints).toHaveLength(1);

    const point = relations.linkPoints[0];
    const itemA = patchmap.selector('$..[?(@.id=="item-A")]')[0];
    const itemB = patchmap.selector('$..[?(@.id=="item-B")]')[0];

    const sourceCenter = relations.parent.toLocal(
      calcOrientedBounds(itemA).center,
    );
    const targetCenter = relations.parent.toLocal(
      calcOrientedBounds(itemB).center,
    );

    expect(point.sourcePoint[0]).toBeCloseTo(sourceCenter.x);
    expect(point.sourcePoint[1]).toBeCloseTo(sourceCenter.y);
    expect(point.targetPoint[0]).toBeCloseTo(targetCenter.x);
    expect(point.targetPoint[1]).toBeCloseTo(targetCenter.y);
  });

  it('should keep link points aligned after 270-degree rotation with live updates', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseMapData);
    await vi.advanceTimersByTimeAsync(100);

    patchmap.rotation.set(270);
    patchmap.flip.set({ x: true, y: true });
    patchmap.update({
      path: '$..[?(@.id=="item-B")]',
      changes: { attrs: { x: 360, y: 180 } },
    });
    await vi.advanceTimersByTimeAsync(100);

    const relations = getRelations(patchmap);
    expect(relations.linkPoints).toHaveLength(1);

    const point = relations.linkPoints[0];
    const itemA = patchmap.selector('$..[?(@.id=="item-A")]')[0];
    const itemB = patchmap.selector('$..[?(@.id=="item-B")]')[0];

    const sourceCenter = relations.parent.toLocal(
      calcOrientedBounds(itemA).center,
    );
    const targetCenter = relations.parent.toLocal(
      calcOrientedBounds(itemB).center,
    );

    expect(point.sourcePoint[0]).toBeCloseTo(sourceCenter.x);
    expect(point.sourcePoint[1]).toBeCloseTo(sourceCenter.y);
    expect(point.targetPoint[0]).toBeCloseTo(targetCenter.x);
    expect(point.targetPoint[1]).toBeCloseTo(targetCenter.y);
  });
});
