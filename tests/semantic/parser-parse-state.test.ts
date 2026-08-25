import { describe, expect, it } from 'vitest';

import { PatchMapParseError } from '../../src/patch-map/contracts';
import {
  createPatchMapParseState,
  fatalPatchMapParse,
  finishPatchMapParseState,
  warnPatchMapParse,
  warnPatchMapParseOnce,
} from '../../src/patch-map/parser/parse-state';

describe('PatchMap parser state', () => {
  it('finishes one frozen empty result with deterministic indexes and counts', () => {
    const state = createPatchMapParseState({});

    const result = finishPatchMapParseState(state);

    expect(result.identity.counts).toEqual({
      sourceElements: 0,
      sourceComponents: 0,
      expandedItems: 0,
      gridCells: 0,
      relationLinks: 0,
      entities: 0,
      kinds: { rect: 0, text: 0, image: 0, bar: 0, relation: 0 },
    });
    expect(Object.getPrototypeOf(result.projection.byEntityId)).toBeNull();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.identity.counts.kinds)).toBe(true);
  });

  it('preserves warning order, warn-once identity, and fatal diagnostics', () => {
    const state = createPatchMapParseState({});
    warnPatchMapParse(state, '$[0]', 'first-warning', 'first');
    warnPatchMapParseOnce(state, 'dedupe', '$[1]', 'once-warning', 'once');
    warnPatchMapParseOnce(state, 'dedupe', '$[2]', 'ignored-warning', 'ignored');

    let error: unknown;
    try {
      fatalPatchMapParse(state, '$[3]', 'fatal-error', 'fatal', 'source-a', 'entity-a');
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(PatchMapParseError);
    expect((error as PatchMapParseError).diagnostics).toEqual([
      { level: 'warning', code: 'first-warning', path: '$[0]', message: 'first' },
      { level: 'warning', code: 'once-warning', path: '$[1]', message: 'once' },
      {
        level: 'error',
        code: 'fatal-error',
        path: '$[3]',
        message: 'fatal',
        sourceId: 'source-a',
        entityId: 'entity-a',
      },
    ]);
    expect(Object.isFrozen((error as PatchMapParseError).diagnostics)).toBe(true);
  });
});
