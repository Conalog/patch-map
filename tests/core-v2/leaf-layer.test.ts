import { describe, expect, it } from 'vitest';

import { AggregateLeafLayer, isBitmapTextSafe } from '../../src/core-v2/renderers/leaf-layer';

describe('Core v2 aggregate leaf policy', () => {
  it('routes short ASCII labels to BitmapText and guards CJK/emoji/rich content', () => {
    expect(isBitmapTextSafe('CPU 42%')).toBe(true);
    expect(isBitmapTextSafe('line one\nline two')).toBe(true);
    expect(isBitmapTextSafe('인버터 42')).toBe(false);
    expect(isBitmapTextSafe('ready ✅')).toBe(false);
    expect(isBitmapTextSafe('x'.repeat(129))).toBe(false);
  });

  it('starts empty and has an idempotent asynchronous lifecycle', async () => {
    const layer = new AggregateLeafLayer();
    expect(layer.container.label).toBe('core-v2:text-and-assets');
    expect(layer.debugSnapshot()).toEqual({
      bitmapTextCount: 0,
      fallbackTextCount: 0,
      imageCount: 0,
      loadedAssetCount: 0,
      unresolvedAssetCount: 0,
    });
    await layer.destroy();
    await layer.destroy();
  });
});
