import { describe, expect, it, vi } from 'vitest';

import {
  PatchMapPersistenceError,
  serializePatchMapDataset,
} from '../../src/semantic/persistence';

describe('PatchMap persistence', () => {
  it('serializes a detached canonical array without retaining caller values', () => {
    const input = [{
      type: 'rect',
      id: 'rect-a',
      size: { width: 40, height: 20 },
      attrs: { x: 10, y: 15 },
    }];
    const before = structuredClone(input);
    const serialized = serializePatchMapDataset(input);

    expect(JSON.parse(serialized)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'rect-a', type: 'rect' }),
    ]));
    expect(input).toEqual(before);
  });

  it('requires an array root', () => {
    expect(() => serializePatchMapDataset({ dataset: [] })).toThrowError(
      expect.objectContaining({
        name: 'PatchMapPersistenceError',
        code: 'INVALID_EXPORT_ROOT',
        datasetPath: '$',
      }),
    );
  });

  it('checks semantic references in strict mode and permits explicit relaxed export', () => {
    const input = [
      { type: 'rect', id: 'source', size: 10 },
      {
        type: 'relations',
        id: 'links',
        links: [{ source: 'source', target: 'missing' }],
      },
    ];

    expect(() => serializePatchMapDataset(input)).toThrowError(
      expect.objectContaining({
        code: 'MISSING_TARGET',
        datasetPath: '$[1].links[0].target',
      }),
    );
    expect(JSON.parse(serializePatchMapDataset(input, {
      strictReferences: false,
    }))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'links', type: 'relations' }),
    ]));
  });

  it('rejects non-JSON values before serialization', () => {
    const input = [{
      type: 'rect',
      id: 'rect-a',
      size: { width: 40, height: 20 },
      attrs: { bad: (): void => undefined },
    }];

    expect(() => serializePatchMapDataset(input)).toThrowError(
      expect.objectContaining({
        code: 'NON_SERIALIZABLE_VALUE',
        datasetPath: '$[0].attrs.bad',
      }),
    );
  });

  it('rejects accessors without executing caller code', () => {
    const getter = vi.fn(() => 10);
    const attrs = Object.defineProperty({}, 'x', {
      enumerable: true,
      get: getter,
    });

    expect(() => serializePatchMapDataset([{
      type: 'rect',
      id: 'rect-a',
      size: { width: 40, height: 20 },
      attrs,
    }])).toThrowError(expect.objectContaining({
      code: 'NON_SERIALIZABLE_VALUE',
      datasetPath: '$[0].attrs.x',
    }));
    expect(getter).not.toHaveBeenCalled();
  });

  it('exposes a stable persistence error shape to the data API', () => {
    const error = new PatchMapPersistenceError(
      'NON_SERIALIZABLE_VALUE',
      '$.value',
      'test',
    );

    expect(error).toMatchObject({
      name: 'PatchMapPersistenceError',
      category: 'INVALID_INPUT',
      code: 'NON_SERIALIZABLE_VALUE',
      datasetPath: '$.value',
      recoverable: false,
      retryable: false,
      appliedCount: 0,
      missingCount: 0,
      unchangedCount: 0,
    });
  });
});
