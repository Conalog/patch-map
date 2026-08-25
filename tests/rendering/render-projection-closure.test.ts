import datasets from '../fixtures/datasets.json';
import { describe, expect, it } from 'vitest';

import { parsePatchMap } from '../../src/parsing';
import { buildQuadGeometry } from '../../src/rendering/mesh-layer';
import { materializePatchMapDataset } from '../../src/semantic/dataset';
import {
  patchMapAffineHasSkew,
  createPatchMapAffine,
  multiplyPatchMapAffine,
} from '../../src/semantic/geometry';

describe('PatchMap render projection closure', () => {
  it('paints a background across the complete item frame', () => {
    const materialized = materializePatchMapDataset(datasets.background);
    const item = materialized.dataset[0];
    const result = parsePatchMap(materialized.dataset);

    expect(item?.type === 'item' ? item.components[0] : undefined).toMatchObject({
      type: 'background',
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
    const itemResult = parsePatchMap(
      materializePatchMapDataset(datasets['item-components']).dataset,
    );
    const relationResult = parsePatchMap(materializePatchMapDataset([
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

  it('projects split, animation metadata, and canonical relation style exactly', () => {
    const result = parsePatchMap(materializePatchMapDataset([
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
        style: { color: '#123456', width: 3, alpha: 0.6 },
      },
    ]).dataset);

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'component-animation-unsupported',
    }));
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'relation-style-degraded',
    }));
    expect(result.document.entities.find(({ kind }) => kind === 'relation')).toMatchObject({
      color: 0x123456ff,
      lineWidth: 3,
      opacity: 0.6,
    });
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
    const result = parsePatchMap(materializePatchMapDataset([
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

  it('lowers justify into the dense renderer without a degradation diagnostic', () => {
    const result = parsePatchMap(materializePatchMapDataset([{
      type: 'text',
      id: 'justify',
      text: 'AB',
      style: { align: 'justify' },
    }]).dataset);

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'text-align-degraded',
    }));
    expect(result.document.entities[0]).toMatchObject({ align: 'justify' });
    expect(result.projection.textsByEntityId?.justify?.authoredStyle).toMatchObject({
      align: 'justify',
    });
  });

  it('projects standalone text zIndex and accepts item affine orientation semantics', () => {
    const textResult = parsePatchMap(materializePatchMapDataset([
      { type: 'text', id: 'text', text: 'label', attrs: { zIndex: 7 } },
    ]).dataset);
    const itemResult = parsePatchMap(materializePatchMapDataset([
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
    const parsed = parsePatchMap(materializePatchMapDataset([
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
    const parsed = parsePatchMap([{
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
    expect(patchMapAffineHasSkew(projection?.affine ?? expected)).toBe(true);
    expect(intrinsic).toEqual({
      parentAffine: createPatchMapAffine(30, 20, 25, 2, 0.5),
      localTranslationAffine: createPatchMapAffine(12, 8),
      localRotationScaleAffine: createPatchMapAffine(0, 0, 40, -1.5, 0.75),
      localPivotScaleAffine: createPatchMapAffine(0, 0, 0, -1.5, 0.75),
    });
  });
});

function nestedIntrinsicImageAffine(width: number, height: number) {
  return multiplyPatchMapAffine(
    createPatchMapAffine(30, 20, 25, 2, 0.5),
    multiplyPatchMapAffine(
      createPatchMapAffine(12, 8),
      multiplyPatchMapAffine(
        createPatchMapAffine(-1.5 * width / 2, 0.75 * height / 2),
        multiplyPatchMapAffine(
          createPatchMapAffine(0, 0, 40, -1.5, 0.75),
          createPatchMapAffine(-width / 2, -height / 2),
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
