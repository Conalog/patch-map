import gsap from 'gsap';
import { Point } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from './patchmap.setup';

describe('View Transform Tests', () => {
  const { getPatchmap } = setupPatchmapTests();

  const createItemWithComponents = (components) => ({
    type: 'item',
    id: 'item-transform',
    size: { width: 200, height: 100 },
    components,
  });

  const getById = (patchmap, id) =>
    patchmap.selector(`$..[?(@.id=="${id}")]`)[0];

  const tempWorldPoint = new Point();
  const tempParentPoint = new Point();

  const getBoundsInParent = (component) => {
    const bounds = component.getBounds();
    if (!component.parent) {
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    }
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x, y: bounds.y + bounds.height },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    ];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const corner of corners) {
      tempWorldPoint.set(corner.x, corner.y);
      component.parent.toLocal(tempWorldPoint, undefined, tempParentPoint);
      minX = Math.min(minX, tempParentPoint.x);
      minY = Math.min(minY, tempParentPoint.y);
      maxX = Math.max(maxX, tempParentPoint.x);
      maxY = Math.max(maxY, tempParentPoint.y);
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  };

  const expectMirroredX = (before, after, parentWidth) => {
    const mirroredX = parentWidth - before.x - before.width;
    expect(after.x).toBeCloseTo(mirroredX);
    expect(after.width).toBeCloseTo(before.width);
  };

  const expectMirroredY = (before, after, parentHeight) => {
    const mirroredY = parentHeight - before.y - before.height;
    expect(after.y).toBeCloseTo(mirroredY);
    expect(after.height).toBeCloseTo(before.height);
  };

  const getParentSize = (component) => ({
    width: component?.parent?.props?.size?.width ?? 0,
    height: component?.parent?.props?.size?.height ?? 0,
  });

  it('should apply rotation and flip via controllers', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createItemWithComponents([
        {
          type: 'text',
          id: 'text-basic',
          text: 'Hello',
          style: { fontSize: 20, fill: 'black' },
        },
      ]),
    ]);
    gsap.exportRoot().totalProgress(1);

    patchmap.rotation.set(90);
    expect(patchmap.world.angle).toBe(90);
    expect(patchmap.rotation.value).toBe(90);

    patchmap.rotation.rotateBy(90);
    expect(patchmap.world.angle).toBe(180);

    patchmap.rotation.reset();
    expect(patchmap.world.angle).toBe(0);

    patchmap.rotation.set(Number.POSITIVE_INFINITY);
    expect(patchmap.world.angle).toBe(0);
    expect(patchmap.rotation.value).toBe(0);

    patchmap.flip.toggleX();
    expect(patchmap.world.scale.x).toBe(-1);
    expect(patchmap.flip.x).toBe(true);

    patchmap.flip.toggleY();
    expect(patchmap.world.scale.y).toBe(-1);
    expect(patchmap.flip.y).toBe(true);

    patchmap.flip.reset();
    expect(patchmap.world.scale.x).toBe(1);
    expect(patchmap.world.scale.y).toBe(1);
  });

  it('should sync text and icon orientation on rotation and flip', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createItemWithComponents([
        {
          type: 'text',
          id: 'text-sync',
          text: 'Sync',
          style: { fontSize: 20, fill: 'black' },
        },
        {
          type: 'icon',
          id: 'icon-sync',
          source: 'device',
          size: 20,
        },
      ]),
    ]);
    gsap.exportRoot().totalProgress(1);

    const text = getById(patchmap, 'text-sync');
    const icon = getById(patchmap, 'icon-sync');

    patchmap.rotation.set(90);
    patchmap.flip.set({ x: true, y: true });

    expect(text.angle).toBe(180);
    expect(icon.angle).toBe(180);
    expect(text.scale.x).toBeLessThan(0);
    expect(text.scale.y).toBeLessThan(0);
    expect(icon.scale.x).toBeLessThan(0);
    expect(icon.scale.y).toBeLessThan(0);

    patchmap.rotation.reset();
    patchmap.flip.reset();

    expect(text.angle).toBe(0);
    expect(icon.angle).toBe(0);
    expect(text.scale.x).toBeGreaterThan(0);
    expect(text.scale.y).toBeGreaterThan(0);
    expect(icon.scale.x).toBeGreaterThan(0);
    expect(icon.scale.y).toBeGreaterThan(0);
  });

  it('should not continuously counter-rotate text/icon with view angle', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createItemWithComponents([
        {
          type: 'text',
          id: 'text-angle-step',
          text: 'Step',
          style: { fontSize: 20, fill: 'black' },
        },
        {
          type: 'icon',
          id: 'icon-angle-step',
          source: 'device',
          size: 20,
        },
      ]),
    ]);
    gsap.exportRoot().totalProgress(1);

    const text = getById(patchmap, 'text-angle-step');
    const icon = getById(patchmap, 'icon-angle-step');

    patchmap.rotation.set(45);
    expect(text.angle).toBe(0);
    expect(icon.angle).toBe(0);

    patchmap.rotation.set(135);
    expect(text.angle).toBe(180);
    expect(icon.angle).toBe(180);

    patchmap.rotation.set(225);
    expect(text.angle).toBe(180);
    expect(icon.angle).toBe(180);

    patchmap.rotation.set(315);
    expect(text.angle).toBe(0);
    expect(icon.angle).toBe(0);
  });

  const placements = [
    'left-top',
    'center',
    'right-bottom',
    'right-top',
    'left-bottom',
    'top',
    'bottom',
    'left',
    'right',
  ];

  it.each(
    placements,
  )('should keep text placement stable after rotation/flip (%s)', (placement) => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createItemWithComponents([
        {
          type: 'text',
          id: 'text-placement',
          text: 'Place',
          placement,
          style: { fontSize: 20, fill: 'black' },
        },
      ]),
    ]);
    gsap.exportRoot().totalProgress(1);

    const text = getById(patchmap, 'text-placement');
    const initialBounds = getBoundsInParent(text);

    patchmap.rotation.set(90);
    patchmap.flip.set({ x: true, y: true });

    const rotatedBounds = getBoundsInParent(text);
    expect(rotatedBounds.x).toBeCloseTo(initialBounds.x);
    expect(rotatedBounds.y).toBeCloseTo(initialBounds.y);
  });

  it.each(
    placements,
  )('should keep icon placement stable after rotation/flip (%s)', (placement) => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createItemWithComponents([
        {
          type: 'icon',
          id: 'icon-placement',
          source: 'device',
          size: 20,
          placement,
        },
      ]),
    ]);
    gsap.exportRoot().totalProgress(1);

    const icon = getById(patchmap, 'icon-placement');
    const initialBounds = getBoundsInParent(icon);

    patchmap.rotation.set(90);
    patchmap.flip.set({ x: true, y: true });

    const rotatedBounds = getBoundsInParent(icon);
    expect(rotatedBounds.x).toBeCloseTo(initialBounds.x);
    expect(rotatedBounds.y).toBeCloseTo(initialBounds.y);
  });

  it('should mirror icon bounds on flipX/flipY', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createItemWithComponents([
        {
          type: 'icon',
          id: 'icon-bounds',
          source: 'device',
          size: 30,
          placement: 'left-top',
        },
      ]),
    ]);
    gsap.exportRoot().totalProgress(1);

    const icon = getById(patchmap, 'icon-bounds');
    const parentSize = getParentSize(icon);
    const before = getBoundsInParent(icon);

    patchmap.flip.set({ x: true });
    const afterFlipX = getBoundsInParent(icon);
    expectMirroredX(before, afterFlipX, parentSize.width);
    expect(afterFlipX.y).toBeCloseTo(before.y);

    patchmap.flip.set({ x: true, y: true });
    const afterFlipY = getBoundsInParent(icon);
    expect(afterFlipY.x).toBeCloseTo(afterFlipX.x);
    expectMirroredY(before, afterFlipY, parentSize.height);
  });

  it('should mirror text bounds on flipX/flipY', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createItemWithComponents([
        {
          type: 'text',
          id: 'text-bounds',
          text: 'Flip',
          style: { fontSize: 20, fill: 'black' },
          placement: 'left-top',
        },
      ]),
    ]);
    gsap.exportRoot().totalProgress(1);

    const text = getById(patchmap, 'text-bounds');
    const parentSize = getParentSize(text);
    const before = getBoundsInParent(text);

    patchmap.flip.set({ x: true });
    const afterFlipX = getBoundsInParent(text);
    expectMirroredX(before, afterFlipX, parentSize.width);
    expect(afterFlipX.y).toBeCloseTo(before.y);

    patchmap.flip.set({ x: true, y: true });
    const afterFlipY = getBoundsInParent(text);
    expect(afterFlipY.x).toBeCloseTo(afterFlipX.x);
    expectMirroredY(before, afterFlipY, parentSize.height);
  });

  it('should keep bar percent size on 90-degree rotation', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createItemWithComponents([
        {
          type: 'bar',
          id: 'bar-rotate-size',
          source: { fill: 'blue', borderWidth: 0, borderColor: 'transparent' },
          size: { width: '60%', height: '20%' },
          placement: 'center',
          animation: false,
        },
      ]),
    ]);
    gsap.exportRoot().totalProgress(1);

    const bar = getById(patchmap, 'bar-rotate-size');

    patchmap.rotation.set(90);
    patchmap.flip.set({ x: true, y: true });

    expect(bar.width).toBeCloseTo(120);
    expect(bar.height).toBeCloseTo(20);
  });

  it('should keep bar at screen bottom under rotation/flip', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createItemWithComponents([
        {
          type: 'bar',
          id: 'bar-screen-bottom',
          source: { fill: 'blue', borderWidth: 0, borderColor: 'transparent' },
          size: { width: '40%', height: '20%' },
          placement: 'bottom',
          animation: false,
        },
      ]),
    ]);
    gsap.exportRoot().totalProgress(1);

    const bar = getById(patchmap, 'bar-screen-bottom');
    const item = getById(patchmap, 'item-transform');

    patchmap.rotation.set(90);
    patchmap.flip.set({ y: true });

    const barBounds = bar.getBounds();
    const itemBounds = item.getBounds();
    expect(barBounds.y + barBounds.height).toBeCloseTo(
      itemBounds.y + itemBounds.height,
    );
  });

  it('should keep bar aligned during mid-animation resize under rotation/flip', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createItemWithComponents([
        {
          type: 'bar',
          id: 'bar-animated-resize',
          source: { fill: 'blue', borderWidth: 0, borderColor: 'transparent' },
          size: { width: '20%', height: '10%' },
          placement: 'bottom',
          animation: true,
          animationDuration: 300,
        },
      ]),
    ]);
    gsap.exportRoot().totalProgress(1);

    const bar = getById(patchmap, 'bar-animated-resize');
    const item = getById(patchmap, 'item-transform');
    const sizeCases = [
      { width: '30%', height: '12%' },
      { width: '65%', height: '25%' },
      { width: '45%', height: '18%' },
      { width: '80%', height: '30%' },
    ];

    patchmap.rotation.set(90);
    patchmap.flip.set({ y: true });

    for (const size of sizeCases) {
      patchmap.update({
        path: '$..[?(@.id=="bar-animated-resize")]',
        changes: { size },
      });

      gsap.exportRoot().totalProgress(0.5);
      const midBarBounds = bar.getBounds();
      const midItemBounds = item.getBounds();
      const midBottomGap = Math.abs(
        midBarBounds.y +
          midBarBounds.height -
          (midItemBounds.y + midItemBounds.height),
      );

      expect(Number.isFinite(midBarBounds.x)).toBe(true);
      expect(Number.isFinite(midBarBounds.y)).toBe(true);
      expect(Number.isFinite(midBarBounds.width)).toBe(true);
      expect(Number.isFinite(midBarBounds.height)).toBe(true);
      expect(midBottomGap).toBeLessThan(1);

      gsap.exportRoot().totalProgress(1);
      const endBarBounds = bar.getBounds();
      const endItemBounds = item.getBounds();
      const endBottomGap = Math.abs(
        endBarBounds.y +
          endBarBounds.height -
          (endItemBounds.y + endItemBounds.height),
      );
      expect(endBottomGap).toBeLessThan(1);
    }
  });
});
