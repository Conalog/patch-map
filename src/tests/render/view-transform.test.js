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
    patchmap.viewport.emit('object_transformed', patchmap.world);

    expect(text.angle).toBe(-90);
    expect(icon.angle).toBe(-90);
    expect(text.scale.x).toBeLessThan(0);
    expect(text.scale.y).toBeLessThan(0);
    expect(icon.scale.x).toBeLessThan(0);
    expect(icon.scale.y).toBeLessThan(0);

    patchmap.rotation.reset();
    patchmap.flip.reset();
    patchmap.viewport.emit('object_transformed', patchmap.world);

    expect(text.angle).toBe(0);
    expect(icon.angle).toBe(0);
    expect(text.scale.x).toBeGreaterThan(0);
    expect(text.scale.y).toBeGreaterThan(0);
    expect(icon.scale.x).toBeGreaterThan(0);
    expect(icon.scale.y).toBeGreaterThan(0);
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

  it.each(placements)(
    'should keep text placement stable after rotation/flip (%s)',
    (placement) => {
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
      patchmap.viewport.emit('object_transformed', patchmap.world);

      const rotatedBounds = getBoundsInParent(text);
      expect(rotatedBounds.x).toBeCloseTo(initialBounds.x);
      expect(rotatedBounds.y).toBeCloseTo(initialBounds.y);
    },
  );

  it.each(placements)(
    'should keep icon placement stable after rotation/flip (%s)',
    (placement) => {
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
      patchmap.viewport.emit('object_transformed', patchmap.world);

      const rotatedBounds = getBoundsInParent(icon);
      expect(rotatedBounds.x).toBeCloseTo(initialBounds.x);
      expect(rotatedBounds.y).toBeCloseTo(initialBounds.y);
    },
  );

  it('should keep icon bounds stable on flipX/flipY', () => {
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
    const before = getBoundsInParent(icon);

    patchmap.flip.set({ x: true });
    patchmap.viewport.emit('object_transformed', patchmap.world);
    const afterFlipX = getBoundsInParent(icon);
    expect(afterFlipX.x).toBeCloseTo(before.x);
    expect(afterFlipX.y).toBeCloseTo(before.y);

    patchmap.flip.set({ x: true, y: true });
    patchmap.viewport.emit('object_transformed', patchmap.world);
    const afterFlipY = getBoundsInParent(icon);
    expect(afterFlipY.x).toBeCloseTo(before.x);
    expect(afterFlipY.y).toBeCloseTo(before.y);
  });

  it('should keep text bounds stable on flipX/flipY', () => {
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
    const before = getBoundsInParent(text);

    patchmap.flip.set({ x: true });
    patchmap.viewport.emit('object_transformed', patchmap.world);
    const afterFlipX = getBoundsInParent(text);
    expect(afterFlipX.x).toBeCloseTo(before.x);
    expect(afterFlipX.y).toBeCloseTo(before.y);

    patchmap.flip.set({ x: true, y: true });
    patchmap.viewport.emit('object_transformed', patchmap.world);
    const afterFlipY = getBoundsInParent(text);
    expect(afterFlipY.x).toBeCloseTo(before.x);
    expect(afterFlipY.y).toBeCloseTo(before.y);
  });

  it('should swap bar percent size on 90-degree rotation', () => {
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
    patchmap.viewport.emit('object_transformed', patchmap.world);

    expect(bar.width).toBeCloseTo(60); // 60% of item height (100)
    expect(bar.height).toBeCloseTo(40); // 20% of item width (200)
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
    patchmap.viewport.emit('object_transformed', patchmap.world);

    const barBounds = bar.getBounds();
    const itemBounds = item.getBounds();
    expect(barBounds.y + barBounds.height).toBeCloseTo(
      itemBounds.y + itemBounds.height,
    );
  });
});
