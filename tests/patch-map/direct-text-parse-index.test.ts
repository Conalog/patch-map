import { describe, expect, it } from 'vitest';

import type { ParsePatchMapResult } from '../../src/patch-map/contracts';
import {
  inheritPatchMapV010DirectParseIndexes,
  parsePatchMapV010,
} from '../../src/patch-map/parser';
import {
  directTextParseIndexes,
  directTextTargetKey,
} from '../../src/patch-map/parser/direct-text-index';

const TEXT_SCENE = [
  {
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [{ type: 'text', id: 'label-a', text: 'Alpha' }],
  },
  {
    type: 'item',
    id: 'item-b',
    size: { width: 120, height: 90 },
    components: [{ type: 'text', id: 'label-b', text: 'Bravo' }],
  },
] as const;

describe('PATCH MAP v0.10 direct text parse index', () => {
  it('indexes stable root, component, and entity locations once', () => {
    const parsed = parsePatchMapV010(TEXT_SCENE);
    const indexes = directTextParseIndexes(parsed, TEXT_SCENE.length);

    expect(indexes?.rootIds).toEqual(['item-a', 'item-b']);
    expect(Object.isFrozen(indexes?.rootIds)).toBe(true);
    const target = indexes?.targets.get(directTextTargetKey('item-a', 'label-a'));
    expect(target).toMatchObject({
      rootIndex: 0,
      componentIndex: 0,
      componentPath: '$[0].components[0]',
    });
    expect(target?.entityIndex).toBe(
      parsed.document.entities.findIndex(({ id }) => id === target?.entityId),
    );
    expect(Object.isFrozen(target)).toBe(true);
    expect(directTextParseIndexes(parsed, TEXT_SCENE.length)).toBe(indexes);
  });

  it('inherits the exact cached indexes across an immutable result shell', () => {
    const parsed = parsePatchMapV010(TEXT_SCENE);
    const indexes = directTextParseIndexes(parsed, TEXT_SCENE.length);
    const wrapped = Object.freeze({
      ...parsed,
      diagnostics: Object.freeze([...parsed.diagnostics]),
    });

    inheritPatchMapV010DirectParseIndexes(parsed, wrapped);

    expect(directTextParseIndexes(wrapped, TEXT_SCENE.length)).toBe(indexes);
    expect(directTextParseIndexes(wrapped, TEXT_SCENE.length - 1)).toBeNull();
  });

  it('refuses an identity-ambiguous result without caching a partial index', () => {
    const parsed = parsePatchMapV010(TEXT_SCENE);
    const duplicate = parsed.identity.components[0];
    if (duplicate === undefined) throw new Error('Expected one component identity');
    const ambiguous = Object.freeze({
      ...parsed,
      identity: Object.freeze({
        ...parsed.identity,
        components: Object.freeze([...parsed.identity.components, duplicate]),
      }),
    }) as ParsePatchMapResult;

    expect(directTextParseIndexes(ambiguous, TEXT_SCENE.length)).toBeNull();
    expect(directTextParseIndexes(ambiguous, TEXT_SCENE.length)).toBeNull();
  });
});
