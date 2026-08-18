import { describe, expect, it } from 'vitest';

import { percentile, summarize } from '../../performance/patch-map/protocol';
import {
  createSyntheticPatchMap,
  resolveSyntheticBitmapTextCapability,
} from '../../performance/patch-map/workloads';
import { parsePatchMapV010 } from '../../src/patch-map/parser';
import { selectPatchMapTextRenderRoute } from '../../src/patch-map/semantic/text-render-route';

describe('PatchMap performance protocol', () => {
  it('retains raw sample order and reports deterministic nearest-rank statistics', () => {
    const result = summarize([7, 1, 3, 2, 6, 5, 4]);
    expect(result.samples).toEqual([7, 1, 3, 2, 6, 5, 4]);
    expect(result).toMatchObject({ min: 1, median: 4, p95: 7, max: 7 });
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it('generates deterministic schema-valid item inputs with bar, text, asset, and relation coverage', () => {
    const left = createSyntheticPatchMap(100, 123);
    const right = createSyntheticPatchMap(100, 123);
    expect(left).toEqual(right);
    expect(left).toHaveLength(101);
    expect(left[0]).toMatchObject({ type: 'item', id: 'item-00000' });
    expect(left.at(-1)).toMatchObject({ type: 'relations', id: 'synthetic-relations' });
    const parsed = parsePatchMapV010(left);
    expect(Object.values(parsed.projection.textsByEntityId ?? {}).every(
      (text) => text.rendererRoute === 'bitmap-text' &&
        text.visibleFontRuns.every((run) => run.fallbackReason === undefined),
    )).toBe(true);
    const firstText = Object.values(parsed.projection.textsByEntityId ?? {})[0];
    if (!firstText) throw new Error('missing synthetic text projection');
    const routeStyle = {
      fontFamily: 'Unifont',
      fontSize: firstText.fontSizePx,
      fontWeight: 600,
      fontStyle: 'normal' as const,
      lineHeight: firstText.lineHeightPx,
      letterSpacing: firstText.letterSpacingPx,
      advancedFeatures: [] as const,
    };
    expect(selectPatchMapTextRenderRoute({
      text: firstText.visibleText,
      style: routeStyle,
      glyphResolution: { missingGlyphCount: 0, fontFallbackGlyphCount: 0 },
      bitmapCapability: resolveSyntheticBitmapTextCapability({
        entityId: firstText.entityId,
        text: firstText.visibleText,
        style: routeStyle,
        projection: firstText,
      }),
    }).route).toBe('bitmap-text');
  });

  it('proves only the pinned finite benchmark BitmapText profile', () => {
    const request = {
      entityId: 'item-00000::component:value',
      text: 'CPU 42%',
      style: {
        fontFamily: 'Unifont',
        fontSize: 11,
        fontWeight: 600,
        fontStyle: 'normal' as const,
        lineHeight: 20,
        letterSpacing: 0,
        advancedFeatures: [] as const,
      },
      projection: null,
    };
    expect(resolveSyntheticBitmapTextCapability(request)).toMatchObject({
      coverage: 'proven',
      atlasId: 'core-v2-benchmark-unifont-ascii-11-600',
      multiline: false,
    });
    expect(resolveSyntheticBitmapTextCapability({ ...request, text: '상태 42' })).toBeNull();
    expect(resolveSyntheticBitmapTextCapability({
      ...request,
      style: { ...request.style, fontWeight: 400 },
    })).toBeNull();
  });
});
