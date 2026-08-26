import datasets from '../fixtures/datasets/index';
import { describe, expect, it } from 'vitest';

import {
  PatchMapDatasetError,
  materializePatchMapDataset,
} from '../../src/semantic/dataset';
import { parsePatchMap } from '../../src/parsing';

const invalidDatasetProfiles = new Set(['malformed']);

describe('PatchMap rendering schema support inventory', () => {
  it('materializes every supported dataset while rejecting invalid inputs', () => {
    const failures: Record<string, string> = {};
    for (const [id, dataset] of Object.entries(datasets)) {
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
        datasets[id as keyof typeof datasets],
      )).toThrowError(
        expect.objectContaining<Partial<PatchMapDatasetError>>({
          code: 'INVALID_VALUE',
          datasetPath: '$',
        }),
      );
    }
  });

  it('preserves supported rendering-only fields without caller aliases', () => {
    const rectInput = datasets['rect-specimen'];
    const imageInput = datasets['image-specimens'];
    const boundsInput = datasets.bounds;
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
    const imageResult = parsePatchMap(datasets['image-specimens']);
    const boundsResult = parsePatchMap(datasets.bounds);
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
    const result = parsePatchMap(datasets['rect-specimen']);

    expect(result.document.entities[0]).toMatchObject({ radius: 10 });
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'corner-radius-degraded',
    }));
  });

  it('retains existing rectangular-texture border aliases as dense paint', () => {
    const result = parsePatchMap(datasets.background);

    expect(result.document.entities.find((entity) => entity.id === 'item::background:bg')).toMatchObject({
      kind: 'rect',
      stroke: 0x000000ff,
      strokeWidth: 2,
      radius: 8,
    });
  });

  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ])('rejects %s standalone radius during strict materialization', (_label, radius) => {
    const input = [{ type: 'rect', id: 'invalid-radius', size: 10, radius }];
    expect(() => materializePatchMapDataset(input)).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'INVALID_VALUE',
        datasetPath: '$[0].radius',
      }),
    );
    expect(parsePatchMap(input).diagnostics).toContainEqual(expect.objectContaining({
      code: 'invalid-radius',
      path: '$[0].radius',
    }));
  });

  it('retains direct-parser negative-radius clamping compatibility', () => {
    const input = [{ type: 'rect', id: 'negative-radius', size: 10, radius: -1 }];
    expect(() => materializePatchMapDataset(input)).toThrowError(PatchMapDatasetError);
    expect(parsePatchMap(input).document.entities[0]).toMatchObject({ radius: 0 });
  });

  it('does not widen closed records beyond supported fields', () => {
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
      const input = [{ type: 'rect', id: 'radius', size: 10, radius }];
      expect(materializePatchMapDataset(input).dataset[0]).toMatchObject({ radius });
      const parsed = parsePatchMap(input);
      expect(parsed.document.entities[0]).toMatchObject({ radius: 4 });
      expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
        code: 'corner-radius-degraded',
        path: '$[0].radius',
      }));
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
