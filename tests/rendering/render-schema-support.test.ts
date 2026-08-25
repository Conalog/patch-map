import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import catalogProfiles from '../../contracts/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import {
  PatchMapDatasetError,
  materializePatchMapDataset,
} from '../../src/semantic/dataset';
import { parsePatchMap } from '../../src/parsing';

const productionFixturePath = fileURLToPath(
  new URL('../../verification/fixtures/datasets/production-like.json', import.meta.url),
);

const invalidDatasetProfiles = new Set(['malformed']);

describe('PatchMap rendering schema support inventory', () => {
  it('materializes every approved dataset while rejecting invalid profiles', () => {
    const failures: Record<string, string> = {};
    for (const [id, dataset] of Object.entries(catalogProfiles.datasets)) {
      if (invalidDatasetProfiles.has(id)) continue;
      try {
        materializePatchMapDataset(dataset);
      } catch (error) {
        failures[id] = error instanceof PatchMapDatasetError
          ? `${error.code}:${error.datasetPath}`
          : String(error);
      }
    }

    expect(failures).toEqual({});

    for (const id of invalidDatasetProfiles) {
      expect(() => materializePatchMapDataset(
        catalogProfiles.datasets[id as keyof typeof catalogProfiles.datasets],
      )).toThrowError(
        expect.objectContaining<Partial<PatchMapDatasetError>>({
          code: 'INVALID_VALUE',
          datasetPath: '$',
        }),
      );
    }
  });

  it('keeps the production fixture within the same strict boundary', () => {
    const dataset = JSON.parse(readFileSync(productionFixturePath, 'utf8')) as unknown;
    expect(() => materializePatchMapDataset(dataset)).not.toThrow();
  });

  it('preserves the exact approved rendering-only fields without caller aliases', () => {
    const rectInput = catalogProfiles.datasets['rect-specimen'];
    const imageInput = catalogProfiles.datasets['image-specimens'];
    const boundsInput = catalogProfiles.datasets.bounds;
    const before = JSON.stringify({ rectInput, imageInput, boundsInput });

    const rect = materializePatchMapDataset(rectInput).dataset[0];
    const images = materializePatchMapDataset(imageInput).dataset;
    const bounds = materializePatchMapDataset(boundsInput).dataset;

    expect(rect).toMatchObject({
      type: 'rect',
      radius: 10,
    });
    expect(images[3]).toMatchObject({ type: 'image', id: 'data-uri', opacity: 0.5 });
    expect(images[5]).toMatchObject({ type: 'image', id: 'hidden-image', opacity: 0.25 });
    expect(bounds[2]).toMatchObject({ type: 'text', id: 'overflow-text', overflow: 'visible' });
    expect(bounds[4]).toMatchObject({
      type: 'rect',
      id: 'transparent-interactive',
      eventMode: 'static',
    });
    expect(JSON.stringify({ rectInput, imageInput, boundsInput })).toBe(before);
  });

  it('projects opacity, standalone overflow, and root hit-test participation', () => {
    const imageResult = parsePatchMap(catalogProfiles.datasets['image-specimens']);
    const boundsResult = parsePatchMap(catalogProfiles.datasets.bounds);
    const eventModes = parsePatchMap([
      { type: 'rect', id: 'none', size: 10, eventMode: 'none' },
      { type: 'rect', id: 'dynamic', size: 10, eventMode: 'dynamic' },
    ]);

    expect(imageResult.document.entities.find((entity) => entity.id === 'data-uri')).toMatchObject({
      kind: 'image',
      opacity: 0.5,
    });
    expect(boundsResult.document.entities.find((entity) => entity.id === 'overflow-text')).toMatchObject({
      kind: 'text',
      width: 272,
      height: 20,
    });
    expect(boundsResult.document.entities.find(
      (entity) => entity.id === 'transparent-interactive',
    )).toMatchObject({ interactive: true });
    expect(eventModes.document.entities).toMatchObject([
      { id: 'none', interactive: false },
      { id: 'dynamic', interactive: true },
    ]);
  });

  it('publishes the exact standalone scalar radius without a degradation diagnostic', () => {
    const result = parsePatchMap(catalogProfiles.datasets['rect-specimen']);

    expect(result.document.entities[0]).toMatchObject({ radius: 10 });
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'corner-radius-degraded',
    }));
  });

  it('retains existing rectangular-texture border aliases as dense paint', () => {
    const result = parsePatchMap(catalogProfiles.datasets.background);

    expect(result.document.entities.find((entity) => entity.id === 'item::background:bg')).toMatchObject({
      kind: 'rect',
      stroke: 0x000000ff,
      strokeWidth: 2,
      radius: 8,
    });
  });

  it.each([
    ['negative', -1],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ])('rejects %s standalone radius at both admission boundaries', (_label, radius) => {
    const input = [{ type: 'rect', id: 'invalid-radius', size: 10, radius }];
    expect(() => materializePatchMapDataset(input)).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'INVALID_VALUE',
        datasetPath: '$[0].radius',
      }),
    );
    expect(() => parsePatchMap(input)).toThrow('Standalone rect radius must be a nonnegative finite number');
  });

  it('does not widen closed records beyond the inventoried approved fields', () => {
    expect(() => materializePatchMapDataset([
      { type: 'rect', id: 'strict', size: 10, extra: true },
    ])).toThrowError(expect.objectContaining<Partial<PatchMapDatasetError>>({
      code: 'UNKNOWN_FIELD',
      datasetPath: '$[0].extra',
    }));
    expect(() => materializePatchMapDataset([
      { type: 'rect', id: 'radius', size: 10, radius: [1, 2, 3] },
    ])).toThrowError(expect.objectContaining<Partial<PatchMapDatasetError>>({
      code: 'INVALID_VALUE',
      datasetPath: '$[0].radius',
    }));
    for (const radius of [[1, 2, 3, 4], {
      topLeft: 1,
      topRight: 2,
      bottomRight: 3,
      bottomLeft: 4,
    }]) {
      expect(() => materializePatchMapDataset([
        { type: 'rect', id: 'radius', size: 10, radius },
      ])).toThrowError(expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'INVALID_VALUE',
        datasetPath: '$[0].radius',
      }));
      expect(() => parsePatchMap([
        { type: 'rect', id: 'radius', size: 10, radius },
      ])).toThrow('Standalone rect radius must be a nonnegative finite number');
    }
    expect(() => materializePatchMapDataset([
      { type: 'image', id: 'opacity', source: 'asset', opacity: 2 },
    ])).toThrowError(expect.objectContaining<Partial<PatchMapDatasetError>>({
      code: 'INVALID_VALUE',
      datasetPath: '$[0].opacity',
    }));
    expect(() => materializePatchMapDataset([
      { type: 'text', id: 'overflow', overflow: 'clip' },
    ])).toThrowError(expect.objectContaining<Partial<PatchMapDatasetError>>({
      code: 'INVALID_VALUE',
      datasetPath: '$[0].overflow',
    }));
    expect(() => materializePatchMapDataset([
      { type: 'rect', id: 'event-mode', size: 10, eventMode: 'interactive' },
    ])).toThrowError(expect.objectContaining<Partial<PatchMapDatasetError>>({
      code: 'INVALID_VALUE',
      datasetPath: '$[0].eventMode',
    }));
  });
});
