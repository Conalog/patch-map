import { describe, expect, it } from 'vitest';

import { DenseStore } from '../../src/patch-map/dense/store';
import { normalizeEntity } from '../../src/patch-map/dense/validation';
import { RenderAlign } from '../../src/patch-map/dense/renderer-types';

describe('PatchMap dense text alignment', () => {
  it('round-trips justify through the Uint8 code 3 column', () => {
    const canonical = normalizeEntity({
      kind: 'text',
      id: 'justified',
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      text: 'A B\nC D',
      color: 0xffffffff,
      fontSize: 16,
      align: 'justify',
    }, '$.entities[0]');
    const store = DenseStore.fromCanonical([canonical]);

    expect(store.align[0]).toBe(RenderAlign.Justify);
    expect(store.toInput(0)).toMatchObject({ align: 'justify' });
    expect(store.canonicalAt(0)).toMatchObject({ align: 'justify' });
  });
});
