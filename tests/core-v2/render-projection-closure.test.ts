import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import { parsePatchMapV010 } from '../../src/core-v2/parser';
import { buildQuadGeometry } from '../../src/core-v2/renderers/mesh-layer';
import { materializeCoreV2Dataset } from '../../src/core-v2/semantic/dataset';
import {
  coreV2AffineHasSkew,
  createCoreV2Affine,
  multiplyCoreV2Affine,
} from '../../src/core-v2/semantic/geometry';

describe('Core v2 approved render projection closure', () => {
  it('keeps authored background size inert while painting the complete item frame', () => {
    const materialized = materializeCoreV2Dataset(catalogProfiles.datasets.background);
    const item = materialized.dataset[0];
    const result = parsePatchMapV010(materialized.dataset);

    expect(item?.type === 'item' ? item.components[0] : undefined).toMatchObject({
      type: 'background',
      size: { width: 20, height: 10 },
    });
    expect(result.document.entities.find((entity) => entity.id === 'item::background:bg')).toMatchObject({
      kind: 'rect',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
  });

  it('does not diagnose materializer defaults whose initial projection is exact or inert', () => {
    const itemResult = parsePatchMapV010(
      materializeCoreV2Dataset(catalogProfiles.datasets['item-components']).dataset,
    );
    const relationResult = parsePatchMapV010(materializeCoreV2Dataset([
      { type: 'rect', id: 'a', size: 10 },
      { type: 'relations', id: 'links', links: [{ source: 'a', target: 'a' }] },
    ]).dataset);

    expect(itemResult.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'component-animation-unsupported',
    }));
    expect(itemResult.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'text-split-degraded',
    }));
    expect(relationResult.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'relation-style-degraded',
    }));
  });

  it('projects split while keeping unrelated animation and relation degradation explicit', () => {
    const result = parsePatchMapV010(materializeCoreV2Dataset([
      {
        type: 'item',
        id: 'item',
        size: 100,
        components: [
          {
            type: 'bar',
            id: 'bar',
            source: { type: 'rect' },
            size: 20,
            animation: false,
            animationDuration: 350,
          },
          { type: 'text', id: 'text', text: 'AB', split: 1 },
        ],
      },
      {
        type: 'relations',
        id: 'links',
        links: [{ source: 'item', target: 'item' }],
        style: { cap: 'round', join: 'round' },
      },
    ]).dataset);

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'component-animation-unsupported',
    }));
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'relation-style-degraded' }),
    ]));
    expect(result.projection.barsByEntityId?.['item::bar:bar']).toMatchObject({
      animation: false,
      animationDuration: 350,
      destinationHeight: 20,
    });
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'text-split-degraded',
    }));
    expect(result.projection.textsByEntityId?.['item::text:text']?.splitLines).toEqual(['A', 'B']);
  });

  it('keeps descriptor options lossless and represents deterministic text layout fields', () => {
    const result = parsePatchMapV010(materializeCoreV2Dataset([
      {
        type: 'image',
        id: 'image',
        source: { src: 'fixture-image', data: { resolution: 2 } },
        size: 16,
      },
      {
        type: 'text',
        id: 'standalone',
        text: 'ABCDEFGHIJ',
        style: { wordWrap: true, wordWrapWidth: 32, breakWords: true },
      },
      {
        type: 'item',
        id: 'item',
        size: 100,
        components: [{
          type: 'text',
          id: 'component',
          text: 'AB',
          style: { lineHeight: 22, letterSpacing: 1 },
        }],
      },
    ]).dataset);

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'asset-resolution-degraded',
    }));
    expect(result.projection.imagesByEntityId?.image).toMatchObject({
      entityId: 'image',
      authoredSource: { src: 'fixture-image', data: { resolution: 2 } },
      cacheIdentity: 'descriptor:fixture-image?resolution=2',
      sourceKind: 'descriptor',
      authoredSize: true,
      dimensionMode: 'authored',
    });
    expect(result.document.entities[0]).toMatchObject({
      kind: 'image',
      source: 'fixture-image',
    });
    for (const code of [
      'standalone-text-break-words-degraded',
      'component-text-line-height-degraded',
      'component-text-letter-spacing-degraded',
    ]) {
      expect(result.diagnostics).not.toContainEqual(expect.objectContaining({ code }));
    }
    expect(result.projection.textsByEntityId?.standalone).toMatchObject({
      lines: ['ABCD', 'EFGH', 'IJ'],
      wordWrapWidthPx: 32,
      breakWords: true,
    });
    expect(result.projection.textsByEntityId?.['item::text:component']).toMatchObject({
      lineHeightPx: 22,
      letterSpacingPx: 1,
    });
  });

  it('retains honest text diagnostics for semantics that the dense compatibility row still degrades', () => {
    const result = parsePatchMapV010(materializeCoreV2Dataset([{
      type: 'text',
      id: 'justify',
      text: 'AB',
      style: { align: 'justify' },
    }]).dataset);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'text-align-degraded',
      path: '$[0].style.align',
    }));
    expect(result.projection.textsByEntityId?.justify?.authoredStyle).toMatchObject({
      align: 'justify',
    });
  });

  it('projects standalone text zIndex and accepts item affine orientation semantics', () => {
    const textResult = parsePatchMapV010(materializeCoreV2Dataset([
      { type: 'text', id: 'text', text: 'label', attrs: { zIndex: 7 } },
    ]).dataset);
    const itemResult = parsePatchMapV010(materializeCoreV2Dataset([
      {
        type: 'item',
        id: 'item',
        size: 100,
        contentOrientation: 'upright',
        attrs: { scaleX: -1, zIndex: 4 },
      },
    ]).dataset);

    expect(textResult.document.entities[0]).toMatchObject({ id: 'text', zIndex: 7 });
    expect(textResult.diagnostics).not.toContainEqual(expect.objectContaining({
      path: '$[0].attrs.zIndex',
    }));
    expect(itemResult.document.entities[0]).toMatchObject({ id: 'item', zIndex: 0 });
    expect(itemResult.diagnostics).not.toContainEqual(expect.objectContaining({
      path: '$[0].attrs.scaleX',
    }));
    expect(itemResult.diagnostics).not.toContainEqual(expect.objectContaining({
      path: '$[0].contentOrientation',
    }));
    expect(itemResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'attribute-preserved-only',
        path: '$[0].attrs.zIndex',
      }),
    ]));
  });

  it('converts authored-origin rotation into the dense center-pivot representation', () => {
    const parsed = parsePatchMapV010(materializeCoreV2Dataset([
      {
        type: 'rect',
        id: 'rect',
        size: { width: 60, height: 20 },
        radius: 30,
        attrs: { x: -10, y: 5, angle: 90, zIndex: 4 },
      },
    ]).dataset);
    const entity = parsed.document.entities[0];
    if (entity === undefined || entity.kind === 'relation') throw new Error('expected rect entity');
    const geometry = buildQuadGeometry([entity]);
    const coordinate = (index: number): number => {
      const value = geometry.positions[index];
      if (value === undefined) throw new Error(`missing rendered coordinate ${index}`);
      return value;
    };
    const xValues = [
      coordinate(0),
      coordinate(2),
      coordinate(4),
      coordinate(6),
    ] as const;
    const yValues = [
      coordinate(1),
      coordinate(3),
      coordinate(5),
      coordinate(7),
    ] as const;
    const renderedBounds = {
      x: Math.min(...xValues),
      y: Math.min(...yValues),
      width: Math.max(...xValues) - Math.min(...xValues),
      height: Math.max(...yValues) - Math.min(...yValues),
    };

    expect(entity).toMatchObject({ x: -50, y: 25, width: 60, height: 20, rotation: 90 });
    expect(renderedBounds.x).toBeCloseTo(-30, 10);
    expect(renderedBounds.y).toBeCloseTo(5, 10);
    expect(renderedBounds.width).toBeCloseTo(20, 10);
    expect(renderedBounds.height).toBeCloseTo(60, 10);
  });

  it('keeps exact ancestor and local affine authority for an unsized image pivot', () => {
    const parsed = parsePatchMapV010([{
      type: 'group',
      id: 'parent',
      attrs: { x: 30, y: 20, angle: 25, scaleX: 2, scaleY: 0.5 },
      children: [{
        type: 'image',
        id: 'intrinsic-child',
        source: 'fixture-image',
        attrs: { x: 12, y: 8, angle: 40, scaleX: -1.5, scaleY: 0.75 },
      }],
    }]);
    const projection = parsed.projection.byEntityId['intrinsic-child'];
    const intrinsic = parsed.projection.imagesByEntityId?.['intrinsic-child']?.intrinsicTransform;
    const expected = nestedIntrinsicImageAffine(32, 32);

    expect(projection?.localBounds).toEqual([0, 0, 32, 32]);
    expectAffineClose(projection?.affine, expected);
    expect(coreV2AffineHasSkew(projection?.affine ?? expected)).toBe(true);
    expect(intrinsic).toEqual({
      parentAffine: createCoreV2Affine(30, 20, 25, 2, 0.5),
      localTranslationAffine: createCoreV2Affine(12, 8),
      localRotationScaleAffine: createCoreV2Affine(0, 0, 40, -1.5, 0.75),
      localPivotScaleAffine: createCoreV2Affine(0, 0, 0, -1.5, 0.75),
    });
  });
});

function nestedIntrinsicImageAffine(width: number, height: number) {
  return multiplyCoreV2Affine(
    createCoreV2Affine(30, 20, 25, 2, 0.5),
    multiplyCoreV2Affine(
      createCoreV2Affine(12, 8),
      multiplyCoreV2Affine(
        createCoreV2Affine(-1.5 * width / 2, 0.75 * height / 2),
        multiplyCoreV2Affine(
          createCoreV2Affine(0, 0, 40, -1.5, 0.75),
          createCoreV2Affine(-width / 2, -height / 2),
        ),
      ),
    ),
  );
}

function expectAffineClose(
  actual: readonly number[] | undefined,
  expected: readonly number[],
): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual?.[index]).toBeCloseTo(value, 12));
}
