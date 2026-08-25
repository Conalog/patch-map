import type { MapData } from '../src/patch-map/input';
import type { PatchMapBitmapTextCapabilityRequest } from '../src/patch-map/renderers/leaf-layer';
import type { PatchMapBitmapTextCapabilityProof } from '../src/patch-map/semantic/text-render-route';

export const PATCH_MAP_SYNTHETIC_ASSET_ALIAS = 'patch-map-synthetic-dot';
export const PATCH_MAP_SYNTHETIC_ASSET_DATA_URL =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Ccircle cx="4" cy="4" r="3" fill="white"/%3E%3C/svg%3E';

const PATCH_MAP_SYNTHETIC_BITMAP_GLYPHS = Object.freeze(
  Array.from({ length: 95 }, (_, index) => String.fromCharCode(0x20 + index)),
);

/** Exact finite proof for the benchmark's one pinned dynamic ASCII profile. */
export function resolveSyntheticBitmapTextCapability(
  request: PatchMapBitmapTextCapabilityRequest,
): PatchMapBitmapTextCapabilityProof | null {
  const { style, text } = request;
  if (
    text.length > 128 ||
    [...text].some((glyph) => !PATCH_MAP_SYNTHETIC_BITMAP_GLYPHS.includes(glyph)) ||
    style.fontFamily !== 'Unifont' ||
    style.fontSize !== 11 ||
    style.fontWeight !== 600 ||
    style.fontStyle !== 'normal' ||
    style.lineHeight !== 20 ||
    style.letterSpacing !== 0 ||
    style.advancedFeatures.length !== 0
  ) {
    return null;
  }
  return Object.freeze({
    coverage: 'proven',
    atlasId: 'patch-map-benchmark-unifont-ascii-11-600',
    glyphs: PATCH_MAP_SYNTHETIC_BITMAP_GLYPHS,
    style: Object.freeze({
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
    }),
    multiline: false,
  });
}

export function createSyntheticPatchMap(itemCount: number, seed = 0x5eed): MapData {
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) {
    throw new RangeError('itemCount must be a positive safe integer');
  }
  const random = seededRandom(seed);
  const columns = Math.max(1, Math.ceil(Math.sqrt(itemCount)));
  const elements: MapData[number][] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const value = Math.round(random() * 100);
    elements.push({
      type: 'item',
      id: `item-${String(index).padStart(5, '0')}`,
      label: `Synthetic ${index}`,
      show: true,
      attrs: { x: column * 54, y: row * 88, angle: 0, display: true, metadata: { seed, index } },
      size: { width: 44, height: 78 },
      padding: 4,
      components: [
        {
          type: 'background',
          id: 'background',
          show: true,
          source: { type: 'rect', fill: '#f4f6fa', borderColor: '#8090a8', borderWidth: 1, radius: 5 },
        },
        {
          type: 'bar',
          id: 'bar',
          show: true,
          source: { type: 'rect', fill: '#3976e8', radius: 3 },
          tint: '#3976e8',
          size: { width: '72%', height: `${value}%` },
          placement: 'bottom',
          margin: { bottom: 6, left: 6, right: 6 },
          animation: true,
          animationDuration: 240,
        },
        {
          type: 'text',
          id: 'value',
          show: true,
          text: String(value),
          placement: 'top',
          margin: { top: 5 },
          style: {
            fontFamily: 'Unifont',
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 20,
            fill: '#18243a',
          },
        },
        ...(index % 10 === 0
          ? [{
              type: 'icon' as const,
              id: 'status',
              show: true,
              source: PATCH_MAP_SYNTHETIC_ASSET_ALIAS,
              tint: '#26a269',
              size: 8,
              placement: 'right-top' as const,
              margin: 4,
            }]
          : []),
      ],
    });
  }

  if (itemCount > 1) {
    const links = Array.from({ length: itemCount - 1 }, (_, index) => ({
      source: `item-${String(index).padStart(5, '0')}`,
      target: `item-${String(index + 1).padStart(5, '0')}`,
    }));
    elements.push({
      type: 'relations',
      id: 'synthetic-relations',
      show: true,
      attrs: { display: true, metadata: { seed } },
      links,
      style: { color: '#94a3b8', width: 1, alpha: 0.8 },
    });
  }
  return elements;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
