import { describe, expect, it } from 'vitest';

import { CoreScene } from '../../src/core-v1/scene';
import { createCoreV2SurfaceGeometrySnapshot } from '../../src/core-v2/engine';
import { parsePatchMapV010 } from '../../src/core-v2/parser';
import {
  applyCoreV2Affine,
  coreV2AffineBasis,
  createCoreV2Affine,
  invertCoreV2Affine,
  multiplyCoreV2Affine,
} from '../../src/core-v2/semantic/geometry';

describe('Core v2 signed affine orientation projection', () => {
  it('composes and inverts generic finite signed 2D transforms', () => {
    const parent = createCoreV2Affine(12, -7, 37, -2, 3);
    const local = createCoreV2Affine(4, 9, -22, 0.5, -1.25);
    const composed = multiplyCoreV2Affine(parent, local);
    const point = Object.freeze([3, -5] as const);
    const sequential = applyCoreV2Affine(parent, applyCoreV2Affine(local, point));

    const composedPoint = applyCoreV2Affine(composed, point);
    expect(composedPoint[0]).toBeCloseTo(sequential[0], 12);
    expect(composedPoint[1]).toBeCloseTo(sequential[1], 12);
    const restored = applyCoreV2Affine(invertCoreV2Affine(composed), sequential);
    expect(restored[0]).toBeCloseTo(point[0], 10);
    expect(restored[1]).toBeCloseTo(point[1], 10);
  });

  it.each([
    { angle: 0, scaleX: 1, scaleY: 1, basis: [1, 0, 0, 1] },
    { angle: 90, scaleX: 1, scaleY: 1, basis: [0, 1, -1, 0] },
    { angle: 180, scaleX: 1, scaleY: 1, basis: [-1, 0, 0, -1] },
    { angle: 270, scaleX: 1, scaleY: 1, basis: [0, -1, 1, 0] },
    { angle: 37, scaleX: -1, scaleY: 1, basis: [-0.798636, -0.601815, -0.601815, 0.798636] },
    { angle: 0, scaleX: 1, scaleY: -1, basis: [1, 0, 0, -1] },
  ])('keeps authored signs for $angle° [$scaleX,$scaleY]', ({ angle, scaleX, scaleY, basis }) => {
    const actual = coreV2AffineBasis(createCoreV2Affine(0, 0, angle, scaleX, scaleY));
    basis.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 6));
    expect(actual.every((value) => !Object.is(value, -0))).toBe(true);
  });

  it('publishes follow and upright facts from the parser sidecar under world rotation and flip', () => {
    const parsed = parsePatchMapV010([
      item('follow', 'follow-item'),
      item('upright', 'upright'),
    ]);
    const scene = new CoreScene();
    scene.load(parsed.document);
    const geometry = createCoreV2SurfaceGeometrySnapshot(
      scene.snapshot(),
      parsed.projection,
      { x: 0, y: 0, scale: 1, rotation: 90, flipX: true, flipY: false },
    );
    const follow = geometry.entities.find((entity) => entity.componentId === 'follow-label');
    const upright = geometry.entities.find((entity) => entity.componentId === 'upright-label');

    expect(follow).toMatchObject({
      ownerItemId: 'follow',
      componentType: 'text',
      contentOrientation: 'follow-item',
      visibleCenter: [50, 40],
      screenAngle: 90,
    });
    const followBasis = [0, 1, 1, 0];
    followBasis.forEach((value, index) => {
      expect(follow?.screenBasis?.[index]).toBeCloseTo(value, 8);
    });
    expect(upright).toMatchObject({
      ownerItemId: 'upright',
      componentType: 'text',
      contentOrientation: 'upright',
      visibleCenter: [50, 40],
      screenAngle: 270,
    });
    const uprightBasis = [0, -1, 1, 0];
    uprightBasis.forEach((value, index) => {
      expect(upright?.screenBasis?.[index]).toBeCloseTo(value, 8);
    });
  });

  it('applies screen-axis flips after rotation for canonical endpoint projection', () => {
    const parsed = parsePatchMapV010([{
      type: 'rect',
      id: 'endpoint',
      size: { width: 20, height: 20 },
      attrs: { x: 110, y: 70 },
      fill: '#336699',
    }]);
    const scene = new CoreScene();
    scene.load(parsed.document);
    const geometry = createCoreV2SurfaceGeometrySnapshot(
      scene.snapshot(),
      parsed.projection,
      { x: 10, y: 20, scale: 2, rotation: 90, flipX: true, flipY: false },
    );
    const endpoint = geometry.entities.find(({ id }) => id === 'endpoint');

    expect(endpoint?.visibleCenter).toEqual([120, 80]);
    [150, 240, 40, 40].forEach((value, index) => {
      expect(endpoint?.screenBounds[index]).toBeCloseTo(value, 8);
    });
    const screenCenter = [
      (endpoint?.screenBounds[0] ?? 0) + (endpoint?.screenBounds[2] ?? 0) / 2,
      (endpoint?.screenBounds[1] ?? 0) + (endpoint?.screenBounds[3] ?? 0) / 2,
    ];
    expect(screenCenter[0]).toBeCloseTo(170, 8);
    expect(screenCenter[1]).toBeCloseTo(260, 8);
  });

  it('keeps a full-frame background attached to the item while inner content stays upright', () => {
    const parsed = parsePatchMapV010([{
      type: 'item',
      id: 'equipment',
      size: { width: 100, height: 50 },
      attrs: { x: 20, y: 30, angle: 90 },
      contentOrientation: 'upright',
      components: [
        {
          type: 'background',
          id: 'surface',
          source: { type: 'rect', fill: '#223344' },
        },
        {
          type: 'text',
          id: 'label',
          text: '42',
          style: { fontSize: 12 },
        },
      ],
    }]);
    const background = parsed.projection.byEntityId['equipment::background:surface'];
    const label = parsed.projection.byEntityId['equipment::text:label'];

    expect(background).toMatchObject({
      contentOrientation: 'follow-item',
      localBounds: [0, 0, 100, 50],
    });
    expect(background?.visibleCenter[0]).toBeCloseTo(-5, 8);
    expect(background?.visibleCenter[1]).toBeCloseTo(80, 8);
    expect(label).toMatchObject({ contentOrientation: 'upright' });
    const expectedBasis = [0, 1, -1, 0];
    expectedBasis.forEach((value, index) => {
      expect(background?.worldBasis[index]).toBeCloseTo(value, 8);
    });
  });

  it('publishes readable bar geometry at its authored center without leaving its owner', () => {
    const parsed = parsePatchMapV010([{
      type: 'item',
      id: 'meter',
      size: { width: 120, height: 80 },
      padding: 8,
      contentOrientation: 'upright',
      components: [
        {
          type: 'background',
          id: 'surface',
          source: { type: 'rect', fill: '#e2e8f0' },
        },
        {
          type: 'bar',
          id: 'level',
          size: { width: 100, height: 16 },
          placement: 'bottom',
          source: { type: 'rect', fill: '#22c55e' },
        },
      ],
    }]);
    const scene = new CoreScene();
    scene.load(parsed.document);
    const view = { x: 0, y: 0, scale: 1, rotation: 45, flipX: false, flipY: false };
    const geometry = createCoreV2SurfaceGeometrySnapshot(
      scene.snapshot(),
      parsed.projection,
      view,
    );
    const bar = geometry.entities.find((entity) => entity.componentId === 'level');
    const owner = parsed.projection.byEntityId.meter;
    const projection = parsed.projection.byEntityId['meter::bar:level'];
    if (!bar || !owner || !projection) throw new Error('upright bar geometry was not published');
    const world = createCoreV2Affine(0, 0, 45);
    const ownerScreenInverse = invertCoreV2Affine(
      multiplyCoreV2Affine(world, owner.affine),
    );
    const [x, y, width, height] = bar.screenBounds;

    expect(bar.visibleCenter).toEqual(projection.visibleCenter);
    expect(bar.screenAngle).toBe(45);
    [Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2].forEach(
      (value, index) => expect(bar.screenBasis?.[index]).toBeCloseTo(value, 8),
    );
    expect([x, y, width, height].every(Number.isFinite)).toBe(true);
    const screenCenter = [x + width / 2, y + height / 2] as const;
    const ownerLocalCenter = applyCoreV2Affine(ownerScreenInverse, screenCenter);
    expect(ownerLocalCenter[0]).toBeGreaterThanOrEqual(0);
    expect(ownerLocalCenter[0]).toBeLessThanOrEqual(120);
    expect(ownerLocalCenter[1]).toBeGreaterThanOrEqual(0);
    expect(ownerLocalCenter[1]).toBeLessThanOrEqual(80);
  });
});

function item(id: string, contentOrientation: 'follow-item' | 'upright') {
  return {
    type: 'item',
    id,
    size: { width: 20, height: 20 },
    attrs: { x: 40, y: 30 },
    contentOrientation,
    components: [{
      type: 'text',
      id: `${id}-label`,
      text: id,
      placement: 'center',
      style: { fontSize: 10 },
    }],
  };
}
