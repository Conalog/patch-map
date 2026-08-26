import type {
  AlignSetting,
  EntityInput,
  Rgba,
} from '../dense/contracts';
import type { PatchMapContentOrientation } from './contracts';
import type {
  PatchMapEdges,
  PatchMapPlacement,
} from '../semantic/dataset';
import {
  layoutPatchMapText,
  type PatchMapTextLayout,
  type PatchMapTextLayoutOptions,
} from '../semantic/text-layout';
import {
  PATCH_MAP_FIRA_CODE_FAMILY,
  canonicalPatchMapTextFontFamily,
} from '../semantic/text-font-family';
import {
  clonePatchMapParserJson as cloneJson,
  deepFreezePatchMapParserValue as deepFreeze,
  warnPatchMapParse as warn,
  warnPatchMapParseOnce as warnOnce,
  type PatchMapParseState as ParseState,
} from './parse-state';
import {
  projectPatchMapParserTopLeft,
  type PatchMapParserSize as Size,
  type PatchMapParserTransform as Transform,
} from './transform-projection';
import {
  clamp01,
  finiteNumber,
  fontWeight,
  isParserRecord as isRecord,
  type PatchMapParserBox as Box,
  type PatchMapParserRecord as JsonRecord,
} from './value-normalization';

const AVAILABLE_TEXT_FONTS = Object.freeze([PATCH_MAP_FIRA_CODE_FAMILY, 'Unifont']);
const BASIC_TEXT_STYLE_KEYS = new Set([
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

export function textEntity(
  id: string,
  transform: Transform,
  box: Box,
  layout: PatchMapTextLayout,
  style: JsonRecord,
  color: Rgba,
  visible: boolean,
  interactive: boolean,
  layer: number,
): EntityInput {
  const alignValue = style.align;
  const align: AlignSetting = alignValue === 'center' ||
      alignValue === 'right' ||
      alignValue === 'justify'
    ? alignValue
    : 'left';
  const denseTransform = projectPatchMapParserTopLeft(transform, box);
  return {
    kind: 'text',
    id,
    x: denseTransform.x,
    y: denseTransform.y,
    width: denseTransform.width,
    height: denseTransform.height,
    rotation: transform.rotation,
    text: layout.visibleText,
    color,
    fontSize: layout.fontSizePx,
    ...(finiteNumber(style.alpha) === undefined
      ? {}
      : { opacity: clamp01(finiteNumber(style.alpha) as number) }),
    ...(typeof style.fontFamily === 'string' ? { fontFamily: style.fontFamily } : {}),
    ...(fontWeight(style.fontWeight) !== undefined ? { fontWeight: fontWeight(style.fontWeight) as number } : {}),
    align,
    visible,
    interactive,
    zIndex: layer,
    tags: ['text'],
  };
}

export function semanticTextLayout(
  source: string,
  style: JsonRecord,
  contentFrame: Size | undefined,
  overflowValue: unknown,
  split: number,
  origin: Readonly<{ x: number; y: number }> | undefined,
  path: string,
  state: ParseState,
): PatchMapTextLayout {
  const cacheKey = state.textLayoutCache === undefined
    ? null
    : JSON.stringify([source, style, contentFrame ?? null, overflowValue ?? null, split, origin ?? null]);
  const cached = cacheKey === null ? undefined : state.textLayoutCache?.get(cacheKey);
  if (cached !== undefined) return cached;
  const fontSizePx = positiveTextMetric(style.fontSize, `${path}.style.fontSize`, state);
  const lineHeightPx = positiveTextMetric(style.lineHeight, `${path}.style.lineHeight`, state);
  const letterSpacingPx = textLetterSpacing(
    style.letterSpacing,
    `${path}.style.letterSpacing`,
    state,
  );
  const overflow = textOverflow(overflowValue, `${path}.overflow`, state);
  const wordWrapWidth = textWrapWidth(style, contentFrame, path, state);
  // Match the PatchMap text-style default even when callers use the
  // lower-level parser directly instead of passing through the materializer.
  const requestedFontValue = requestedFont(style.fontFamily) ?? PATCH_MAP_FIRA_CODE_FAMILY;
  const autoFont = textAutoFont(style.autoFont, `${path}.style.autoFont`, state);
  const options: PatchMapTextLayoutOptions = {
    source,
    ...(fontSizePx === undefined ? {} : { fontSizePx }),
    ...(lineHeightPx === undefined ? {} : { lineHeightPx }),
    ...(letterSpacingPx === undefined ? {} : { letterSpacingPx }),
    requestedFont: requestedFontValue,
    availableRequestedFonts: AVAILABLE_TEXT_FONTS,
    split,
    wordWrapWidthPx: wordWrapWidth,
    breakWords: style.breakWords === true,
    ...(contentFrame === undefined
      ? {}
      : { contentFrame: { width: contentFrame.width, height: contentFrame.height } }),
    overflow,
    ...(autoFont === undefined ? {} : { autoFont }),
    ...(origin === undefined ? {} : { origin }),
    advancedStyle: hasAdvancedTextStyle(style),
  };
  const layout = layoutPatchMapText(options);
  for (const diagnostic of layout.diagnostics) {
    warnOnce(
      state,
      `text-layout:${path}:${diagnostic.code}:${diagnostic.sourceIndex ?? -1}`,
      diagnostic.sourceIndex === undefined
        ? `${path}.text`
        : `${path}.text[${diagnostic.sourceIndex}]`,
      'text-layout-unsupported',
      `${diagnostic.code}: ${diagnostic.detail}`,
    );
  }
  if (cacheKey !== null) state.textLayoutCache?.set(cacheKey, layout);
  return layout;
}

export function addTextProjection(
  input: Readonly<{
    entityId: string;
    targetKind: 'element' | 'component';
    ownerId?: string;
    componentId?: string;
    authoredStyle: JsonRecord;
    color: number;
    placement: PatchMapPlacement | null;
    margin: PatchMapEdges;
    contentOrientation: PatchMapContentOrientation;
    layout: PatchMapTextLayout;
  }>,
  state: ParseState,
): void {
  state.textProjectionByEntityId[input.entityId] = Object.freeze({
    ...input.layout,
    entityId: input.entityId,
    targetKind: input.targetKind,
    ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
    ...(input.componentId === undefined ? {} : { componentId: input.componentId }),
    authoredStyle: deepFreeze(cloneJson(input.authoredStyle)),
    color: input.color >>> 0,
    placement: input.placement,
    margin: Object.freeze({ ...input.margin }),
    contentOrientation: input.contentOrientation,
  });
}

function positiveTextMetric(
  value: unknown,
  path: string,
  state: ParseState,
): number | undefined {
  if (value === undefined) return undefined;
  const metric = finiteNumber(value);
  if (metric !== undefined && metric > 0) return metric;
  warn(state, path, 'invalid-text-metric', 'Invalid text metric used the deterministic profile default');
  return undefined;
}

function textLetterSpacing(
  value: unknown,
  path: string,
  state: ParseState,
): number | undefined {
  if (value === undefined) return undefined;
  const spacing = finiteNumber(value);
  if (spacing !== undefined) return spacing;
  warn(state, path, 'invalid-text-metric', 'Invalid letterSpacing used the deterministic profile default');
  return undefined;
}

function textOverflow(
  value: unknown,
  path: string,
  state: ParseState,
): 'visible' | 'hidden' | 'ellipsis' {
  if (value === undefined || value === 'visible') return 'visible';
  if (value === 'hidden' || value === 'ellipsis') return value;
  warn(state, path, 'invalid-text-overflow', 'Invalid overflow fell back to visible');
  return 'visible';
}

function textWrapWidth(
  style: JsonRecord,
  contentFrame: Size | undefined,
  path: string,
  state: ParseState,
): number | null {
  if (style.wordWrap !== true) return null;
  if (style.wordWrapWidth === undefined) return contentFrame?.width ?? null;
  const width = finiteNumber(style.wordWrapWidth);
  if (width !== undefined && width >= 0) return width;
  warn(
    state,
    `${path}.style.wordWrapWidth`,
    'invalid-text-wrap-width',
    'Invalid wordWrapWidth fell back to the available frame width',
  );
  return contentFrame?.width ?? null;
}

function textAutoFont(
  value: unknown,
  path: string,
  state: ParseState,
): Readonly<{ minPx: number; maxPx: number }> | undefined {
  if (value === undefined) return undefined;
  if (isRecord(value)) {
    const min = finiteNumber(value.min);
    const max = finiteNumber(value.max);
    if (
      min !== undefined &&
      max !== undefined &&
      Number.isSafeInteger(min) &&
      Number.isSafeInteger(max) &&
      min > 0 &&
      max >= min
    ) {
      return Object.freeze({ minPx: min, maxPx: max });
    }
  }
  warn(state, path, 'invalid-text-auto-font', 'Invalid autoFont bounds were ignored');
  return undefined;
}

function requestedFont(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return canonicalPatchMapTextFontFamily(value);
  }
  if (Array.isArray(value)) {
    const family = value.find(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    );
    return family === undefined ? undefined : canonicalPatchMapTextFontFamily(family);
  }
  return undefined;
}

function hasAdvancedTextStyle(style: JsonRecord): boolean {
  return Object.keys(style).some((key) => !BASIC_TEXT_STYLE_KEYS.has(key));
}
