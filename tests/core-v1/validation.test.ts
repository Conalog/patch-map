import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/core-v1/contracts';
import { CoreValidationError } from '../../src/core-v1/errors';
import { normalizeDocument, validatePatch } from '../../src/core-v1/validation';

const RECT = {
  kind: 'rect' as const,
  id: 'node-a',
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  fill: 0x336699ff,
  tags: ['machine'],
};

describe('Core v1 document validation', () => {
  it('copies caller-owned collections without mutating input', () => {
    const document: SceneDocument = { version: 1, entities: [RECT] };
    const before = JSON.stringify(document);

    const normalized = normalizeDocument(document);

    expect(JSON.stringify(document)).toBe(before);
    expect(normalized[0]?.tags).not.toBe(RECT.tags);
    expect(normalized[0]).toMatchObject({
      id: 'node-a',
      visible: true,
      interactive: true,
      opacity: 1,
      zIndex: 0,
    });
  });

  it('rejects a duplicate ID before creating store state', () => {
    expect(() =>
      normalizeDocument({
        version: 1,
        entities: [RECT, { ...RECT }],
      }),
    ).toThrow(new CoreValidationError('$.entities[1].id', 'duplicate ID node-a'));
  });

  it('rejects a relation whose endpoint is absent', () => {
    expect(() =>
      normalizeDocument({
        version: 1,
        entities: [
          RECT,
          {
            kind: 'relation',
            id: 'edge-a',
            from: 'node-a',
            to: 'missing',
            color: 0xffffffff,
          },
        ],
      }),
    ).toThrow('$.entities[1].to: unknown ID missing');
  });

  it('validates patch fields against the target kind', () => {
    expect(() => validatePatch({ text: 'wrong' }, 'rect', '$.operations[0].changes')).toThrow(
      '$.operations[0].changes.text: field is not valid for rect',
    );
    expect(() =>
      validatePatch({ fill: 0xff00ffff, radius: 3 }, 'rect', '$.operations[1].changes'),
    ).not.toThrow();
  });
});
