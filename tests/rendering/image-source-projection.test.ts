import { describe, expect, it } from 'vitest';

import { parsePatchMap } from '../../src/parsing';

describe('PatchMap image source projection', () => {
  it('classifies every supported source form and gives dense rows canonical bindings', () => {
    const dataUri = 'data:image/svg+xml,%3Csvg width=%2216%22 height=%228%22/%3E';
    const result = parsePatchMap([
      { type: 'image', id: 'alias', source: 'fixture-image', size: 10 },
      { type: 'image', id: 'url', source: 'https://assets.example.test/image.png', size: 10 },
      { type: 'image', id: 'fixture-url', source: 'fixture://failed-image.png', size: 10 },
      { type: 'image', id: 'inline', source: dataUri, size: 10 },
      {
        type: 'image',
        id: 'descriptor',
        source: {
          src: 'https://assets.example.test/image.svg',
          data: { scaleMode: 'nearest', resolution: 2 },
        },
        size: 10,
      },
    ]);
    const images = result.projection.imagesByEntityId;

    expect(images?.alias).toMatchObject({
      authoredSource: 'fixture-image',
      bindingKey: 'alias:fixture-image',
      cacheIdentity: 'alias:fixture-image',
      sourceKind: 'alias',
      authoredSize: true,
      dimensionMode: 'authored',
    });
    expect(images?.url).toMatchObject({
      bindingKey: 'url:https://assets.example.test/image.png',
      cacheIdentity: 'url:https://assets.example.test/image.png',
      sourceKind: 'url',
    });
    expect(images?.['fixture-url']).toMatchObject({
      bindingKey: 'url:fixture://failed-image.png',
      sourceKind: 'url',
    });
    expect(images?.inline).toMatchObject({
      authoredSource: dataUri,
      sourceKind: 'data-uri',
    });
    expect(images?.inline?.bindingKey).toMatch(/^data-uri:\d+:[0-9a-f]{16}$/u);
    expect(images?.inline?.cacheIdentity).toBe(images?.inline?.bindingKey);
    expect(images?.inline?.cacheIdentity).not.toContain('%3Csvg');
    expect(images?.descriptor).toMatchObject({
      authoredSource: {
        src: 'https://assets.example.test/image.svg',
        data: { scaleMode: 'nearest', resolution: 2 },
      },
      cacheIdentity: 'descriptor:https://assets.example.test/image.svg?resolution=2&scaleMode=nearest',
      sourceKind: 'descriptor',
    });
    expect(images?.descriptor?.bindingKey).toContain('"resolution":2');
    expect(images?.descriptor?.bindingKey).toContain('"scaleMode":"nearest"');

    expect(result.document.entities.find((entity) => entity.id === 'alias')).toMatchObject({
      source: 'fixture-image',
    });
    expect(result.document.entities.find((entity) => entity.id === 'descriptor')).toMatchObject({
      source: 'https://assets.example.test/image.svg',
    });
  });

  it('clones and deeply freezes descriptor values without mutating caller input', () => {
    const source = {
      src: 'https://assets.example.test/image.svg',
      data: {
        resolution: 2,
        tags: ['fixture', { variant: 'primary' }],
      },
    };
    const input = [{ type: 'image', id: 'image', source, size: 16 }];
    const before = JSON.stringify(input);
    const result = parsePatchMap(input);
    const projected = result.projection.imagesByEntityId?.image;

    expect(JSON.stringify(input)).toBe(before);
    expect(projected?.authoredSource).toEqual(source);
    expect(projected?.authoredSource).not.toBe(source);
    if (typeof projected?.authoredSource === 'string' || projected === undefined) {
      throw new Error('expected descriptor projection');
    }
    expect(projected.authoredSource.data).not.toBe(source.data);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.authoredSource)).toBe(true);
    expect(Object.isFrozen(projected.authoredSource.data)).toBe(true);
    expect(Object.isFrozen(projected.authoredSource.data?.tags)).toBe(true);

    source.data.resolution = 4;
    expect(projected.authoredSource.data?.resolution).toBe(2);
  });

  it('distinguishes descriptor options even when src is unchanged', () => {
    const result = parsePatchMap([
      {
        type: 'image',
        id: 'one-x',
        source: { src: 'https://assets.example.test/image.svg', data: { resolution: 1 } },
        size: 10,
      },
      {
        type: 'image',
        id: 'two-x',
        source: { src: 'https://assets.example.test/image.svg', data: { resolution: 2 } },
        size: 10,
      },
    ]);
    const one = result.projection.imagesByEntityId?.['one-x'];
    const two = result.projection.imagesByEntityId?.['two-x'];

    expect(one?.bindingKey).not.toBe(two?.bindingKey);
    expect(one?.cacheIdentity).toBe('descriptor:https://assets.example.test/image.svg?resolution=1');
    expect(two?.cacheIdentity).toBe('descriptor:https://assets.example.test/image.svg?resolution=2');
  });

  it('preserves parser and compatibility loadParser identities', () => {
    const result = parsePatchMap([
      {
        type: 'image',
        id: 'texture-parser',
        source: { src: '/extensionless', parser: 'texture' },
        size: 10,
      },
      {
        type: 'image',
        id: 'svg-parser',
        source: { src: '/extensionless', parser: 'svg' },
        size: 10,
      },
      {
        type: 'image',
        id: 'legacy-parser',
        source: { src: '/extensionless', loadParser: 'loadTextures' },
        size: 10,
      },
    ]);
    const texture = result.projection.imagesByEntityId?.['texture-parser'];
    const svg = result.projection.imagesByEntityId?.['svg-parser'];
    const legacy = result.projection.imagesByEntityId?.['legacy-parser'];

    expect(texture?.authoredSource).toEqual({ src: '/extensionless', parser: 'texture' });
    expect(texture?.cacheIdentity).toBe('descriptor:/extensionless?parser=texture');
    expect(svg?.cacheIdentity).toBe('descriptor:/extensionless?parser=svg');
    expect(legacy?.authoredSource).toEqual({ src: '/extensionless', loadParser: 'loadTextures' });
    expect(legacy?.cacheIdentity).toBe('descriptor:/extensionless?loadParser=loadTextures');
    expect(texture?.bindingKey).not.toBe(svg?.bindingKey);
    expect(legacy?.bindingKey).not.toBe(texture?.bindingKey);
  });

  it('frames ambiguous descriptor identities instead of flattening query and option channels', () => {
    const result = parsePatchMap([
      {
        type: 'image',
        id: 'query-src',
        source: { src: 'https://assets.example.test/image.svg?resolution=2' },
        size: 10,
      },
      {
        type: 'image',
        id: 'data-option',
        source: {
          src: 'https://assets.example.test/image.svg',
          data: { resolution: 2 },
        },
        size: 10,
      },
      {
        type: 'image',
        id: 'nested-format',
        source: {
          src: 'https://assets.example.test/image.svg',
          data: { format: 'svg' },
        },
        size: 10,
      },
      {
        type: 'image',
        id: 'top-format',
        source: {
          src: 'https://assets.example.test/image.svg',
          format: 'svg',
        },
        size: 10,
      },
    ]);
    const images = result.projection.imagesByEntityId;

    expect(images?.['query-src']?.cacheIdentity).toMatch(/^descriptor-safe:/u);
    expect(images?.['query-src']?.cacheIdentity).not.toBe(images?.['data-option']?.cacheIdentity);
    expect(images?.['nested-format']?.cacheIdentity).toMatch(/^descriptor-safe:/u);
    expect(images?.['nested-format']?.cacheIdentity).not.toBe(images?.['top-format']?.cacheIdentity);
  });

  it('uses the standalone 32 by 32 fallback and records whether size was authored', () => {
    const result = parsePatchMap([
      { type: 'image', id: 'fallback', source: 'fixture://failed-image.png' },
      { type: 'image', id: 'sized', source: 'fixture-image', size: { width: 8, height: 4 } },
    ]);

    expect(result.document.entities[0]).toMatchObject({
      id: 'fallback',
      width: 32,
      height: 32,
    });
    expect(result.projection.byEntityId.fallback?.localBounds).toEqual([0, 0, 32, 32]);
    expect(result.projection.imagesByEntityId?.fallback?.authoredSize).toBe(false);
    expect(result.projection.imagesByEntityId?.fallback?.dimensionMode).toBe('intrinsic');
    expect(result.projection.imagesByEntityId?.sized?.authoredSize).toBe(true);
    expect(result.projection.imagesByEntityId?.sized?.dimensionMode).toBe('authored');
  });

  it('keeps ordinary authored standalone image rotation on the Sprite center pivot', () => {
    const result = parsePatchMap([{
      type: 'image',
      id: 'transformed',
      source: 'fixture-image',
      size: { width: 20, height: 10 },
      attrs: { x: 140, y: 120, angle: 90 },
    }]);

    expect(result.document.entities[0]).toMatchObject({
      x: 140,
      y: 120,
      width: 20,
      height: 10,
      rotation: 90,
    });
    expect(result.projection.byEntityId.transformed?.visibleCenter).toEqual([150, 125]);
  });

  it('ignores preserved display metadata instead of changing image geometry', () => {
    const result = parsePatchMap([
      {
        type: 'image',
        id: 'site-image',
        source: 'fixture-image',
        size: { width: 200, height: 120 },
        attrs: { x: -25, y: 40, angle: 36.5, display: 'image' },
      },
      {
        type: 'image',
        id: 'current-image',
        source: 'fixture-image',
        size: { width: 200, height: 120 },
        attrs: { x: -25, y: 40, angle: 36.5 },
      },
    ]);

    const image = result.document.entities[0];
    const current = result.document.entities[1];
    if (!image || image.kind === 'relation' || !current || current.kind === 'relation') {
      throw new Error('expected projected image geometry');
    }
    expect([
      image?.x,
      image?.y,
      image?.width,
      image?.height,
      image?.rotation,
    ]).toEqual([
      current?.x,
      current?.y,
      current?.width,
      current?.height,
      current?.rotation,
    ]);
    expect(result.projection.byEntityId['site-image']?.affine)
      .toEqual(result.projection.byEntityId['current-image']?.affine);
    expect(result.projection.byEntityId['site-image']?.visibleCenter)
      .toEqual(result.projection.byEntityId['current-image']?.visibleCenter);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'attribute-preserved-only',
      path: '$[0].attrs.display',
    }));
  });

  it('projects image components into the same lossless source table', () => {
    const result = parsePatchMap([
      {
        type: 'item',
        id: 'item',
        size: 40,
        components: [
          {
            type: 'background',
            id: 'background',
            source: { src: 'https://assets.example.test/background.svg', data: { resolution: 2 } },
          },
          { type: 'icon', id: 'icon', source: 'fixture-icon', size: 12 },
        ],
      },
    ]);

    expect(result.projection.imagesByEntityId?.['item::background:background']).toMatchObject({
      sourceKind: 'descriptor',
      authoredSize: false,
      dimensionMode: 'layout',
      cacheIdentity: 'descriptor:https://assets.example.test/background.svg?resolution=2',
    });
    expect(result.projection.imagesByEntityId?.['item::icon:icon']).toMatchObject({
      sourceKind: 'alias',
      authoredSize: true,
      dimensionMode: 'layout',
      cacheIdentity: 'alias:fixture-icon',
    });
  });
});
