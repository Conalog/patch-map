import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import { parsePatchMapV010 } from '../../src/core-v2/parser';
import { buildQuadGeometry } from '../../src/core-v2/renderers/mesh-layer';
import { materializeCoreV2Dataset } from '../../src/core-v2/semantic/dataset';

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

  it('keeps non-default animation, split, and relation style degradation explicit', () => {
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

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'component-animation-unsupported' }),
      expect.objectContaining({ code: 'text-split-degraded' }),
      expect.objectContaining({ code: 'relation-style-degraded' }),
    ]));
  });

  it('diagnoses every approved field still lost by the flat text and asset contracts', () => {
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

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'asset-resolution-degraded',
        path: '$[0].source.data.resolution',
      }),
      expect.objectContaining({
        code: 'standalone-text-break-words-degraded',
        path: '$[1].style.breakWords',
      }),
      expect.objectContaining({
        code: 'component-text-line-height-degraded',
        path: '$[2].components[0].style.lineHeight',
      }),
      expect.objectContaining({
        code: 'component-text-letter-spacing-degraded',
        path: '$[2].components[0].style.letterSpacing',
      }),
    ]));
  });

  it('projects standalone text zIndex but exposes unsupported item transform semantics', () => {
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
    expect(itemResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'attribute-preserved-only',
        path: '$[0].attrs.scaleX',
      }),
      expect.objectContaining({
        code: 'attribute-preserved-only',
        path: '$[0].attrs.zIndex',
      }),
      expect.objectContaining({
        code: 'content-orientation-unsupported',
        path: '$[0].contentOrientation',
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
});
