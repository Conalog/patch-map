import { describe, expect, it } from 'vitest';

import type { PatchMapTextProjection } from '../../src/patch-map/contracts';
import {
  RenderAlign,
  type RenderStoreView,
} from '../../src/patch-map/dense/renderer-types';
import {
  alignName,
  countVisibleGraphemes,
  isBitmapTextSafe,
  textGlyphResolution,
  textRenderStyle,
  textStyle,
} from '../../src/patch-map/renderers/leaf-text-style';

describe('PatchMap leaf text style contract', () => {
  it('keeps the bounded ASCII BitmapText safety boundary', () => {
    expect(isBitmapTextSafe('CPU 42%')).toBe(true);
    expect(isBitmapTextSafe('line one\nline two')).toBe(true);
    expect(isBitmapTextSafe('인버터 42')).toBe(false);
    expect(isBitmapTextSafe('ready ✅')).toBe(false);
    expect(isBitmapTextSafe('x'.repeat(128))).toBe(true);
    expect(isBitmapTextSafe('x'.repeat(129))).toBe(false);
  });

  it('resolves authored route style and preserves the exact Pixi stroke contract', () => {
    const store = textStore({
      fontFamily: 'Dense Sans',
      fontSize: 14,
      fontWeight: 500,
      align: RenderAlign.Right,
    });
    const projection = textProjection({
      authoredStyle: {
        fontFamily: ['', 'Authored Sans'],
        fontWeight: 'bold',
        fontStyle: 'italic',
        stroke: '#123456',
        strokeWidth: 2,
      },
      fontSizePx: 18,
      lineHeightPx: 22,
      letterSpacingPx: 1.5,
    });

    const routeStyle = textRenderStyle(store, 0, projection);
    expect(routeStyle).toEqual({
      fontFamily: 'Authored Sans',
      fontSize: 18,
      fontWeight: 700,
      fontStyle: 'italic',
      lineHeight: 22,
      letterSpacing: 1.5,
      advancedFeatures: ['align:right', 'stroke', 'strokeWidth'],
    });
    expect(Object.isFrozen(routeStyle)).toBe(true);
    expect(Object.isFrozen(routeStyle.advancedFeatures)).toBe(true);
    expect(textStyle(store, 0, routeStyle, projection.authoredStyle)).toMatchObject({
      fontFamily: 'Authored Sans',
      fontSize: 18,
      fontWeight: 'bold',
      fontStyle: 'italic',
      lineHeight: 22,
      letterSpacing: 1.5,
      wordWrap: false,
      fill: 0xffffff,
      stroke: { color: '#123456', width: 2 },
      align: 'right',
    });
  });

  it('publishes the resolved omitted multiline line height to both Pixi text routes', () => {
    const store = textStore({
      fontFamily: 'Fira Code',
      fontSize: 52,
      fontWeight: 400,
      align: RenderAlign.Left,
    });
    const projection = textProjection({
      fontSizePx: 52,
      lineHeightPx: 65,
    });

    const routeStyle = textRenderStyle(store, 0, projection);
    expect(routeStyle).toMatchObject({ fontSize: 52, lineHeight: 65 });
    expect(textStyle(store, 0, routeStyle, projection.authoredStyle)).toMatchObject({
      fontSize: 52,
      lineHeight: 65,
    });
  });

  it('maps the PATCH MAP v0.10 FiraCode spelling to the loaded browser family', () => {
    const store = textStore({
      fontFamily: 'FiraCode',
      fontSize: 16,
      fontWeight: 600,
      align: RenderAlign.Left,
    });
    const projection = textProjection({
      authoredStyle: { fontFamily: 'FiraCode', fontWeight: 600 },
    });

    const routeStyle = textRenderStyle(store, 0, projection);
    expect(routeStyle).toMatchObject({ fontFamily: 'Fira Code', fontWeight: 600 });
    expect(textStyle(store, 0, routeStyle, projection.authoredStyle)).toMatchObject({
      fontFamily: 'Fira Code',
      fontWeight: '600',
    });
  });

  it('falls back to dense font values while publishing invalid authored weight', () => {
    const store = textStore({
      fontFamily: 'Dense Sans',
      fontSize: 12,
      fontWeight: 500,
      align: RenderAlign.Center,
    });
    const projection = textProjection({
      authoredStyle: {
        fontFamily: [],
        fontWeight: 'semibold',
        fontStyle: 'unsupported',
      },
    });

    expect(textRenderStyle(store, 0, projection)).toEqual({
      fontFamily: 'Dense Sans',
      fontSize: 16,
      fontWeight: 500,
      fontStyle: 'normal',
      lineHeight: 20,
      letterSpacing: 0,
      advancedFeatures: ['align:center', 'fontWeight:invalid'],
    });
    expect(alignName(RenderAlign.Left)).toBe('left');
    expect(alignName(RenderAlign.Center)).toBe('center');
    expect(alignName(RenderAlign.Right)).toBe('right');
    expect(alignName(99)).toBe('left');
  });

  it('counts missing and visible fallback graphemes without counting hard breaks', () => {
    const fallbackText = 'A\r\n👩‍🚀e\u0301';
    const projection = textProjection({
      missingGlyphs: [
        { codePoint: 'A', identity: 'core-v2-missing-glyph-box/1', count: 2 },
        { codePoint: 'B', identity: 'core-v2-missing-glyph-box/1', count: 1 },
      ],
      visibleFontRuns: [
        { text: 'ignored', font: 'Primary' },
        {
          text: fallbackText,
          font: 'Fallback',
          fallbackReason: 'requested-font-unavailable',
        },
      ],
    });

    const resolution = textGlyphResolution(projection);
    expect(resolution).toEqual({ missingGlyphCount: 3, fallbackGlyphCount: 3 });
    expect(Object.isFrozen(resolution)).toBe(true);
    expect(countVisibleGraphemes(fallbackText)).toBe(3);
    expect(textGlyphResolution(null)).toEqual({
      missingGlyphCount: 0,
      fallbackGlyphCount: 0,
    });
  });
});

function textStore(options: {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly align: number;
}): RenderStoreView {
  return {
    fontFamily: [options.fontFamily],
    fontSize: [options.fontSize],
    fontWeight: [options.fontWeight],
    align: [options.align],
  } as unknown as RenderStoreView;
}

function textProjection(
  overrides: Partial<PatchMapTextProjection>,
): PatchMapTextProjection {
  return {
    authoredStyle: {},
    fontSizePx: 16,
    lineHeightPx: 20,
    letterSpacingPx: 0,
    missingGlyphs: [],
    visibleFontRuns: [],
    ...overrides,
  } as unknown as PatchMapTextProjection;
}
