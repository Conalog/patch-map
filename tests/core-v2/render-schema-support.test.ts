import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import {
  CoreV2DatasetError,
  materializeCoreV2Dataset,
} from '../../src/core-v2/semantic/dataset';
import { parsePatchMapV010 } from '../../src/core-v2/parser';

const productionFixturePath = fileURLToPath(
  new URL('../../lab/fixtures/production-like.json', import.meta.url),
);

const intentionallyRejectedProfiles = new Set(['legacy-root', 'legacy', 'malformed']);

describe('Core v2 rendering schema support inventory', () => {
  it('materializes every approved canonical dataset while rejecting compatibility roots', () => {
    const failures: Record<string, string> = {};
    for (const [id, dataset] of Object.entries(catalogProfiles.datasets)) {
      if (intentionallyRejectedProfiles.has(id)) continue;
      try {
        materializeCoreV2Dataset(dataset);
      } catch (error) {
        failures[id] = error instanceof CoreV2DatasetError
          ? `${error.code}:${error.datasetPath}`
          : String(error);
      }
    }

    expect(failures).toEqual({});

    for (const id of intentionallyRejectedProfiles) {
      expect(() => materializeCoreV2Dataset(
        catalogProfiles.datasets[id as keyof typeof catalogProfiles.datasets],
      )).toThrowError(
        expect.objectContaining<Partial<CoreV2DatasetError>>({
          code: 'INVALID_VALUE',
          datasetPath: '$',
        }),
      );
    }
  });

  it('keeps the production fixture within the same strict boundary', () => {
    const dataset = JSON.parse(readFileSync(productionFixturePath, 'utf8')) as unknown;
    expect(() => materializeCoreV2Dataset(dataset)).not.toThrow();
  });

  it('preserves the exact approved rendering-only fields without caller aliases', () => {
    const rectInput = catalogProfiles.datasets['rect-specimen'];
    const imageInput = catalogProfiles.datasets['image-specimens'];
    const boundsInput = catalogProfiles.datasets.bounds;
    const before = JSON.stringify({ rectInput, imageInput, boundsInput });

    const rect = materializeCoreV2Dataset(rectInput).dataset[0];
    const images = materializeCoreV2Dataset(imageInput).dataset;
    const bounds = materializeCoreV2Dataset(boundsInput).dataset;

    expect(rect).toMatchObject({
      type: 'rect',
      radius: [4, 6, 8, 10],
    });
    expect(images[3]).toMatchObject({ type: 'image', id: 'data-uri', opacity: 0.5 });
    expect(images[5]).toMatchObject({ type: 'image', id: 'hidden-image', opacity: 0.25 });
    expect(bounds[2]).toMatchObject({ type: 'text', id: 'overflow-text', overflow: 'visible' });
    expect(bounds[4]).toMatchObject({
      type: 'rect',
      id: 'transparent-interactive',
      eventMode: 'static',
    });
    expect(Object.isFrozen(rect?.type === 'rect' ? rect.radius : null)).toBe(true);
    expect(JSON.stringify({ rectInput, imageInput, boundsInput })).toBe(before);
  });

  it('projects opacity, standalone overflow, and root hit-test participation', () => {
    const imageResult = parsePatchMapV010(catalogProfiles.datasets['image-specimens']);
    const boundsResult = parsePatchMapV010(catalogProfiles.datasets.bounds);
    const eventModes = parsePatchMapV010([
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

  it('keeps per-corner radius loss explicit at the current scalar dense seam', () => {
    const result = parsePatchMapV010(catalogProfiles.datasets['rect-specimen']);

    expect(result.document.entities[0]).toMatchObject({ radius: 10 });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'corner-radius-degraded',
      path: '$[0].radius',
    }));
  });

  it('retains existing rectangular-texture border aliases as dense paint', () => {
    const result = parsePatchMapV010(catalogProfiles.datasets.background);

    expect(result.document.entities.find((entity) => entity.id === 'item::background:bg')).toMatchObject({
      kind: 'rect',
      stroke: 0x000000ff,
      strokeWidth: 2,
      radius: 8,
    });
  });

  it('does not widen closed records beyond the inventoried approved fields', () => {
    expect(() => materializeCoreV2Dataset([
      { type: 'rect', id: 'strict', size: 10, extra: true },
    ])).toThrowError(expect.objectContaining<Partial<CoreV2DatasetError>>({
      code: 'UNKNOWN_FIELD',
      datasetPath: '$[0].extra',
    }));
    expect(() => materializeCoreV2Dataset([
      { type: 'rect', id: 'radius', size: 10, radius: [1, 2, 3] },
    ])).toThrowError(expect.objectContaining<Partial<CoreV2DatasetError>>({
      code: 'INVALID_VALUE',
      datasetPath: '$[0].radius',
    }));
    expect(() => materializeCoreV2Dataset([
      { type: 'image', id: 'opacity', source: 'asset', opacity: 2 },
    ])).toThrowError(expect.objectContaining<Partial<CoreV2DatasetError>>({
      code: 'INVALID_VALUE',
      datasetPath: '$[0].opacity',
    }));
    expect(() => materializeCoreV2Dataset([
      { type: 'text', id: 'overflow', overflow: 'clip' },
    ])).toThrowError(expect.objectContaining<Partial<CoreV2DatasetError>>({
      code: 'INVALID_VALUE',
      datasetPath: '$[0].overflow',
    }));
    expect(() => materializeCoreV2Dataset([
      { type: 'rect', id: 'event-mode', size: 10, eventMode: 'interactive' },
    ])).toThrowError(expect.objectContaining<Partial<CoreV2DatasetError>>({
      code: 'INVALID_VALUE',
      datasetPath: '$[0].eventMode',
    }));
  });
});
