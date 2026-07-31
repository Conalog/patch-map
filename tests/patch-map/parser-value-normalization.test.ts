import { describe, expect, it } from 'vitest';

import { PATCH_MAP_IDENTITY_AFFINE } from '../../src/patch-map/semantic/geometry';
import { createPatchMapParseState } from '../../src/patch-map/parser/parse-state';
import {
  barAnimationDuration,
  elementTransform,
  fixedSize,
  inspectAttributes,
  resolveColor,
  resolveComponentSize,
} from '../../src/patch-map/parser/value-normalization';

describe('PatchMap parser value normalization', () => {
  it('normalizes fixed and component lengths while preserving warning order', () => {
    const state = createPatchMapParseState({});

    expect(fixedSize({ width: -10, height: 20 }, '$.size', state)).toEqual({
      width: 0,
      height: 20,
    });
    expect(resolveComponentSize(
      { width: '50%', height: { value: 12, unit: 'px' } },
      { width: 80, height: 40 },
      '$.component.size',
      state,
    )).toEqual({ width: 40, height: 12 });
    expect(state.diagnostics).toEqual([{
      level: 'warning',
      code: 'negative-length',
      path: '$.size.width',
      message: 'Negative length was clamped to zero',
    }]);
  });

  it('projects signed transforms and deduplicates preserved-only attribute diagnostics', () => {
    const state = createPatchMapParseState({});
    const parent = {
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      affine: PATCH_MAP_IDENTITY_AFFINE,
    };

    const transform = elementTransform(
      { x: 5, y: 7, angle: 90, scaleX: -1, custom: true },
      '$[0]',
      parent,
      'rect',
      state,
    );
    inspectAttributes({ custom: true }, '$[0].attrs', 'rect', state);
    inspectAttributes({ custom: false }, '$[1].attrs', 'rect', state);

    expect(transform).toMatchObject({ x: 5, y: 7, rotation: 90, scaleX: -1 });
    expect(state.diagnostics).toEqual([{
      level: 'warning',
      code: 'attribute-preserved-only',
      path: '$[0].attrs.custom',
      message: 'Attribute "custom" is preserved in identity but has no dense-store projection',
    }]);
  });

  it('resolves theme colors and preserves exact fatal animation diagnostics', () => {
    const state = createPatchMapParseState({ colors: { primary: '#112233' } });

    expect(resolveColor('primary', 0, '$.fill', state)).toBe(0x112233ff);
    expect(() => barAnimationDuration(-1, '$.animationDuration', 'bar-a', state)).toThrow(
      'Bar animationDuration must be a nonnegative finite number',
    );
    expect(state.diagnostics.at(-1)).toEqual({
      level: 'error',
      code: 'invalid-animation-duration',
      path: '$.animationDuration',
      message: 'Bar animationDuration must be a nonnegative finite number',
      sourceId: 'bar-a',
    });
  });
});
