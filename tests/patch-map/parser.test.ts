import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PatchMapParseError } from '../../src/patch-map/contracts';
import { parsePatchMapV010 } from '../../src/patch-map/parser';

const fixturePath = fileURLToPath(
  new URL('../../lab/fixtures/production-like.json', import.meta.url),
);

describe('PatchMap PATCH MAP v0.10 parser', () => {
  it('loads the production JSON directly with stable expansion counts', () => {
    const input = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
    const before = JSON.stringify(input);

    const result = parsePatchMapV010(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(result.identity.counts).toEqual({
      sourceElements: 458,
      sourceComponents: 167,
      expandedItems: 9_365,
      gridCells: 9_336,
      relationLinks: 8_947,
      entities: 37_071,
      kinds: {
        rect: 18_730,
        text: 0,
        image: 29,
        bar: 9_365,
        relation: 8_947,
      },
    });
    expect(new Set(result.identity.entityIds).size).toBe(37_071);
  });

  it('preserves template/component identity while expanding deterministic grid cells', () => {
    const input = [
      {
        type: 'grid',
        id: 'rack',
        attrs: { x: 10, y: 20, metadata: { owner: 'ops' } },
        cells: [[1, 1]],
        gap: { x: 5, y: 0 },
        item: {
          size: { width: 40, height: 80 },
          padding: 2,
          components: [
            {
              type: 'background',
              id: 'panel',
              attrs: { metadata: { role: 'track' } },
              size: { width: '100%', height: { value: 100, unit: '%' } },
              source: { type: 'rect', fill: 'white', radius: 4 },
            },
            {
              type: 'bar',
              id: 'level',
              size: { width: { value: 100, unit: '%' }, height: '50%' },
              placement: 'bottom',
              source: { type: 'rect', fill: '#ffffff' },
              tint: 'primary.default',
            },
          ],
        },
      },
      {
        type: 'relations',
        id: 'links',
        attrs: { metadata: { parent: 'rack' } },
        links: [{ source: 'rack.0.0', target: { id: 'rack.0.1' } }],
        style: { color: 'hsl(210, 100%, 50%)', width: 2 },
      },
    ];

    const result = parsePatchMapV010(input);

    expect(result.identity.entityIds).toEqual([
      'rack.0.0',
      'rack.0.0::background:panel',
      'rack.0.0::bar:level',
      'rack.0.1',
      'rack.0.1::background:panel',
      'rack.0.1::bar:level',
      '@relation:5:links8:rack.0.08:rack.0.1',
    ]);
    expect(result.identity.entityIdsByComponentId.panel).toEqual([
      'rack.0.0::background:panel',
      'rack.0.1::background:panel',
    ]);
    expect(result.identity.components).toHaveLength(2);
    expect(result.identity.components[0]).toMatchObject({
      componentId: 'panel',
      sourceElementId: 'rack',
      rawMetadata: { role: 'track' },
    });
    expect(result.identity.elements[0]).toMatchObject({
      sourceId: 'rack',
      rawMetadata: { owner: 'ops' },
    });
    expect(result.document.entities.at(-1)).toMatchObject({
      kind: 'relation',
      from: 'rack.0.0',
      to: 'rack.0.1',
      color: 0x0080ffff,
    });
    expect(result.document.entities[4]).toMatchObject({ x: 55, y: 20 });
  });

  it('is deterministic, never retains caller aliases, and freezes its result', () => {
    const attrs = { x: 3, metadata: { note: 'caller-owned' } };
    const input = [
      {
        type: 'item',
        attrs,
        size: 20,
        components: [
          {
            type: 'icon',
            source: { src: '/icon.png' },
            size: { value: 50, unit: '%' },
          },
        ],
      },
    ];
    const before = structuredClone(input);

    const first = parsePatchMapV010(input);
    const second = parsePatchMapV010(input);

    expect(input).toEqual(before);
    expect(first).toEqual(second);
    expect(first.identity.entityIds).toEqual([
      '@element:0',
      '@element:0::icon:@component:0.components.0',
    ]);
    expect(first.diagnostics.filter((entry) => entry.code === 'generated-id')).toHaveLength(2);
    expect(first.identity.elements[0]?.rawAttrs).not.toBe(attrs);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.document.entities)).toBe(true);
    expect(Object.isFrozen(first.identity.elements[0]?.rawMetadata)).toBe(true);
  });

  it('supports nested groups and direct rect/image/text records', () => {
    const result = parsePatchMapV010([
      {
        type: 'group',
        id: 'group-a',
        attrs: { x: 10, y: 20, angle: 90 },
        children: [
          {
            type: 'rect',
            id: 'rect-a',
            attrs: { x: 5, y: 0 },
            size: { width: 8, height: 9 },
            fill: 'rgb(255, 0, 0)',
          },
          {
            type: 'image',
            id: 'image-a',
            source: { src: '/asset.png' },
            size: 12,
          },
          {
            type: 'text',
            id: 'text-a',
            text: '온도 42',
            style: {
              fill: '#0f08',
              stroke: '#123456',
              strokeWidth: 2,
              alpha: 0.8,
              cornerRadius: 4,
              fontSize: 16,
            },
          },
        ],
      },
    ]);

    expect(result.document.entities).toHaveLength(3);
    expect(result.document.entities[0]).toMatchObject({
      id: 'rect-a',
      // PATCH MAP rotates around the authored top-left. The dense renderer
      // rotates around the quad center, so the parser stores the equivalent
      // compensated top-left while retaining the authored 90° rotation.
      x: 1.5,
      y: 24.5,
      rotation: 90,
      fill: 0xff0000ff,
    });
    expect(result.document.entities[1]).toMatchObject({
      id: 'image-a',
      source: '/asset.png',
    });
    expect(result.document.entities[2]).toMatchObject({
      id: 'text-a',
      text: '온도 42',
      color: 0x00ff0088,
      opacity: 0.8,
    });
    expect(result.identity.entityIdsBySourceId['group-a']).toEqual([
      'rect-a',
      'image-a',
      'text-a',
    ]);
  });

  it('warns and deterministically hashes unknown color aliases', () => {
    const input = [{ type: 'rect', id: 'x', size: 10, fill: 'brand.unknown' }];
    const first = parsePatchMapV010(input);
    const second = parsePatchMapV010(input);

    expect(first.document.entities[0]).toEqual(second.document.entities[0]);
    expect(first.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'color-fallback', path: '$[0].fill' }),
    );
  });

  it('diagnoses known v0.10 fields that are retained-only or unsupported', () => {
    const result = parsePatchMapV010([
      {
        type: 'item',
        id: 'item-a',
        attrs: { display: 'block', opacity: 0.5, alpha: 0.5, tags: ['source'], zIndex: 3 },
        size: 20,
        contentOrientation: 'upright',
        components: [{
          type: 'bar',
          id: 'bar-a',
          animation: true,
          animationDuration: 500,
          size: { width: '100%', height: '50%' },
          source: { type: 'rect', fill: '#fff' },
        }],
      },
      {
        type: 'relations',
        id: 'links',
        attrs: { x: 10 },
        links: [{ source: 'item-a', target: 'item-a' }],
        style: { cap: 'round', join: 'round' },
      },
      {
        type: 'grid',
        id: 'grid-a',
        inactiveCellStrategy: 'collapse',
        cells: [[0]],
        item: { size: 10 },
      },
    ]);

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'content-orientation-unsupported',
    }));
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'component-animation-unsupported',
    }));
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'relation-style-degraded' }),
      expect.objectContaining({ code: 'inactive-cell-strategy-unsupported' }),
      expect.objectContaining({ code: 'attribute-preserved-only', path: '$[0].attrs.display' }),
      expect.objectContaining({ code: 'attribute-preserved-only', path: '$[0].attrs.opacity' }),
      expect.objectContaining({ code: 'attribute-preserved-only', path: '$[0].attrs.tags' }),
    ]));
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'attribute-preserved-only',
      path: '$[0].attrs.alpha',
    }));
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'attribute-preserved-only',
      path: '$[0].attrs.zIndex',
    }));
    expect(result.document.entities.find(({ id }) => id === 'item-a')).toMatchObject({
      opacity: 0.5,
    });
    expect(result.document.entities.find(({ id }) => id === 'item-a::bar:bar-a')).toMatchObject({
      opacity: 0.5,
    });
    expect(result.projection.relationsByEntityId?.['@relation:5:links6:item-a6:item-a']?.affine).toEqual([
      1, 0, 0, 1, 10, 0,
    ]);
    expect(result.projection.barsByEntityId?.['item-a::bar:bar-a']).toMatchObject({
      ownerId: 'item-a',
      componentId: 'bar-a',
      animation: true,
      animationDuration: 500,
      destinationHeight: 10,
    });
  });

  it('multiplies attrs alpha through groups, items, components, and local text style', () => {
    const result = parsePatchMapV010([
      {
        type: 'group',
        id: 'group',
        attrs: { alpha: 0.5 },
        children: [{
          type: 'item',
          id: 'item',
          attrs: { alpha: 0.8 },
          size: 20,
          components: [
            {
              type: 'background',
              id: 'background',
              attrs: { alpha: 0.5 },
              source: { type: 'rect', fill: '#ffffff' },
            },
            {
              type: 'text',
              id: 'label',
              attrs: { alpha: 0.25 },
              text: '42',
              style: { alpha: 0.5, fontSize: 12 },
            },
          ],
        }],
      },
    ]);

    expect(result.document.entities.find(({ id }) => id === 'item')).toMatchObject({
      opacity: 0.4,
    });
    expect(result.document.entities.find(({ id }) => id === 'item::background:background'))
      .toMatchObject({ opacity: 0.2 });
    expect(result.document.entities.find(({ id }) => id === 'item::text:label'))
      .toMatchObject({ opacity: 0.05 });
    expect(result.diagnostics.some(
      ({ code, path }) => code === 'attribute-preserved-only' && path.endsWith('.alpha'),
    )).toBe(false);
  });

  it('fails atomically for duplicate visible IDs and explicitly omits dangling endpoints', () => {
    expect(() =>
      parsePatchMapV010([
        { type: 'rect', id: 'duplicate', size: 10 },
        { type: 'text', id: 'duplicate', text: 'x' },
      ]),
    ).toThrow(PatchMapParseError);

    const result = parsePatchMapV010([
      { type: 'rect', id: 'known', size: 10 },
      {
        type: 'relations',
        id: 'relations',
        links: [{ source: 'known', target: { id: 'missing' } }],
      },
    ]);
    expect(result.document.entities.map((entity) => entity.id)).toEqual(['known']);
    expect(result.projection.omittedRelations).toEqual([
      expect.objectContaining({
        relationId: 'relations',
        sourceId: 'known',
        targetId: 'missing',
        reason: 'missing-target',
      }),
    ]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      level: 'warning',
      code: 'omitted-relation-endpoint',
      path: '$[1].links[0]',
    }));
  });

  it.each([
    {
      label: 'empty groups',
      elements: [
        { type: 'group', id: 'duplicate-source', children: [] },
        { type: 'group', id: 'duplicate-source', children: [] },
      ],
    },
    {
      label: 'unsupported elements',
      elements: [
        { type: 'future-widget', id: 'duplicate-source' },
        { type: 'future-widget', id: 'duplicate-source' },
      ],
    },
    {
      label: 'empty relation elements',
      elements: [
        { type: 'relations', id: 'duplicate-source', links: [] },
        { type: 'relations', id: 'duplicate-source', links: [] },
      ],
    },
  ])('fails atomically for duplicate source IDs on $label', ({ elements }) => {
    const before = structuredClone(elements);

    try {
      parsePatchMapV010(elements);
      throw new Error('expected parser failure');
    } catch (error) {
      expect(error).toBeInstanceOf(PatchMapParseError);
      expect((error as PatchMapParseError).diagnostics).toContainEqual({
        level: 'error',
        code: 'duplicate-source-element-id',
        path: '$[1].id',
        message: 'Duplicate source element ID "duplicate-source"; first declared at $[0]',
        sourceId: 'duplicate-source',
      });
    }

    expect(elements).toEqual(before);
  });

  it('keeps repeated component IDs distinct across source-element owners', () => {
    const component = {
      type: 'background',
      id: 'shared-component',
      source: { type: 'rect', fill: 'white' },
    };
    const result = parsePatchMapV010([
      { type: 'item', id: 'item-a', size: 10, components: [component] },
      { type: 'item', id: 'item-b', size: 10, components: [component] },
    ]);

    expect(result.identity.components).toMatchObject([
      { componentId: 'shared-component', sourceElementId: 'item-a' },
      { componentId: 'shared-component', sourceElementId: 'item-b' },
    ]);
    expect(result.identity.entityIdsByComponentId['shared-component']).toEqual([
      'item-a::background:shared-component',
      'item-b::background:shared-component',
    ]);
  });
});
