import type { TextStyleOptions } from 'pixi.js';

import type { PatchMapTextProjection } from '../contracts';
import {
  RenderAlign,
  type RenderStoreView,
} from '../dense/renderer-types';
import { segmentPatchMapGraphemes } from '../semantic/text-layout';
import { canonicalPatchMapTextFontFamily } from '../semantic/text-font-family';
import type {
  PatchMapTextGlyphResolution,
  PatchMapTextRenderStyle,
} from '../semantic/text-render-route';

export function isBitmapTextSafe(value: string): boolean {
  return value.length <= 128 && /^[\x20-\x7e\n\r\t]*$/.test(value);
}

export function textStyle(
  store: RenderStoreView,
  slot: number,
  routeStyle: PatchMapTextRenderStyle,
  authoredStyle: PatchMapTextProjection['authoredStyle'] | undefined,
): TextStyleOptions {
  const stroke = pixiTextStroke(authoredStyle);
  return {
    fontFamily: routeStyle.fontFamily,
    fontSize: routeStyle.fontSize,
    fontWeight: pixiTextFontWeight(routeStyle.fontWeight),
    fontStyle: routeStyle.fontStyle,
    lineHeight: routeStyle.lineHeight,
    letterSpacing: routeStyle.letterSpacing,
    // Semantic layout already supplied explicit line breaks and clipping text.
    wordWrap: false,
    // Keep the raster white and apply exact packed paint through leaf tint.
    fill: 0xffffff,
    ...(stroke === undefined ? {} : { stroke }),
    align: alignName(store.align[slot] ?? RenderAlign.Left),
  };
}

export function textRenderStyle(
  store: RenderStoreView,
  slot: number,
  projection: PatchMapTextProjection | null,
): PatchMapTextRenderStyle {
  const authored = projection?.authoredStyle;
  const fontFamily = textFontFamily(authored?.fontFamily, store.fontFamily[slot]);
  const fontWeight = textFontWeight(authored?.fontWeight, store.fontWeight[slot]);
  const fontStyle = textFontStyle(authored?.fontStyle);
  const align = alignName(store.align[slot] ?? RenderAlign.Left);
  return Object.freeze({
    fontFamily,
    fontSize: projection?.fontSizePx ?? Math.max(1, store.fontSize[slot] ?? 16),
    fontWeight,
    fontStyle,
    lineHeight: projection?.lineHeightPx ?? Math.max(1, store.fontSize[slot] ?? 16) * 1.2,
    letterSpacing: projection?.letterSpacingPx ?? 0,
    advancedFeatures: textAdvancedFeatures(authored, align),
  });
}

export function textGlyphResolution(
  projection: PatchMapTextProjection | null,
): PatchMapTextGlyphResolution {
  if (projection === null) {
    return Object.freeze({ missingGlyphCount: 0, fallbackGlyphCount: 0 });
  }
  const missingGlyphCount = projection.missingGlyphs.reduce(
    (count, missing) => count + missing.count,
    0,
  );
  const fallbackGlyphCount = projection.visibleFontRuns.reduce(
    (count, run) => count + (
      run.fallbackReason === undefined ? 0 : countVisibleGraphemes(run.text)
    ),
    0,
  );
  return Object.freeze({ missingGlyphCount, fallbackGlyphCount });
}

export function countVisibleGraphemes(text: string): number {
  let count = 0;
  for (const grapheme of segmentPatchMapGraphemes(text)) {
    if (grapheme !== '\n' && grapheme !== '\r' && grapheme !== '\r\n') count += 1;
  }
  return count;
}

export function alignName(value: number): 'left' | 'center' | 'right' {
  if (value === RenderAlign.Center) return 'center';
  if (value === RenderAlign.Right) return 'right';
  return 'left';
}

function pixiTextStroke(
  authoredStyle: PatchMapTextProjection['authoredStyle'] | undefined,
): TextStyleOptions['stroke'] | undefined {
  const stroke = authoredStyle?.stroke;
  if (stroke === undefined) return undefined;
  const width = authoredStyle?.strokeWidth;
  if (
    (typeof stroke === 'string' || typeof stroke === 'number') &&
    typeof width === 'number' &&
    Number.isFinite(width)
  ) {
    return { color: stroke, width };
  }
  return stroke as TextStyleOptions['stroke'];
}

function textFontFamily(authored: unknown, dense: string | undefined): string {
  if (typeof authored === 'string' && authored.length > 0) {
    return canonicalPatchMapTextFontFamily(authored);
  }
  if (Array.isArray(authored)) {
    const family = authored.find((value): value is string => (
      typeof value === 'string' && value.length > 0
    ));
    if (family !== undefined) return canonicalPatchMapTextFontFamily(family);
  }
  return dense && dense.length > 0 ? canonicalPatchMapTextFontFamily(dense) : 'Arial';
}

function textFontWeight(authored: unknown, dense: number | undefined): number {
  const resolvedAuthored = authoredTextFontWeight(authored);
  if (resolvedAuthored !== null) return resolvedAuthored;
  if (validTextFontWeight(dense)) return dense;
  return 400;
}

function authoredTextFontWeight(value: unknown): number | null {
  if (value === 'bold' || value === 'bolder') return 700;
  if (value === 'normal') return 400;
  if (value === 'lighter') return 300;
  if (validTextFontWeight(value)) return value;
  if (typeof value === 'string' && /^(?:[1-9]00)$/.test(value)) return Number(value);
  return null;
}

function pixiTextFontWeight(value: number): NonNullable<TextStyleOptions['fontWeight']> {
  if (value === 400) return 'normal';
  if (value === 700) return 'bold';
  return String(value) as NonNullable<TextStyleOptions['fontWeight']>;
}

function textFontStyle(value: unknown): PatchMapTextRenderStyle['fontStyle'] {
  return value === 'italic' || value === 'oblique' ? value : 'normal';
}

const TEXT_SEMANTIC_STYLE_KEYS = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fill',
  'align',
  'wordWrap',
  'wordWrapWidth',
  'breakWords',
  'lineHeight',
  'letterSpacing',
  'autoFont',
  'overflow',
]);

function textAdvancedFeatures(
  authored: PatchMapTextProjection['authoredStyle'] | undefined,
  align: 'left' | 'center' | 'right',
): readonly string[] {
  const features = authored === undefined
    ? []
    : Object.keys(authored).filter((key) => !TEXT_SEMANTIC_STYLE_KEYS.has(key));
  if (align !== 'left') features.push(`align:${align}`);
  if (authored?.fontWeight !== undefined && authoredTextFontWeight(authored.fontWeight) === null) {
    features.push('fontWeight:invalid');
  }
  return Object.freeze([...new Set(features)].sort());
}

function validTextFontWeight(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 900;
}
